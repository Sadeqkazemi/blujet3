import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isISO8601, isUUID } from 'class-validator';
import { PinoLogger } from 'nestjs-pino';
import { ErrorCode } from '../../common/errors';
import { loyaltyMembershipReadConfig } from '../../config/loyalty-membership-read.config';
import {
  ClubCardRequestStatus,
  ClubCardStatus,
  ClubTier,
} from '../../database/enums';
import { requestIdFromHeader } from '../../gateway/request-id';

export interface CardHistoryEntryWire {
  step: string;
  labelFa: string;
  at: string;
}

export interface CardRequestWire {
  id: string;
  status: ClubCardRequestStatus;
  history: CardHistoryEntryWire[];
  cardNo: string | null;
  createdAt: string;
}

export interface LoyaltyMembershipWire {
  userId: string;
  isMember: boolean;
  level: ClubTier | null;
  balance: string;
  cardStatus: ClubCardStatus | null;
  cardNo: string | null;
  tierRules: {
    goldMinPoints: number;
    platinumMinPoints: number;
    cardRequestMinPoints: number;
  };
  cardRequest: CardRequestWire | null;
  canRequestCard: boolean;
  pointsNeededForCard: string;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exact(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).sort().join(',') === [...keys].sort().join(',');
}

function boundedString(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}

function utc(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    isISO8601(value, { strict: true })
  );
}

function decimal(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^-?\d+$/.test(value) &&
    Number.isSafeInteger(Number(value))
  );
}

function history(value: unknown): value is CardHistoryEntryWire[] {
  return (
    Array.isArray(value) &&
    value.length <= 32 &&
    value.every(
      (entry) =>
        record(entry) &&
        exact(entry, ['step', 'labelFa', 'at']) &&
        boundedString(entry.step, 64) &&
        boundedString(entry.labelFa, 2048) &&
        boundedString(entry.at, 64),
    )
  );
}

function cardRequest(value: unknown): value is CardRequestWire | null {
  if (value === null) return true;
  const readableStatuses: readonly unknown[] = [
    ClubCardRequestStatus.SUBMITTED,
    ClubCardRequestStatus.REFERRED,
    ClubCardRequestStatus.APPROVED,
  ];
  return (
    record(value) &&
    exact(value, ['id', 'status', 'history', 'cardNo', 'createdAt']) &&
    boundedString(value.id, 128) &&
    readableStatuses.includes(value.status) &&
    history(value.history) &&
    (value.cardNo === null || boundedString(value.cardNo, 128)) &&
    utc(value.createdAt)
  );
}

function tierRules(
  value: unknown,
): value is LoyaltyMembershipWire['tierRules'] {
  if (!record(value)) return false;
  return (
    exact(value, [
      'goldMinPoints',
      'platinumMinPoints',
      'cardRequestMinPoints',
    ]) &&
    [
      value.goldMinPoints,
      value.platinumMinPoints,
      value.cardRequestMinPoints,
    ].every((item) => Number.isSafeInteger(item) && Number(item) >= 0) &&
    Number(value.goldMinPoints) < Number(value.platinumMinPoints)
  );
}

function membership(
  value: unknown,
  owner: string,
): value is LoyaltyMembershipWire {
  if (!record(value)) return false;
  const valid =
    exact(value, [
      'userId',
      'isMember',
      'level',
      'balance',
      'cardStatus',
      'cardNo',
      'tierRules',
      'cardRequest',
      'canRequestCard',
      'pointsNeededForCard',
    ]) &&
    value.userId === owner &&
    typeof value.isMember === 'boolean' &&
    decimal(value.balance) &&
    tierRules(value.tierRules) &&
    cardRequest(value.cardRequest) &&
    typeof value.canRequestCard === 'boolean' &&
    decimal(value.pointsNeededForCard);
  if (!valid) return false;
  if (!value.isMember)
    return (
      value.level === null &&
      value.cardStatus === null &&
      value.cardNo === null &&
      value.cardRequest === null &&
      value.balance === '0' &&
      value.canRequestCard === false
    );
  return (
    Object.values(ClubTier).some((level) => level === value.level) &&
    Object.values(ClubCardStatus).some(
      (cardStatus) => cardStatus === value.cardStatus,
    ) &&
    (value.cardNo === null || boundedString(value.cardNo, 128))
  );
}

@Injectable()
export class LoyaltyMembershipClient {
  constructor(
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
  ) {}

  async get(
    owner: string,
    incomingRequestId?: string,
  ): Promise<LoyaltyMembershipWire | undefined> {
    const config = loyaltyMembershipReadConfig({
      LOYALTY_MEMBERSHIP_READ_ENABLED: this.config.get<string>(
        'LOYALTY_MEMBERSHIP_READ_ENABLED',
      ),
      LOYALTY_SERVICE_URL: this.config.get<string>('LOYALTY_SERVICE_URL'),
      LOYALTY_INTERNAL_TOKEN: this.config.get<string>('LOYALTY_INTERNAL_TOKEN'),
    });
    if (!config.enabled) return undefined;
    const requestId = requestIdFromHeader(incomingRequestId);
    const fallback = () => {
      this.logger.warn(
        { requestId, reason: 'unavailable' },
        'Loyalty membership read using Core fallback',
      );
      return undefined;
    };
    const invalid = () => {
      this.logger.warn(
        { requestId, reason: 'invalid_boundary' },
        'Loyalty membership read rejected',
      );
      return new ServiceUnavailableException({
        code: ErrorCode.INTERNAL_ERROR,
        message: 'دریافت عضویت باشگاه موقتاً امکان‌پذیر نیست.',
      });
    };
    if (!isUUID(owner)) throw invalid();
    let response: Response;
    try {
      response = await fetch(
        config.url + '/internal/v1/loyalty/membership/' + owner,
        {
          headers: {
            'X-Internal-Token': config.token,
            'X-Loyalty-User-Id': owner,
            'X-Request-Id': requestId,
          },
          redirect: 'manual',
          signal: AbortSignal.timeout(2000),
        },
      );
    } catch {
      return fallback();
    }
    if (response.status >= 500) {
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
        if (size > 64 * 1024) return fallback();
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
      !membership(body.data, owner)
    )
      throw invalid();
    return body.data;
  }
}
