import type { StoredLocale } from '../hooks/useLocale';
import type { Airport } from '../types/public-site';

/** Known airport cities — matches design-reference-v2 CITY_NAMES. */
export const AIRPORT_CITY_NAMES: Record<string, Record<StoredLocale, string>> = {
  THR: { fa: 'تهران', en: 'Tehran', ar: 'طهران' },
  IKA: { fa: 'تهران', en: 'Tehran', ar: 'طهران' },
  MHD: { fa: 'مشهد', en: 'Mashhad', ar: 'مشهد' },
  IST: { fa: 'استانبول', en: 'Istanbul', ar: 'إسطنبول' },
  DXB: { fa: 'دبی', en: 'Dubai', ar: 'دبي' },
  KIH: { fa: 'کیش', en: 'Kish', ar: 'كيش' },
  SYZ: { fa: 'شیراز', en: 'Shiraz', ar: 'شيراز' },
  IFN: { fa: 'اصفهان', en: 'Isfahan', ar: 'أصفهان' },
  TBZ: { fa: 'تبریز', en: 'Tabriz', ar: 'تبريز' },
  NJF: { fa: 'نجف', en: 'Najaf', ar: 'النجف' },
  GSM: { fa: 'قشم', en: 'Qeshm', ar: 'قشم' },
  BND: { fa: 'بندرعباس', en: 'Bandar Abbas', ar: 'بندر عباس' },
  AWZ: { fa: 'اهواز', en: 'Ahvaz', ar: 'الأهواز' },
  RAS: { fa: 'رشت', en: 'Rasht', ar: 'رشت' },
  SRY: { fa: 'ساری', en: 'Sari', ar: 'ساري' },
  GBT: { fa: 'گرگان', en: 'Gorgan', ar: 'جرجان' },
  KER: { fa: 'کرمان', en: 'Kerman', ar: 'كرمان' },
  KSH: { fa: 'کرمانشاه', en: 'Kermanshah', ar: 'كرمانشاه' },
  OMH: { fa: 'ارومیه', en: 'Urmia', ar: 'أرومية' },
  ADU: { fa: 'اردبیل', en: 'Ardabil', ar: 'أردبيل' },
  ZAH: { fa: 'زاهدان', en: 'Zahedan', ar: 'زاهدان' },
  BUZ: { fa: 'بوشهر', en: 'Bushehr', ar: 'بوشهر' },
  AZD: { fa: 'یزد', en: 'Yazd', ar: 'يزد' },
};

const AIRPORT_NAMES: Record<string, { en: string; ar: string }> = {
  THR: { en: 'Mehrabad International Airport', ar: 'مطار مهرآباد الدولي' },
  IKA: { en: 'Imam Khomeini International Airport', ar: 'مطار الإمام الخميني الدولي' },
  MHD: { en: 'Mashhad International Airport', ar: 'مطار مشهد الدولي' },
  TBZ: { en: 'Tabriz International Airport', ar: 'مطار تبريز الدولي' },
  KIH: { en: 'Kish International Airport', ar: 'مطار كيش الدولي' },
  SYZ: { en: 'Shiraz International Airport', ar: 'مطار شيراز الدولي' },
  IFN: { en: 'Isfahan International Airport', ar: 'مطار أصفهان الدولي' },
  GSM: { en: 'Qeshm International Airport', ar: 'مطار قشم الدولي' },
  BND: { en: 'Bandar Abbas International Airport', ar: 'مطار بندر عباس الدولي' },
  AWZ: { en: 'Ahvaz International Airport', ar: 'مطار الأهواز الدولي' },
  RAS: { en: 'Rasht Airport', ar: 'مطار رشت' },
  SRY: { en: 'Sari Airport', ar: 'مطار ساري' },
  GBT: { en: 'Gorgan International Airport', ar: 'مطار جرجان الدولي' },
  KER: { en: 'Kerman International Airport', ar: 'مطار كرمان الدولي' },
  KSH: { en: 'Kermanshah International Airport', ar: 'مطار كرمانشاه الدولي' },
  OMH: { en: 'Urmia International Airport', ar: 'مطار أرومية الدولي' },
  ADU: { en: 'Ardabil Airport', ar: 'مطار أردبيل' },
  ZAH: { en: 'Zahedan International Airport', ar: 'مطار زاهدان الدولي' },
  BUZ: { en: 'Bushehr Airport', ar: 'مطار بوشهر' },
  AZD: { en: 'Yazd Airport', ar: 'مطار يزد' },
  DXB: { en: 'Dubai International Airport', ar: 'مطار دبي الدولي' },
  IST: { en: 'Istanbul Airport', ar: 'مطار إسطنبول' },
  NJF: { en: 'Al Najaf International Airport', ar: 'مطار النجف الدولي' },
};

