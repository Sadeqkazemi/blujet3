import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { isISO8601, isUUID } from 'class-validator';
import { agencyInvoiceReadConfig } from '../../config/agency-invoice-read.config';
import { ErrorCode } from '../../common/errors';
import { AgencyInvoiceStatus } from '../../database/enums';
import { requestIdFromHeader } from '../../gateway/request-id';

export interface PortalInvoiceWire {
  id: string;
  agencyId: string;
  bookingId: string | null;
  invoiceNo: string;
  issuedById: string;
  issuedAt: string;
  dueAt: string;
  amountIrr: string;
  descriptionFa: string | null;
  status: AgencyInvoiceStatus;
  paidAt: string | null;
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
function invoice(value: unknown, owner: string): value is PortalInvoiceWire {
  return (
    record(value) &&
    Object.keys(value).sort().join(',') ===
      'agencyId,amountIrr,bookingId,descriptionFa,dueAt,id,invoiceNo,issuedAt,issuedById,paidAt,status' &&
    typeof value.id === 'string' &&
    isUUID(value.id) &&
    value.agencyId === owner &&
    (value.bookingId === null ||
      (typeof value.bookingId === 'string' && isUUID(value.bookingId))) &&
    typeof value.issuedById === 'string' &&
    isUUID(value.issuedById) &&
    typeof value.invoiceNo === 'string' &&
    typeof value.amountIrr === 'string' &&
    /^(0|-?[1-9]\d*)$/.test(value.amountIrr) &&
    (value.descriptionFa === null || typeof value.descriptionFa === 'string') &&
    typeof value.status === 'string' &&
    Object.values(AgencyInvoiceStatus).some(
      (status) => status === value.status,
    ) &&
    utc(value.issuedAt) &&
    utc(value.dueAt) &&
    (value.paidAt === null || utc(value.paidAt))
  );
}

@Injectable()
export class AgencyInvoiceClient {
  constructor(
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
  ) {}

  async list(
    owner: string,
    incomingRequestId?: string,
  ): Promise<PortalInvoiceWire[] | undefined> {
    const config = agencyInvoiceReadConfig({
      AGENCY_INVOICES_READ_ENABLED: this.config.get<string>(
        'AGENCY_INVOICES_READ_ENABLED',
      ),
      AGENCY_SERVICE_URL: this.config.get<string>('AGENCY_SERVICE_URL'),
      AGENCY_INTERNAL_TOKEN: this.config.get<string>('AGENCY_INTERNAL_TOKEN'),
    });
    if (!config.enabled) return undefined;
    const requestId = requestIdFromHeader(incomingRequestId);
    const fail = () => {
      this.logger.warn(
        { requestId, reason: 'invalid_boundary' },
        'Agency invoice read rejected',
      );
      return new ServiceUnavailableException({
        code: ErrorCode.INTERNAL_ERROR,
        message: 'دریافت فاکتورها موقتاً امکان‌پذیر نیست.',
      });
    };
    if (!isUUID(owner)) throw fail();
    const fallback = () => {
      this.logger.warn(
        { requestId, reason: 'unavailable' },
        'Agency invoice read using Core fallback',
      );
      return undefined;
    };
    let response: Response;
    try {
      response = await fetch(
        config.url + '/internal/v1/agencies/' + owner + '/portal-invoices',
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
      await response.body?.cancel();
      return fallback();
    }
    if (response.status !== 200 || !response.body) {
      await response.body?.cancel();
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
      !body.data.every((row: unknown) => invoice(row, owner))
    )
      throw fail();
    const rows = body.data;
    if (
      new Set(rows.map((row) => row.id)).size !== rows.length ||
      rows.some(
        (row, index) => index > 0 && row.issuedAt > rows[index - 1].issuedAt,
      )
    )
      throw fail();
    return rows;
  }
}
