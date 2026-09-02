import { describe, expect, it } from 'vitest';
import { airportCityLabel, airportCityName, airportName, resolveAirportCode } from './airport-cities';

describe('airport-cities', () => {
  it('returns localized city names for known airport codes', () => {
    expect(airportCityName('THR', 'fa')).toBe('تهران');
    expect(airportCityName('THR', 'en')).toBe('Tehran');
    expect(airportCityName('MHD', 'fa')).toBe('مشهد');
  });

  it('falls back to API cityFa then code for unknown airports', () => {
    expect(airportCityName('ABC', 'fa', 'شهر ناشناخته')).toBe('شهر ناشناخته');
    expect(airportCityName('ABC', 'fa')).toBe('ABC');
    expect(airportCityName('ABC', 'en', 'شهر ناشناخته')).toBe('ABC');
    expect(airportCityName('ABC', 'ar', 'شهر ناشناخته')).toBe('ABC');
  });

  it('localizes airport names without leaking Persian presentation fields', () => {
    expect(airportName('THR', 'en', 'فرودگاه بین‌المللی مهرآباد')).toBe('Mehrabad International Airport');
    expect(airportName('THR', 'ar', 'فرودگاه بین‌المللی مهرآباد')).toBe('مطار مهرآباد الدولي');
    expect(airportName('ABC', 'en', 'فرودگاه ناشناخته')).toBe('Airport ABC');
    expect(airportName('ABC', 'ar', 'فرودگاه ناشناخته')).toBe('مطار ABC');
  });

  it('resolves legacy Persian popular-route values to real IATA codes', () => {
    const airports = [
      { id: 'thr', code: 'THR', cityFa: 'تهران', tz: 'Asia/Tehran' },
      { id: 'mhd', code: 'MHD', cityFa: 'مشهد', tz: 'Asia/Tehran' },
    ];
    expect(resolveAirportCode('تهران', airports)).toBe('THR');
    expect(resolveAirportCode('مشهد', airports)).toBe('MHD');
  });

  it('formats city labels with airport code like the design bundle', () => {
    expect(airportCityLabel('THR', 'fa')).toBe('تهران (THR)');
    expect(airportCityLabel('MHD', 'en')).toBe('Mashhad (MHD)');
  });
});
