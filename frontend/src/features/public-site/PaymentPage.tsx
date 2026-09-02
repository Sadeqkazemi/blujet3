import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchClubPoints, fetchMyBooking, fetchWallet, payBooking } from '../../api/publicSite';
import { ApiRequestError } from '../../api/envelope';
import { useLocale, type StoredLocale } from '../../hooks/useLocale';
import { useIsMobile } from '../../hooks/useIsMobile';
import { localeMoney } from '../../lib/fa-format';
import { localeDigits } from '../../lib/locale-format';
import type { BookingDetail, PayResultPriceChanged } from '../../types/public-site';
import PublicPageShell from '../../components/public/PublicPageShell';
import CheckoutStepBar from './checkout/CheckoutStepBar';
import FlightSummaryCard from './checkout/FlightSummaryCard';
import type { FlightSnapshot } from './checkout/checkout-types';
import { PAYMENT_COPY } from './payment/payment-copy';

type PaymentMethod = 'GATEWAY' | 'WALLET' | 'POINTS';

function holdSecondsLeft(holdExpiresAt: string | null): number {
  if (!holdExpiresAt) return 0;
  return Math.max(0, Math.floor((new Date(holdExpiresAt).getTime() - Date.now()) / 1000));
}

function formatHoldClock(seconds: number, locale: StoredLocale): string {
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  const raw = `${mm}:${ss}`;
  return localeDigits(raw, locale);
}

function bookingToFlight(booking: BookingDetail): FlightSnapshot {
  return {
    flightInstanceId: booking.flightInstanceId,
    flightNo: booking.flightNo,
    originCode: booking.originCode,
    destCode: booking.destCode,
    departureAt: booking.departureAt,
    arrivalAt: booking.arrivalAt,
    priceIrr: booking.priceIrr,
  };
}

function LockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function MethodIcon({ kind }: { kind: PaymentMethod }) {
  if (kind === 'GATEWAY') {
    return (
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 0-2-2z" />
        <path d="M2 10h20" />
        <path d="M6 15h4" />
      </svg>
    );
  }
  if (kind === 'WALLET') {
    return (
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 7V5H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
        <path d="M21 7h-7a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h7z" />
        <path d="M16.5 12h.01" />
      </svg>
    );
  }
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l2.7 5.5 6 .9-4.3 4.2 1 6L12 16.8l-5.4 2.8 1-6L3.3 9.4l6-.9z" />
    </svg>
  );
}

const METHOD_STYLE: Record<
  PaymentMethod,
  { iconBg: string; iconColor: string }
> = {
  GATEWAY: { iconBg: '#eef4fb', iconColor: '#1668c4' },
  WALLET: { iconBg: '#f0eefb', iconColor: '#6d5bd0' },
  POINTS: { iconBg: '#fdf3d9', iconColor: '#caa53a' },
};

function PaymentMethodRow({
  method,
  selected,
  disabled,
  title,
  subtitle,
  tag,
  onSelect,
  testId,
}: {
  method: PaymentMethod;
  selected: boolean;
  disabled?: boolean;
  title: string;
  subtitle: string;
  tag?: string;
  onSelect: () => void;
  testId: string;
}) {
  const style = METHOD_STYLE[method];
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      data-testid={testId}
      className={`flex w-full items-center justify-between gap-2.5 rounded-[13px] px-[15px] py-[13px] text-start transition-colors ${
        disabled
          ? 'cursor-not-allowed border border-[#e6eaf0] opacity-50'
          : selected
            ? 'cursor-pointer border-[1.5px] border-[#1668c4] bg-[#f6faff]'
            : 'cursor-pointer border-[1.5px] border-[#e6eaf0] bg-white hover:border-[#1668c4]/40'
      }`}
    >
      <div className="flex min-w-0 items-center gap-[11px]">
        <span
          className={`flex h-[17px] w-[17px] flex-none items-center justify-center rounded-full border-2 ${
            selected ? 'border-[#1668c4]' : 'border-[#cbd5e1]'
          }`}
        >
          {selected && <span className="h-2 w-2 rounded-full bg-[#1668c4]" />}
        </span>
        <span
          className="flex h-10 w-10 flex-none items-center justify-center rounded-[11px]"
          style={{ background: style.iconBg, color: style.iconColor }}
        >
          <MethodIcon kind={method} />
        </span>
        <div className="min-w-0 leading-snug">
          <div className="text-[12.5px] font-extrabold text-[#0d2640]">{title}</div>
          <div className="text-[10.5px] text-[#8a96a6]">{subtitle}</div>
        </div>
      </div>
      {tag ? (
        <span className="flex-none text-[11px] font-bold text-[#1f8a5b]">{tag}</span>
      ) : (
        <span className="w-0 flex-none" />
      )}
    </button>
  );
}

