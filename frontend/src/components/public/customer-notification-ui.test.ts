import { describe, expect, it } from 'vitest';
import {
  customerNotificationTarget,
  formatNotificationTime,
  notificationCategoryIcon,
} from './customer-notification-ui';
import type { NotificationRow } from '../../types/notifications';

function row(partial: Partial<NotificationRow>): NotificationRow {
  return {
    id: 'n1',
    recipientId: 'u1',
    category: 'SYSTEM',
    action: 'INFO',
    title: 't',
    body: 'b',
    entityType: null,
    entityId: null,
    dedupeKey: null,
    readAt: null,
    createdAt: new Date().toISOString(),
    ...partial,
  };
}

describe('customer-notification-ui', () => {
  it('routes refund and booking notifications to account tabs', () => {
    expect(customerNotificationTarget(row({ entityType: 'REFUND' }))).toBe('/account?tab=refunds');
    expect(customerNotificationTarget(row({ entityType: 'BOOKING' }))).toBe('/account?tab=trips');
    expect(customerNotificationTarget(row({ entityType: 'WALLET' }))).toBe('/account?tab=wallet');
    expect(customerNotificationTarget(row({ category: 'MESSAGE' }))).toBe('/account?tab=tickets');
  });

  it('formats relative times per locale', () => {
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    expect(formatNotificationTime(hourAgo, 'fa')).toContain('ساعت');
    expect(formatNotificationTime(hourAgo, 'en')).toContain('h ago');
    expect(formatNotificationTime(hourAgo, 'ar')).toContain('ساعة');
  });

  it('maps categories to icons', () => {
    expect(notificationCategoryIcon('MESSAGE')).toBe('✉');
    expect(notificationCategoryIcon('SYSTEM')).toBe('🔔');
  });
});
