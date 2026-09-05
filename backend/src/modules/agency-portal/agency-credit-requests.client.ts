import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { isISO8601, isUUID } from 'class-validator';
import { agencyCreditRequestsReadConfig } from '../../config/agency-credit-requests-read.config';
import { ErrorCode } from '../../common/errors';
import { AgencyCreditRequestStatus } from '../../database/enums';
import { requestIdFromHeader } from '../../gateway/request-id';

export interface PortalCreditRequestWire {
  id: string;
  agencyId: string;
  requestedLimitIrr: string;
  note: string | null;
  status: AgencyCreditRequestStatus;
  decidedById: string | null;
  decidedAt: string | null;
  createdAt: string;
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
function creditRequest(
  value: unknown,
  owner: string,
): value is PortalCreditRequestWire {
  return (
    record(value) &&
    Object.keys(value).sort().join(',') ===
      'agencyId,createdAt,decidedAt,decidedById,id,note,requestedLimitIrr,status' &&
    typeof value.id === 'string' &&
    isUUID(value.id) &&
    value.agencyId === owner &&
    typeof value.requestedLimitIrr === 'string' &&
    /^(0|-?[1-9]\d*)$/.test(value.requestedLimitIrr) &&
    (value.note === null || typeof value.note === 'string') &&
    Object.values(AgencyCreditRequestStatus).some(
      (status) => status === value.status,
    ) &&
    (value.decidedById === null ||
      (typeof value.decidedById === 'string' && isUUID(value.decidedById))) &&
    (value.decidedAt === null || utc(value.decidedAt)) &&
    utc(value.createdAt)
  );
}

@Injectable()
export class AgencyCreditRequestsClient {
  constructor(
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
  ) {}

  async list(
    owner: string,
    incomingRequestId?: string,
  ): Promise<PortalCreditRequestWire[] | undefined> {
    const config = agencyCreditRequestsReadConfig({
      AGENCY_CREDIT_REQUESTS_READ_ENABLED: this.config.get<string>(
        'AGENCY_CREDIT_REQUESTS_READ_ENABLED',
      ),
      AGENCY_SERVICE_URL: this.config.get<string>('AGENCY_SERVICE_URL'),
      AGENCY_INTERNAL_TOKEN: this.config.get<string>('AGENCY_INTERNAL_TOKEN'),
    });
    if (!config.enabled) return undefined;
    const requestId = requestIdFromHeader(incomingRequestId);
    const fail = () => {
      this.logger.warn(
        { requestId, reason: 'invalid_boundary' },
        'Agency credit-request read rejected',
      );
      return new ServiceUnavailableException({
        code: ErrorCode.INTERNAL_ERROR,
        message: 'دریافت درخواست‌های اعتبار موقتاً امکان‌پذیر نیست.',
      });
    };
    if (!isUUID(owner)) throw fail();
    const fallback = () => {
      this.logger.warn(
        { requestId, reason: 'unavailable' },
        'Agency credit-request read using Core fallback',
      );
      return undefined;
    };
    let response: Response;
    try {
      response = await fetch(
        config.url +
          '/internal/v1/agencies/' +
          owner +
          '/portal-credit-requests',
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
        if (size > 1024 * 1024) return fallback();
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
      !Array.isArray(body.data) ||
      body.data.length > 1000 ||
      !body.data.every((row: unknown) => creditRequest(row, owner))
    )
      throw fail();
    const rows = body.data;
    if (
      new Set(rows.map((row) => row.id)).size !== rows.length ||
      rows.some(
        (row, index) => index > 0 && row.createdAt > rows[index - 1].createdAt,
      )
    )
      throw fail();
    return rows;
  }
}
