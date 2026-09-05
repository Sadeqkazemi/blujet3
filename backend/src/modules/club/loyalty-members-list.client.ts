import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isISO8601 } from 'class-validator';
import { PinoLogger } from 'nestjs-pino';
import { ErrorCode } from '../../common/errors';
import { loyaltyMembersListReadConfig } from '../../config/loyalty-members-list-read.config';
import { ClubCardStatus, ClubTier } from '../../database/enums';
import { requestIdFromHeader } from '../../gateway/request-id';

export interface LoyaltyMemberListWire {
  id: string;
  userId: string | null;
  fullName: string;
  email: string;
  birthDate: string | null;
  joinDate: string;
  points: number;
  level: ClubTier;
  cardStatus: ClubCardStatus;
  cardNo: string | null;
  issuedByLabelFa: string | null;
  createdAt: string;
}

export interface LoyaltyMembersListWire {
  members: LoyaltyMemberListWire[];
  kpis: {
    totalMembers: number;
    issuedCards: number;
    pendingRequests: number;
    submittedRequests: number;
    tierCounts: Record<ClubTier, number>;
  };
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exact(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).sort().join(',') === [...keys].sort().join(',');
}

function bounded(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}

function utc(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    isISO8601(value, { strict: true })
  );
}

function member(value: unknown): value is LoyaltyMemberListWire {
  if (!record(value)) return false;
  return (
    exact(value, [
      'id',
      'userId',
      'fullName',
      'email',
      'birthDate',
      'joinDate',
      'points',
      'level',
      'cardStatus',
      'cardNo',
      'issuedByLabelFa',
      'createdAt',
    ]) &&
    bounded(value.id, 128) &&
    (value.userId === null || bounded(value.userId, 128)) &&
    bounded(value.fullName, 512) &&
    bounded(value.email, 512) &&
    (value.birthDate === null || utc(value.birthDate)) &&
    utc(value.joinDate) &&
    Number.isSafeInteger(value.points) &&
    Object.values(ClubTier).some((level) => level === value.level) &&
    Object.values(ClubCardStatus).some(
      (cardStatus) => cardStatus === value.cardStatus,
    ) &&
    (value.cardNo === null || bounded(value.cardNo, 128)) &&
    (value.issuedByLabelFa === null || bounded(value.issuedByLabelFa, 128)) &&
    utc(value.createdAt)
  );
}

function nonnegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function valid(value: unknown): value is LoyaltyMembersListWire {
  if (
    !record(value) ||
    !exact(value, ['members', 'kpis']) ||
    !Array.isArray(value.members) ||
    value.members.length > 1000 ||
    !value.members.every(member) ||
    !record(value.kpis) ||
    !exact(value.kpis, [
      'totalMembers',
      'issuedCards',
      'pendingRequests',
      'submittedRequests',
      'tierCounts',
    ]) ||
    !record(value.kpis.tierCounts) ||
    !exact(value.kpis.tierCounts, ['SILVER', 'GOLD', 'PLATINUM'])
  )
    return false;
  const counts = [
    value.kpis.totalMembers,
    value.kpis.issuedCards,
    value.kpis.pendingRequests,
    value.kpis.submittedRequests,
    value.kpis.tierCounts.SILVER,
    value.kpis.tierCounts.GOLD,
    value.kpis.tierCounts.PLATINUM,
  ];
  return (
    counts.every(nonnegativeInteger) &&
    Number(value.kpis.issuedCards) <= Number(value.kpis.totalMembers) &&
    Number(value.kpis.tierCounts.SILVER) +
      Number(value.kpis.tierCounts.GOLD) +
      Number(value.kpis.tierCounts.PLATINUM) ===
      Number(value.kpis.totalMembers)
  );
}

@Injectable()
export class LoyaltyMembersListClient {
  constructor(
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
  ) {}

  async get(
    query: { level?: ClubTier; q?: string },
    incomingRequestId?: string,
  ): Promise<LoyaltyMembersListWire | undefined> {
    const config = loyaltyMembersListReadConfig({
      LOYALTY_MEMBERS_LIST_READ_ENABLED: this.config.get<string>(
        'LOYALTY_MEMBERS_LIST_READ_ENABLED',
      ),
      LOYALTY_SERVICE_URL: this.config.get<string>('LOYALTY_SERVICE_URL'),
      LOYALTY_INTERNAL_TOKEN: this.config.get<string>('LOYALTY_INTERNAL_TOKEN'),
    });
    if (!config.enabled) return undefined;
    const requestId = requestIdFromHeader(incomingRequestId);
    const fallback = () => {
      this.logger.warn(
        { requestId, reason: 'unavailable' },
        'Loyalty members-list read using Core fallback',
      );
      return undefined;
    };
    const invalid = () => {
      this.logger.warn(
        { requestId, reason: 'invalid_boundary' },
        'Loyalty members-list read rejected',
      );
      return new ServiceUnavailableException({
        code: ErrorCode.INTERNAL_ERROR,
        message: 'دریافت فهرست اعضای باشگاه موقتاً امکان‌پذیر نیست.',
      });
    };
    const search = new URLSearchParams();
    if (query.level) search.set('level', query.level);
    if (query.q !== undefined) search.set('q', query.q);
    const suffix = search.size ? '?' + search.toString() : '';
    let response: Response;
    try {
      response = await fetch(
        config.url + '/internal/v1/loyalty/members-list' + suffix,
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
