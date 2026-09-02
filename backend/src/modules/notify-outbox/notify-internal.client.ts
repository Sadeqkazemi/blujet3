import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { ErrorCode } from '../../common/errors';
import type { NotificationCategory } from '../../database/enums';
import type { NotifyOutboxEvent } from '../../database/entities/notify-outbox-event.entity';
import type {
  NotificationUnreadCount,
  NotificationView,
  SmsLogReport,
} from './notify-outbox.contract';

interface InternalEnvelope {
  success: boolean;
  data?: unknown;
}

type NotificationWire = Omit<NotificationView, 'readAt' | 'createdAt'> & {
  readAt: string | null;
  createdAt: string;
};

function toNotificationView(row: NotificationWire): NotificationView {
  return {
    ...row,
    readAt: row.readAt ? new Date(row.readAt) : null,
    createdAt: new Date(row.createdAt),
  };
}

function isInternalEnvelope(value: unknown): value is InternalEnvelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    'success' in value &&
    typeof value.success === 'boolean'
  );
}

@Injectable()
export class NotifyInternalClient {
  enabled(): boolean {
    return process.env.NOTIFY_INTEGRATION_ENABLED === 'true';
  }

  async dispatch(event: NotifyOutboxEvent): Promise<void> {
    await this.request(
      '/internal/v1/events',
      {
        method: 'POST',
        body: JSON.stringify({
          eventId: event.id,
          eventType: event.eventType,
          payloadEncrypted: event.payloadEncrypted,
        }),
      },
      Number(process.env.NOTIFY_EVENT_TIMEOUT_MS ?? 15_000),
    );
  }

  async list(
    actor: AuthenticatedUser,
    query: {
      category?: NotificationCategory;
      unreadOnly?: boolean;
      limit?: number;
      offset?: number;
    },
  ): Promise<NotificationView[]> {
    const params = this.recipientParams(actor);
    if (query.category) params.set('category', query.category);
    if (query.unreadOnly !== undefined) {
      params.set('unreadOnly', String(query.unreadOnly));
    }
    if (query.limit !== undefined) params.set('limit', String(query.limit));
    if (query.offset !== undefined) params.set('offset', String(query.offset));
    const rows = await this.request<NotificationWire[]>(
      `/internal/v1/notifications?${params.toString()}`,
    );
    return rows.map(toNotificationView);
  }

  unreadCount(actor: AuthenticatedUser): Promise<NotificationUnreadCount> {
    return this.request(
      `/internal/v1/notifications/unread-count?${this.recipientParams(actor).toString()}`,
    );
  }

  async markRead(
    actor: AuthenticatedUser,
    id: string,
  ): Promise<NotificationView> {
    const row = await this.request<NotificationWire>(
      `/internal/v1/notifications/${encodeURIComponent(id)}/read`,
      {
        method: 'PATCH',
        body: JSON.stringify({ recipientId: actor.id, role: actor.role }),
      },
    );
    return toNotificationView(row);
  }

  markAllRead(actor: AuthenticatedUser): Promise<{ updated: number }> {
    return this.request('/internal/v1/notifications/read-all', {
      method: 'PATCH',
      body: JSON.stringify({ recipientId: actor.id, role: actor.role }),
    });
  }

  async listByEntityType(entityType: string): Promise<NotificationView[]> {
    const params = new URLSearchParams({ entityType });
    const rows = await this.request<NotificationWire[]>(
      `/internal/v1/notifications/by-entity?${params.toString()}`,
    );
    return rows.map(toNotificationView);
  }

  smsLog(): Promise<SmsLogReport> {
    return this.request('/internal/v1/sms-log');
  }

  private recipientParams(actor: AuthenticatedUser): URLSearchParams {
    return new URLSearchParams({ recipientId: actor.id, role: actor.role });
  }

  private async request<T = unknown>(
    path: string,
    init: RequestInit = {},
    timeoutMs = Number(process.env.NOTIFY_REQUEST_TIMEOUT_MS ?? 3000),
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(
        `${process.env.NOTIFY_SERVICE_URL ?? 'http://notify-service:3200'}${path}`,
        {
          ...init,
          signal: controller.signal,
          headers: {
            'content-type': 'application/json',
            'x-internal-token': process.env.NOTIFY_INTERNAL_TOKEN ?? '',
            ...init.headers,
          },
        },
      );
      if (response.status === 404) {
        throw new NotFoundException({
          code: ErrorCode.NOT_FOUND,
          message: 'اعلان یافت نشد.',
        });
      }
      if (!response.ok) throw this.unavailable();
      const body: unknown = await response.json();
      if (!isInternalEnvelope(body) || !body.success) throw this.unavailable();
      return body.data as T;
    } catch (error) {
      if (
        error instanceof ServiceUnavailableException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      throw this.unavailable();
    } finally {
      clearTimeout(timeout);
    }
  }

  private unavailable(): ServiceUnavailableException {
    return new ServiceUnavailableException({
      code: ErrorCode.NOTIFY_UNAVAILABLE,
      message: 'سرویس اعلان موقتاً در دسترس نیست.',
    });
  }
}
