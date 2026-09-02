import type { StoredLocale } from '../../hooks/useLocale';
import { arDigits, faDigits } from '../../lib/fa-format';
import { formatLocaleDate } from '../../lib/locale-format';
import type { BlogCategory } from '../../types/blog';

export const CATEGORY_GRADIENT: Record<BlogCategory, string> = {
  NEWS: 'linear-gradient(135deg,#b45309,#f59e0b)',
  GUIDE: 'linear-gradient(135deg,#1e3a8a,#3b82f6)',
  DEST: 'linear-gradient(135deg,#0e7490,#22d3ee)',
  OFFERS: 'linear-gradient(135deg,#9333ea,#c084fc)',
};

export const CATEGORY_LABELS: Record<BlogCategory, Record<StoredLocale, string>> = {
  NEWS: { fa: 'اخبار پرواز', en: 'Flight News', ar: 'أخبار الرحلات' },
  GUIDE: { fa: 'راهنمای سفر', en: 'Travel Guide', ar: 'دليل السفر' },
  DEST: { fa: 'مقاصد', en: 'Destinations', ar: 'الوجهات' },
  OFFERS: { fa: 'تخفیف‌ها', en: 'Offers', ar: 'العروض' },
};

export function blogCoverUrl(coverFileId: string | null): string | null {
  if (!coverFileId) return null;
  return `${import.meta.env.VITE_API_URL}/blog/covers/${coverFileId}`;
}

export function formatPublicBlogDate(date: string, locale: StoredLocale): string {
  return formatLocaleDate(date, locale);
}

export function formatPublicCount(value: number, locale: StoredLocale): string {
  const grouped = value.toLocaleString('en-US');
  if (locale === 'en') return grouped;
  const withSep = grouped.replace(/,/g, '٬');
  return locale === 'ar' ? arDigits(withSep) : faDigits(withSep);
}
