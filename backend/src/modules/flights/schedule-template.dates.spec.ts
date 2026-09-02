import {
  enumerateMatchingDates,
  utcIsoWeekday,
  zonedLocalToUtc,
} from './schedule-template.dates';

describe('schedule-template.dates', () => {
  it('enumerates ISO weekdays inside a range', () => {
    // 2026-09-01 is Tuesday (ISO 2) … include Mon=1 and Wed=3
    const dates = enumerateMatchingDates('2026-09-01', '2026-09-10', [1, 3]);
    expect(dates).toEqual([
      '2026-09-02', // Wed
      '2026-09-07', // Mon
      '2026-09-09', // Wed
    ]);
  });

  it('returns empty when end is before start', () => {
    expect(enumerateMatchingDates('2026-09-10', '2026-09-01', [1])).toEqual([]);
  });

  it('maps UTC Sunday to ISO 7', () => {
    expect(utcIsoWeekday(new Date(Date.UTC(2026, 8, 6)))).toBe(7); // Sun
    expect(utcIsoWeekday(new Date(Date.UTC(2026, 8, 7)))).toBe(1); // Mon
  });

  it('converts Asia/Tehran local morning to a UTC Instant', () => {
    const utc = zonedLocalToUtc('2026-09-01', '07:30', 'Asia/Tehran');
    // Tehran is UTC+3:30 in Sep (no DST) → 04:00 UTC
    expect(utc.toISOString()).toBe('2026-09-01T04:00:00.000Z');
  });
});
