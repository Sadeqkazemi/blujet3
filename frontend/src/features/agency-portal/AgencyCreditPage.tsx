import { useEffect, useState } from 'react';
import {
  fetchCredit,
  fetchInvoices,
  fetchFinancialEvents,
  fetchMyCreditRequests,
  payInvoice,
  requestCreditIncrease,
} from '../../api/agency-portal';
import { localeMoney, parseTomanToRial } from '../../lib/fa-format';
import { formatLocaleDate, formatLocaleDateTime, localeDigits } from '../../lib/locale-format';
import { ApiRequestError } from '../../api/envelope';
import Modal from '../../components/Modal';
import { useLocale, type StoredLocale } from '../../hooks/useLocale';
import type {
  AgencyCredit,
  AgencyCreditRequest,
  AgencyInvoice,
  AgencyFinancialEvent,
} from '../../types/agency-portal';

// اعتبار و مانده — EN strings mostly extracted from design-reference-v2/
// پنل آژانس.dc.html's own isEN vocabulary for this exact tab
// (creditBalanceTitle, creditLimitLabel, payFromCreditLabel, etc.); AR
// there is partial, filled in by hand to the same quality bar. This page
// deliberately keeps its OWN local invoice/credit-request status maps
// (not the shared `agency-labels.ts` used by the staff-side
// AgencyDetailPage) — that module stays Persian-only since staff panels
// are not locale-switchable per CLAUDE.md, and this agency-facing page's
// own fa wording ("تسویه شد" for paid) already differs slightly from the
// staff copy ("تسویه شد" vs the shared map's identical label, kept as-is
// here to avoid touching a module another still-fa-only surface depends on).
interface Tr {
  fa: string;
  en: string;
  ar: string;
}

const EVENT_LABEL: Record<AgencyFinancialEvent['type'], Tr> = {
  SALE: { fa: 'فروش بلیط', en: 'Ticket Sale', ar: 'بيع تذكرة' },
  REFUND: { fa: 'استرداد', en: 'Refund', ar: 'استرداد' },
  SETTLEMENT: { fa: 'تسویه', en: 'Settlement', ar: 'تسوية' },
  COMMISSION: { fa: 'کمیسیون', en: 'Commission', ar: 'عمولة' },
  COMMITMENT: { fa: 'تعهد صندلی', en: 'Seat commitment', ar: 'التزام المقاعد' },
  INVOICE_ISSUED: { fa: 'صدور فاکتور', en: 'Invoice issued', ar: 'إصدار فاتورة' },
  INVOICE_PAID: { fa: 'پرداخت فاکتور', en: 'Invoice paid', ar: 'دفع الفاتورة' },
  CREDIT_REQUESTED: { fa: 'درخواست افزایش اعتبار', en: 'Credit increase requested', ar: 'طلب زيادة الائتمان' },
  CREDIT_APPROVED: { fa: 'تأیید افزایش اعتبار', en: 'Credit increase approved', ar: 'الموافقة على زيادة الائتمان' },
  CREDIT_REJECTED: { fa: 'رد افزایش اعتبار', en: 'Credit increase rejected', ar: 'رفض زيادة الائتمان' },
};

const INVOICE_STATUS_LOCAL: Record<AgencyInvoice['status'], { label: Tr; className: string }> = {
  PAID: { label: { fa: 'تسویه شد', en: 'Settled', ar: 'تمت التسوية' }, className: 'bg-[#10b98124] text-[#059669]' },
  UNPAID: { label: { fa: 'در انتظار پرداخت', en: 'Awaiting Payment', ar: 'بانتظار الدفع' }, className: 'bg-[#f59e0b24] text-[#b45309]' },
  OVERDUE: { label: { fa: 'معوق', en: 'Overdue', ar: 'متأخر' }, className: 'bg-danger/15 text-danger' },
};

const CREDIT_REQUEST_STATUS: Record<AgencyCreditRequest['status'], { label: Tr; className: string }> = {
  PENDING: { label: { fa: 'در انتظار بررسی', en: 'Under Review', ar: 'قيد المراجعة' }, className: 'bg-[#f59e0b24] text-[#b45309]' },
  APPROVED: { label: { fa: 'تأیید شد', en: 'Approved', ar: 'تمت الموافقة' }, className: 'bg-[#10b98124] text-[#059669]' },
  REJECTED: { label: { fa: 'رد شد', en: 'Rejected', ar: 'مرفوض' }, className: 'bg-danger/15 text-danger' },
};

