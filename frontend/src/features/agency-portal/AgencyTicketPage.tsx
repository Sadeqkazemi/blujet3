import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import JalaliDatePicker from '../../components/JalaliDatePicker';
import { fetchAirports, fetchSearchCabins } from '../../api/publicSite';
import { useLocale, type StoredLocale } from '../../hooks/useLocale';
import { airportCityLabel, airportCityName, FALLBACK_AIRPORTS } from '../../lib/airport-cities';
import { localeDigits } from '../../lib/locale-format';
import { airportsForSearchScope, type FlightSearchScope } from '../../lib/airport-search-scope';
import type { Airport, CabinClass } from '../../types/public-site';

type TripType = 'one' | 'round';

const COPY: Record<StoredLocale, {
  one: string;
  round: string;
  origin: string;
  destination: string;
  chooseOrigin: string;
  chooseDestination: string;
  departure: string;
  returnDate: string;
  chooseDate: string;
  passengers: string;
  passenger: string;
  search: string;
  loadError: string;
  missing: string;
  sameCity: string;
  invalidReturn: string;
  adult: string;
  adultHint: string;
  child: string;
  childHint: string;
  infant: string;
  infantHint: string;
  confirm: string;
  cabin: string;
  domestic: string;
  international: string;
}> = {
  fa: {
    one: 'یک طرفه', round: 'رفت و برگشت', origin: 'مبدا', destination: 'مقصد',
    chooseOrigin: 'انتخاب مبدا', chooseDestination: 'انتخاب مقصد', departure: 'تاریخ رفت',
    returnDate: 'تاریخ برگشت', chooseDate: 'انتخاب تاریخ', passengers: 'مسافران',
    passenger: 'مسافر', search: 'جستجوی پرواز', loadError: 'دریافت فهرست فرودگاه‌ها با خطا روبه‌رو شد.',
    missing: 'مبدا، مقصد و تاریخ رفت را کامل کنید.', sameCity: 'مبدا و مقصد نمی‌توانند یکسان باشند.',
    invalidReturn: 'تاریخ برگشت باید پس از تاریخ رفت باشد.',
    adult: 'بزرگسال', adultHint: '۱۲ سال به بالا', child: 'کودک', childHint: '۲ تا ۱۲ سال',
    infant: 'نوزاد', infantHint: 'زیر ۲ سال', confirm: 'تأیید', cabin: 'نوع پرواز', domestic: 'پرواز داخلی', international: 'پرواز خارجی',
  },
  en: {
    one: 'One-way', round: 'Round-trip', origin: 'From', destination: 'To',
    chooseOrigin: 'Choose origin', chooseDestination: 'Choose destination', departure: 'Departure date',
    returnDate: 'Return date', chooseDate: 'Choose date', passengers: 'Passengers',
    passenger: 'passenger', search: 'Search flights', loadError: 'Unable to load the airport list.',
    missing: 'Complete origin, destination, and departure date.', sameCity: 'Origin and destination must differ.',
    invalidReturn: 'Return date must be after departure.',
    adult: 'Adult', adultHint: '12 years and over', child: 'Child', childHint: '2 to 12 years',
    infant: 'Infant', infantHint: 'Under 2 years', confirm: 'Confirm', cabin: 'Cabin', domestic: 'Domestic', international: 'International',
  },
  ar: {
    one: 'ذهاب فقط', round: 'ذهاب وعودة', origin: 'من', destination: 'إلى',
    chooseOrigin: 'اختر نقطة الانطلاق', chooseDestination: 'اختر الوجهة', departure: 'تاريخ المغادرة',
    returnDate: 'تاريخ العودة', chooseDate: 'اختر التاريخ', passengers: 'المسافرون',
    passenger: 'مسافر', search: 'البحث عن رحلات', loadError: 'تعذر تحميل قائمة المطارات.',
    missing: 'أكمل نقطة الانطلاق والوجهة وتاريخ المغادرة.', sameCity: 'يجب أن تختلف نقطة الانطلاق عن الوجهة.',
    invalidReturn: 'يجب أن يكون تاريخ العودة بعد المغادرة.',
    adult: 'بالغ', adultHint: '12 سنة فأكثر', child: 'طفل', childHint: 'من 2 إلى 12 سنة',
    infant: 'رضيع', infantHint: 'أقل من سنتين', confirm: 'تأكيد', cabin: 'درجة السفر', domestic: 'رحلة داخلية', international: 'رحلة دولية',
  },
};

