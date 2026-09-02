import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import PublicPageShell from '../../components/public/PublicPageShell';
import JalaliDatePicker from '../../components/JalaliDatePicker';
import { fetchAirports } from '../../api/publicSite';
import { lookupFlightStatus } from '../../api/flight-status';
import { dayjs } from '../../lib/jalali';
import { formatLocaleDate, localeDigits } from '../../lib/locale-format';
import { ApiRequestError } from '../../api/envelope';
import { useLocale, type StoredLocale } from '../../hooks/useLocale';
import type { Airport } from '../../types/public-site';
import type { FlightStatusResult } from '../../types/flight-status';

// وضعیت پرواز — matches design-reference/وضعیت پرواز.dc.html's layout, now
// backed by the real FlightInstance data (Phase 22). The design's status
// card also shows گیت/تحویل بار/تأخیر/ترمینال — none of those are modeled
// anywhere in this codebase (no gate-assignment/baggage-belt/delay-minutes
// operational system exists yet), so this real version shows only what's
// real (route, times, aircraft, status) and drops the fabricated fields —
// see docs/API.md's Phase 22 section for the explicit deferral.
//
// Most labels below reuse design-reference-v2/وضعیت پرواز.dc.html's own
// isEN/isAR vocabulary for this exact page (heroTitle, flightNoLabel,
// dateLabel, searchLabel, notFoundTitle/notFoundMsg, aircraftLabel,
// delayAlertSub, manageBookingTitle/Sub, support24Title/Sub). The status
// pill can't use a simple 3-way status map — the backend's DEPARTED
// status maps to two different Persian strings ("فرود آمد"/"در حال
// پرواز") depending on arrival time (see
// backend/src/modules/flight-status/flight-status.service.ts) — so it's
// translated by looking up the exact fa string the backend returns,
// with the fa string itself as the identity fallback.

interface Tr {
  fa: string;
  en: string;
  ar: string;
}

const STATUS_META: Record<FlightStatusResult['status'], { color: string; bg: string }> = {
  SCHEDULED: { color: '#1f8a5b', bg: '#1f8a5b' },
  DEPARTED: { color: '#1668c4', bg: '#1668c4' },
  CANCELLED: { color: '#d64545', bg: '#d64545' },
};

const STATUS_LABEL_TR: Record<string, Tr> = {
  'برنامه‌ریزی‌شده': { fa: 'برنامه‌ریزی‌شده', en: 'Scheduled', ar: 'مجدولة' },
  'لغو شد': { fa: 'لغو شد', en: 'Cancelled', ar: 'ملغاة' },
  'فرود آمد': { fa: 'فرود آمد', en: 'Landed', ar: 'هبطت' },
  'در حال پرواز': { fa: 'در حال پرواز', en: 'In flight', ar: 'في الجو' },
};

function statusLabel(statusLabelFa: string, locale: StoredLocale): string {
  return STATUS_LABEL_TR[statusLabelFa]?.[locale] ?? statusLabelFa;
}

