export type NotificationCategory =
  | 'CARTABLE'
  | 'MESSAGE'
  | 'REQUEST'
  | 'APPROVAL'
  | 'SYSTEM';

export interface NotificationRow {
  id: string;
  recipientId: string;
  category: NotificationCategory;
  action: string;
  title: string;
  body: string;
  entityType: string | null;
  entityId: string | null;
  dedupeKey: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationsUnreadCount {
  total: number;
  CARTABLE: number;
  MESSAGE: number;
  REQUEST: number;
  APPROVAL: number;
  SYSTEM: number;
}
