import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isISO8601, isUUID } from 'class-validator';
import { PinoLogger } from 'nestjs-pino';
import { ErrorCode } from '../../common/errors';
import { agencyProfileReadConfig } from '../../config/agency-profile-read.config';
import { AgencyTier } from '../../database/enums';
import { requestIdFromHeader } from '../../gateway/request-id';

export interface PortalProfileWire {
  agencyId: string;
  managerName: string;
  licenseNo: string;
  phone: string;
  email: string;
  city: string;
  address: string;
  tier: AgencyTier;
  suspendedAt: string | null;
  suspendReason: string | null;
  joinedAt: string;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function utc(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    isISO8601(value, { strict: true })
  );
}

function profile(value: unknown, owner: string): value is PortalProfileWire {
  return (
    record(value) &&
    Object.keys(value).sort().join(',') ===
      'address,agencyId,city,email,joinedAt,licenseNo,managerName,phone,suspendReason,suspendedAt,tier' &&
    value.agencyId === owner &&
    typeof value.managerName === 'string' &&
    typeof value.licenseNo === 'string' &&
    typeof value.phone === 'string' &&
    typeof value.email === 'string' &&
    typeof value.city === 'string' &&
    typeof value.address === 'string' &&
    typeof value.tier === 'string' &&
    Object.values(AgencyTier).some((tier) => tier === value.tier) &&
    (value.suspendedAt === null || utc(value.suspendedAt)) &&
    (value.suspendReason === null || typeof value.suspendReason === 'string') &&
    utc(value.joinedAt)
  );
}

@Injectable()
export class AgencyProfileClient {
  constructor(
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
  ) {}

  async get(
    owner: string,
    incomingRequestId?: string,
  ): Promise<PortalProfileWire | undefined> {
    const config = agencyProfileReadConfig({
      AGENCY_PROFILE_READ_ENABLED: this.config.get<string>(
        'AGENCY_PROFILE_READ_ENABLED',
      ),
      AGENCY_SERVICE_URL: this.config.get<string>('AGENCY_SERVICE_URL'),
      AGENCY_INTERNAL_TOKEN: this.config.get<string>('AGENCY_INTERNAL_TOKEN'),
    });
    if (!config.enabled) return undefined;
    const requestId = requestIdFromHeader(incomingRequestId);
    const fail = () => {
      this.logger.warn(
        { requestId, reason: 'invalid_boundary' },
        'Agency profile read rejected',
      );
      return new ServiceUnavailableException({
        code: ErrorCode.INTERNAL_ERROR,
        message: 'دریافت پروفایل موقتاً امکان‌پذیر نیست.',
      });
    };
    if (!isUUID(owner)) throw fail();
    const fallback = () => {
      this.logger.warn(
        { requestId, reason: 'unavailable' },
        'Agency profile read using Core fallback',
      );
      return undefined;
    };
    let response: Response;
    try {
      response = await fetch(
        config.url + '/internal/v1/agencies/' + owner + '/portal-profile',
        {
          headers: {
            'X-Internal-Token': config.token,
            'X-Agency-Id': owner,
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
    if (response.status === 404) {
      await response.body?.cancel().catch(() => undefined);
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'پروفایل آژانس یافت نشد.',
      });
    }
    if (response.status !== 200 || !response.body) {
      await response.body?.cancel().catch(() => undefined);
      throw fail();
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
      throw fail();
    }
    if (
      !record(body) ||
      Object.keys(body).sort().join(',') !== 'data,success' ||
      body.success !== true ||
      !profile(body.data, owner)
    )
      throw fail();
    return body.data;
  }
}
