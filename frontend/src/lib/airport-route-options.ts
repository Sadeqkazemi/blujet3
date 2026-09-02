import type { Airport } from '../types/public-site';

function normalizedCity(value: string) {
  return value
    .trim()
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('fa');
}

export function airportsShareCity(
  airports: Airport[],
  firstCode: string,
  secondCode: string,
) {
  if (!firstCode || !secondCode) return false;
  const first = airports.find((airport) => airport.code === firstCode);
  const second = airports.find((airport) => airport.code === secondCode);
  if (!first || !second) return firstCode === secondCode;
  return normalizedCity(first.cityFa) === normalizedCity(second.cityFa);
}

/**
 * Origin and destination must be different cities, not merely different IATA
 * codes. This prevents routes such as THR→IKA while keeping every airport of
 * other cities available.
 */
export function airportsOutsideSelectedCity(
  airports: Airport[],
  selectedAirportCode: string,
) {
  const selected = airports.find(
    (airport) => airport.code === selectedAirportCode,
  );
  if (!selected) {
    return airports.filter((airport) => airport.code !== selectedAirportCode);
  }
  const selectedCity = normalizedCity(selected.cityFa);
  return airports.filter(
    (airport) =>
      airport.code !== selectedAirportCode &&
      normalizedCity(airport.cityFa) !== selectedCity,
  );
}