export default function AgencyTicketPage() {
  const { locale } = useLocale();
  const t = COPY[locale];
  const navigate = useNavigate();
  const isRtl = locale !== 'en';
  const [airports, setAirports] = useState<Airport[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [tripType, setTripType] = useState<TripType>('one');
  const [service, setService] = useState<FlightSearchScope>('domestic');
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [departureDate, setDepartureDate] = useState<string | null>(null);
  const [returnDate, setReturnDate] = useState<string | null>(null);
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [infants, setInfants] = useState(0);
  const [cabins, setCabins] = useState<CabinClass[]>(['ECONOMY']);
  const [cabin, setCabin] = useState<CabinClass>('ECONOMY');
  const [passengerOpen, setPassengerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAirports()
      .then((rows) => {
        setAirports(rows);
        setLoadError(false);
      })
      .catch(() => {
        setAirports(FALLBACK_AIRPORTS);
        setLoadError(true);
      });
  }, []);

  useEffect(() => {
    fetchSearchCabins()
      .then((rows) => {
        const available = rows.length > 0 ? rows : ['ECONOMY' as CabinClass];
        setCabins(available);
        setCabin((current) => available.includes(current) ? current : available[0]!);
      })
      .catch(() => {
        setCabins(['ECONOMY']);
        setCabin('ECONOMY');
      });
  }, []);

  const options = useMemo(
    () => airportsForSearchScope(airports, service).sort((a, b) => airportCityName(a.code, locale, a.cityFa).localeCompare(airportCityName(b.code, locale, b.cityFa), locale)),
    [airports, locale, service],
  );

  function changeService(next: FlightSearchScope) {
    setService(next);
    const allowed = airportsForSearchScope(airports, next);
    if (!allowed.some((airport) => airport.code === origin)) setOrigin('');
    if (!allowed.some((airport) => airport.code === destination)) setDestination('');
  }

  function submit() {
    if (!origin || !destination || !departureDate) {
      setError(t.missing);
      return;
    }
    if (origin === destination) {
      setError(t.sameCity);
      return;
    }
    if (tripType === 'round' && (!returnDate || returnDate.slice(0, 10) <= departureDate.slice(0, 10))) {
      setError(t.invalidReturn);
      return;
    }
    const query = new URLSearchParams({
      origin,
      dest: destination,
      date: departureDate.slice(0, 10),
      adults: String(adults),
      children: String(children),
      infants: String(infants),
      cabin,
    });
    if (tripType === 'round' && returnDate) query.set('returnDate', returnDate.slice(0, 10));
    navigate(`/results?${query.toString()}`);
  }

  const selectClass = 'h-[72px] w-full appearance-none rounded-xl border border-[#e5eaf1] bg-white px-3 pt-6 text-xs font-extrabold text-[#0d2640] outline-none transition focus:border-[#1668c4] sm:h-[76px] sm:px-5 sm:text-sm';

  return (
    <div data-testid="agency-ticket-page" className="space-y-5">
      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-[#edf0f5] bg-white p-1.5">
        {(['domestic', 'intl'] as FlightSearchScope[]).map((kind) => (
          <button
            key={kind}
            type="button"
            data-testid={`agency-ticket-service-${kind}`}
            onClick={() => changeService(kind)}
            className={`h-11 rounded-xl text-xs font-black transition ${service === kind ? 'bg-[#eaf3ff] text-[#1668c4] ring-1 ring-[#1668c4]' : 'text-[#8a96a6]'}`}
          >
            {kind === 'domestic' ? t.domestic : t.international}
          </button>
        ))}
      </div>
      <div className="flex h-14 items-center rounded-2xl border border-[#edf0f5] bg-white p-1.5">
        {(['one', 'round'] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            data-testid={`agency-trip-${kind}`}
            onClick={() => {
              setTripType(kind);
              if (kind === 'one') setReturnDate(null);
            }}
            className={`h-full flex-1 rounded-xl text-sm font-black transition ${tripType === kind ? 'bg-[#1668c4] text-white shadow-sm' : 'text-[#aab4c1]'}`}
          >
            {kind === 'one' ? t.one : t.round}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-[#edf0f5] bg-white p-3 sm:p-5">
        {(loadError || error) && (
          <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-xs font-bold text-red-600">
            {error ?? t.loadError}
          </p>
        )}
        <div className={`grid grid-cols-2 gap-2.5 sm:gap-3 ${tripType === 'round' ? 'xl:grid-cols-6' : 'xl:grid-cols-5'}`}>
          <div data-testid="agency-ticket-route-fields" className="relative col-span-2 grid grid-cols-2 gap-2.5 sm:gap-3">
          <label className="relative">
            <span className="pointer-events-none absolute top-3 z-10 px-3 text-[10px] font-bold text-[#8a96a6] sm:px-5 sm:text-[11px]">⌖ {t.origin}</span>
            <select data-testid="agency-ticket-origin" value={origin} onChange={(e) => setOrigin(e.target.value)} className={selectClass}>
              <option value="">{t.chooseOrigin}</option>
              {options.map((airport) => <option key={airport.code} value={airport.code}>{airportCityLabel(airport.code, locale, airportCityName(airport.code, locale, airport.cityFa))}</option>)}
            </select>
          </label>
          <label className="relative">
            <span className="pointer-events-none absolute top-3 z-10 px-3 text-[10px] font-bold text-[#8a96a6] sm:px-5 sm:text-[11px]">⌖ {t.destination}</span>
            <select data-testid="agency-ticket-destination" value={destination} onChange={(e) => setDestination(e.target.value)} className={selectClass}>
              <option value="">{t.chooseDestination}</option>
              {options.filter((airport) => airport.code !== origin).map((airport) => <option key={airport.code} value={airport.code}>{airportCityLabel(airport.code, locale, airportCityName(airport.code, locale, airport.cityFa))}</option>)}
            </select>
          </label>
          <button
            type="button"
            aria-label={locale === 'fa' ? 'جابجایی مبدا و مقصد' : 'Swap origin and destination'}
            data-testid="agency-ticket-swap"
            onClick={() => {
              setOrigin(destination);
              setDestination(origin);
            }}
            className="absolute left-1/2 top-6 z-20 grid h-7 w-7 -translate-x-1/2 place-items-center rounded-full border border-[#dbe7f5] bg-[#f4f8fd] text-xs font-black text-[#1668c4] shadow-sm sm:top-[25px] sm:h-8 sm:w-8"
          >
            ⇄
          </button>
          </div>
          <div className="h-[72px] rounded-xl border border-[#e5eaf1] bg-white px-1 sm:h-[76px] sm:px-2">
            <JalaliDatePicker label={t.departure} value={departureDate} onChange={setDepartureDate} minDate={new Date().toISOString().slice(0, 10)} placeholder={t.chooseDate} subLabel=" " locale={locale} isRTL={isRtl} testId="agency-ticket-date" />
          </div>
          {tripType === 'round' && (
            <div className="h-[72px] rounded-xl border border-[#e5eaf1] bg-white px-1 sm:h-[76px] sm:px-2">
              <JalaliDatePicker label={t.returnDate} value={returnDate} onChange={setReturnDate} minDate={departureDate ?? new Date().toISOString().slice(0, 10)} placeholder={t.chooseDate} subLabel=" " locale={locale} isRTL={isRtl} testId="agency-ticket-return-date" />
            </div>
          )}
          <div className={`relative ${tripType === 'round' ? 'col-span-2 xl:col-span-1' : ''}`}>
            <span className="pointer-events-none absolute top-3 z-10 px-3 text-[10px] font-bold text-[#8a96a6] sm:px-5 sm:text-[11px]">♙ {t.passengers}</span>
            <button type="button" data-testid="agency-ticket-passengers" onClick={() => setPassengerOpen((open) => !open)} className={`${selectClass} text-start`}>
              {localeDigits(adults + children + infants, locale)} {t.passenger}
            </button>
            {passengerOpen && (
              <div data-testid="agency-ticket-pax-popover" className="absolute left-0 top-[82px] z-40 w-[305px] max-w-[86vw] rounded-2xl border border-[#e5eaf1] bg-white p-4 shadow-[0_18px_45px_-14px_rgba(13,38,64,.35)]">
                {[
                  { key: 'adults', label: t.adult, hint: t.adultHint, value: adults, min: 1, dec: () => { const next = Math.max(1, adults - 1); setAdults(next); setInfants((count) => Math.min(count, next)); }, inc: () => setAdults((count) => count + 1) },
                  { key: 'children', label: t.child, hint: t.childHint, value: children, min: 0, dec: () => setChildren((count) => Math.max(0, count - 1)), inc: () => setChildren((count) => count + 1) },
                  { key: 'infants', label: t.infant, hint: t.infantHint, value: infants, min: 0, dec: () => setInfants((count) => Math.max(0, count - 1)), inc: () => setInfants((count) => Math.min(adults, count + 1)) },
                ].map((row) => (
                  <div key={row.key} className="flex items-center justify-between border-b border-[#eef1f5] py-3 last:border-b-0">
                    <div><b className="block text-sm text-[#0d2640]">{row.label}</b><span className="text-[11px] text-[#8a96a6]">{row.hint}</span></div>
                    <div className="flex items-center gap-3">
                      <button type="button" disabled={row.value <= row.min} data-testid={`agency-ticket-pax-${row.key}-dec`} onClick={row.dec} className="h-8 w-8 rounded-lg bg-[#f6f8fb] font-black text-[#0d2640] disabled:opacity-35">−</button>
                      <b className="min-w-4 text-center text-sm text-[#0d2640]">{localeDigits(row.value, locale)}</b>
                      <button type="button" data-testid={`agency-ticket-pax-${row.key}-inc`} onClick={row.inc} className="h-8 w-8 rounded-lg bg-[#f6f8fb] font-black text-[#0d2640]">+</button>
                    </div>
                  </div>
                ))}
                <button type="button" data-testid="agency-ticket-pax-confirm" onClick={() => setPassengerOpen(false)} className="mt-3 h-12 w-full rounded-xl bg-[#1668c4] text-sm font-black text-white">{t.confirm}</button>
              </div>
            )}
          </div>
          <label className="relative">
            <span className="pointer-events-none absolute top-3 z-10 px-3 text-[10px] font-bold text-[#8a96a6] sm:px-5 sm:text-[11px]">✦ {t.cabin}</span>
            <select
              data-testid="agency-ticket-cabin"
              value={cabin}
              onChange={(event) => setCabin(event.target.value as CabinClass)}
              className={selectClass}
            >
              {cabins.map((value) => (
                <option key={value} value={value}>
                  {value === 'ECONOMY'
                    ? locale === 'en' ? 'Economy' : locale === 'ar' ? 'اقتصادية' : 'اکونومی'
                    : value === 'COMFORT'
                      ? locale === 'en' ? 'Comfort' : locale === 'ar' ? 'راحة' : 'کامفورت'
                      : value === 'BUSINESS'
                        ? locale === 'en' ? 'Business' : locale === 'ar' ? 'أعمال' : 'بیزینس'
                        : locale === 'en' ? 'First Class' : locale === 'ar' ? 'الدرجة الأولى' : 'فرست کلاس'}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button type="button" data-testid="agency-ticket-search" onClick={submit} className="mt-4 flex h-14 w-full items-center justify-center gap-3 rounded-xl bg-[#1668c4] text-sm font-black text-white transition hover:brightness-105">
          <span aria-hidden>⌕</span> {t.search}
        </button>
      </div>
    </div>
  );
}