/**
 * Normalizes user-entered airport queries across Persian, Arabic and Latin
 * keyboards. Arabic ي/ك are especially common when a Persian city name is
 * typed on mobile and must match their Persian ی/ک counterparts.
 */
export function normalizeAirportSearch(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ؤ/g, 'و')
    .replace(/[ةۀ]/g, 'ه')
    .replace(/\u200C/g, ' ')
    .replace(/\u200D/g, ' ')
    .replace(/\u0640/g, ' ')
    .toLocaleLowerCase('en-US')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Search every known localized spelling, independent of the active locale. */
export function airportMatchesQuery(airport: Airport, query: string): boolean {
  const normalizedQuery = normalizeAirportSearch(query);
  if (!normalizedQuery) return true;

  const code = airport.code.trim().toUpperCase();
  const cityNames = Object.values(AIRPORT_CITY_NAMES[code] ?? {});
  const airportNames = Object.values(AIRPORT_NAMES[code] ?? {});
  return [
    code,
    airport.cityFa,
    airport.airportNameFa ?? '',
    ...cityNames,
    ...airportNames,
  ].some((candidate) => normalizeAirportSearch(candidate).includes(normalizedQuery));
}

/** Static fallback when /search/airports has not loaded yet or fails — matches the design bundle city list. */
export const FALLBACK_AIRPORTS: Airport[] = Object.entries(AIRPORT_CITY_NAMES).map(
  ([code, names]) => ({
    id: `fallback-${code}`,
    code,
    cityFa: names.fa,
    tz: code === 'IST' ? 'Europe/Istanbul' : code === 'DXB' ? 'Asia/Dubai' : 'Asia/Tehran',
  }),
);

export function airportCityName(
  code: string,
  locale: StoredLocale,
  cityFa?: string,
): string {
  const normalized = code.toUpperCase();
  return AIRPORT_CITY_NAMES[normalized]?.[locale] ?? (locale === 'fa' ? cityFa : undefined) ?? normalized;
}

export function airportName(
  code: string,
  locale: StoredLocale,
  airportNameFa?: string | null,
): string {
  const normalized = code.trim().toUpperCase();
  if (locale === 'fa') return airportNameFa || `فرودگاه ${normalized}`;
  const known = AIRPORT_NAMES[normalized]?.[locale];
  if (known) return known;
  return locale === 'ar' ? `مطار ${normalized}` : `Airport ${normalized}`;
}

/** Repairs legacy CMS route rows that stored a Persian city instead of an IATA code. */
export function resolveAirportCode(value: string, airports: Airport[], cityFa?: string): string {
  const raw = value.trim();
  const normalized = raw.toUpperCase();
  const direct = airports.find((airport) => airport.code.toUpperCase() === normalized);
  if (direct) return direct.code.toUpperCase();

  const targetCity = cityFa?.trim() || raw;
  const byApiCity = airports.find((airport) => airport.cityFa.trim() === targetCity);
  if (byApiCity) return byApiCity.code.toUpperCase();

  const byCatalog = Object.entries(AIRPORT_CITY_NAMES).find(([, names]) =>
    Object.values(names).some((name) => name === targetCity),
  );
  return byCatalog?.[0] ?? normalized;
}

/** Design bundle pattern: «تهران (THR)» in search summaries and edit modal fields. */
export function airportCityLabel(
  code: string,
  locale: StoredLocale,
  cityFa?: string,
): string {
  const city = airportCityName(code, locale, cityFa);
  const normalized = code.toUpperCase();
  if (city === normalized) return normalized;
  return `${city} (${normalized})`;
}
