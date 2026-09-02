import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { fetchMyBookings } from '../../../api/publicSite';
import PublicPageShell from '../../../components/public/PublicPageShell';
import { useAuth } from '../../../hooks/useAuth';
import { useLocale } from '../../../hooks/useLocale';
import { useIsMobile } from '../../../hooks/useIsMobile';
import { formatLocaleDateTime } from '../../../lib/locale-format';
import type { BookingDetail } from '../../../types/public-site';
import { loadCheckoutDraft } from '../checkout/checkout-draft';
import { filterServiceEligibleBookings } from './service-eligible-bookings';

const COPY = {
  fa: {
    title: 'انتخاب خدمات',
    subtitle:
      'پرواز فعال خود را انتخاب کنید تا به مرحلهٔ انتخاب خدمات (صندلی یا بار) بروید.',
    loading: 'در حال بارگذاری…',
    empty: 'پرواز فعالی یافت نشد.',
    bookNew: 'رزرو پرواز جدید',
    continue: 'ادامه به انتخاب خدمات',
    pnr: 'کد رزرو',
    route: 'مسیر',
    dep: 'پرواز',
    status: 'وضعیت',
    loginRequired: 'برای ادامه وارد شوید.',
    goLogin: 'ورود / ثبت‌نام',
  },
  en: {
    title: 'Select services',
    subtitle:
      'Pick an active flight to continue to seat selection or extra baggage.',
    loading: 'Loading…',
    empty: 'No active flight found.',
    bookNew: 'Book a new flight',
    continue: 'Continue to services',
    pnr: 'PNR',
    route: 'Route',
    dep: 'Departure',
    status: 'Status',
    loginRequired: 'Please sign in to continue.',
    goLogin: 'Log in / Sign up',
  },
  ar: {
    title: 'اختيار الخدمات',
    subtitle: 'اختر رحلة نشطة للمتابعة إلى اختيار المقعد أو الأمتعة الإضافية.',
    loading: 'جارٍ التحميل…',
    empty: 'لا توجد رحلة نشطة.',
    bookNew: 'احجز رحلة جديدة',
    continue: 'المتابعة إلى الخدمات',
    pnr: 'رمز الحجز',
    route: 'المسار',
    dep: 'المغادرة',
    status: 'الحالة',
    loginRequired: 'يرجى تسجيل الدخول للمتابعة.',
    goLogin: 'تسجيل الدخول',
  },
} as const;

function continuePath(booking: BookingDetail, focus: string | null): string {
  const draft = loadCheckoutDraft();
  if (draft?.flightInstanceId === booking.flightInstanceId) {
    const qs = new URLSearchParams({ step: 'extras' });
    if (focus === 'seat-selection' || focus === 'extra-baggage') {
      qs.set('focus', focus);
    }
    return `/checkout/new?${qs.toString()}`;
  }
  if (booking.status === 'HELD') {
    return `/checkout/${booking.id}`;
  }
  const qs = new URLSearchParams({ pnr: booking.pnr });
  if (focus === 'seat-selection') qs.set('focus', 'seat');
  if (focus === 'extra-baggage') qs.set('focus', 'baggage');
  return `/manage-booking?${qs.toString()}`;
}

