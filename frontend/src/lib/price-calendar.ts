import type { StoredLocale } from '../hooks/useLocale';
import type { PriceCalendarDay } from '../types/public-site';
import { localeMoney } from './fa-format';
import { dayjs } from './jalali';

/** A day with no bookable inventory — API sends `"0"`. */
export function isPriceCalendarEmpty(minPriceIrr: string | null | undefined): boolean {
  if (minPriceIrr == null || minPriceIrr === '') return true;
  try {
    return BigInt(minPriceIrr) <= 0n;
  } catch {
    return true;
  }
}

export function findCheapestPriceCalendarDate(
  days: Pick<PriceCalendarDay, 'date' | 'minPriceIrr'>[],
): string | null {
  let bestDate: string | null = null;
  let best: bigint | null = null;
  for (const day of days) {
    if (isPriceCalendarEmpty(day.minPriceIrr)) continue;
    const price = BigInt(day.minPriceIrr);
    if (best === null || price < best) {
      best = price;
      bestDate = day.date;
    }
  }
  return bestDate;
}

/** Weekday + short date for a calendar cell (Jalali for fa/ar, Gregorian for en). */
export function formatPriceCalendarDayParts(
  isoDate: string,
  locale: StoredLocale,
): { weekday: string; dateStr: string } {
  const noon = `${isoDate.slice(0, 10)}T12:00:00.000Z`;
  if (locale === 'en') {
    const d = dayjs(noon);
    return {
      weekday: d.format('ddd'),
      dateStr: d.format('D MMM'),
    };
  }

  // Jalaliday changes the calendar calculations but does not automatically
  // load Day.js's Persian/Arabic locale data. Formatting `dd` / `MMMM` on
  // that instance therefore leaks English labels such as `Su` and `Mordad`
  // into an otherwise Persian page. Native Intl formats both labels and
  // digits for the requested language while keeping the Persian calendar.
  const date = new Date(noon);
  const localeTag = locale === 'fa' ? 'fa-IR-u-ca-persian' : 'ar-IR-u-ca-persian';
  return {
    weekday: new Intl.DateTimeFormat(localeTag, {
      weekday: 'short',
      timeZone: 'UTC',
    }).format(date),
    dateStr: new Intl.DateTimeFormat(localeTag, {
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    }).format(date),
  };
}

export function formatPriceCalendarPrice(
  minPriceIrr: string,
  locale: StoredLocale,
  emptyLabel: string,
): string {
  if (isPriceCalendarEmpty(minPriceIrr)) return emptyLabel;
  return localeMoney(minPriceIrr, locale);
}

export type PriceCalendarCopy = {
  title: string;
  subtitle: string;
  cheapest: string;
  emptyDay: string;
  loading: string;
  error: string;
  retry: string;
  currency: string;
};

export function priceCalendarCopy(locale: StoredLocale): PriceCalendarCopy {
  if (locale === 'en') {
    return {
      title: 'Price calendar',
      subtitle: 'Compare fares across nearby days',
      cheapest: 'Cheapest',
      emptyDay: '—',
      loading: 'Loading prices…',
      error: 'Could not load the price calendar.',
      retry: 'Retry',
      currency: 'Toman',
    };
  }
  if (locale === 'ar') {
    return {
      title: 'تقويم الأسعار',
      subtitle: 'قارن الأسعار عبر الأيام القريبة',
      cheapest: 'الأرخص',
      emptyDay: '—',
      loading: 'جاري تحميل الأسعار…',
      error: 'تعذّر تحميل تقويم الأسعار.',
      retry: 'إعادة المحاولة',
      currency: 'تومان',
    };
  }
  return {
    title: 'تقویم قیمت',
    subtitle: 'مقایسه قیمت پرواز در روزهای نزدیک',
    cheapest: 'ارزان‌ترین',
    emptyDay: '—',
    loading: 'در حال بارگذاری قیمت‌ها…',
    error: 'بارگذاری تقویم قیمت ناموفق بود.',
    retry: 'تلاش مجدد',
    currency: 'تومان',
  };
}
