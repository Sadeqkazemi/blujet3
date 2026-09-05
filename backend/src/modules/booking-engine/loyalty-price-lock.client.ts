import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isUUID } from 'class-validator';
import { PinoLogger } from 'nestjs-pino';
import { ErrorCode } from '../../common/errors';
import { requestIdFromHeader } from '../../gateway/request-id';
import { loyaltyPriceLockReadConfig } from '../../config/loyalty-price-lock-read.config';

const CABINS = new Set(['ECONOMY', 'BUSINESS', 'COMFORT']);
const STATUSES = new Set(['ACTIVE', 'USED', 'EXPIRED', 'CANCELLED']);
const MAX_BODY_BYTES = 512 * 1024;

export interface LoyaltyPriceLockWire {
  id: string;
  flightInstanceId: string;
  cabin: string;
  lockedPriceIrr: string;
  feeIrr: string;
  status: string;
  expiresAt: string;
  createdAt: string;
  bookingId: string | null;
}

export interface LoyaltyPriceLockHistoryWire {
  userId: string;
  locks: LoyaltyPriceLockWire[];
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 200;
}

function irr(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d+$/.test(value) || value.length > 19)
    return false;
  try {
    return BigInt(value) <= 9_223_372_036_854_775_807n;
  } catch {
    return false;
  }
}

function utc(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  )
    return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function lock(value: unknown): value is LoyaltyPriceLockWire {
  return (
    record(value) &&
    Object.keys(value).sort().join(',') ===
      'bookingId,cabin,createdAt,expiresAt,feeIrr,flightInstanceId,id,lockedPriceIrr,status' &&
    text(value.id) &&
    text(value.flightInstanceId) &&
    typeof value.cabin === 'string' &&
    CABINS.has(value.cabin) &&
    irr(value.lockedPriceIrr) &&
    irr(value.feeIrr) &&
    typeof value.status === 'string' &&
    STATUSES.has(value.status) &&
    utc(value.expiresAt) &&
    utc(value.createdAt) &&
    (value.bookingId === null || text(value.bookingId))
  );
}

function history(
  value: unknown,
  owner: string,
): value is LoyaltyPriceLockHistoryWire {
  if (
    !record(value) ||
    Object.keys(value).sort().join(',') !== 'locks,userId' ||
    value.userId !== owner ||
    !Array.isArray(value.locks) ||
    value.locks.length > 1000 ||
    !value.locks.every((item: unknown) => lock(item))
  )
    return false;
  const ids = new Set<string>();
  for (let index = 0; index < value.locks.length; index += 1) {
    const current = value.locks[index];
    if (ids.has(current.id)) return false;
    ids.add(current.id);
    const previous = value.locks[index - 1];
    if (
      previous &&
      (previous.createdAt < current.createdAt ||
        (previous.createdAt === current.createdAt && previous.id < current.id))
    )
      return false;
  }
  return true;
}

@Injectable()
export class LoyaltyPriceLockClient {
  constructor(
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
  ) {}

  async get(
    owner: string,
    incomingRequestId?: string,
  ): Promise<LoyaltyPriceLockHistoryWire | undefined> {
    const config = loyaltyPriceLockReadConfig({
      LOYALTY_PRICE_LOCK_READ_ENABLED: this.config.get<string>(
        'LOYALTY_PRICE_LOCK_READ_ENABLED',
      ),
      LOYALTY_SERVICE_URL: this.config.get<string>('LOYALTY_SERVICE_URL'),
      LOYALTY_INTERNAL_TOKEN: this.config.get<string>('LOYALTY_INTERNAL_TOKEN'),
    });
    if (!config.enabled) return undefined;
    const requestId = requestIdFromHeader(incomingRequestId);
    const unavailable = () => {
      this.logger.warn(
        { requestId, reason: 'unavailable' },
        'Loyalty price-lock read using Core fallback',
      );
      return undefined;
    };
    const invalid = () => {
      this.logger.warn(
        { requestId, reason: 'invalid_boundary' },
        'Loyalty price-lock read rejected',
      );
      return new ServiceUnavailableException({
        code: ErrorCode.INTERNAL_ERROR,
        message: 'دریافت قفل‌های قیمت موقتاً امکان‌پذیر نیست.',
      });
    };
    if (!isUUID(owner)) throw invalid();
    let response: Response;
    try {
      response = await fetch(
        config.url + '/internal/v1/loyalty/price-lock-history/' + owner,
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
      return unavailable();
    }
    if (
      response.status >= 500 ||
      response.status === 404 ||
      response.status === 409
    ) {
      await response.body?.cancel().catch(() => undefined);
      return unavailable();
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
        if (size > MAX_BODY_BYTES) return unavailable();
        chunks.push(next.value);
      }
    } catch {
      return unavailable();
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
      Object.keys(body).sort().join(',') !== 'data,success' ||
      body.success !== true ||
      !history(body.data, owner)
    )
      throw invalid();
    return body.data;
  }
}
