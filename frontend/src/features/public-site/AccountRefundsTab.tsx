import { useEffect, useMemo, useState } from 'react';
import { z } from 'zod';
import Modal from '../../components/Modal';
import {
  fetchBankAccounts,
  fetchCustomerRefundRules,
  fetchEligibleRefundBookings,
  fetchMyRefunds,
  previewRefund,
  submitRefund,
} from '../../api/publicSite';
import {
  arDigits,
  faDigits,
  formatLocalePercent,
  latinDigits,
  localeMoney,
} from '../../lib/fa-format';
import { formatLocaleDateTime } from '../../lib/locale-format';
import { useLocale, type StoredLocale } from '../../hooks/useLocale';
import type {
  CustomerRefundRule,
  EligibleRefundBooking,
  RefundPreview,
  RefundRequestView,
  SavedBankAccount,
} from '../../types/public-site';

const ibanSchema = z.string().regex(/^IR\d{24}$/);
const STAGES = ['submitted', 'review', 'finance', 'paid'] as const;

const COPY = {
  fa: {
    title: 'استرداد بلیط',
    subtitle: 'درخواست کنسلی، مشاهده جریمه و پیگیری مرحله‌ای بازگشت وجه',
    eligible: 'قابل استرداد',
    active: 'درخواست فعال',
    flights: 'پروازهای قابل استرداد',
    flightsSub: 'برای مشاهده قوانین و ثبت درخواست، روی «درخواست استرداد» بزنید.',
    noneEligible: 'پرواز قابل استردادی ندارید',
    penalty: 'جریمه',
    refundable: 'قابل بازگشت',
    request: 'درخواست استرداد',
    timeLeft: 'ساعت مانده',
    rules: 'قوانین کنسلی و جریمه استرداد',
    rulesSub: 'درصد جریمه بر اساس فاصله زمانی تا پرواز',
    notAllowed: 'غیرمجاز',
    process: 'پس از ثبت، ادمین سایت درخواست را بررسی و به واحد مالی ارجاع می‌دهد؛ مبلغ قابل بازگشت حداکثر تا ۷ روز کاری واریز می‌شود.',
    tracking: 'پیگیری درخواست‌های استرداد',
    trackingSub: 'وضعیت لحظه‌ای درخواست‌های شما در هر مرحله',
    noneRequests: 'هنوز درخواست استردادی ثبت نکرده‌اید.',
    trackingCode: 'کد پیگیری',
    ticket: 'بلیط',
    amount: 'مبلغ قابل بازگشت',
    modalTitle: 'ثبت درخواست استرداد',
    bank: 'حساب بانکی مقصد',
    manual: 'ورود شماره شبای دیگر',
    iban: 'شماره شبا',
    paid: 'مبلغ پرداخت‌شده',
    confirm: 'تأیید و ثبت درخواست',
    cancel: 'انصراف',
    loading: 'در حال بارگذاری…',
    previewLoading: 'در حال محاسبه جریمه…',
    invalidIban: 'شماره شبا باید با IR شروع شود و ۲۴ رقم داشته باشد.',
    loadError: 'دریافت اطلاعات استرداد انجام نشد.',
    submitError: 'ثبت درخواست استرداد انجام نشد.',
    toman: 'تومان',
    stages: ['ثبت درخواست', 'بررسی ادمین', 'ارجاع به مالی', 'واریز وجه'],
  },
  en: {
    title: 'Ticket Refund',
    subtitle: 'Cancel eligible tickets, review penalties, and track repayment',
    eligible: 'Refundable',
    active: 'Active requests',
    flights: 'Refundable Flights',
    flightsSub: 'Select “Request Refund” to review and submit.',
    noneEligible: 'You have no refundable flights',
    penalty: 'Penalty',
    refundable: 'Refundable',
    request: 'Request Refund',
    timeLeft: 'hours left',
    rules: 'Cancellation Rules & Refund Penalty',
    rulesSub: 'Penalty percentage based on time remaining',
    notAllowed: 'Not allowed',
    process: 'After submission, the site admin reviews and refers the request to Finance. Payment is completed within 7 business days.',
    tracking: 'Track Refund Requests',
    trackingSub: 'Live status of your requests at every stage',
    noneRequests: 'You have not submitted a refund request yet.',
    trackingCode: 'Tracking code',
    ticket: 'Ticket',
    amount: 'Refund amount',
    modalTitle: 'Submit Refund Request',
    bank: 'Destination bank account',
    manual: 'Use another IBAN',
    iban: 'IBAN',
    paid: 'Amount paid',
    confirm: 'Confirm and submit',
    cancel: 'Cancel',
    loading: 'Loading…',
    previewLoading: 'Calculating penalty…',
    invalidIban: 'IBAN must start with IR and contain 24 digits.',
    loadError: 'Could not load refund information.',
    submitError: 'Could not submit the refund request.',
    toman: 'toman',
    stages: ['Submitted', 'Admin review', 'Finance review', 'Paid'],
  },
  ar: {
    title: 'استرداد التذكرة',
    subtitle: 'إلغاء التذاكر المؤهلة ومراجعة الغرامة وتتبع إعادة المبلغ',
    eligible: 'قابل للاسترداد',
    active: 'طلبات نشطة',
    flights: 'الرحلات القابلة للاسترداد',
    flightsSub: 'اضغط «طلب الاسترداد» للمراجعة والإرسال.',
    noneEligible: 'لا توجد رحلات قابلة للاسترداد',
    penalty: 'الغرامة',
    refundable: 'المبلغ المسترد',
    request: 'طلب الاسترداد',
    timeLeft: 'ساعة متبقية',
    rules: 'قواعد الإلغاء وغرامة الاسترداد',
    rulesSub: 'نسبة الغرامة حسب الوقت المتبقي',
    notAllowed: 'غير مسموح',
    process: 'بعد الإرسال يراجع مدير الموقع الطلب ويحيله إلى المالية، ويتم الدفع خلال ٧ أيام عمل.',
    tracking: 'تتبع طلبات الاسترداد',
    trackingSub: 'الحالة المباشرة للطلب في كل مرحلة',
    noneRequests: 'لم تقدم طلب استرداد بعد.',
    trackingCode: 'رمز التتبع',
    ticket: 'التذكرة',
    amount: 'مبلغ الاسترداد',
    modalTitle: 'إرسال طلب الاسترداد',
    bank: 'الحساب البنكي المستلم',
    manual: 'استخدام شبا آخر',
    iban: 'رقم شبا',
    paid: 'المبلغ المدفوع',
    confirm: 'تأكيد وإرسال',
    cancel: 'إلغاء',
    loading: 'جارٍ التحميل…',
    previewLoading: 'جارٍ حساب الغرامة…',
    invalidIban: 'يجب أن يبدأ شبا بـ IR ويتكون من ٢٤ رقماً.',
    loadError: 'تعذر تحميل معلومات الاسترداد.',
    submitError: 'تعذر إرسال طلب الاسترداد.',
    toman: 'تومان',
    stages: ['تم الإرسال', 'مراجعة المدير', 'الإحالة للمالية', 'تم الدفع'],
  },
} satisfies Record<StoredLocale, Record<string, string | string[]>>;

