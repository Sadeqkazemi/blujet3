import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchBookingByPnr } from '../../api/publicSite';
import { useLocale, type StoredLocale } from '../../hooks/useLocale';
import { formatLocaleDateTime } from '../../lib/locale-format';
import type { BookingDetail } from '../../types/public-site';
import PublicPageShell from '../../components/public/PublicPageShell';
import TicketBarcode from '../../components/public/TicketBarcode';

const CABIN_LABEL: Record<string, Record<StoredLocale, string>> = {
  ECONOMY: { fa: 'اکونومی', en: 'Economy', ar: 'اقتصادية' },
  COMFORT: { fa: 'کامفورت', en: 'Comfort', ar: 'كومفورت' },
  BUSINESS: { fa: 'بیزینس', en: 'Business', ar: 'درجة الأعمال' },
  FIRST: { fa: 'فرست', en: 'First', ar: 'الدرجة الأولى' },
};

const STR: Record<
  StoredLocale,
  {
    loading: string;
    notFound: string;
    unpaidTitle: string;
    unpaidMsg: string;
    expiredTitle: string;
    expiredMsg: string;
    title: string;
    ticketIssued: string;
    origin: string;
    dest: string;
    pnrLabel: string;
    cabinLabel: string;
    passengers: string;
    showAtCheckin: string;
    downloadPrint: string;
  }
> = {
  fa: {
    loading: 'در حال بارگذاری…',
    notFound: 'بلیط یافت نشد.',
    unpaidTitle: 'بلیط هنوز صادر نشده است',
    unpaidMsg:
      'تا تکمیل پرداخت نمی‌توانید تصویر بلیط را ببینید. برای رزروهای در انتظار پرداخت حداکثر ۱۵ دقیقه فرصت دارید.',
    expiredTitle: 'مهلت پرداخت به پایان رسید',
    expiredMsg: 'این رزرو منقضی شده و صندلی آزاد شده است. لطفاً دوباره جستجو و خرید کنید.',
    title: 'بلیط الکترونیکی',
    ticketIssued: 'کارت پرواز · صادر شده',
    origin: 'مبدأ',
    dest: 'مقصد',
    pnrLabel: 'کد رزرو (PNR)',
    cabinLabel: 'کلاس پروازی',
    passengers: 'مسافران',
    showAtCheckin: 'این کارت را هنگام پذیرش نشان دهید',
    downloadPrint: 'دانلود / چاپ بلیط',
  },
  en: {
    loading: 'Loading…',
    notFound: 'Ticket not found.',
    unpaidTitle: 'Ticket not issued yet',
    unpaidMsg:
      'You cannot view the ticket image until payment is complete. Unpaid holds are valid for 15 minutes.',
    expiredTitle: 'Payment window expired',
    expiredMsg: 'This reservation expired and the seat was released. Please search and book again.',
    title: 'E-ticket',
    ticketIssued: 'Boarding pass · issued',
    origin: 'Origin',
    dest: 'Destination',
    pnrLabel: 'Booking code (PNR)',
    cabinLabel: 'Cabin class',
    passengers: 'Passengers',
    showAtCheckin: 'Show this card at check-in',
    downloadPrint: 'Download / print ticket',
  },
  ar: {
    loading: 'جارٍ التحميل…',
    notFound: 'لم تُعثر على التذكرة.',
    unpaidTitle: 'لم تُصدر التذكرة بعد',
    unpaidMsg:
      'لا يمكنك عرض صورة التذكرة قبل إتمام الدفع. الحجوزات غير المدفوعة صالحة لمدة ١٥ دقيقة.',
    expiredTitle: 'انتهت مهلة الدفع',
    expiredMsg: 'انتهت صلاحية هذا الحجز وتم تحرير المقعد. يرجى البحث والحجز مجددًا.',
    title: 'التذكرة الإلكترونية',
    ticketIssued: 'بطاقة الصعود · صادرة',
    origin: 'المبدأ',
    dest: 'الوجهة',
    pnrLabel: 'رمز الحجز (PNR)',
    cabinLabel: 'درجة السفر',
    passengers: 'المسافرون',
    showAtCheckin: 'اعرض هذه البطاقة عند تسجيل الوصول',
    downloadPrint: 'تنزيل / طباعة التذكرة',
  },
};

function formatDeparture(value: string, locale: StoredLocale) {
  return formatLocaleDateTime(value, locale);
}