const STR: Record<StoredLocale, {
  title: string;
  subtitle: string;
  modeFlightNo: string;
  modeRoute: string;
  flightNoFieldLabel: string;
  flightNoPlaceholder: string;
  originFieldLabel: string;
  destFieldLabel: string;
  selectPlaceholder: string;
  dateFieldLabel: string;
  searchBtn: string;
  searchingBtn: string;
  errorFallback: string;
  notFoundTitle: string;
  notFoundMsg: string;
  aircraftLabel: string;
  delayAlertTitle: string;
  delayAlertSub: string;
  manageBookingTitle: string;
  manageBookingSub: string;
  support24Title: string;
  support24Sub: string;
  soonTooltip: string;
}> = {
  fa: {
    title: 'وضعیت پرواز',
    subtitle: 'با شماره پرواز یا مسیر و تاریخ، آخرین وضعیت پرواز را ببینید.',
    modeFlightNo: 'شماره پرواز',
    modeRoute: 'مبدأ و مقصد',
    flightNoFieldLabel: 'شماره پرواز',
    flightNoPlaceholder: 'مثلاً BJ-410',
    originFieldLabel: 'مبدأ',
    destFieldLabel: 'مقصد',
    selectPlaceholder: 'انتخاب کنید',
    dateFieldLabel: 'تاریخ',
    searchBtn: 'جستجو',
    searchingBtn: 'در حال جستجو…',
    errorFallback: 'خطا در جستجوی وضعیت پرواز.',
    notFoundTitle: 'پروازی یافت نشد',
    notFoundMsg: 'اطلاعات وارد‌شده با هیچ پروازی مطابقت ندارد. شماره پرواز یا مسیر و تاریخ را بررسی کنید.',
    aircraftLabel: 'هواپیما',
    delayAlertTitle: 'اطلاع‌رسانی تأخیر (به‌زودی)',
    delayAlertSub: 'فعال‌سازی پیامک تغییر وضعیت پرواز',
    manageBookingTitle: 'مدیریت رزرو',
    manageBookingSub: 'تغییر صندلی، دانلود بلیط یا استرداد',
    support24Title: 'پشتیبانی ۲۴ ساعته',
    support24Sub: 'در صورت هرگونه سؤال با ما تماس بگیرید',
    soonTooltip: 'به‌زودی',
  },
  en: {
    title: 'Flight Status',
    subtitle: 'Check the latest status of your flight by flight number or route and date.',
    modeFlightNo: 'Flight number',
    modeRoute: 'Origin & Destination',
    flightNoFieldLabel: 'Flight number',
    flightNoPlaceholder: 'e.g. BJ-410',
    originFieldLabel: 'From',
    destFieldLabel: 'To',
    selectPlaceholder: 'Select',
    dateFieldLabel: 'Date',
    searchBtn: 'Search',
    searchingBtn: 'Searching…',
    errorFallback: 'Error searching for flight status.',
    notFoundTitle: 'Flight not found',
    notFoundMsg: 'No flight matches the information entered. Please check the flight number or route and date.',
    aircraftLabel: 'Aircraft',
    delayAlertTitle: 'Delay notifications (coming soon)',
    delayAlertSub: 'Enable SMS alerts for flight status changes',
    manageBookingTitle: 'Manage booking',
    manageBookingSub: 'Change seat, download ticket or refund',
    support24Title: '24/7 support',
    support24Sub: 'Contact us with any question',
    soonTooltip: 'Coming soon',
  },
  ar: {
    title: 'حالة الرحلة',
    subtitle: 'تحقق من آخر حالة لرحلتك عبر رقم الرحلة أو المسار والتاريخ.',
    modeFlightNo: 'رقم الرحلة',
    modeRoute: 'المبدأ والوجهة',
    flightNoFieldLabel: 'رقم الرحلة',
    flightNoPlaceholder: 'مثلاً BJ-410',
    originFieldLabel: 'من',
    destFieldLabel: 'إلى',
    selectPlaceholder: 'اختر',
    dateFieldLabel: 'التاريخ',
    searchBtn: 'بحث',
    searchingBtn: 'جارٍ البحث…',
    errorFallback: 'خطأ في البحث عن حالة الرحلة.',
    notFoundTitle: 'لم يتم العثور على الرحلة',
    notFoundMsg: 'لا توجد رحلة مطابقة للمعلومات المدخلة. تحقق من رقم الرحلة أو المسار والتاريخ.',
    aircraftLabel: 'الطائرة',
    delayAlertTitle: 'إشعارات التأخير (قريبًا)',
    delayAlertSub: 'فعّل تنبيهات الرسائل عند تغيّر حالة الرحلة',
    manageBookingTitle: 'إدارة الحجز',
    manageBookingSub: 'تغيير المقعد أو تنزيل التذكرة أو الاسترداد',
    support24Title: 'دعم على مدار الساعة',
    support24Sub: 'تواصل معنا لأي استفسار',
    soonTooltip: 'قريبًا',
  },
};

// Same airport-city translation map/precedent as HomeSearchPage.tsx
// (Phase 42): falls back to the airport's real cityFa when the code
// isn't in this small known set, rather than inventing a translation.
const CITY_NAMES: Record<string, Record<StoredLocale, string>> = {
  THR: { fa: 'تهران', en: 'Tehran', ar: 'طهران' },
  MHD: { fa: 'مشهد', en: 'Mashhad', ar: 'مشهد' },
  IST: { fa: 'استانبول', en: 'Istanbul', ar: 'إسطنبول' },
  DXB: { fa: 'دبی', en: 'Dubai', ar: 'دبي' },
  KIH: { fa: 'کیش', en: 'Kish', ar: 'كيش' },
  SYZ: { fa: 'شیراز', en: 'Shiraz', ar: 'شيراز' },
};

