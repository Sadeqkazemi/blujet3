import { describe, expect, it } from 'vitest';
import {
  calendarForLocale,
  formatLocaleDate,
  formatLocaleDateTime,
  localeDigits,
  parseLocaleDateToIso,
} from './locale-format';

describe('locale-aware calendars and digits', () => {
  it('keeps Persian on Jalali and uses Gregorian for English and Arabic', () => {
    const value = '2026-08-11T12:34:00.000Z';

    expect(calendarForLocale('fa')).toBe('jalali');
    expect(calendarForLocale('en')).toBe('gregory');
    expect(calendarForLocale('ar')).toBe('gregory');
    expect(formatLocaleDate(value, 'fa')).toBe('۱۴۰۵/۰۵/۲۰');
    expect(formatLocaleDate(value, 'en')).toBe('2026/08/11');
    expect(formatLocaleDate(value, 'ar')).toBe('٢٠٢٦/٠٨/١١');
    expect(formatLocaleDateTime(value, 'ar')).toMatch(/^٢٠٢٦\/٠٨\/١١ [٠-٩]{2}:[٠-٩]{2}$/);
  });

  it('uses the digit set of the active locale', () => {
    expect(localeDigits('Flight 123', 'en')).toBe('Flight 123');
    expect(localeDigits('123', 'fa')).toBe('۱۲۳');
    expect(localeDigits('123', 'ar')).toBe('١٢٣');
  });

  it('parses locale dates with the matching calendar', () => {
    expect(parseLocaleDateToIso('1405/05/20', 'fa')?.slice(0, 10)).toBe('2026-08-11');
    expect(parseLocaleDateToIso('2026/08/11', 'en')?.slice(0, 10)).toBe('2026-08-11');
    expect(parseLocaleDateToIso('٢٠٢٦/٠٨/١١', 'ar')?.slice(0, 10)).toBe('2026-08-11');
    expect(parseLocaleDateToIso('2026/02/30', 'en')).toBeNull();
  });
});