function HoldBanner({
  locale,
  label,
  seconds,
  urgent,
}: {
  locale: StoredLocale;
  label: string;
  seconds: number;
  urgent: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between rounded-[11px] px-3 py-2.5 ${
        urgent ? 'bg-[#fdecec]' : 'bg-[#e8f5ee]'
      }`}
    >
      <span className={`text-[11.5px] font-bold ${urgent ? 'text-[#e5484d]' : 'text-[#1f8a5b]'}`}>
        {label}
      </span>
      <span
        className={`font-num text-sm font-black ${urgent ? 'text-[#e5484d]' : 'text-[#1f8a5b]'}`}
        dir="ltr"
        data-testid="hold-timer"
      >
        {formatHoldClock(seconds, locale)}
      </span>
    </div>
  );
}

function PaymentPricingAside({
  locale,
  t,
  paxCount,
  ticketIrr,
  taxesIrr,
  extras,
  priceDisplay,
  isClubMember,
  clubDisplay,
  earnDisplay,
  afterDisplay,
  holdSecs,
  holdUrgent,
  hideActions,
  priceChange,
  paying,
  holdExpired,
  onPay,
}: {
  locale: StoredLocale;
  t: (typeof PAYMENT_COPY)[StoredLocale];
  paxCount: number;
  ticketIrr: number;
  taxesIrr: number;
  extras: NonNullable<BookingDetail['extras']>;
  priceDisplay: string;
  isClubMember: boolean;
  clubDisplay: string;
  earnDisplay: string;
  afterDisplay: string;
  holdSecs: number;
  holdUrgent: boolean;
  hideActions: boolean;
  priceChange: PayResultPriceChanged | null;
  paying: boolean;
  holdExpired: boolean;
  onPay: (confirmedPriceIrr?: string | number) => void;
}) {
  const paxLabel =
    locale === 'en'
      ? t.ticketPrice(paxCount)
      : t.ticketPrice(paxCount).replace(String(paxCount), localeDigits(paxCount, locale));

  return (
    <aside
      className="flex flex-col rounded-[18px] border border-[#eef1f5] bg-white p-[22px] lg:sticky lg:top-[146px]"
      data-testid="payment-pricing-aside"
    >
      {holdSecs > 0 && (
        <div className="mb-3.5">
          <HoldBanner locale={locale} label={t.holdRemaining} seconds={holdSecs} urgent={holdUrgent} />
        </div>
      )}

      <div className="mb-4 text-[16.5px] font-extrabold text-[#0d2640]">{t.paymentDetails}</div>

      <div className="mb-4 overflow-hidden rounded-[13px] border border-[#eef1f5]">
        <div className="grid grid-cols-[1fr_auto] gap-2 border-b border-[#eef1f5] bg-[#f8fafc] px-3.5 py-2 text-[10.5px] font-bold text-[#8a96a6]">
          <span>{t.description}</span>
          <span>{t.amountToman}</span>
        </div>
        <div className="grid grid-cols-[1fr_auto] items-center gap-2 px-3.5 py-2.5 text-[13px] text-[#5a6678]">
          <span>{paxLabel}</span>
          <span className="font-bold text-[#16202e]" data-testid="payment-ticket-amount">
            {localeMoney(ticketIrr, locale)}
          </span>
        </div>
        <div className="grid grid-cols-[1fr_auto] items-center gap-2 border-t border-[#eef1f5] px-3.5 py-2.5 text-[13px] text-[#5a6678]">
          <span>{t.taxesFees}</span>
          <span className="font-bold text-[#16202e]" data-testid="payment-tax-amount">
            {localeMoney(taxesIrr, locale)}
          </span>
        </div>
        {extras.map((extra) => {
          const title = locale === 'en'
            ? extra.titleEn || extra.code.replaceAll('_', ' ')
            : locale === 'ar'
              ? extra.titleAr || 'خدمة إضافية'
              : extra.titleFa;
          return (
            <div key={extra.id} className="grid grid-cols-[1fr_auto] items-center gap-2 border-t border-[#eef1f5] px-3.5 py-2.5 text-[13px] text-[#5a6678]">
              <span>{title}</span>
              <span className="font-bold text-[#16202e]">{localeMoney(extra.totalIrr, locale)}</span>
            </div>
          );
        })}
      </div>

      {isClubMember && (
        <div className="mb-4 rounded-[11px] border border-[#f3e3b8] bg-[#fffaf0] p-3">
          <div className="mb-2 text-[11.5px] font-extrabold text-[#8a6d1f]">{t.clubCalc}</div>
          <div className="mb-1 flex justify-between text-[11px] text-[#7d8ba0]">
            <span>{t.currentPoints}</span>
            <span className="font-bold text-[#16202e]">
              {clubDisplay} {t.pointsUnit}
            </span>
          </div>
          <div className="mb-1 flex justify-between text-[11px] text-[#7d8ba0]">
            <span>{t.earnPoints}</span>
            <span className="font-bold text-[#1f8a5b]">
              + {earnDisplay} {t.pointsUnit}
            </span>
          </div>
          <div className="flex justify-between border-t border-dashed border-[#ecdba0] pt-2 text-[11.5px]">
            <span className="font-bold text-[#0d2640]">{t.pointsAfter}</span>
            <span className="font-extrabold text-[#8a6d1f]">
              {afterDisplay} {t.pointsUnit}
            </span>
          </div>
        </div>
      )}

      <div className="mb-3.5 flex items-center justify-between rounded-[13px] bg-[#eef4fb] px-4 py-3.5">
        <span className="text-[14.5px] font-extrabold text-[#0d2640]">{t.total}</span>
        <span className="text-[19px] font-black text-[#1668c4]">{priceDisplay}</span>
      </div>

      <div className="mb-4 flex items-center gap-1.5 text-[11.5px] text-[#8a96a6]">
        <LockIcon /> {t.securePayment}
      </div>

      {priceChange && (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
          <p className="mb-2 text-xs text-amber-800">{t.priceChanged}</p>
          <p className="font-num text-sm font-extrabold text-amber-900">
            {t.newPrice(localeMoney(priceChange.currentPriceIrr, locale))}
          </p>
        </div>
      )}

      {!hideActions && (
        <>
          <p className="mb-4 text-center text-[10.5px] leading-relaxed text-[#9aa4b2]">{t.payTerms}</p>
          <button
            disabled={paying || holdExpired}
            onClick={() => onPay(priceChange?.currentPriceIrr)}
            data-testid={priceChange ? 'confirm-new-price' : 'pay-submit'}
            className="flex h-14 items-center justify-center rounded-[14px] bg-[#1668c4] text-[15px] font-extrabold text-white shadow-[0_12px_24px_-12px_rgba(22,104,196,.55)] disabled:opacity-60"
          >
            {paying ? t.paying : priceChange ? t.confirmNewPrice : t.payFinal}
          </button>
        </>
      )}
    </aside>
  );
}

function PaymentMethodsSection({
  t,
  paymentMethod,
  setPaymentMethod,
  walletDisplay,
  clubDisplay,
  isClubMember,
  promoCode,
  setPromoCode,
}: {
  t: (typeof PAYMENT_COPY)[StoredLocale];
  paymentMethod: PaymentMethod;
  setPaymentMethod: (m: PaymentMethod) => void;
  walletDisplay: string;
  clubDisplay: string;
  isClubMember: boolean;
  promoCode: string;
  setPromoCode: (v: string) => void;
}) {
  return (
    <section
      className="rounded-[15px] border border-[#eef1f5] bg-white px-[17px] py-4"
      data-testid="payment-methods-section"
    >
      <div className="mb-[15px] flex items-center gap-2.5">
        <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-[#eef4fb] text-[#1668c4]">
          <LockIcon />
        </span>
        <h2 className="m-0 text-[15.5px] font-extrabold text-[#0d2640]">{t.payment}</h2>
      </div>

      <div className="mb-[15px] flex flex-col gap-2.5">
        <PaymentMethodRow
          method="GATEWAY"
          selected={paymentMethod === 'GATEWAY'}
          onSelect={() => setPaymentMethod('GATEWAY')}
          title={t.gatewayTitle}
          subtitle={t.gatewaySub}
          tag={t.gatewayTag}
          testId="payment-method-GATEWAY"
        />
        <PaymentMethodRow
          method="WALLET"
          selected={paymentMethod === 'WALLET'}
          onSelect={() => setPaymentMethod('WALLET')}
          title={t.walletTitle}
          subtitle={t.walletBalance(walletDisplay)}
          testId="payment-method-WALLET"
        />
        <PaymentMethodRow
          method="POINTS"
          selected={paymentMethod === 'POINTS'}
          disabled={!isClubMember}
          onSelect={() => setPaymentMethod('POINTS')}
          title={t.pointsTitle}
          subtitle={t.pointsBalance(clubDisplay)}
          testId="payment-method-POINTS"
        />
      </div>

      <div className="mb-[13px] flex gap-2">
        <input
          id="promo-code"
          data-testid="promo-code-input"
          value={promoCode}
          onChange={(e) => setPromoCode(e.target.value)}
          placeholder={t.discountPlaceholder}
          dir="ltr"
          className="h-[46px] flex-1 rounded-[10px] border-[1.5px] border-[#e2e7ee] bg-white px-3.5 font-mono text-[13px] outline-none focus:border-[#1668c4]"
        />
        <button
          type="button"
          className="flex h-[46px] items-center whitespace-nowrap rounded-[10px] bg-[#1668c4] px-5 text-[12.5px] font-bold text-white"
          onClick={() => undefined}
        >
          {t.applyCode}
        </button>
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-[#eef1f5] bg-[#f8fafc] px-[13px] py-[11px] text-[11px] text-[#8a96a6]">
        <span className="text-[13px]">ℹ</span>
        <span>{t.pointsHint}</span>
      </div>
    </section>
  );
}

export default function PaymentPage() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const navigate = useNavigate();
  const { locale } = useLocale();
  const isMobile = useIsMobile();
  const t = PAYMENT_COPY[locale];

  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [walletBalanceIrr, setWalletBalanceIrr] = useState<string | null>(null);
  const [clubBalance, setClubBalance] = useState(0);
  const [isClubMember, setIsClubMember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [priceChange, setPriceChange] = useState<PayResultPriceChanged | null>(null);
  const [paying, setPaying] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('GATEWAY');
  const [holdSecs, setHoldSecs] = useState(0);

  useEffect(() => {
    if (!bookingId) return;
    fetchMyBooking(bookingId)
      .then((b) => {
        setBooking(b);
        setHoldSecs(holdSecondsLeft(b.holdExpiresAt));
      })
      .catch(() => setError(t.notFound));
    fetchWallet()
      .then((w) => setWalletBalanceIrr(w.balanceIrr))
      .catch(() => undefined);
    fetchClubPoints()
      .then((p) => {
        setIsClubMember(p.isMember);
        setClubBalance(p.balance);
      })
      .catch(() => undefined);
  }, [bookingId, t.notFound]);

  useEffect(() => {
    if (!booking?.holdExpiresAt) return;
    const id = setInterval(() => setHoldSecs(holdSecondsLeft(booking.holdExpiresAt)), 1000);
    return () => clearInterval(id);
  }, [booking?.holdExpiresAt]);

  const earnPoints = useMemo(() => {
    if (!booking) return 0;
    // Matches backend ClubPointsService IRR_PER_EARNED_POINT = 100_000.
    return Math.floor(Number(booking.priceIrr) / 100_000);
  }, [booking]);

  async function onPay(confirmedPriceIrr?: string | number) {
    if (!bookingId || !booking) return;
    if (booking.status === 'HELD' && holdSecs <= 0 && booking.holdExpiresAt) return;
    setError(null);
    setPaying(true);
    try {
      const result = await payBooking(bookingId, {
        confirmedPriceIrr,
        promoCode: promoCode.trim() || undefined,
        paymentMethod,
      });
      if (result.priceChanged) {
        setPriceChange(result);
        return;
      }
      if (result.walletBalanceIrr !== undefined) {
        window.dispatchEvent(
          new CustomEvent('blujet:wallet-balance', {
            detail: { balanceIrr: result.walletBalanceIrr },
          }),
        );
      }
      const pendingReturn = sessionStorage.getItem('blujet_pending_return_payment');
      if (pendingReturn) {
        sessionStorage.removeItem('blujet_pending_return_payment');
        navigate(`/payment/${pendingReturn}`);
        return;
      }
      navigate(`/ticket/${result.booking.pnr}`);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t.payError);
    } finally {
      setPaying(false);
    }
  }

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

  if (booking.status === 'EXPIRED' || (booking.status === 'HELD' && holdSecs <= 0 && booking.holdExpiresAt)) {
    return (
      <PublicPageShell>
        <div className="mx-auto max-w-md p-8 text-center">
          <p className="mb-4 text-sm text-red-600">{t.expired}</p>
          <button
            onClick={() => navigate('/')}
            className="rounded-lg bg-[#1668c4] px-6 py-2.5 text-sm font-bold text-white"
          >
            {t.searchAgain}
          </button>
        </div>
      </PublicPageShell>
    );
  }

  const holdExpired =
    booking.status === 'HELD' && holdSecs <= 0 && Boolean(booking.holdExpiresAt);
  const holdUrgent = holdSecs <= 120;
  // The backend snapshots fare, tax and charges when the HELD booking is
  // created. Payment must display that immutable snapshot instead of
  // calculating a new tax rate in the browser.
  const taxesIrr = Number(
    booking.taxIrr ?? Math.round(Number(booking.priceIrr) * 0.084),
  );
  const extrasIrr = Number(booking.extrasIrr ?? '0');
  const ticketIrr = Number(booking.priceIrr) - taxesIrr - extrasIrr;
  const priceDisplay = localeMoney(booking.priceIrr, locale);
  const walletDisplay =
    walletBalanceIrr !== null ? localeMoney(walletBalanceIrr, locale) : '—';
  const clubDisplay = localeDigits(clubBalance, locale);
  const earnDisplay = localeDigits(earnPoints, locale);
  const afterDisplay =
    localeDigits(clubBalance + earnPoints, locale);
  const paxCount = Math.max(1, booking.passengers.length);
  const flight = bookingToFlight(booking);

  const pricingAside = (
    <PaymentPricingAside
      locale={locale}
      t={t}
      paxCount={paxCount}
      ticketIrr={ticketIrr}
      taxesIrr={taxesIrr}
      extras={booking.extras ?? []}
      priceDisplay={priceDisplay}
      isClubMember={isClubMember}
      clubDisplay={clubDisplay}
      earnDisplay={earnDisplay}
      afterDisplay={afterDisplay}
      holdSecs={holdSecs}
      holdUrgent={holdUrgent}
      hideActions={false}
      priceChange={priceChange}
      paying={paying}
      holdExpired={holdExpired}
      onPay={onPay}
    />
  );

  const paymentMethods = (
    <PaymentMethodsSection
      t={t}
      paymentMethod={paymentMethod}
      setPaymentMethod={setPaymentMethod}
      walletDisplay={walletDisplay}
      clubDisplay={clubDisplay}
      isClubMember={isClubMember}
      promoCode={promoCode}
      setPromoCode={setPromoCode}
    />
  );

  if (isMobile) {
    return (
      <PublicPageShell>
        <div
          className="flex items-center gap-3 border-b border-[#eef1f5] bg-white px-4 py-3"
          data-testid="payment-mobile-titlebar"
        >
          <button
            type="button"
            onClick={() => navigate(-1)}
            data-testid="payment-mobile-back"
            className="flex h-9 w-9 flex-none items-center justify-center rounded-full border border-[#e6eaf0] bg-[#f3f5f8] text-[#0d2640]"
          >
            →
          </button>
          <span className="text-sm font-extrabold text-[#16202e]">{t.title}</span>
        </div>

        <div
          className="mx-auto flex w-full max-w-[1180px] flex-col gap-[15px] px-3.5 py-3.5"
          data-testid="payment-mobile-main"
        >
          {error && (
            <div className="rounded-[10px] border border-[#f5c6c6] bg-[#fdecec] px-3.5 py-2.5 text-xs font-semibold text-[#c0343a]">
              {error}
            </div>
          )}
          <FlightSummaryCard flight={flight} cabin={booking.cabin} locale={locale} />
          {paymentMethods}
          {pricingAside}
        </div>
      </PublicPageShell>
    );
  }

  return (
    <PublicPageShell>
      <CheckoutStepBar current="payment" locale={locale} />
      <div className="mx-auto max-w-[1180px] px-5 py-5">
        {error && <p className="mb-4 rounded-lg bg-red-50 p-3 text-xs text-red-600">{error}</p>}

        <div className="grid items-start gap-2.5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="flex min-w-0 flex-col gap-[15px]">
            <FlightSummaryCard flight={flight} cabin={booking.cabin} locale={locale} />
            {paymentMethods}
          </div>
          {pricingAside}
        </div>
      </div>
    </PublicPageShell>
  );
}
