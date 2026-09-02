import { describe, expect, it } from 'vitest';
import { dayjs, formatJalaliDate, formatJalaliDateTime, isoDateAtNoon, toIsoDateOnly } from './jalali';

describe('formatJalaliDate', () => {
  it('converts a UTC ISO date to YYYY/MM/DD Jalali', () => {
    // 2026-03-21 is Nowruz — 1405/01/01 in the Jalali calendar.
    expect(formatJalaliDate('2026-03-21T00:00:00.000Z')).toBe('۱۴۰۵/۰۱/۰۱');
  });
});

describe('toIsoDateOnly', () => {
  it('maps a Jalali calendar day to Gregorian YYYY-MM-DD without timezone drift', () => {
    const mordad1405 = dayjs('1405/05/11', { jalali: true } as never).calendar('jalali');
    const isoDay = toIsoDateOnly(mordad1405);
    expect(formatJalaliDate(isoDateAtNoon(isoDay))).toBe('۱۴۰۵/۰۵/۱۱');
  });
});

describe('formatJalaliDateTime', () => {
  it('includes the time portion', () => {
    expect(formatJalaliDateTime('2026-03-21T14:30:00.000Z')).toMatch(/^۱۴۰۵\/۰۱\/۰۱ [۰-۹]{2}:[۰-۹]{2}$/);
  });
});
