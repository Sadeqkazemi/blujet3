import { apiGet, apiPatch } from './http';

export interface WebservicePlanPrices {
  1: number;
  3: number;
  12: number;
}

export function fetchWebservicePricing() {
  return apiGet<{ prices: WebservicePlanPrices }>('/webservice/pricing');
}

export function updateWebservicePricing(prices: {
  month1PriceIrr: number;
  month3PriceIrr: number;
  month12PriceIrr: number;
}) {
  return apiPatch<{ prices: WebservicePlanPrices }>('/webservice/pricing', prices);
}

export function fetchAgencyWebservicePlans() {
  return apiGet<{ plans: { months: 1 | 3 | 12; priceIrr: number }[] }>(
    '/agency-portal/webservice-plans',
  );
}
