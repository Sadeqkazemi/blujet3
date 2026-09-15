import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isISO8601, isUUID } from 'class-validator';
import { PinoLogger } from 'nestjs-pino';
import { ErrorCode } from '../../common/errors';
import { opsAdminCartableUnreadReadConfig } from '../../config/ops-admin-cartable-unread-read.config';
import { requestIdFromHeader } from '../../gateway/request-id';

interface OpsAdminCartableUnreadWire {
  assigneeId: string;
  count: number;
  observedAt: string;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exact(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).sort().join(',') === [...keys].sort().join(',');
}

function utc(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    isISO8601(value, { strict: true })
  );
}

function unreadProjection(
  value: unknown,
  assigneeId: string,
): value is OpsAdminCartableUnreadWire {
  return (
    record(value) &&
    exact(value, ['assigneeId', 'count', 'observedAt']) &&
    value.assigneeId === assigneeId &&
    Number.isSafeInteger(value.count) &&
    Number(value.count) >= 0 &&
    utc(value.observedAt)
  );
}

@Injectable()
export class OpsAdminCartableUnreadClient {
  constructor(
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
  ) {}

  async get(
    assigneeId: string,
    incomingRequestId?: string,
  ): Promise<number | undefined> {
    const config = opsAdminCartableUnreadReadConfig({
      OPS_ADMIN_CARTABLE_UNREAD_READ_ENABLED: this.config.get<string>(
        'OPS_ADMIN_CARTABLE_UNREAD_READ_ENABLED',
      ),
      OPS_ADMIN_SERVICE_URL: this.config.get<string>('OPS_ADMIN_SERVICE_URL'),
      OPS_ADMIN_INTERNAL_TOKEN: this.config.get<string>(
        'OPS_ADMIN_INTERNAL_TOKEN',
      ),
    });
    if (!config.enabled) return undefined;

    const requestId = requestIdFromHeader(incomingRequestId);
    const fallback = () => {
      this.logger.warn(
        { requestId, reason: 'unavailable' },
        'Ops/Admin cartable unread read using Core fallback',
      );
      return undefined;
    };
    const invalid = () => {
      this.logger.warn(
        { requestId, reason: 'invalid_boundary' },
        'Ops/Admin cartable unread read rejected',
      );
      return new ServiceUnavailableException({
        code: ErrorCode.INTERNAL_ERROR,
        message: 'دریافت شمارندهٔ کارتابل موقتاً امکان‌پذیر نیست.',
      });
    };
    if (!isUUID(assigneeId)) throw invalid();

    let response: Response;
    try {
      response = await fetch(
        `${config.url}/internal/v1/ops-admin/cartable/unread-count`,
        {
          headers: {
            'X-Internal-Token': config.token,
            'X-Ops-Admin-Assignee-Id': assigneeId,
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
      !unreadProjection(body.data, assigneeId)
    )
      throw invalid();
    return body.data.count;
  }
}
