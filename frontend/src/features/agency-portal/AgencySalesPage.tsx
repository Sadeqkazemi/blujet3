import { useEffect, useMemo, useState } from 'react';
import {
  downloadSalesExport,
  fetchCredit,
  fetchInvoices,
  fetchProfile,
  fetchSales,
} from '../../api/agency-portal';
import { useLocale, type StoredLocale } from '../../hooks/useLocale';
import { AIRPORT_REFERENCE_CATALOG } from '../../lib/airport-reference-catalog';
import { localeMoney } from '../../lib/fa-format';
import { formatLocaleDate, localeDigits } from '../../lib/locale-format';
import type {
  AgencyCredit,
  AgencyInvoice,
  AgencyProfile,
  AgencySalesReport,
  AgencySalesTicket,
} from '../../types/agency-portal';

type ReportTab = 'RTRD' | 'PSR' | 'PRR';
type ReportBundle = {
  report: AgencySalesReport;
  profile: AgencyProfile;
  credit: AgencyCredit;
  invoices: AgencyInvoice[];
};

const PAGE_SIZE = 10;
const IRAN_AIRPORT_CODES = new Set(
  AIRPORT_REFERENCE_CATALOG
    .filter((airport) => airport.countryFa === 'ایران')
    .map((airport) => airport.code),
);

