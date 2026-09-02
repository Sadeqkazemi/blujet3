import type {
  NotificationCategory,
  SmsMessageType,
} from '../../database/enums';

export const NotifyOutboxEventType = {
  NOTIFICATION_CREATED: 'NOTIFICATION_CREATED',
  SMS_REQUESTED: 'SMS_REQUESTED',
} as const;
export type NotifyOutboxEventType =
  (typeof NotifyOutboxEventType)[keyof typeof NotifyOutboxEventType];

export interface NotificationCreatedPayload {
  recipientId: string;
  category: NotificationCategory;
  action: string;
  title: string;
  body?: string;
  entityType?: string;
  entityId?: string;
  dedupeKey?: string;
}

export interface SmsProviderSnapshot {
  mode: 'KAVENEGAR' | 'MOCK' | 'UNAVAILABLE';
  apiKeyEncrypted?: string;
  senderLine?: string;
}

export interface SmsRequestedPayload {
  phone: string | null;
  message: string;
  messageType: SmsMessageType;
  provider: SmsProviderSnapshot;
}

export interface NotifyOutboxPayloadByType {
  NOTIFICATION_CREATED: NotificationCreatedPayload;
  SMS_REQUESTED: SmsRequestedPayload;
}

export interface NotificationView {
  id: string;
  recipientId: string;
  category: NotificationCategory;
  action: string;
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  dedupeKey: string | null;
  readAt: Date | null;
  createdAt: Date;
}

export interface NotificationUnreadCount {
  total: number;
  CARTABLE: number;
  MESSAGE: number;
  REQUEST: number;
  APPROVAL: number;
  SYSTEM: number;
}

export interface SmsLogReport {
  todaySuccessCount: number;
  todayFailedCount: number;
  recent: Array<{
    id: string;
    phoneMasked: string | null;
    messageType: SmsMessageType;
    status: 'SUCCESS' | 'FAILED';
    failureReason: string | null;
    createdAt: Date | string;
  }>;
}
