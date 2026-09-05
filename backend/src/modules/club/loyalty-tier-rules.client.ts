import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isISO8601, isUUID } from 'class-validator';
import { PinoLogger } from 'nestjs-pino';
import { ErrorCode } from '../../common/errors';
import { loyaltyTierRulesReadConfig } from '../../config/loyalty-tier-rules-read.config';
import { requestIdFromHeader } from '../../gateway/request-id';

export interface LoyaltyTierRulesWire {
  goldMinPoints: number;
  platinumMinPoints: number;
  cardRequestMinPoints: number;
  updatedAt: string;
  updatedById: string | null;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exact(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).sort().join(',') === [...keys].sort().join(',');
}

function valid(value: unknown): value is LoyaltyTierRulesWire {
  if (!record(value)) return false;
  const integers = [
    value.goldMinPoints,
    value.platinumMinPoints,
    value.cardRequestMinPoints,
  ];
  return (
    exact(value, [
      'goldMinPoints',
      'platinumMinPoints',
      'cardRequestMinPoints',
      'updatedAt',
      'updatedById',
    ]) &&
    integers.every((item) => Number.isSafeInteger(item) && Number(item) >= 0) &&
    Number(value.goldMinPoints) < Number(value.platinumMinPoints) &&
    typeof value.updatedAt === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.updatedAt) &&
    isISO8601(value.updatedAt, { strict: true }) &&
    (value.updatedById === null ||
      (typeof value.updatedById === 'string' && isUUID(value.updatedById)))
  );
}

@Injectable()
export class LoyaltyTierRulesClient {
  constructor(
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
  ) {}

  async get(
    incomingRequestId?: string,
  ): Promise<LoyaltyTierRulesWire | undefined> {
    const config = loyaltyTierRulesReadConfig({
      LOYALTY_TIER_RULES_READ_ENABLED: this.config.get<string>(
        'LOYALTY_TIER_RULES_READ_ENABLED',
      ),
      LOYALTY_SERVICE_URL: this.config.get<string>('LOYALTY_SERVICE_URL'),
      LOYALTY_INTERNAL_TOKEN: this.config.get<string>('LOYALTY_INTERNAL_TOKEN'),
    });
    if (!config.enabled) return undefined;
    const requestId = requestIdFromHeader(incomingRequestId);
    const fallback = () => {
      this.logger.warn(
        { requestId, reason: 'unavailable' },
        'Loyalty tier-rules read using Core fallback',
      );
      return undefined;
    };
    const invalid = () => {
      this.logger.warn(
        { requestId, reason: 'invalid_boundary' },
        'Loyalty tier-rules read rejected',
      );
      return new ServiceUnavailableException({
        code: ErrorCode.INTERNAL_ERROR,
        message: 'دریافت قوانین باشگاه موقتاً امکان‌پذیر نیست.',
      });
    };
    let response: Response;
    try {
      response = await fetch(config.url + '/internal/v1/loyalty/tier-rules', {
        headers: {
          'X-Internal-Token': config.token,
          'X-Request-Id': requestId,
        },
        redirect: 'manual',
        signal: AbortSignal.timeout(2000),
      });
    } catch {
      return fallback();
    }
    if (response.status === 404 || response.status >= 500) {
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
        if (size > 16 * 1024) return fallback();
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