const STATUS: Record<RefundRequestView['status'], Record<StoredLocale, string>> = {
  SUBMITTED: { fa: 'ثبت‌شده', en: 'Submitted', ar: 'تم الإرسال' },
  REVIEW: { fa: 'در حال بررسی', en: 'Under review', ar: 'قيد المراجعة' },
  FINANCE: { fa: 'در واحد مالی', en: 'With Finance', ar: 'لدى المالية' },
  PAID: { fa: 'واریز شد', en: 'Paid', ar: 'تم الدفع' },
};

function digits(value: string | number, locale: StoredLocale) {
  if (locale === 'en') return String(value);
  return locale === 'ar' ? arDigits(value) : faDigits(value);
}

function ruleLabel(rule: CustomerRefundRule, locale: StoredLocale) {
  if (locale === 'fa') return rule.labelFa;
  const min = rule.minHoursBeforeDeparture;
  if (locale === 'en') {
    if (min === 72) return 'More than 72 hours';
    if (min === 24) return '24 to 72 hours';
    if (min === 3) return '3 to 24 hours';
    return 'Under 3 hours / after departure';
  }
  if (min === 72) return 'أكثر من ٧٢ ساعة';
  if (min === 24) return 'من ٢٤ إلى ٧٢ ساعة';
  if (min === 3) return 'من ٣ إلى ٢٤ ساعة';
  return 'أقل من ٣ ساعات / بعد المغادرة';
}

