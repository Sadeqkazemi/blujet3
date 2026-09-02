import {
  FLIGHTOPS_AUTO_CLOSE_HOURS,
  isSaleAutoClosed,
} from './sale-close.util';

describe('isSaleAutoClosed', () => {
  const now = new Date('2026-08-01T12:00:00.000Z');

  it('is false well before the 4h threshold', () => {
    const departureAt = new Date(now.getTime() + 10 * 3_600_000);
    expect(isSaleAutoClosed(departureAt, now)).toBe(false);
  });

  it('is true well after the 4h threshold (already departed)', () => {
    const departureAt = new Date(now.getTime() - 1 * 3_600_000);
    expect(isSaleAutoClosed(departureAt, now)).toBe(true);
  });

  it('is exactly boundary-true at precisely 4h before departure', () => {
    const departureAt = new Date(
      now.getTime() + FLIGHTOPS_AUTO_CLOSE_HOURS * 3_600_000,
    );
    expect(isSaleAutoClosed(departureAt, now)).toBe(true);
  });

  it('is false one millisecond before the boundary', () => {
    const departureAt = new Date(
      now.getTime() + FLIGHTOPS_AUTO_CLOSE_HOURS * 3_600_000 + 1,
    );
    expect(isSaleAutoClosed(departureAt, now)).toBe(false);
  });
});
