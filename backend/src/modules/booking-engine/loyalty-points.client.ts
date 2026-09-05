import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isUUID } from 'class-validator';
import { PinoLogger } from 'nestjs-pino';
import { ErrorCode } from '../../common/errors';
import { requestIdFromHeader } from '../../gateway/request-id';
import { loyaltyPointsReadConfig } from '../../config/loyalty-points-read.config';

export interface LoyaltyMemberWire {
  id: string;
  userId: string;
  level: string;
  cardStatus: string;
  points: string;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function member(value: unknown, owner: string): value is LoyaltyMemberWire {
  return (
    record(value) &&
    Object.keys(value).sort().join(',') ===
      'cardStatus,id,level,points,userId' &&
    value.userId === owner &&
    typeof value.id === 'string' &&
    typeof value.level === 'string' &&
    typeof value.cardStatus === 'string' &&
    typeof value.points === 'string' &&
    /^-?\d+$/.test(value.points) &&
    Number.isSafeInteger(Number(value.points))
  );
}

@Injectable()
export class LoyaltyPointsClient {
  constructor(
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
  ) {}

  async get(
    owner: string,
    incomingRequestId?: string,
  ): Promise<LoyaltyMemberWire | null | undefined> {
    const config = loyaltyPointsReadConfig({
      LOYALTY_POINTS_READ_ENABLED: this.config.get<string>(
        'LOYALTY_POINTS_READ_ENABLED',
      ),
      LOYALTY_SERVICE_URL: this.config.get<string>('LOYALTY_SERVICE_URL'),
      LOYALTY_INTERNAL_TOKEN: this.config.get<string>('LOYALTY_INTERNAL_TOKEN'),
    });
    if (!config.enabled) return undefined;
    const requestId = requestIdFromHeader(incomingRequestId);
    const unavailable = () => {
      this.logger.warn(
        { requestId, reason: 'unavailable' },
        'Loyalty points read using Core fallback',
      );
      return undefined;
    };
    const invalid = () => {
      this.logger.warn(
        { requestId, reason: 'invalid_boundary' },
        'Loyalty points read rejected',
      );
      return new ServiceUnavailableException({
        code: ErrorCode.INTERNAL_ERROR,
        message: 'دریافت امتیاز باشگاه موقتاً امکان‌پذیر نیست.',
      });
    };
    if (!isUUID(owner)) throw invalid();
    let response: Response;
    try {
      response = await fetch(
        config.url + '/internal/v1/loyalty/members/' + owner,
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
    if (response.status === 404) {
      await response.body?.cancel().catch(() => undefined);
      return null;
    }
    if (response.status >= 500) {
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
        if (size > 16 * 1024) return unavailable();
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
      !member(body.data, owner)
    )
      throw invalid();
    return body.data;
  }
}
