import { describe, expect, it } from 'vitest';
import {
  findCheapestPriceCalendarDate,
  formatPriceCalendarDayParts,
  formatPriceCalendarPrice,
  isPriceCalendarEmpty,
} from './price-calendar';

describe('price-calendar helpers', () => {
  it('treats zero / empty IRR as no-flight day', () => {
    expect(isPriceCalendarEmpty('0')).toBe(true);
    expect(isPriceCalendarEmpty('')).toBe(true);
    expect(isPriceCalendarEmpty(null)).toBe(true);
    expect(isPriceCalendarEmpty('38000000')).toBe(false);
  });

  it('picks the cheapest non-empty day', () => {
    expect(
      findCheapestPriceCalendarDate([
        { date: '2026-08-01', minPriceIrr: '0' },
        { date: '2026-08-02', minPriceIrr: '40000000' },
        { date: '2026-08-03', minPriceIrr: '35000000' },
        { date: '2026-08-04', minPriceIrr: '0' },
      ]),
    ).toBe('2026-08-03');
  });

  it('formats Jalali weekday/date for fa and Gregorian for en', () => {
    const fa = formatPriceCalendarDayParts('2026-08-01', 'fa');
    expect(fa.weekday).toBe('شنبه');
    expect(fa.dateStr).toContain('مرداد');
    expect(fa.dateStr).toMatch(/[۰-۹]/);
    expect(`${fa.weekday} ${fa.dateStr}`).not.toMatch(/[A-Za-z]/);

    const en = formatPriceCalendarDayParts('2026-08-01', 'en');
    expect(en.weekday).toMatch(/[A-Za-z]/);
    expect(en.dateStr).toMatch(/[A-Za-z]/);
  });

  it('shows empty label instead of fabricated money', () => {
    expect(formatPriceCalendarPrice('0', 'fa', '—')).toBe('—');
    expect(formatPriceCalendarPrice('38000000', 'fa', '—')).not.toBe('—');
  });
});
