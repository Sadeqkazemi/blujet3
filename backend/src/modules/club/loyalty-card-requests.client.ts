import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isISO8601 } from 'class-validator';
import { PinoLogger } from 'nestjs-pino';
import { ErrorCode } from '../../common/errors';
import { loyaltyCardRequestsReadConfig } from '../../config/loyalty-card-requests-read.config';
import { requestIdFromHeader } from '../../gateway/request-id';
import { ClubCardRequestStatus, ClubTier } from '../../database/enums';

export interface LoyaltyCardRequestWire {
  id: string;
  memberId: string;
  level: ClubTier;
  points: number;
  status: ClubCardRequestStatus;
  assignedTo: string | null;
  decidedById: string | null;
  decidedAt: string | null;
  cardNo: string | null;
  history: unknown[];
  createdAt: string;
  member: {
    id: string;
    fullName: string;
    email: string;
    points: number;
    level: ClubTier;
  } | null;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function exact(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).sort().join(',') === [...keys].sort().join(',');
}
function str(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}
function utc(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    isISO8601(value, { strict: true })
  );
}
function tier(value: unknown): value is ClubTier {
  return Object.values(ClubTier).some((item) => item === value);
}
function member(value: unknown): value is LoyaltyCardRequestWire['member'] {
  if (value === null || !record(value)) return value === null;
  return (
    exact(value, ['id', 'fullName', 'email', 'points', 'level']) &&
    str(value.id, 128) &&
    str(value.fullName, 512) &&
    str(value.email, 512) &&
    Number.isSafeInteger(value.points) &&
    Number(value.points) >= 0 &&
    tier(value.level)
  );
}
function history(value: unknown): value is unknown[] {
  return (
    Array.isArray(value) &&
    value.length <= 32 &&
    value.every((entry) => {
      if (!record(entry) || !exact(entry, ['step', 'labelFa', 'at']))
        return false;
      return (
        str(entry.step, 64) && str(entry.labelFa, 2048) && str(entry.at, 128)
      );
    })
  );
}
function valid(value: unknown): value is LoyaltyCardRequestWire[] {
  if (!Array.isArray(value) || value.length > 1000) return false;
  return value.every((row) => {
    if (
      !record(row) ||
      !exact(row, [
        'id',
        'memberId',
        'level',
        'points',
        'status',
        'assignedTo',
        'decidedById',
        'decidedAt',
        'cardNo',
        'history',
        'createdAt',
        'member',
      ])
    )
      return false;
    const status: readonly unknown[] = [
      ClubCardRequestStatus.REFERRED,
      ClubCardRequestStatus.APPROVED,
      ClubCardRequestStatus.REJECTED,
    ];
    return (
      str(row.id, 128) &&
      str(row.memberId, 128) &&
      tier(row.level) &&
      Number.isSafeInteger(row.points) &&
      Number(row.points) >= 0 &&
      status.includes(row.status) &&
      (row.assignedTo === null || str(row.assignedTo, 128)) &&
      (row.decidedById === null || str(row.decidedById, 128)) &&
      (row.decidedAt === null || utc(row.decidedAt)) &&
      (row.cardNo === null || str(row.cardNo, 128)) &&
      history(row.history) &&
      utc(row.createdAt) &&
      member(row.member)
    );
  });
}

@Injectable()
export class LoyaltyCardRequestsClient {
  constructor(
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
  ) {}

  async get(
    incomingRequestId?: string,
  ): Promise<LoyaltyCardRequestWire[] | undefined> {
    const config = loyaltyCardRequestsReadConfig({
      LOYALTY_CARD_REQUESTS_READ_ENABLED: this.config.get<string>(
        'LOYALTY_CARD_REQUESTS_READ_ENABLED',
      ),
      LOYALTY_SERVICE_URL: this.config.get<string>('LOYALTY_SERVICE_URL'),
      LOYALTY_INTERNAL_TOKEN: this.config.get<string>('LOYALTY_INTERNAL_TOKEN'),
    });
    if (!config.enabled) return undefined;
    const requestId = requestIdFromHeader(incomingRequestId);
    const fallback = () => {
      this.logger.warn(
        { requestId, reason: 'unavailable' },
        'Loyalty card-requests read using Core fallback',
      );
      return undefined;
    };
    const invalid = () => {
      this.logger.warn(
        { requestId, reason: 'invalid_boundary' },
        'Loyalty card-requests read rejected',
      );
      return new ServiceUnavailableException({
        code: ErrorCode.INTERNAL_ERROR,
        message: 'دریافت صف درخواست کارت باشگاه موقتاً امکان‌پذیر نیست.',
      });
    };
    let response: Response;
    try {
      response = await fetch(
        config.url + '/internal/v1/loyalty/card-requests',
        {
          headers: {
            'X-Internal-Token': config.token,
            'X-Request-Id': requestId,
          },
          redirect: 'manual',
          signal: AbortSignal.timeout(2000),
        },
      );
    } catch {
      return fallback();
    }
    if ([404, 409].includes(response.status) || response.status >= 500) {
      await response.body?.cancel().catch(() => undefined);
      return fallback();
    }
    if (response.status !== 200 || !response.body) {
      await response.body?.cancel().catch(() => undefined);
      throw invalid();
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        size += next.value.byteLength;
        if (size > 512 * 1024) return fallback();
        chunks.push(next.value);
      }
    } catch {
      return fallback();
    } finally {
      await reader.cancel().catch(() => undefined);
    }
    let body: unknown;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
    } catch {
      throw invalid();
    }
    if (
      !record(body) ||
      !exact(body, ['success', 'data']) ||
      body.success !== true ||
      !valid(body.data)
    )
      throw invalid();
    return body.data;
  }
}
