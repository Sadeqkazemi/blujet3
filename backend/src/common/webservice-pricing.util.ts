/** B2B webservice plan durations (months) — server-side price catalog. */

export const WEBSERVICE_PLAN_MONTHS = [1, 3, 12] as const;
export type WebservicePlanMonths = (typeof WEBSERVICE_PLAN_MONTHS)[number];

export type WebservicePlanPrices = Record<WebservicePlanMonths, number>;

export const DEFAULT_WEBSERVICE_PLAN_PRICES_IRR: WebservicePlanPrices = {
  1: 45_000_000,
  3: 120_000_000,
  12: 420_000_000,
};

const MIN_PRICE_IRR = 1;
const MAX_PRICE_IRR = 9_999_999_999_999;

/** Validates a patch — all three month keys required, positive integer IRR. */
export function parseWebservicePlanPrices(
  input: unknown,
): WebservicePlanPrices {
  if (!input || typeof input !== 'object') {
    throw new Error('webservicePlanPrices must be an object');
  }
  const obj = input as Record<string, unknown>;
  const result = {} as WebservicePlanPrices;
  for (const months of WEBSERVICE_PLAN_MONTHS) {
    const key = String(months);
    const raw = obj[key] ?? obj[months];
    if (typeof raw !== 'number' || !Number.isInteger(raw)) {
      throw new Error(`invalid price for ${months} month plan`);
    }
    if (raw < MIN_PRICE_IRR || raw > MAX_PRICE_IRR) {
      throw new Error(`price out of range for ${months} month plan`);
    }
    result[months] = raw;
  }
  return result;
}

export function priceForMonths(
  prices: WebservicePlanPrices,
  months: number,
): number | undefined {
  if (months === 1 || months === 3 || months === 12) {
    return prices[months];
  }
  return undefined;
}