const STR: Record<StoredLocale, {
  heading: string;
  subtitle: string;
  addCreditBtn: string;
  loading: string;
  errorFallback: string;
  payErrorFallback: string;
  toman: string;
  creditLimitLabel: string;
  creditUsedLabel: string;
  creditRemainingLabel: string;
  invoicesHeading: string;
  invoicesEmpty: string;
  colInvoiceNo: string;
  colDueDate: string;
  colAmount: string;
  colStatus: string;
  payBtn: string;
  payingBtn: string;
  creditRequestsHeading: string;
  ledgerHeading: string;
  ledgerEmpty: string;
  modalTitle: string;
  modalDesc: string;
  requestedLimitLabel: string;
  noteLabel: string;
  requestedLimitRequired: string;
  requestSubmitFallback: string;
  submitBtn: string;
  submittingBtn: string;
}> = {
  fa: {
    heading: 'اعتبار و مانده',
    subtitle: 'وضعیت اعتبار، فاکتورها و گردش حساب آژانس شما',
    addCreditBtn: 'افزایش اعتبار',
    loading: 'در حال بارگذاری…',
    errorFallback: 'خطا در دریافت اطلاعات اعتبار.',
    payErrorFallback: 'خطا در پرداخت فاکتور.',
    toman: 'تومان',
    creditLimitLabel: 'سقف اعتبار',
    creditUsedLabel: 'مصرف‌شده',
    creditRemainingLabel: 'باقیمانده',
    invoicesHeading: 'فاکتورها',
    invoicesEmpty: 'فاکتوری صادر نشده است.',
    colInvoiceNo: 'شماره فاکتور',
    colDueDate: 'سررسید',
    colAmount: 'مبلغ',
    colStatus: 'وضعیت',
    payBtn: 'پرداخت از اعتبار',
    payingBtn: 'در حال پرداخت…',
    creditRequestsHeading: 'درخواست‌های افزایش اعتبار',
    ledgerHeading: 'گردش حساب اخیر',
    ledgerEmpty: 'تراکنشی ثبت نشده است.',
    modalTitle: 'درخواست افزایش اعتبار',
    modalDesc: 'درخواست شما برای بررسی به واحد بازرگانی/مالی ارسال می‌شود و تنها پس از تأیید، سقف اعتبار تغییر می‌کند.',
    requestedLimitLabel: 'سقف درخواستی (تومان)',
    noteLabel: 'یادداشت (اختیاری)',
    requestedLimitRequired: 'سقف درخواستی را وارد کنید.',
    requestSubmitFallback: 'خطا در ثبت درخواست.',
    submitBtn: 'ارسال درخواست',
    submittingBtn: 'در حال ارسال…',
  },
  en: {
    heading: 'Credit & Balance',
    subtitle: "Your agency's credit status, invoices, and account activity",
    addCreditBtn: 'Add Credit',
    loading: 'Loading…',
    errorFallback: 'Error loading credit information.',
    payErrorFallback: 'Error paying the invoice.',
    toman: 'Toman',
    creditLimitLabel: 'Credit Limit',
    creditUsedLabel: 'Used',
    creditRemainingLabel: 'Remaining',
    invoicesHeading: 'Invoices',
    invoicesEmpty: 'No invoices issued yet.',
    colInvoiceNo: 'Invoice Number',
    colDueDate: 'Due Date',
    colAmount: 'Amount',
    colStatus: 'Status',
    payBtn: 'Pay from Credit',
    payingBtn: 'Paying…',
    creditRequestsHeading: 'Credit Increase Requests',
    ledgerHeading: 'Recent Account Activity',
    ledgerEmpty: 'No transactions recorded yet.',
    modalTitle: 'Credit Increase Request',
    modalDesc: 'Your request is sent to the commercial/finance team for review; the credit limit only changes once approved.',
    requestedLimitLabel: 'Requested Limit (Toman)',
    noteLabel: 'Note (optional)',
    requestedLimitRequired: 'Enter the requested limit.',
    requestSubmitFallback: 'Error submitting the request.',
    submitBtn: 'Submit Request',
    submittingBtn: 'Sending…',
  },
  ar: {
    heading: 'الرصيد والائتمان',
    subtitle: 'حالة رصيد وكالتك وفواتيرها ونشاط حسابها',
    addCreditBtn: 'إضافة رصيد',
    loading: 'جارٍ التحميل…',
    errorFallback: 'خطأ في تحميل معلومات الرصيد.',
    payErrorFallback: 'خطأ في دفع الفاتورة.',
    toman: 'تومان',
    creditLimitLabel: 'سقف الائتمان',
    creditUsedLabel: 'المستخدم',
    creditRemainingLabel: 'المتبقي',
    invoicesHeading: 'الفواتير',
    invoicesEmpty: 'لم تصدر أي فاتورة بعد.',
    colInvoiceNo: 'رقم الفاتورة',
    colDueDate: 'تاريخ الاستحقاق',
    colAmount: 'المبلغ',
    colStatus: 'الحالة',
    payBtn: 'الدفع من الرصيد',
    payingBtn: 'جارٍ الدفع…',
    creditRequestsHeading: 'طلبات زيادة الرصيد',
    ledgerHeading: 'نشاط الحساب الأخير',
    ledgerEmpty: 'لا توجد معاملات مسجّلة بعد.',
    modalTitle: 'طلب زيادة الرصيد',
    modalDesc: 'يُرسل طلبك إلى فريق المبيعات/المالية للمراجعة؛ لا يتغيّر سقف الرصيد إلا بعد الموافقة عليه.',
    requestedLimitLabel: 'الحد المطلوب (تومان)',
    noteLabel: 'ملاحظة (اختياري)',
    requestedLimitRequired: 'أدخل الحد المطلوب.',
    requestSubmitFallback: 'خطأ في إرسال الطلب.',
    submitBtn: 'إرسال الطلب',
    submittingBtn: 'جارٍ الإرسال…',
  },
};

