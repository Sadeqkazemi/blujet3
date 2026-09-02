import { apiGet, apiPatch } from './http';
import type {
  NotificationCategory,
  NotificationRow,
  NotificationsUnreadCount,
} from '../types/notifications';

export function fetchNotifications(query?: {
  category?: NotificationCategory;
  unreadOnly?: boolean;
  limit?: number;
  offset?: number;
}) {
  const params = new URLSearchParams();
  if (query?.category) params.set('category', query.category);
  if (query?.unreadOnly) params.set('unreadOnly', 'true');
  if (query?.limit != null) params.set('limit', String(query.limit));
  if (query?.offset != null) params.set('offset', String(query.offset));
  const qs = params.toString();
  return apiGet<NotificationRow[]>(`/notifications${qs ? `?${qs}` : ''}`);
}

export function fetchNotificationsUnreadCount() {
  return apiGet<NotificationsUnreadCount>('/notifications/unread-count');
}

export function markNotificationRead(id: string) {
  return apiPatch<NotificationRow>(`/notifications/${id}/read`);
}

export function markAllNotificationsRead() {
  return apiPatch<{ updated: number } | NotificationRow[]>('/notifications/read-all');
}