export default function AccountRefundsTab() {
  const { locale } = useLocale();
  const t = COPY[locale];
  const [eligible, setEligible] = useState<EligibleRefundBooking[] | null>(null);
  const [requests, setRequests] = useState<RefundRequestView[] | null>(null);
  const [rules, setRules] = useState<CustomerRefundRule[]>([]);
  const [banks, setBanks] = useState<SavedBankAccount[]>([]);
  const [selected, setSelected] = useState<EligibleRefundBooking | null>(null);
  const [preview, setPreview] = useState<RefundPreview | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [bankId, setBankId] = useState('');
  const [manualIban, setManualIban] = useState('');
  const [useManual, setUseManual] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);

  async function load() {
    try {
      const [nextEligible, nextRequests, nextRules, nextBanks] =
        await Promise.all([
          fetchEligibleRefundBookings(),
          fetchMyRefunds(),
          fetchCustomerRefundRules(),
          fetchBankAccounts(),
        ]);
      setEligible(nextEligible);
      setRequests(nextRequests);
      setRules(nextRules);
      setBanks(nextBanks);
    } catch {
      setError(t.loadError as string);
      setEligible([]);
      setRequests([]);
    }
  }

  useEffect(() => {
    void load();
    // Reload when display language changes so fallback errors use that locale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  const activeCount = useMemo(
    () => (requests ?? []).filter((r) => r.status !== 'PAID').length,
    [requests],
  );

  async function openRequest(row: EligibleRefundBooking) {
    setSelected(row);
    setPreview(null);
    setModalError(null);
    setUseManual(banks.length === 0);
    setBankId(banks.find((b) => b.isDefault)?.id ?? banks[0]?.id ?? '');
    setManualIban('');
    setPreviewBusy(true);
    try {
      setPreview(await previewRefund(row.bookingId));
    } catch (e) {
      setModalError(e instanceof Error ? e.message : (t.loadError as string));
    } finally {
      setPreviewBusy(false);
    }
  }

  async function confirm() {
    if (!selected || !preview) return;
    const bank = banks.find((b) => b.id === bankId);
    const iban = latinDigits(
      (useManual ? manualIban : bank?.sheba ?? '').replace(/\s/g, ''),
    ).toUpperCase();
    if (!ibanSchema.safeParse(iban).success) {
      setModalError(t.invalidIban as string);
      return;
    }
    setSubmitBusy(true);
    setModalError(null);
    try {
      await submitRefund(selected.bookingId, iban);
      setSelected(null);
      await load();
    } catch (e) {
      setModalError(e instanceof Error ? e.message : (t.submitError as string));
    } finally {
      setSubmitBusy(false);
    }
  }

  const loading = eligible === null || requests === null;

  return (
    <div data-testid="account-refunds" className="flex flex-col gap-4">
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-[18px] bg-gradient-to-br from-[#0d2640] to-[#16406e] p-5 text-white">
        <div>
          <h2 className="m-0 text-lg font-black">{t.title}</h2>
          <p className="mt-1 max-w-md text-xs leading-7 text-[#aac4e2]">{t.subtitle}</p>
        </div>
        <div className="flex gap-3">
          <Kpi value={eligible?.length ?? 0} label={t.eligible as string} locale={locale} />
          <Kpi value={activeCount} label={t.active as string} locale={locale} />
        </div>
      </section>

      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-xs text-red-700">{error}</p>}
      {loading ? (
        <p className="py-8 text-center text-sm text-muted">{t.loading}</p>
      ) : (
        <>
          <section className="rounded-2xl border border-[#eef1f5] bg-white p-[18px]">
            <h3 className="m-0 text-[15px] font-extrabold text-ink">{t.flights}</h3>
            <p className="mb-4 mt-1 text-xs text-muted">{t.flightsSub}</p>
            {eligible.length === 0 ? (
              <p className="py-7 text-center text-xs text-muted">{t.noneEligible}</p>
            ) : (
              <div className="flex flex-col gap-3">
                {eligible.map((row) => (
                  <div key={row.bookingId} data-testid="refund-eligible" className="flex flex-wrap items-center justify-between gap-4 rounded-[14px] border border-[#eef1f5] p-3.5">
                    <div className="flex flex-wrap items-center gap-4">
                      <div className="ltr text-lg font-black text-ink">{row.originCode} → {row.destCode}</div>
                      <div className="text-xs leading-6 text-muted">
                        <div className="ltr font-semibold">{row.flightNo} · {row.pnr}</div>
                        <div>{formatDate(row.departureAt, locale)}</div>
                      </div>
                      <div className="flex gap-2">
                        <span className="rounded-full bg-[#eef4fb] px-2.5 py-1 text-[11px] font-bold text-accent">
                          {digits(Math.max(0, Math.ceil(row.hoursLeft)), locale)} {t.timeLeft}
                        </span>
                        <span className="rounded-full bg-[#fdecec] px-2.5 py-1 text-[11px] font-bold text-danger">
                          {t.penalty} {formatLocalePercent(row.penaltyPct, locale)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-left">
                        <div className="text-[10px] text-muted">{t.refundable}</div>
                        <div className="text-sm font-black text-[#1f8a5b]">{localeMoney(row.refundableIrr, locale)} {t.toman}</div>
                      </div>
                      <button type="button" onClick={() => void openRequest(row)} className="rounded-xl bg-danger px-4 py-2.5 text-xs font-extrabold text-white">
                        {t.request}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-[#eef1f5] bg-white p-[18px]">
            <h3 className="m-0 text-[15px] font-extrabold text-ink">{t.rules}</h3>
            <p className="mb-4 mt-1 text-xs text-muted">{t.rulesSub}</p>
            <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
              {rules.map((rule) => (
                <div key={rule.minHoursBeforeDeparture} data-testid="refund-rule" className={`rounded-[13px] border p-3.5 text-center ${rule.isRefundable ? 'border-amber-100 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}>
                  <div className={`text-lg font-black ${rule.isRefundable ? 'text-danger' : 'text-muted'}`}>
                    {rule.isRefundable ? formatLocalePercent(rule.penaltyPct, locale) : t.notAllowed}
                  </div>
                  <div className="mt-1.5 text-[11px] leading-5 text-muted">{ruleLabel(rule, locale)}</div>
                </div>
              ))}
            </div>
            <p className="mb-0 mt-3.5 rounded-xl border border-[#f6e0bb] bg-[#fff8ec] p-3 text-xs leading-7 text-[#9a6a16]">{t.process}</p>
          </section>

          <section className="rounded-2xl border border-[#eef1f5] bg-white p-[18px]">
            <h3 className="m-0 text-[15px] font-extrabold text-ink">{t.tracking}</h3>
            <p className="mb-4 mt-1 text-xs text-muted">{t.trackingSub}</p>
            {requests.length === 0 ? (
              <p className="py-8 text-center text-xs text-muted">{t.noneRequests}</p>
            ) : (
              <div className="flex flex-col gap-3">
                {requests.map((row) => (
                  <TrackingCard key={row.id} row={row} locale={locale} />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {selected && (
        <Modal
          variant="light"
          title={t.modalTitle as string}
          onClose={() => !submitBusy && setSelected(null)}
        >
          {previewBusy ? (
            <p className="py-6 text-center text-sm text-muted">{t.previewLoading}</p>
          ) : preview ? (
            <div className="flex flex-col gap-4">
              <div className="ltr rounded-xl bg-surface p-3 text-center text-sm font-black text-ink">
                {selected.originCode} → {selected.destCode} · {selected.pnr}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Amount label={t.paid as string} value={preview.totalPaidIrr} locale={locale} />
                <Amount label={t.penalty as string} value={preview.penaltyAmountIrr} locale={locale} />
                <Amount label={t.refundable as string} value={preview.refundableIrr} locale={locale} green />
              </div>
              {banks.length > 0 && !useManual && (
                <label className="text-xs font-bold text-ink">
                  {t.bank}
                  <select value={bankId} onChange={(e) => setBankId(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-border bg-white px-3 text-xs">
                    {banks.map((bank) => (
                      <option key={bank.id} value={bank.id}>{bank.bankName} · {bank.shebaMasked}</option>
                    ))}
                  </select>
                </label>
              )}
              {useManual && (
                <label className="text-xs font-bold text-ink">
                  {t.iban}
                  <input data-testid="refund-iban" value={manualIban} onChange={(e) => setManualIban(e.target.value)} dir="ltr" placeholder="IR820170000000332211009900" className="mt-2 h-11 w-full rounded-xl border border-border px-3 font-mono text-xs" />
                </label>
              )}
              {banks.length > 0 && (
                <button type="button" onClick={() => setUseManual((v) => !v)} className="text-xs font-bold text-accent">{t.manual}</button>
              )}
              {modalError && <p role="alert" className="m-0 text-xs text-danger">{modalError}</p>}
              <div className="flex gap-2">
                <button type="button" data-testid="refund-confirm" disabled={submitBusy} onClick={() => void confirm()} className="flex-1 rounded-xl bg-danger py-3 text-xs font-extrabold text-white disabled:opacity-50">
                  {t.confirm}
                </button>
                <button type="button" disabled={submitBusy} onClick={() => setSelected(null)} className="rounded-xl border border-border px-4 text-xs font-bold text-muted">{t.cancel}</button>
              </div>
            </div>
          ) : (
            modalError && <p role="alert" className="text-xs text-danger">{modalError}</p>
          )}
        </Modal>
      )}
    </div>
  );
}

function Kpi({ value, label, locale }: { value: number; label: string; locale: StoredLocale }) {
  return (
    <div className="min-w-24 rounded-[13px] border border-white/15 bg-white/10 px-4 py-3 text-center">
      <div className="text-2xl font-black">{digits(value, locale)}</div>
      <div className="mt-1 text-[11px] text-[#aac4e2]">{label}</div>
    </div>
  );
}

function Amount({ label, value, locale, green = false }: { label: string; value: number | string; locale: StoredLocale; green?: boolean }) {
  return (
    <div className="rounded-xl border border-border p-2 text-center">
      <div className="text-[10px] text-muted">{label}</div>
      <div className={`mt-1 text-xs font-black ${green ? 'text-[#1f8a5b]' : 'text-ink'}`}>{localeMoney(value, locale)}</div>
    </div>
  );
}

function TrackingCard({ row, locale }: { row: RefundRequestView; locale: StoredLocale }) {
  const t = COPY[locale];
  const completed = new Set(row.history.map((h) => h.step));
  return (
    <div data-testid="refund-tracking" className="rounded-[14px] border border-[#eef1f5] p-3.5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="ltr text-sm font-extrabold text-ink">{row.originCode} → {row.destCode}</div>
          <div className="mt-1 text-[11px] text-muted">{t.trackingCode} <span className="ltr font-mono">{row.trackingCode}</span> · {t.ticket} <span className="ltr font-mono">{row.pnr}</span></div>
        </div>
        <span className="rounded-full bg-[#eef4fb] px-3 py-1 text-[11px] font-bold text-accent">{STATUS[row.status][locale]}</span>
      </div>
      <div className="flex flex-col">
        {STAGES.map((stage, index) => {
          const event = row.history.find((h) => h.step === stage);
          const done = completed.has(stage);
          return (
            <div key={stage} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className={`flex h-[22px] w-[22px] items-center justify-center rounded-full text-[11px] text-white ${done ? 'bg-[#1f8a5b]' : 'bg-slate-300'}`}>{done ? '✓' : digits(index + 1, locale)}</span>
                {index < STAGES.length - 1 && <span className={`min-h-4 w-0.5 flex-1 ${done ? 'bg-[#1f8a5b]' : 'bg-slate-200'}`} />}
              </div>
              <div className="pb-3">
                <div className={`text-xs font-bold ${done ? 'text-ink' : 'text-muted'}`}>{(t.stages as string[])[index]}</div>
                {event && <div className="mt-0.5 text-[10px] text-muted">{formatDate(event.at, locale)}</div>}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between border-t border-[#f2f4f7] pt-3 text-xs">
        <span className="text-muted">{t.amount}</span>
        <strong className="text-[#1f8a5b]">{localeMoney(row.refundableIrr, locale)} {t.toman}</strong>
      </div>
    </div>
  );
}

function formatDate(value: string, locale: StoredLocale) {
  return formatLocaleDateTime(value, locale);
}