function cityName(code: string, fallbackFa: string, locale: StoredLocale): string {
  return CITY_NAMES[code]?.[locale] ?? fallbackFa;
}

function todayIso() {
  return dayjs().toDate().toISOString();
}

export default function FlightStatusPage() {
  const { locale } = useLocale();
  const [params] = useSearchParams();
  const t = STR[locale];
  const [mode, setMode] = useState<'flightNo' | 'route'>('flightNo');
  const [flightNo, setFlightNo] = useState(() => params.get('flightNo') ?? '');
  const [origin, setOrigin] = useState('');
  const [dest, setDest] = useState('');
  const [dateIso, setDateIso] = useState<string | null>(() => params.get('date') ?? todayIso());
  const [airports, setAirports] = useState<Airport[]>([]);
  const [result, setResult] = useState<FlightStatusResult | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [smsOn, setSmsOn] = useState(false);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    fetchAirports()
      .then(setAirports)
      .catch(() => setAirports([]));
  }, []);

  useEffect(() => {
    const qFlight = (params.get('flightNo') ?? '').trim();
    const qDate = params.get('date');
    if (qFlight) setFlightNo(qFlight);
    if (qDate) setDateIso(qDate);
    if (!qFlight || !qDate) return;
    let cancelled = false;
    setSearching(true);
    setError(null);
    setNotFound(false);
    setResult(null);
    lookupFlightStatus({ flightNo: qFlight, date: qDate.slice(0, 10) })
      .then((data) => {
        if (!cancelled) setResult(data);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiRequestError && err.code === 'NOT_FOUND') {
          setNotFound(true);
        } else {
          setError(err instanceof ApiRequestError ? err.message : t.errorFallback);
        }
      })
      .finally(() => {
        if (!cancelled) setSearching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [params, t.errorFallback]);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotFound(false);
    setResult(null);
    if (!dateIso) return;
    setSearching(true);
    try {
      const date = dateIso.slice(0, 10);
      const data =
        mode === 'flightNo'
          ? await lookupFlightStatus({ flightNo: flightNo.trim(), date })
          : await lookupFlightStatus({ origin, dest, date });
      setResult(data);
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'NOT_FOUND') {
        setNotFound(true);
      } else {
        setError(err instanceof ApiRequestError ? err.message : t.errorFallback);
      }
    } finally {
      setSearching(false);
    }
  }

  const canSearch = mode === 'flightNo' ? !!flightNo.trim() && !!dateIso : !!origin && !!dest && !!dateIso;

  return (
    <PublicPageShell>
      <section style={{ background: 'linear-gradient(150deg,#0d2640,#124a86)', color: '#fff', padding: '41px 22px 65px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 30, fontWeight: 900, margin: '0 0 10px', letterSpacing: '-.5px' }}>{t.title}</h1>
        <p style={{ fontSize: 13, color: '#c9dcf3', margin: 0 }}>{t.subtitle}</p>
      </section>

      <div style={{ maxWidth: 720, margin: '-34px auto 0', padding: '0 22px 60px', position: 'relative' }}>
        <div style={{ background: '#fff', border: '1px solid #eef1f5', borderRadius: 18, boxShadow: '0 24px 54px -28px rgba(13,38,102,.35)', padding: 20 }}>
          <div style={{ display: 'flex', background: '#eef1f5', borderRadius: 11, padding: 3, marginBottom: 16, maxWidth: 320 }}>
            {(
              [
                ['flightNo', t.modeFlightNo],
                ['route', t.modeRoute],
              ] as const
            ).map(([m, lbl]) => (
              <span
                key={m}
                data-testid={`fs-mode-${m}`}
                onClick={() => {
                  setMode(m);
                  setResult(null);
                  setNotFound(false);
                  setError(null);
                }}
                style={{
                  flex: 1,
                  textAlign: 'center',
                  padding: '8px 0',
                  borderRadius: 9,
                  fontSize: 12.5,
                  fontWeight: mode === m ? 700 : 600,
                  color: mode === m ? '#1668c4' : '#6b7787',
                  background: mode === m ? '#fff' : 'transparent',
                  boxShadow: mode === m ? '0 2px 7px rgba(13,38,102,.14)' : 'none',
                  cursor: 'pointer',
                }}
              >
                {lbl}
              </span>
            ))}
          </div>

          <form onSubmit={(e) => void search(e)} style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            {mode === 'flightNo' ? (
              <div style={{ flex: '1 1 200px' }}>
                <label htmlFor="fs-flightno" style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: '#5a6678', marginBottom: 6 }}>
                  {t.flightNoFieldLabel}
                </label>
                <input
                  id="fs-flightno"
                  data-testid="fs-flightno"
                  dir="ltr"
                  value={flightNo}
                  onChange={(e) => setFlightNo(e.target.value)}
                  placeholder={t.flightNoPlaceholder}
                  className="font-num"
                  style={{ width: '100%', boxSizing: 'border-box', height: 56, padding: '0 15px', border: '1.5px solid #e2e7ee', borderRadius: 12, background: '#fafbfd', fontSize: 15, fontWeight: 700, color: '#16202e', direction: 'ltr', textAlign: 'right', outline: 'none' }}
                />
              </div>
            ) : (
              <>
                <div style={{ flex: '1 1 130px' }}>
                  <label htmlFor="fs-origin" style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: '#5a6678', marginBottom: 6 }}>
                    {t.originFieldLabel}
                  </label>
                  <select
                    id="fs-origin"
                    data-testid="fs-origin"
                    value={origin}
                    onChange={(e) => setOrigin(e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box', height: 56, padding: '0 15px', border: '1.5px solid #e2e7ee', borderRadius: 12, fontFamily: 'inherit', fontSize: 14, fontWeight: 700, color: '#16202e', outline: 'none', background: '#fafbfd' }}
                  >
                    <option value="">{t.selectPlaceholder}</option>
                    {airports.map((a) => (
                      <option key={a.id} value={a.code}>
                        {cityName(a.code, a.cityFa, locale)} ({a.code})
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ flex: '1 1 130px' }}>
                  <label htmlFor="fs-dest" style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: '#5a6678', marginBottom: 6 }}>
                    {t.destFieldLabel}
                  </label>
                  <select
                    id="fs-dest"
                    data-testid="fs-dest"
                    value={dest}
                    onChange={(e) => setDest(e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box', height: 56, padding: '0 15px', border: '1.5px solid #e2e7ee', borderRadius: 12, fontFamily: 'inherit', fontSize: 14, fontWeight: 700, color: '#16202e', outline: 'none', background: '#fafbfd' }}
                  >
                    <option value="">{t.selectPlaceholder}</option>
                    {airports.map((a) => (
                      <option key={a.id} value={a.code}>
                        {cityName(a.code, a.cityFa, locale)} ({a.code})
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
            <div style={{ flex: '1 1 150px' }}>
              <div style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: '#5a6678', marginBottom: 6 }}>
                {t.dateFieldLabel}
              </div>
              <div
                data-testid="fs-date-control"
                style={{ height: 56, boxSizing: 'border-box', border: '1.5px solid #e2e7ee', borderRadius: 12, background: '#fafbfd' }}
              >
                <JalaliDatePicker locale={locale} label={t.dateFieldLabel} value={dateIso} onChange={setDateIso} testId="fs-date" singleLine />
              </div>
            </div>
            <button
              type="submit"
              data-testid="fs-search"
              disabled={!canSearch || searching}
              style={{ flex: 'none', height: 56, border: 'none', borderRadius: 12, background: canSearch && !searching ? '#1668c4' : '#aab8c8', color: '#fff', padding: '0 30px', fontSize: 14, fontWeight: 800, cursor: canSearch && !searching ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}
            >
              {searching ? t.searchingBtn : t.searchBtn}
            </button>
          </form>
        </div>

        {error && (
          <p style={{ marginTop: 16, borderRadius: 10, background: '#fef2f2', padding: 12, fontSize: 12.5, color: '#e5484d' }}>{error}</p>
        )}

        {notFound && (
          <div data-testid="fs-not-found" style={{ marginTop: 22, background: '#fff', border: '1px solid #eef1f5', borderRadius: 18, padding: '48px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
            <div style={{ fontSize: 15, fontWeight: 900, color: '#0d2640', marginBottom: 8 }}>{t.notFoundTitle}</div>
            <p style={{ fontSize: 12, color: '#8a96a6', margin: 0 }}>{t.notFoundMsg}</p>
          </div>
        )}

        {result && (
          <div style={{ marginTop: 22 }}>
            <div data-testid="fs-result" style={{ background: '#fff', border: '1px solid #eef1f5', borderRadius: 18, overflow: 'hidden', boxShadow: '0 18px 44px -28px rgba(13,38,102,.3)' }}>
              <div style={{ background: 'linear-gradient(120deg,#1668c4,#0d3b66)', color: '#fff', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 14 }}>
                  <span>✈</span> blujet
                </span>
                <span style={{ fontSize: 12 }}>
                  <span dir="ltr">{result.flightNo}</span> · {formatLocaleDate(result.departureAt, locale)}
                </span>
                <span
                  data-testid="fs-status-pill"
                  style={{ background: STATUS_META[result.status].bg, fontSize: 10.5, fontWeight: 800, padding: '4px 10px', borderRadius: 14 }}
                >
                  {statusLabel(result.statusLabelFa, locale)}
                </span>
              </div>

              <div style={{ padding: '20px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 21, fontWeight: 900, color: '#0d2640' }} dir="ltr">
                    {result.originCode}
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7787' }}>{cityName(result.originCode, result.originCityFa, locale)}</div>
                  <div className="font-num" style={{ fontSize: 15, fontWeight: 800, color: '#1668c4', marginTop: 4 }}>
                    {localeDigits(dayjs(result.departureAt).format('HH:mm'), locale)}
                  </div>
                </div>
                <div style={{ flex: 1, textAlign: 'center', color: '#8a96a6', fontSize: 11 }}>
                  <div style={{ borderTop: '2px dashed #d5e1f0', margin: '8px 20px', position: 'relative' }}>
                    <span style={{ position: 'absolute', top: -10, right: '50%', transform: 'translateX(50%)', background: '#fff', padding: '0 8px', color: '#1668c4' }}>✈</span>
                  </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 21, fontWeight: 900, color: '#0d2640' }} dir="ltr">
                    {result.destCode}
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7787' }}>{cityName(result.destCode, result.destCityFa, locale)}</div>
                  <div className="font-num" style={{ fontSize: 15, fontWeight: 800, color: '#1668c4', marginTop: 4 }}>
                    {localeDigits(dayjs(result.arrivalAt).format('HH:mm'), locale)}
                  </div>
                </div>
              </div>

              <div style={{ borderTop: '1px solid #f2f4f7', padding: '11px 14px', textAlign: 'center' }}>
                <div style={{ fontSize: 10.5, color: '#8a96a6', marginBottom: 3 }}>{t.aircraftLabel}</div>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: '#0d2640' }}>{result.aircraftType}</div>
              </div>
            </div>

            <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
              <label
                title={t.soonTooltip}
                style={{ background: '#f6f8fb', border: '1px solid #e8eef6', borderRadius: 14, padding: '14px 16px', cursor: 'not-allowed', display: 'flex', flexDirection: 'column', gap: 6, opacity: 0.7 }}
              >
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12.5, fontWeight: 800, color: '#0d2640' }}>{t.delayAlertTitle}</span>
                  <input type="checkbox" data-testid="fs-sms-toggle" checked={smsOn} onChange={(e) => setSmsOn(e.target.checked)} disabled />
                </span>
                <span style={{ fontSize: 11, color: '#8a96a6' }}>{t.delayAlertSub}</span>
              </label>
              <Link to="/manage-booking" style={{ background: '#fff', border: '1px solid #e8eef6', borderRadius: 14, padding: '14px 16px', textDecoration: 'none' }}>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: '#0d2640', marginBottom: 6 }}>{t.manageBookingTitle}</div>
                <div style={{ fontSize: 11, color: '#8a96a6' }}>{t.manageBookingSub}</div>
              </Link>
              <Link to="/support" style={{ background: '#fff', border: '1px solid #e8eef6', borderRadius: 14, padding: '14px 16px', textDecoration: 'none' }}>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: '#0d2640', marginBottom: 6 }}>{t.support24Title}</div>
                <div style={{ fontSize: 11, color: '#8a96a6' }}>{t.support24Sub}</div>
              </Link>
            </div>
          </div>
        )}
      </div>
    </PublicPageShell>
  );
}