export default function TicketPage() {
  const { pnr } = useParams<{ pnr: string }>();
  const { locale } = useLocale();
  const t = STR[locale];

  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pnr) return;
    fetchBookingByPnr(pnr)
      .then(setBooking)
      .catch(() => setError(t.notFound));
  }, [pnr, t.notFound]);

  if (error && !booking) {
    return (
      <PublicPageShell>
        <p className="p-8 text-sm text-red-600">{error}</p>
      </PublicPageShell>
    );
  }
  if (!booking) {
    return (
      <PublicPageShell>
        <p className="p-8 text-sm text-[#6b7b94]">{t.loading}</p>
      </PublicPageShell>
    );
  }

  const holdExpired =
    booking.status === 'EXPIRED' ||
    (booking.status === 'HELD' &&
      booking.holdExpiresAt !== null &&
      new Date(booking.holdExpiresAt).getTime() <= Date.now());
  const unpaid =
    booking.status === 'HELD' ||
    booking.status === 'DRAFT' ||
    booking.status === 'PAID';

  if (holdExpired) {
    return (
      <PublicPageShell>
        <div className="mx-auto max-w-[520px] p-8 text-center">
          <h1 className="mb-3 text-lg font-extrabold text-[#0d2640]">{t.expiredTitle}</h1>
          <p className="text-sm leading-7 text-[#6b7787]">{t.expiredMsg}</p>
        </div>
      </PublicPageShell>
    );
  }

  if (unpaid || booking.status !== 'TICKETED') {
    return (
      <PublicPageShell>
        <div className="mx-auto max-w-[520px] p-8 text-center" data-testid="ticket-unpaid-block">
          <h1 className="mb-3 text-lg font-extrabold text-[#0d2640]">{t.unpaidTitle}</h1>
          <p className="text-sm leading-7 text-[#6b7787]">{t.unpaidMsg}</p>
        </div>
      </PublicPageShell>
    );
  }

  const statusLabel = t.ticketIssued;
  const isRtl = locale !== 'en';
  const routeArrow = isRtl ? '←' : '→';
  const aircraft = booking.aircraftType || '—';

  return (
    <PublicPageShell>
      <div className="mx-auto w-full max-w-[760px] px-4 py-6 sm:px-6" data-testid="ticket-issued-page">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="m-0 text-[11px] font-bold text-[#6b7b94]">blujet</p>
            <h1 className="mt-1 text-xl font-black text-[#0d2640]">{t.title}</h1>
          </div>
          <span className="rounded-full bg-[#e8f7ef] px-3 py-1.5 text-[11px] font-extrabold text-[#168458]">
            {statusLabel}
          </span>
        </div>

        {booking.passengers.map((passenger, passengerIndex) => (
        <article
          key={passenger.id ?? passenger.ticketNo ?? `${passenger.seatCode ?? 'no-seat'}-${passengerIndex}`}
          data-testid="passenger-ticket"
          className="mb-5 overflow-hidden rounded-[22px] border border-[#dce6f2] bg-white shadow-[0_24px_54px_-28px_rgba(13,38,102,.35)]"
        >
          <header className="flex items-center justify-between gap-3 bg-[linear-gradient(120deg,#1668c4,#0d3b66)] px-5 py-4 text-white sm:px-7">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 text-lg">✈</span>
              <div>
                <div className="text-sm font-black">blujet</div>
                <div className="mt-0.5 text-[10px] text-white/70">{t.ticketIssued}</div>
              </div>
            </div>
            <div className="text-right" dir="ltr">
              <div className="text-[10px] text-white/70">{t.pnrLabel}</div>
              <div className="font-num text-base font-black tracking-[.18em]">{booking.pnr}</div>
              <div className="mt-1 text-[9px] text-white/70">E-ticket No.</div>
              <div className="font-num text-xs font-black tracking-[.08em]">
                {passenger.ticketNo ?? '—'}
              </div>
            </div>
          </header>

          <section className="px-5 py-6 sm:px-7" dir={isRtl ? 'rtl' : 'ltr'} data-testid="ticket-route">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-6" dir="ltr">
              <div
                className={`${isRtl ? 'order-3 text-right' : 'order-1 text-left'} min-w-0`}
                data-testid="ticket-origin"
                dir={isRtl ? 'rtl' : 'ltr'}
              >
                <div className="font-num text-[30px] font-black leading-none text-[#0d2640]" dir="ltr">{booking.originCode}</div>
                <div className="mt-2 text-xs font-bold text-[#6b7787]">{t.origin}</div>
                <div className="mt-1 font-num text-[11px] text-[#8a96a6]" dir="ltr">{formatDeparture(booking.departureAt, locale)}</div>
              </div>

              <div className="order-2 flex min-w-[112px] flex-col items-center gap-2 text-center">
                <div className="font-num text-[11px] font-extrabold text-[#1668c4]" dir="ltr">{booking.flightNo}</div>
                <div className="flex w-full items-center gap-1.5 text-[#1668c4]" aria-hidden="true">
                  <span className="h-2 w-2 rounded-full bg-[#1668c4]" />
                  <span className="h-px flex-1 bg-[#c7d9ed]" />
                  <span
                    data-testid="ticket-route-airplane"
                    data-direction={isRtl ? 'left' : 'right'}
                    className={`${isRtl ? 'rotate-180' : ''} flex h-9 w-9 items-center justify-center rounded-full bg-[#eef5ff] text-base shadow-sm`}
                  >
                    ✈
                  </span>
                  <span className="h-px flex-1 bg-[#c7d9ed]" />
                  <span className="h-2 w-2 rounded-full border-2 border-[#9bb9dc] bg-white" />
                </div>
                <div className="text-[10px] font-bold text-[#6b7787]">{routeArrow}</div>
              </div>

              <div
                className={`${isRtl ? 'order-1 text-left' : 'order-3 text-right'} min-w-0`}
                data-testid="ticket-destination"
                dir={isRtl ? 'rtl' : 'ltr'}
              >
                <div className="font-num text-[30px] font-black leading-none text-[#0d2640]" dir="ltr">{booking.destCode}</div>
                <div className="mt-2 text-xs font-bold text-[#6b7787]">{t.dest}</div>
                <div className="mt-1 font-num text-[11px] text-[#8a96a6]" dir="ltr">{formatDeparture(booking.arrivalAt, locale)}</div>
              </div>
            </div>
          </section>

          <div className="relative border-t-2 border-dashed border-[#e3e9f1]">
            <span className="absolute -top-3 -right-3 h-6 w-6 rounded-full bg-[#f6f8fb]" />
            <span className="absolute -top-3 -left-3 h-6 w-6 rounded-full bg-[#f6f8fb]" />
          </div>

          <section className="grid grid-cols-2 gap-3 px-5 py-5 sm:grid-cols-4 sm:px-7" dir={isRtl ? 'rtl' : 'ltr'}>
            <TicketMeta
              label={locale === 'en' ? 'Flight number' : locale === 'ar' ? 'رقم الرحلة' : 'شماره پرواز'}
              value={booking.flightNo}
              mono
            />
            <TicketMeta
              label={t.cabinLabel}
              value={(
                <>
                  {CABIN_LABEL[booking.cabin]?.[locale] ?? booking.cabin}
                  {booking.fareClassCode ? (
                    <span className="font-num mr-1 inline-block rounded bg-[#e8f1fc] px-1.5 py-0.5 text-[10px] text-[#1668c4]" dir="ltr">
                      {booking.fareClassCode}
                    </span>
                  ) : null}
                </>
              )}
            />
            <TicketMeta label={locale === 'en' ? 'Aircraft' : locale === 'ar' ? 'الطائرة' : 'نوع هواپیما'} value={aircraft} />
            <TicketMeta label={locale === 'en' ? 'Baggage allowance' : locale === 'ar' ? 'الأمتعة المسموح بها' : 'بار مجاز'} value={locale === 'en' ? '20 kg' : locale === 'ar' ? '20 كغ' : '۲۰ کیلوگرم'} />
          </section>

          <section className="border-t border-[#f2f4f7] px-5 py-5 sm:px-7" dir={isRtl ? 'rtl' : 'ltr'}>
            <div className="mb-3 text-sm font-black text-[#0d2640]">{t.passengers}</div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3 rounded-xl bg-[#f7fafd] px-3.5 py-3 text-xs">
                <span className="font-bold text-[#16202e]">{passenger.fullName}</span>
                <span className="font-num rounded-lg bg-[#e8f1fc] px-2.5 py-1 font-extrabold text-[#1668c4]" dir="ltr">{passenger.seatCode || '—'}</span>
              </div>
            </div>
          </section>

          <footer className="flex flex-col items-center gap-4 border-t border-[#f2f4f7] bg-[#fafbfd] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
            <TicketBarcode value={passenger.ticketNo ?? booking.pnr} />
            <div className="text-center text-[10px] leading-relaxed text-[#8a96a6] sm:text-right" dir={isRtl ? 'rtl' : 'ltr'}>{t.showAtCheckin}</div>
          </footer>
        </article>
        ))}

        <button type="button" onClick={() => window.print()} className="mt-4 w-full rounded-xl border border-[#d5e1f0] bg-white py-3 text-xs font-bold text-[#1668c4]">{t.downloadPrint}</button>
      </div>
    </PublicPageShell>
  );
}

function TicketMeta({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="rounded-xl border border-[#e8eef5] bg-[#fbfcfe] px-3 py-3">
      <div className="text-[10px] text-[#8a96a6]">{label}</div>
      <div className={`${mono ? 'font-num tracking-wider' : ''} mt-1 text-xs font-black text-[#0d2640]`} dir={mono ? 'ltr' : undefined}>{value}</div>
    </div>
  );
}
