import type { Airport } from '../types/public-site';

export type FlightSearchScope = 'domestic' | 'intl';

const IRAN_INTERNATIONAL_IATA = new Set([
  'IKA', 'MHD', 'SYZ', 'IFN', 'TBZ', 'BND', 'AJK', 'XBJ', 'LRR', 'KIH',
  'GSM',
]);

const TEST_CITY_PATTERN = /^شهر\s*(?:تست|آزمایش)/u;

export function isPublicAirport(airport: Airport): boolean {
  return !TEST_CITY_PATTERN.test(airport.cityFa.trim());
}

export function isIranianInternationalAirport(airport: Airport): boolean {
  if (airport.isInternational) return false;
  return IRAN_INTERNATIONAL_IATA.has(airport.code.toUpperCase());
}

/** `isInternational` in the persisted catalog means outside Iran. */
export function airportsForSearchScope(
  airports: Airport[],
  scope: FlightSearchScope,
): Airport[] {
  const publicAirports = airports.filter(isPublicAirport);
  if (scope === 'domestic') {
    return publicAirports.filter((airport) => !airport.isInternational);
  }
  return publicAirports.filter(
    (airport) => airport.isInternational || isIranianInternationalAirport(airport),
  );
}