const COPY: Record<StoredLocale, {
  title: string;
  subtitle: string;
  back: string;
  agency: string;
  agencyCode: string;
  registrationDetails: string;
  registrationLocked: string;
  managerName: string;
  phone: string;
  email: string;
  city: string;
  address: string;
  joinedAt: string;
  currency: string;
  period: string;
  reportDate: string;
  creditLimit: string;
  creditUsed: string;
  creditRemaining: string;
  paidAmount: string;
  payableAmount: string;
  salesAmount: string;
  salesCount: string;
  modificationCount: string;
  refundCount: string;
  unsupported: string;
  unsupportedNote: string;
  search: string;
  exportCsv: string;
  exporting: string;
  exportError: string;
  loading: string;
  loadError: string;
  retry: string;
  titleColumn: string;
  amountColumn: string;
  type: string;
  pnr: string;
  ticketNo: string;
  fare: string;
  tax: string;
  crcn: string;
  commissionPct: string;
  commission: string;
  refundable: string;
  routeType: string;
  route: string;
  rbd: string;
  date: string;
  status: string;
  domestic: string;
  international: string;
  unknown: string;
  sale: string;
  refund: string;
  empty: string;
  total: string;
  previous: string;
  next: string;
  page: string;
  of: string;
  toman: string;
}> = {
  fa: {
    title: 'جزئیات گزارش فروش', subtitle: 'تطبیق فروش، پرداخت و استرداد آژانس', back: 'بازگشت به گزارش فروش',
    agency: 'نام آژانس', agencyCode: 'کد آژانس', registrationDetails: 'اطلاعات ثبت‌نام آژانس', registrationLocked: 'این اطلاعات از پروفایل ثبت‌نامی دریافت شده و در گزارش فروش قابل ویرایش نیست.',
    managerName: 'مدیر آژانس', phone: 'شماره تماس', email: 'ایمیل', city: 'شهر', address: 'نشانی', joinedAt: 'تاریخ عضویت',
    currency: 'واحد پول', period: 'دوره', reportDate: 'تاریخ گزارش',
    creditLimit: 'سقف اعتبار', creditUsed: 'اعتبار مصرف‌شده', creditRemaining: 'مانده اعتبار',
    paidAmount: 'مبلغ واریزی', payableAmount: 'مبلغ قابل پرداخت', salesAmount: 'مبلغ فروش',
    salesCount: 'تعداد فروش', modificationCount: 'تعداد اصلاح', refundCount: 'تعداد استرداد',
    unsupported: 'ثبت نشده', unsupportedNote: 'اجزای مالی تفکیک‌نشده مانند مالیات، CRCN و کمیسیون در مدل فعلی با خط تیره نمایش داده می‌شوند و عدد نمونه جایگزین داده واقعی نشده است.',
    search: 'جستجو در گزارش…', exportCsv: 'خروجی CSV', exporting: 'در حال آماده‌سازی…', exportError: 'دریافت خروجی انجام نشد.',
    loading: 'در حال دریافت گزارش…', loadError: 'گزارش فروش دریافت نشد.', retry: 'تلاش مجدد',
    titleColumn: 'عنوان', amountColumn: 'مبلغ', type: 'نوع', pnr: 'PNR', ticketNo: 'شماره بلیط الکترونیکی', fare: 'کرایه',
    tax: 'مالیات', crcn: 'CRCN', commissionPct: 'درصد کمیسیون', commission: 'کمیسیون', refundable: 'قابل استرداد',
    routeType: 'نوع مسیر', route: 'مسیر', rbd: 'RBD', date: 'تاریخ', status: 'وضعیت',
    domestic: 'داخلی', international: 'بین‌المللی', unknown: 'نامشخص', sale: 'فروش', refund: 'استرداد', empty: 'ردیفی برای نمایش وجود ندارد.',
    total: 'جمع', previous: 'قبلی', next: 'بعدی', page: 'صفحه', of: 'از', toman: 'تومان',
  },
  en: {
    title: 'Sales Report Details', subtitle: 'Agency sales, payment, and refund reconciliation', back: 'Back to sales report',
    agency: 'Agency name', agencyCode: 'Agency code', registrationDetails: 'Agency registration details', registrationLocked: 'These values come from the registered agency profile and cannot be edited in the sales report.',
    managerName: 'Agency manager', phone: 'Phone', email: 'Email', city: 'City', address: 'Address', joinedAt: 'Joined',
    currency: 'Currency', period: 'Period', reportDate: 'Report date',
    creditLimit: 'Credit limit', creditUsed: 'Credit used', creditRemaining: 'Credit remaining',
    paidAmount: 'Paid amount', payableAmount: 'Amount payable', salesAmount: 'Sales amount',
    salesCount: 'Sales count', modificationCount: 'Modification count', refundCount: 'Refund count',
    unsupported: 'Not recorded', unsupportedNote: 'Financial components not stored separately, such as tax, CRCN, and commission, are shown as dashes; no sample value replaces real data.',
    search: 'Search report…', exportCsv: 'Export CSV', exporting: 'Preparing…', exportError: 'Export could not be downloaded.',
    loading: 'Loading report…', loadError: 'Sales report could not be loaded.', retry: 'Try again',
    titleColumn: 'Title', amountColumn: 'Amount', type: 'Type', pnr: 'PNR', ticketNo: 'E-ticket number', fare: 'Fare',
    tax: 'Tax', crcn: 'CRCN', commissionPct: 'Commission %', commission: 'Commission', refundable: 'Refundable',
    routeType: 'Route type', route: 'Route', rbd: 'RBD', date: 'Date', status: 'Status',
    domestic: 'Domestic', international: 'International', unknown: 'Unknown', sale: 'Sale', refund: 'Refund', empty: 'No rows to display.',
    total: 'Total', previous: 'Previous', next: 'Next', page: 'Page', of: 'of', toman: 'Toman',
  },
  ar: {
    title: 'تفاصيل تقرير المبيعات', subtitle: 'مطابقة مبيعات الوكالة والمدفوعات والاستردادات', back: 'العودة إلى تقرير المبيعات',
    agency: 'اسم الوكالة', agencyCode: 'رمز الوكالة', registrationDetails: 'بيانات تسجيل الوكالة', registrationLocked: 'تأتي هذه البيانات من ملف الوكالة المسجل ولا يمكن تعديلها في تقرير المبيعات.',
    managerName: 'مدير الوكالة', phone: 'الهاتف', email: 'البريد الإلكتروني', city: 'المدينة', address: 'العنوان', joinedAt: 'تاريخ الانضمام',
    currency: 'العملة', period: 'الفترة', reportDate: 'تاريخ التقرير',
    creditLimit: 'حد الائتمان', creditUsed: 'الائتمان المستخدم', creditRemaining: 'الرصيد المتبقي',
    paidAmount: 'المبلغ المدفوع', payableAmount: 'المبلغ المستحق', salesAmount: 'مبلغ المبيعات',
    salesCount: 'عدد المبيعات', modificationCount: 'عدد التعديلات', refundCount: 'عدد الاستردادات',
    unsupported: 'غير مسجل', unsupportedNote: 'تظهر المكونات المالية غير المفصّلة مثل الضريبة وCRCN والعمولة بشرطة، ولم تستبدل بيانات حقيقية بأرقام نموذجية.',
    search: 'البحث في التقرير…', exportCsv: 'تصدير CSV', exporting: 'جارٍ التحضير…', exportError: 'تعذر تنزيل الملف.',
    loading: 'جارٍ تحميل التقرير…', loadError: 'تعذر تحميل تقرير المبيعات.', retry: 'إعادة المحاولة',
    titleColumn: 'العنوان', amountColumn: 'المبلغ', type: 'النوع', pnr: 'PNR', ticketNo: 'رقم التذكرة الإلكترونية', fare: 'الأجرة',
    tax: 'الضريبة', crcn: 'CRCN', commissionPct: 'نسبة العمولة', commission: 'العمولة', refundable: 'قابل للاسترداد',
    routeType: 'نوع المسار', route: 'المسار', rbd: 'RBD', date: 'التاريخ', status: 'الحالة',
    domestic: 'داخلي', international: 'دولي', unknown: 'غير معروف', sale: 'بيع', refund: 'استرداد', empty: 'لا توجد صفوف للعرض.',
    total: 'المجموع', previous: 'السابق', next: 'التالي', page: 'صفحة', of: 'من', toman: 'تومان',
  },
};