export default function SelectServicesPage() {
  const { locale } = useLocale();
  const { status } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [params] = useSearchParams();
  const from = params.get('from');
  const t = COPY[locale];
  const [rows, setRows] = useState<BookingDetail[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== 'authenticated') return;
    fetchMyBookings()
      .then((list) => setRows(filterServiceEligibleBookings(list)))
      .catch(() => {
        setRows([]);
        setError(t.empty);
      });
  }, [status, t.empty]);

  const focusLabel = useMemo(() => {
    if (from === 'seat-selection') {
      return locale === 'en'
        ? 'Seat selection'
        : locale === 'ar'
          ? 'اختيار المقعد'
          : 'انتخاب صندلی';
    }
    if (from === 'extra-baggage') {
      return locale === 'en'
        ? 'Extra baggage'
        : locale === 'ar'
          ? 'أمتعة إضافية'
          : 'بار اضافه';
    }
    return null;
  }, [from, locale]);

  useEffect(() => {
    if (!rows || rows.length !== 1) return;
    navigate(continuePath(rows[0]!, from), { replace: true });
  }, [rows, from, navigate]);

  if (status !== 'authenticated') {
    return (
      <PublicPageShell>
        <div style={{ maxWidth: 520, margin: '40px auto', padding: 24, textAlign: 'center' }}>
          <p style={{ color: '#5a6678', marginBottom: 16 }}>{t.loginRequired}</p>
          <Link
            to="/signin"
            state={{ from: `/services/select${from ? `?from=${from}` : ''}` }}
            style={{
              display: 'inline-block',
              background: '#1668c4',
              color: '#fff',
              padding: '12px 22px',
              borderRadius: 12,
              fontWeight: 800,
              textDecoration: 'none',
            }}
          >
            {t.goLogin}
          </Link>
        </div>
      </PublicPageShell>
    );
  }

  if (rows === null) {
    return (
      <PublicPageShell>
        <p style={{ padding: 32, color: '#6b7b94' }}>{t.loading}</p>
      </PublicPageShell>
    );
  }

  if (rows.length === 0) {
    return (
      <PublicPageShell>
        <div style={{ maxWidth: 420, margin: '48px auto', padding: 24, textAlign: 'center' }}>
          <p style={{ color: '#5a6678', marginBottom: 16 }}>{error ?? t.empty}</p>
          <Link
            to="/"
            style={{
              display: 'inline-block',
              background: '#1668c4',
              color: '#fff',
              padding: '12px 22px',
              borderRadius: 12,
              fontWeight: 800,
              textDecoration: 'none',
            }}
          >
            {t.bookNew}
          </Link>
        </div>
      </PublicPageShell>
    );
  }

  if (rows.length === 1) {
    return (
      <PublicPageShell>
        <p style={{ padding: 32, color: '#6b7b94' }}>{t.loading}</p>
      </PublicPageShell>
    );
  }

  return (
    <PublicPageShell>
      <div
        data-testid="select-services-page"
        style={{
          maxWidth: 720,
          margin: '0 auto',
          padding: isMobile ? '20px 16px 40px' : '28px 26px 48px',
        }}
      >
        <h1 style={{ fontSize: isMobile ? 22 : 28, fontWeight: 900, color: '#0d2640', margin: '0 0 8px' }}>
          {t.title}
        </h1>
        <p style={{ fontSize: 14, color: '#5a6678', lineHeight: 1.85, margin: '0 0 8px' }}>
          {t.subtitle}
        </p>
        {focusLabel && (
          <p style={{ fontSize: 13, fontWeight: 700, color: '#1668c4', margin: '0 0 22px' }}>
            {focusLabel}
          </p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {rows.map((b) => (
            <button
              key={b.id}
              type="button"
              data-testid={`select-services-booking-${b.id}`}
              onClick={() => navigate(continuePath(b, from))}
              style={{
                textAlign: 'start',
                background: '#fff',
                border: '1px solid #eef1f5',
                borderRadius: 16,
                padding: '16px 18px',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#0d2640' }}>
                    {t.route}:{' '}
                    <span dir="ltr">
                      {b.originCode} → {b.destCode}
                    </span>
                  </div>
                  <div style={{ fontSize: 12.5, color: '#6b7787', marginTop: 6 }}>
                    {t.pnr}: <span dir="ltr">{b.pnr}</span>
                    {' · '}
                    {t.dep}: {formatLocaleDateTime(b.departureAt, locale)}
                  </div>
                  <div style={{ fontSize: 12, color: '#9aa4b2', marginTop: 4 }}>
                    {t.status}: {b.status} · <span dir="ltr">{b.flightNo}</span>
                  </div>
                </div>
                <span
                  style={{
                    alignSelf: 'center',
                    background: '#1668c4',
                    color: '#fff',
                    padding: '10px 14px',
                    borderRadius: 11,
                    fontSize: 12.5,
                    fontWeight: 800,
                  }}
                >
                  {t.continue}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </PublicPageShell>
  );
}
