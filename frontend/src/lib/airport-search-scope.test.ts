import { describe, expect, it } from 'vitest';
import { airportsForSearchScope } from './airport-search-scope';
import type { Airport } from '../types/public-site';

const AIRPORTS: Airport[] = [
  { id: 'thr', code: 'THR', cityFa: 'تهران', airportNameFa: 'فرودگاه بین‌المللی مهرآباد', tz: 'Asia/Tehran', isInternational: false },
  { id: 'ika', code: 'IKA', cityFa: 'تهران', airportNameFa: 'فرودگاه بین‌المللی امام خمینی', tz: 'Asia/Tehran', isInternational: false },
  { id: 'adu', code: 'ADU', cityFa: 'اردبیل', airportNameFa: 'فرودگاه اردبیل', tz: 'Asia/Tehran', isInternational: false },
  { id: 'dxb', code: 'DXB', cityFa: 'دبی', airportNameFa: 'فرودگاه بین‌المللی دبی', tz: 'Asia/Dubai', isInternational: true },
  { id: 'test', code: 'QDQ', cityFa: 'شهر آزمایش الف', airportNameFa: 'فرودگاه آزمایشی', tz: 'Asia/Tehran', isInternational: true },
];

describe('airportsForSearchScope', () => {
  it('keeps all Iranian airports and excludes foreign airports for domestic search', () => {
    expect(airportsForSearchScope(AIRPORTS, 'domestic').map((row) => row.code)).toEqual(['THR', 'IKA', 'ADU']);
  });

  it('keeps Iranian international and foreign airports but excludes domestic-only Iranian airports', () => {
    expect(airportsForSearchScope(AIRPORTS, 'intl').map((row) => row.code)).toEqual(['IKA', 'DXB']);
  });

  it('hides test and experimental cities from every public search scope', () => {
    expect(airportsForSearchScope(AIRPORTS, 'domestic')).not.toContainEqual(
      expect.objectContaining({ code: 'QDQ' }),
    );
    expect(airportsForSearchScope(AIRPORTS, 'intl')).not.toContainEqual(
      expect.objectContaining({ code: 'QDQ' }),
    );
  });
});