export default function AgencyCreditPage() {
  const { locale } = useLocale();
  const t = STR[locale];
  const [credit, setCredit] = useState<AgencyCredit | null>(null);
  const [invoices, setInvoices] = useState<AgencyInvoice[]>([]);
  const [financialEvents, setFinancialEvents] = useState<AgencyFinancialEvent[]>([]);
  const [creditRequests, setCreditRequests] = useState<AgencyCreditRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestedLimit, setRequestedLimit] = useState('');
  const [requestNote, setRequestNote] = useState('');
  const [requestError, setRequestError] = useState<string | null>(null);
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [activeTab, setActiveTab] = useState<'unpaid' | 'paid' | 'ledger'>('unpaid');
  const [invoiceQuery, setInvoiceQuery] = useState('');

  function reload() {
    Promise.all([fetchCredit(), fetchInvoices(), fetchFinancialEvents(), fetchMyCreditRequests()])
      .then(([c, i, l, r]) => {
        setCredit(c);
        setInvoices(i);
        setFinancialEvents(l);
        setCreditRequests(r);
      })
      .catch(() => setError(t.errorFallback));
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(reload, []);

  async function onPay(invoiceId: string) {
    setPayingId(invoiceId);
    try {
      await payInvoice(invoiceId);
      reload();
    } catch {
      setError(t.payErrorFallback);
    } finally {
      setPayingId(null);
    }
  }

  async function onSubmitRequest() {
    const limitIrr = parseTomanToRial(requestedLimit);
    if (!limitIrr || limitIrr <= 0) {
      setRequestError(t.requestedLimitRequired);
      return;
    }
    setRequestError(null);
    setSubmittingRequest(true);
    try {
      await requestCreditIncrease(limitIrr, requestNote.trim() || undefined);
      setRequestOpen(false);
      setRequestedLimit('');
      setRequestNote('');
      reload();
    } catch (err) {
      setRequestError(err instanceof ApiRequestError ? err.message : t.requestSubmitFallback);
    } finally {
      setSubmittingRequest(false);
    }
  }

  if (error) return <p className="p-8 text-sm text-danger">{error}</p>;
  if (!credit) return <p className="p-8 text-sm text-muted">{t.loading}</p>;

  const pageCopy = {
    fa: { heading: 'اعتبار و مانده حساب', issued: 'فاکتورهای صادرشده توسط ایرلاین', unpaid: 'پرداخت‌نشده', paid: 'پرداخت‌شده', ledger: 'گردش مالی کامل', search: 'جستجو بر اساس شماره یا عنوان فاکتور…', calendar: 'تقویم', pendingCount: 'فاکتور در انتظار پرداخت' },
    en: { heading: 'Credit and account balance', issued: 'Invoices issued by the airline', unpaid: 'Unpaid', paid: 'Paid', ledger: 'Complete financial activity', search: 'Search invoice number or title…', calendar: 'Calendar', pendingCount: 'invoice awaiting payment' },
    ar: { heading: 'الرصيد وكشف الحساب', issued: 'الفواتير الصادرة عن شركة الطيران', unpaid: 'غير مدفوع', paid: 'مدفوع', ledger: 'النشاط المالي الكامل', search: 'ابحث برقم الفاتورة أو عنوانها…', calendar: 'التقويم', pendingCount: 'فاتورة بانتظار الدفع' },
  }[locale];
  const visibleInvoices = invoices.filter((invoice) => {
    const statusMatch = activeTab === 'unpaid' ? invoice.status !== 'PAID' : activeTab === 'paid' ? invoice.status === 'PAID' : false;
    if (!statusMatch) return false;
    const query = invoiceQuery.trim().toLowerCase();
    return !query || invoice.invoiceNo.toLowerCase().includes(query) || invoice.descriptionFa?.toLowerCase().includes(query);
  });
  const unpaidCount = invoices.filter((invoice) => invoice.status !== 'PAID').length;

  return (
    <div data-testid="agency-credit-page">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-black text-[#0d2640]">{pageCopy.heading}</h1>
        <button
          onClick={() => setRequestOpen(true)}
          className="flex h-11 items-center gap-2 rounded-xl bg-accent px-5 text-xs font-black text-white transition hover:brightness-110"
        >
          <span aria-hidden>＋</span> {t.addCreditBtn}
        </button>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-[#edf0f5] bg-white p-5">
          <div className="text-[11px] text-muted">{t.creditLimitLabel}</div>
          <div className="mt-2 text-xl font-black text-[#0d2640]">{localeMoney(credit.limitIrr, locale)} {t.toman}</div>
        </div>
        <div className="rounded-2xl border border-[#edf0f5] bg-white p-5">
          <div className="text-[11px] text-muted">{t.creditUsedLabel}</div>
          <div className="mt-2 text-xl font-black text-[#e2583e]">{localeMoney(credit.usedIrr, locale)} {t.toman}</div>
        </div>
        <div className="rounded-2xl border border-[#edf0f5] bg-white p-5">
          <div className="text-[11px] text-muted">{t.creditRemainingLabel}</div>
          <div className="mt-2 text-xl font-black text-[#23895f]">{localeMoney(credit.remainingIrr, locale)} {t.toman}</div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#edf0f5] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf0f5] px-4 py-3.5">
          <h2 className="text-sm font-black text-[#0d2640]">{pageCopy.issued}</h2>
          {unpaidCount > 0 && <span className="rounded-full bg-[#fff4e8] px-3 py-1 text-[10px] font-bold text-[#d27a22]">{localeDigits(unpaidCount, locale)} {pageCopy.pendingCount}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-[#edf0f5] bg-[#fafbfd] px-4 py-2.5">
          {([
            ['unpaid', pageCopy.unpaid],
            ['paid', pageCopy.paid],
            ['ledger', pageCopy.ledger],
          ] as const).map(([key, label]) => (
            <button key={key} type="button" onClick={() => setActiveTab(key)} className={`rounded-lg px-4 py-2 text-xs font-bold ${activeTab === key ? 'bg-[#1668c4] text-white' : 'text-[#687587]'}`}>{label}</button>
          ))}
        </div>
        {activeTab !== 'ledger' && (
          <div className="flex gap-2 border-b border-[#edf0f5] p-3">
            <input value={invoiceQuery} onChange={(event) => setInvoiceQuery(event.target.value)} placeholder={pageCopy.search} className="h-11 min-w-0 flex-1 rounded-xl border border-[#e4e9f0] bg-[#fafbfd] px-4 text-xs outline-none focus:border-[#1668c4]" />
            <button type="button" className="h-11 rounded-xl border border-[#e4e9f0] bg-white px-4 text-xs font-bold text-[#536274]">▣ {pageCopy.calendar}</button>
          </div>
        )}
        {activeTab === 'ledger' ? (
          financialEvents.length === 0 ? <p className="py-10 text-center text-xs text-muted">{t.ledgerEmpty}</p> : (
            <div>
              {financialEvents.map((entry) => {
                const creditEntry = entry.direction === 'CREDIT';
                const informational = entry.direction === 'INFO';
                return (
                  <div key={entry.id} className="flex items-center justify-between gap-4 border-b border-[#edf0f5] px-4 py-4 last:border-0">
                    <div><div className="text-xs font-bold text-[#1a2d42]">{EVENT_LABEL[entry.type][locale]}</div><div className="mt-1 text-[10px] text-muted">{formatLocaleDateTime(entry.occurredAt, locale)}{entry.reference ? ` · ${entry.reference}` : ''}</div></div>
                    {entry.amountIrr != null && <span className={`text-xs font-black ${informational ? 'text-[#1668c4]' : creditEntry ? 'text-[#23895f]' : 'text-[#e2583e]'}`}>{informational ? '' : creditEntry ? '+' : '−'}{localeMoney(entry.amountIrr, locale)} {t.toman}</span>}
                  </div>
                );
              })}
            </div>
          )
        ) : visibleInvoices.length === 0 ? (
          <p className="py-10 text-center text-xs text-muted">{t.invoicesEmpty}</p>
        ) : (
          <div>
            {visibleInvoices.map((inv) => {
              const st = INVOICE_STATUS_LOCAL[inv.status];
              return (
                <div key={inv.id} className="flex flex-wrap items-center justify-between gap-4 border-b border-[#edf0f5] px-4 py-4 last:border-0">
                  <div className="flex min-w-[260px] flex-1 items-center gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#eef5fc] text-[#1668c4]">▤</span>
                    <div>
                      <div className="text-xs font-black text-[#1a2d42]">{inv.descriptionFa?.trim() || t.invoicesHeading}</div>
                      <div className="ltr mt-1 text-[10px] font-bold text-muted">{inv.invoiceNo}</div>
                      <div className="mt-1 text-[10px] text-muted">{t.colDueDate}: {formatLocaleDate(inv.dueAt, locale)}</div>
                    </div>
                  </div>
                  <div className="text-sm font-black text-[#0d2640]">{localeMoney(inv.amountIrr, locale)} {t.toman}<div className={`mt-1 text-[10px] ${st.className.split(' ').at(-1)}`}>{st.label[locale]}</div></div>
                  {inv.status !== 'PAID' ? (
                    <button disabled={payingId === inv.id} onClick={() => void onPay(inv.id)} className="h-11 rounded-xl bg-[#1668c4] px-5 text-xs font-black text-white disabled:opacity-60">{payingId === inv.id ? t.payingBtn : t.payBtn}</button>
                  ) : <span className="rounded-xl bg-[#e9f7f0] px-4 py-3 text-xs font-bold text-[#23895f]">✓ {st.label[locale]}</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {creditRequests.length > 0 && <div className="mt-4 rounded-2xl border border-[#edf0f5] bg-white p-4"><div className="mb-3 text-sm font-black text-[#0d2640]">{t.creditRequestsHeading}</div><div className="space-y-2">{creditRequests.map((request) => { const st = CREDIT_REQUEST_STATUS[request.status]; return <div key={request.id} className="flex items-center justify-between rounded-xl bg-[#fafbfd] px-4 py-3 text-xs"><span className="font-black">{localeMoney(request.requestedLimitIrr, locale)} {t.toman}</span><span className={`rounded-full px-3 py-1 text-[10px] font-bold ${st.className}`}>{st.label[locale]}</span></div>; })}</div></div>}

      {requestOpen && (
        <Modal title={t.modalTitle} onClose={() => setRequestOpen(false)}>
          <div className="flex flex-col gap-4">
            <p className="text-xs text-muted">{t.modalDesc}</p>
            <div>
              <label htmlFor="requestedLimit" className="mb-1.5 block text-[11.5px] text-muted">
                {t.requestedLimitLabel}
              </label>
              <input
                id="requestedLimit"
                className="ltr w-full rounded-lg border border-border bg-white px-3.5 py-2.5 text-sm font-bold outline-none focus:border-accent"
                value={requestedLimit}
                onChange={(e) => setRequestedLimit(e.target.value)}
                inputMode="numeric"
              />
            </div>
            <div>
              <label htmlFor="requestNote" className="mb-1.5 block text-[11.5px] text-muted">
                {t.noteLabel}
              </label>
              <textarea
                id="requestNote"
                className="w-full rounded-lg border border-border bg-white px-3.5 py-2.5 text-sm outline-none focus:border-accent"
                value={requestNote}
                onChange={(e) => setRequestNote(e.target.value)}
                rows={2}
              />
            </div>
            {requestError && (
              <p role="alert" className="text-xs text-danger">
                {requestError}
              </p>
            )}
            <button
              disabled={submittingRequest}
              onClick={() => void onSubmitRequest()}
              className="rounded-lg bg-accent py-2.5 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-60"
            >
              {submittingRequest ? t.submittingBtn : t.submitBtn}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
