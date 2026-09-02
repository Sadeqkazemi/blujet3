import { fallbackCabinPrice } from './pricing';

describe('fallback cabin pricing', () => {
  it('keeps every higher cabin distinct from economy', () => {
    const economy = fallbackCabinPrice(100_000_000n, 'ECONOMY');
    const comfort = fallbackCabinPrice(100_000_000n, 'COMFORT');
    const business = fallbackCabinPrice(100_000_000n, 'BUSINESS');
    const first = fallbackCabinPrice(100_000_000n, 'FIRST');

    expect(economy).toBe(100_000_000n);
    expect(comfort).toBeGreaterThan(economy);
    expect(business).toBeGreaterThan(comfort);
    expect(first).toBeGreaterThan(business);
  });
});