const STATUS: Record<string, Record<StoredLocale, string>> = {
  DRAFT: { fa: 'پیش‌نویس', en: 'Draft', ar: 'مسودة' },
  HELD: { fa: 'رزرو موقت', en: 'Held', ar: 'حجز مؤقت' },
  PAID: { fa: 'پرداخت‌شده', en: 'Paid', ar: 'مدفوع' },
  TICKETED: { fa: 'صادرشده', en: 'Ticketed', ar: 'صادرة' },
  CANCELLED: { fa: 'لغوشده', en: 'Cancelled', ar: 'ملغاة' },
  EXPIRED: { fa: 'منقضی', en: 'Expired', ar: 'منتهية' },
  REFUNDED: { fa: 'مستردشده', en: 'Refunded', ar: 'مستردة' },
};

function sumIrr(values: string[]): string {
  return values.reduce((sum, value) => sum + BigInt(value || '0'), 0n).toString();
}

function routeCodes(route: string): [string, string] | null {
  const codes = route.toUpperCase().match(/[A-Z]{3}/g);
  return codes && codes.length >= 2 ? [codes[0]!, codes[1]!] : null;
}

function Pagination({ page, total, locale, onChange }: { page: number; total: number; locale: StoredLocale; onChange: (page: number) => void }) {
  const t = COPY[locale];
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e6ebf1] px-4 py-3 text-[11px] text-[#66788d]">
      <span>{t.page} {localeDigits(page, locale)} {t.of} {localeDigits(pages, locale)} · {localeDigits(total, locale)} {t.total}</span>
      <div className="flex gap-2">
        <button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)} className="rounded-lg border border-[#dbe3ed] px-3 py-1.5 font-bold disabled:opacity-40">{t.previous}</button>
        <button type="button" disabled={page >= pages} onClick={() => onChange(page + 1)} className="rounded-lg border border-[#dbe3ed] px-3 py-1.5 font-bold disabled:opacity-40">{t.next}</button>
      </div>
    </div>
  );
}
export default function AgencySalesPage() {
  const { locale } = useLocale();
  const t = COPY[locale];
  const [bundle, setBundle] = useState<ReportBundle | null>(null);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  const [tab, setTab] = useState<ReportTab>('RTRD');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState(false);

  useEffect(() => {
    let active = true;
    setError(false);
    setBundle(null);
    Promise.all([fetchSales(), fetchProfile(), fetchCredit(), fetchInvoices()])
      .then(([report, profile, credit, invoices]) => {
        if (active) setBundle({ report, profile, credit, invoices });
      })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [reload]);

  useEffect(() => setPage(1), [query, tab]);

  const derived = useMemo(() => {
    if (!bundle) return null;
    const { report, invoices } = bundle;
    const dates = report.tickets.map((ticket) => ticket.departureAt).sort();
    const refunded = report.tickets.filter((ticket) => ticket.status === 'REFUNDED');
    const paidInvoices = invoices.filter((invoice) => invoice.status === 'PAID');
    const payableInvoices = invoices.filter((invoice) => invoice.status !== 'PAID');
    return {
      period: dates.length === 0 ? '—' : `${formatLocaleDate(dates[0]!, locale)} — ${formatLocaleDate(dates.at(-1)!, locale)}`,
      refunded,
      refundAmountIrr: sumIrr(refunded.map((ticket) => ticket.priceIrr)),
      paidAmountIrr: sumIrr(paidInvoices.map((invoice) => invoice.amountIrr)),
      payableAmountIrr: sumIrr(payableInvoices.map((invoice) => invoice.amountIrr)),
    };
  }, [bundle, locale]);

  async function onExport() {
    setExportBusy(true);
    setExportError(false);
    try {
      const blob = await downloadSalesExport();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'blujet-agency-sales.csv';
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setExportError(true);
    } finally {
      setExportBusy(false);
    }
  }

  if (error) return (
    <div className="grid min-h-[320px] place-items-center rounded-2xl border border-red-200 bg-white text-sm text-red-700">
      <div className="text-center"><p>{t.loadError}</p><button type="button" className="mt-3 rounded-lg bg-[#326bc3] px-4 py-2 font-bold text-white" onClick={() => setReload((value) => value + 1)}>{t.retry}</button></div>
    </div>
  );
  if (!bundle || !derived) return <div className="grid min-h-[320px] place-items-center text-sm text-[#718198]">{t.loading}</div>;

  const { report, profile, credit } = bundle;
  const money = (value: string) => `${localeMoney(value, locale)} ${t.toman}`;
  const summaryFields = [
    [t.currency, 'IRR'], [t.period, derived.period], [t.reportDate, formatLocaleDate(new Date(), locale)], [t.salesAmount, money(report.summary.totalSalesIrr)],
    [t.creditLimit, money(credit.limitIrr)], [t.creditUsed, money(credit.usedIrr)], [t.creditRemaining, money(credit.remainingIrr)],
    [t.paidAmount, money(derived.paidAmountIrr)], [t.payableAmount, money(derived.payableAmountIrr)],
  ];
  const registrationFields: Array<{ label: string; value: string; ltr?: boolean }> = [
    { label: t.agency, value: profile.fullName },
    { label: t.managerName, value: profile.managerName || '—' },
    { label: t.agencyCode, value: profile.licenseNo || '—', ltr: true },
    { label: t.phone, value: profile.phone || '—', ltr: true },
    { label: t.email, value: profile.email || '—', ltr: true },
    { label: t.city, value: profile.city || '—' },
    { label: t.address, value: profile.address || '—' },
    { label: t.joinedAt, value: formatLocaleDate(profile.joinedAt, locale) },
  ];
  const stats = [
    [t.salesCount, localeDigits(report.summary.ticketsIssued, locale)],
    [t.modificationCount, t.unsupported],
    [t.refundCount, localeDigits(derived.refunded.length, locale)],
  ];
  const reconciliation: { title: string; amount: string | null }[] = [
    { title: 'CrcnCommissionAmount', amount: null },
    { title: 'EmdCommissionAmount', amount: null },
    { title: 'EmdSalesAmount', amount: null },
    { title: 'ModificationChargeAmount', amount: null },
    { title: 'ModificationCommissionAmount', amount: null },
    { title: 'ModificationGrossFareAmount', amount: null },
    { title: 'ModificationTaxAmount', amount: null },
    { title: 'RefundCommissionAmount', amount: null },
    { title: 'RefundCrcnAmount', amount: null },
    { title: 'RefundGrossFareAmount', amount: derived.refundAmountIrr },
    { title: 'RefundTaxAmount', amount: null },
    { title: 'SalesCommissionAmount', amount: null },
    { title: 'SalesGrossFareAmount', amount: report.summary.totalSalesIrr },
    { title: 'SalesTaxAmount', amount: null },
    { title: 'PaidInvoiceAmount', amount: derived.paidAmountIrr },
    { title: 'OutstandingInvoiceAmount', amount: derived.payableAmountIrr },
    { title: 'CreditUsedAmount', amount: credit.usedIrr },
    { title: 'CreditRemainingAmount', amount: credit.remainingIrr },
  ];

  const sourceTickets = tab === 'PRR' ? derived.refunded : report.tickets;
  const normalizedQuery = query.trim().toLowerCase();
  const filteredTickets = sourceTickets.filter((ticket) => !normalizedQuery || [
    ticket.pnr, ticket.flightNo, ticket.route, ticket.fareClassCode ?? '', ticket.cabin ?? '', ticket.status,
  ].some((value) => value.toLowerCase().includes(normalizedQuery)));
  const pageRows = filteredTickets.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const reconciliationPage = reconciliation.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const visibleAmount = tab === 'RTRD'
    ? sumIrr(reconciliationPage.flatMap((row) => row.amount == null ? [] : [row.amount]))
    : sumIrr(pageRows.map((ticket) => ticket.priceIrr));

  function routeType(ticket: AgencySalesTicket): string {
    const codes = routeCodes(ticket.route);
    if (!codes) return t.unknown;
    return IRAN_AIRPORT_CODES.has(codes[0]) && IRAN_AIRPORT_CODES.has(codes[1]) ? t.domestic : t.international;
  }

  return (
    <section className="overflow-hidden rounded-[22px] border border-[#dde5ef] bg-white shadow-[0_12px_34px_rgba(13,38,64,0.06)]" dir={locale === 'en' ? 'ltr' : 'rtl'}>
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#e6ebf2] px-5 py-5 sm:px-7">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#e7f5ef] text-xl text-[#23895f]">▣</span>
          <div><h1 className="m-0 text-lg font-black text-[#0d2640]">{t.title}</h1><p className="mb-0 mt-1 text-[11px] text-[#7d8ca0]">{t.subtitle}</p></div>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-[10px] text-[#8796aa] sm:inline">{t.back}</span>
          <button type="button" data-testid="sales-export" disabled={exportBusy} onClick={() => void onExport()} className="rounded-xl bg-[#326bc3] px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">{exportBusy ? t.exporting : t.exportCsv}</button>
        </div>
      </header>
      {exportError && <p role="alert" className="mx-5 mt-4 rounded-xl bg-red-50 px-4 py-3 text-xs text-red-700">{t.exportError}</p>}

      <div className="p-4 sm:p-6">
        <section data-testid="agency-sales-registration-profile" aria-labelledby="agency-sales-registration-title" className="mb-4 overflow-hidden rounded-2xl border border-[#dce6f1] bg-[#f7faff]">
          <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[#e2e9f2] px-4 py-3 sm:px-5">
            <div>
              <h2 id="agency-sales-registration-title" className="m-0 text-sm font-black text-[#163552]">{t.registrationDetails}</h2>
              <p className="mb-0 mt-1 text-[10px] leading-5 text-[#70839a]">{t.registrationLocked}</p>
            </div>
            <span className="rounded-full bg-[#e7f1ff] px-3 py-1 text-[10px] font-black text-[#2f68bd]" aria-hidden>🔒</span>
          </header>
          <dl className="grid grid-cols-1 gap-px bg-[#e6edf5] sm:grid-cols-2 lg:grid-cols-4">
            {registrationFields.map((field) => (
              <div key={field.label} className="min-w-0 bg-white px-4 py-3">
                <dt className="text-[10px] font-bold text-[#7a899d]">{field.label}</dt>
                <dd className="mb-0 mt-1 break-words text-xs font-extrabold text-[#19334e]" dir={field.ltr ? 'ltr' : undefined}>{field.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <div className="grid grid-cols-1 gap-2 rounded-2xl border border-[#e2e8f0] bg-[#f8fafc] p-3 sm:grid-cols-2 lg:grid-cols-3">
          {summaryFields.map(([label, value]) => (
            <div key={label} className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-[#e5eaf1] bg-white px-4 py-3">
              <span className="text-[10px] font-bold text-[#7a899d]">{label}</span><strong className="text-xs text-[#19334e]">{value}</strong>
            </div>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {stats.map(([label, value], index) => (
            <div key={label} className="rounded-xl border border-[#dfe7f0] bg-white px-4 py-3 text-center">
              <span className="text-[10px] text-[#78889b]">{label}</span>
              <div className={`mt-1 text-lg font-black ${index === 0 ? 'text-[#23895f]' : index === 2 ? 'text-[#d36d42]' : 'text-[#78889b]'}`}>{value}</div>
            </div>
          ))}
        </div>

        <div className="mt-5 flex border-b border-[#dfe5ed]" role="tablist" aria-label={t.title}>
          {(['RTRD', 'PSR', 'PRR'] as const).map((entry) => (
            <button key={entry} type="button" role="tab" aria-selected={tab === entry} onClick={() => setTab(entry)} className={`min-w-24 border-b-2 px-5 py-3 text-sm font-black ${tab === entry ? 'border-[#2c7b69] text-[#173f38]' : 'border-transparent text-[#6f7e91]'}`}>{entry}</button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          {tab !== 'RTRD' ? (
            <label className="relative w-full max-w-sm"><span className="sr-only">{t.search}</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.search} className="h-11 w-full rounded-xl border border-[#dce4ed] bg-[#fbfcfe] px-4 text-xs outline-none focus:border-[#326bc3]" /></label>
          ) : <span className="text-[11px] text-[#7b8b9e]">RTRD Reconciliation</span>}
          <span className="rounded-lg bg-[#fff8e9] px-3 py-2 text-[10px] leading-5 text-[#8b681e]">{t.unsupportedNote}</span>
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-[#dfe6ee]">
          <div className="overflow-x-auto">
            {tab === 'RTRD' ? (
              <table className="w-full min-w-[620px] text-xs">
                <thead className="bg-[#f1f5f8] text-[#53677e]"><tr><th className="px-4 py-3 text-start">{t.titleColumn}</th><th className="px-4 py-3 text-start">{t.amountColumn}</th></tr></thead>
                <tbody>{reconciliationPage.map((row) => <tr key={row.title} className="border-t border-[#e7ecf2] odd:bg-white even:bg-[#fafbfd]"><td className="px-4 py-3 font-medium text-[#30465d]" dir="ltr">{row.title}</td><td className="px-4 py-3 font-black text-[#1d405c]">{row.amount == null ? '—' : money(row.amount)}</td></tr>)}</tbody>
                <tfoot><tr className="bg-[#d7f1e9] font-black text-[#185b4c]"><td className="px-4 py-3">{t.total}</td><td className="px-4 py-3">{money(visibleAmount)}</td></tr></tfoot>
              </table>
            ) : (
              <table className="w-full min-w-[1280px] text-[11px]">
                <thead className="bg-[#f1f5f8] text-[#53677e]"><tr>{[t.type, t.pnr, t.ticketNo, t.fare, t.tax, t.crcn, t.commissionPct, t.commission, t.refundable, t.routeType, t.route, t.rbd, t.date, t.status].map((heading) => <th key={heading} className="whitespace-nowrap px-3 py-3 text-start">{heading}</th>)}</tr></thead>
                <tbody>
                  {pageRows.map((ticket) => (
                    <tr key={ticket.passengerId ?? ticket.ticketNo ?? ticket.pnr} className="border-t border-[#e7ecf2] odd:bg-white even:bg-[#fafbfd]">
                      <td className="px-3 py-3 font-bold">{ticket.status === 'REFUNDED' ? t.refund : t.sale}</td><td className="px-3 py-3" dir="ltr">{ticket.pnr}</td><td className="px-3 py-3" dir="ltr">{ticket.ticketNo ?? '—'}</td>
                      <td className="px-3 py-3 font-bold">{money(ticket.priceIrr)}</td><td className="px-3 py-3">—</td><td className="px-3 py-3">—</td><td className="px-3 py-3">—</td><td className="px-3 py-3">—</td>
                      <td className="px-3 py-3">{ticket.status === 'REFUNDED' ? money(ticket.priceIrr) : '—'}</td><td className="px-3 py-3">{routeType(ticket)}</td><td className="px-3 py-3" dir="ltr">{ticket.route}</td>
                      <td className="px-3 py-3" dir="ltr">{ticket.fareClassCode || '—'}</td><td className="px-3 py-3">{formatLocaleDate(ticket.departureAt, locale)}</td><td className="px-3 py-3">{STATUS[ticket.status]?.[locale] ?? ticket.status}</td>
                    </tr>
                  ))}
                  {pageRows.length === 0 && <tr><td colSpan={14} className="px-4 py-12 text-center text-[#7b8b9d]">{t.empty}</td></tr>}
                </tbody>
                <tfoot><tr className="bg-[#d7f1e9] font-black text-[#185b4c]"><td className="px-3 py-3">{t.total}</td><td className="px-3 py-3" colSpan={2}>{localeDigits(filteredTickets.length, locale)}</td><td className="px-3 py-3">{money(visibleAmount)}</td><td colSpan={10} /></tr></tfoot>
              </table>
            )}
          </div>
          <Pagination page={page} total={tab === 'RTRD' ? reconciliation.length : filteredTickets.length} locale={locale} onChange={setPage} />
        </div>
      </div>
    </section>
  );
}
