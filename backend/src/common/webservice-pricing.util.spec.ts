import {
  DEFAULT_WEBSERVICE_PLAN_PRICES_IRR,
  parseWebservicePlanPrices,
  priceForMonths,
} from './webservice-pricing.util';

describe('webservice-pricing.util', () => {
  it('parses a valid plan-prices patch', () => {
    const parsed = parseWebservicePlanPrices({
      1: 50_000_000,
      3: 130_000_000,
      12: 450_000_000,
    });
    expect(parsed[1]).toBe(50_000_000);
    expect(parsed[12]).toBe(450_000_000);
  });

  it('rejects missing or non-integer prices', () => {
    expect(() => parseWebservicePlanPrices({ 1: 1, 3: 2 })).toThrow();
    expect(() => parseWebservicePlanPrices({ 1: 1.5, 3: 2, 12: 3 })).toThrow();
  });

  it('priceForMonths reads from the catalog', () => {
    expect(priceForMonths(DEFAULT_WEBSERVICE_PLAN_PRICES_IRR, 3)).toBe(
      120_000_000,
    );
    expect(
      priceForMonths(DEFAULT_WEBSERVICE_PLAN_PRICES_IRR, 6),
    ).toBeUndefined();
  });
});
