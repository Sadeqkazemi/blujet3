import { describe, expect, it } from 'vitest';
import {
  AIRPORT_REFERENCE_CATALOG,
  AIRPORT_REFERENCE_COUNTRIES,
} from './airport-reference-catalog';

describe('airport reference catalog', () => {
  it('contains unique IATA codes for every supported country', () => {
    const codes = AIRPORT_REFERENCE_CATALOG.map((airport) => airport.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(new Set(AIRPORT_REFERENCE_CATALOG.map((airport) => airport.countryFa))).toEqual(
      new Set(AIRPORT_REFERENCE_COUNTRIES),
    );
    for (const airport of AIRPORT_REFERENCE_CATALOG) {
      expect(airport.code).toMatch(/^[A-Z]{3}$/);
      expect(airport.cityFa).not.toBe('');
      expect(airport.airportNameFa).not.toBe('');
    }
  });

  it('supports multiple airports in one city and the required international hubs', () => {
    expect(AIRPORT_REFERENCE_CATALOG).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'THR', cityFa: 'تهران' }),
        expect.objectContaining({ code: 'IKA', cityFa: 'تهران' }),
        expect.objectContaining({ code: 'DXB', countryFa: 'امارات' }),
        expect.objectContaining({ code: 'MCT', countryFa: 'عمان' }),
        expect.objectContaining({ code: 'DOH', countryFa: 'قطر' }),
        expect.objectContaining({ code: 'IST', countryFa: 'ترکیه' }),
        expect.objectContaining({ code: 'EVN', countryFa: 'ارمنستان' }),
        expect.objectContaining({ code: 'NJF', countryFa: 'عراق' }),
      ]),
    );
  });

  it('includes the public Iranian airport cities that have an IATA code', () => {
    const iranCodes = new Set(
      AIRPORT_REFERENCE_CATALOG
        .filter((airport) => airport.countryFa === 'ایران')
        .map((airport) => airport.code),
    );
    for (const code of [
      'THR', 'IKA', 'MHD', 'SYZ', 'IFN', 'TBZ', 'KIH', 'GSM', 'AEU', 'AJK',
      'BXR', 'BDH', 'GCH', 'IHR', 'JYR', 'KHY', 'MRX', 'NSH', 'PFQ', 'SYJ',
      'TCX', 'YES', 'ACZ',
    ]) {
      expect(iranCodes.has(code), `${code} is missing`).toBe(true);
    }
  });
});
