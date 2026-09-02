import type { StoredLocale } from '../../hooks/useLocale';
import { localeDigits } from '../../lib/locale-format';
import type { NotificationCategory, NotificationRow } from '../../types/notifications';

/** Customer-facing deep links for notification rows. */
export function customerNotificationTarget(n: NotificationRow): string {
  const type = (n.entityType ?? '').toUpperCase();
  const action = (n.action ?? '').toUpperCase();
  if (type.includes('REFUND') || action.includes('REFUND')) return '/account?tab=refunds';
  if (type.includes('BOOKING') || type.includes('TICKET') || type.includes('PNR')) {
    if (n.entityId && type.includes('TICKET')) return `/ticket/${n.entityId}`;
    return '/account?tab=trips';
  }
  if (type.includes('WALLET') || action.includes('WALLET')) return '/account?tab=wallet';
  if (type.includes('CLUB') || type.includes('POINTS') || action.includes('CLUB')) {
    return '/account?tab=club';
  }
  if (type.includes('PROFILE') || action.includes('PROFILE')) return '/account?tab=profile';
  if (type.includes('SUPPORT') || type.includes('TICKET_SUPPORT')) return '/account?tab=tickets';
  if (n.category === 'MESSAGE') return '/account?tab=tickets';
  return '/account';
}

export function notificationCategoryIcon(category: NotificationCategory): string {
  switch (category) {
    case 'MESSAGE':
      return '✉';
    case 'REQUEST':
      return '📄';
    case 'APPROVAL':
      return '✓';
    case 'CARTABLE':
      return '📋';
    case 'SYSTEM':
    default:
      return '🔔';
  }
}

const RELATIVE: Record<
  StoredLocale,
  {
    justNow: string;
    minutes: (n: string) => string;
    hours: (n: string) => string;
    yesterday: string;
    days: (n: string) => string;
  }
> = {
  fa: {
    justNow: 'همین الان',
    minutes: (n) => `${n} دقیقه پیش`,
    hours: (n) => `${n} ساعت پیش`,
    yesterday: 'دیروز',
    days: (n) => `${n} روز پیش`,
  },
  en: {
    justNow: 'Just now',
    minutes: (n) => `${n} min ago`,
    hours: (n) => `${n}h ago`,
    yesterday: 'Yesterday',
    days: (n) => `${n} days ago`,
  },
  ar: {
    justNow: 'الآن',
    minutes: (n) => `قبل ${n} دقيقة`,
    hours: (n) => `قبل ${n} ساعة`,
    yesterday: 'أمس',
    days: (n) => `قبل ${n} يوم`,
  },
};

export function formatNotificationTime(iso: string, locale: StoredLocale): string {
  const created = new Date(iso).getTime();
  if (Number.isNaN(created)) return '';
  const diffMs = Math.max(0, Date.now() - created);
  const mins = Math.floor(diffMs / 60_000);
  const copy = RELATIVE[locale];
  if (mins < 1) return copy.justNow;
  if (mins < 60) return copy.minutes(localeDigits(mins, locale));
  const hours = Math.floor(mins / 60);
  if (hours < 24) return copy.hours(localeDigits(hours, locale));
  if (hours < 48) return copy.yesterday;
  const days = Math.floor(hours / 24);
  return copy.days(localeDigits(days, locale));
}
