import type { StoredLocale } from '../hooks/useLocale';
import { arDigits, faDigits, latinDigits } from './fa-format';
import { dayjs, parseJalaliDateToIso } from './jalali';

export type CalendarSystem = 'jalali' | 'gregory';

export function calendarForLocale(locale: StoredLocale): CalendarSystem {
  return locale === 'fa' ? 'jalali' : 'gregory';
}

export function localeDigits(value: string | number, locale: StoredLocale): string {
  if (locale === 'fa') return faDigits(value);
  if (locale === 'ar') return arDigits(value);
  return String(value);
}

/** Split an ISO birth date into day/month/year strings for passenger forms. */
export function isoDateToFormParts(
  iso: string,
  locale: StoredLocale,
): { birthDay: string; birthMonth: string; birthYear: string } {
  const d = dayjs(iso).calendar(calendarForLocale(locale));
  return {
    birthDay: String(d.date()),
    birthMonth: String(d.month() + 1),
    birthYear: String(d.year()),
  };
}

export function formatLocaleDate(
  value: string | number | Date,
  locale: StoredLocale,
): string {
  const formatted = dayjs(value)
    .calendar(calendarForLocale(locale))
    .format('YYYY/MM/DD');
  return localeDigits(formatted, locale);
}

export function formatLocaleDateTime(
  value: string | number | Date,
  locale: StoredLocale,
  timeZone?: string,
): string {
  const date = timeZone ? dayjs(value).tz(timeZone) : dayjs(value);
  const formatted = date
    .calendar(calendarForLocale(locale))
    .format('YYYY/MM/DD HH:mm');
  return localeDigits(formatted, locale);
}

export function parseLocaleDateToIso(
  value: string,
  locale: StoredLocale,
): string | null {
  const normalized = latinDigits(value.trim());
  if (locale === 'fa') {
    const parsed = parseJalaliDateToIso(normalized);
    if (!parsed) return null;
    return `${dayjs(parsed).calendar('gregory').format('YYYY-MM-DD')}T12:00:00.000Z`;
  }

  const match = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(normalized);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(Date.UTC(year, month - 1, day, 12));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) return null;
  return candidate.toISOString();
}

export function localeMonthYear(
  value: ReturnType<typeof dayjs>,
  locale: StoredLocale,
): string {
  if (locale === 'fa') {
    const names = [
      'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
      'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
    ];
    return `${names[value.month()]} ${faDigits(value.year())}`;
  }

  const intlLocale = locale === 'ar' ? 'ar' : 'en';
  const gregorian = value.calendar('gregory');
  return new Intl.DateTimeFormat(intlLocale, {
    calendar: 'gregory',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${gregorian.format('YYYY-MM')}-15T12:00:00Z`));
}

export function localeMonthName(
  value: ReturnType<typeof dayjs>,
  locale: StoredLocale,
): string {
  if (locale === 'fa') {
    return [
      'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
      'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
    ][value.month()]!;
  }
  const gregorian = value.calendar('gregory');
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en', {
    calendar: 'gregory',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${gregorian.format('YYYY-MM')}-15T12:00:00Z`));
}

export function localeWeekdayLong(
  value: ReturnType<typeof dayjs>,
  locale: StoredLocale,
): string {
  const gregorian = value.calendar('gregory');
  const tag = locale === 'fa'
    ? 'fa-IR-u-ca-persian'
    : locale === 'ar'
      ? 'ar-u-ca-gregory'
      : 'en-US-u-ca-gregory';
  return new Intl.DateTimeFormat(tag, {
    weekday: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${gregorian.format('YYYY-MM-DD')}T12:00:00Z`));
}

export const localeWeekdays: Record<StoredLocale, string[]> = {
  fa: ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'],
  en: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
  ar: ['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س'],
};

export function calendarOffset(
  monthStart: ReturnType<typeof dayjs>,
  locale: StoredLocale,
): number {
  return locale === 'fa' ? (monthStart.day() + 1) % 7 : monthStart.day();
}
