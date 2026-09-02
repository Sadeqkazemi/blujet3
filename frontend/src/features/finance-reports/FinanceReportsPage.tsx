import { useEffect, useMemo, useState } from 'react';
import {
  downloadFinanceReport,
  downloadFinanceSales,
  fetchFinanceSales,
  fetchFinanceFlightDetail,
  fetchFinanceReport,
  searchFinanceFlights,
  type FinanceReportFilters,
  type FinanceSalesFilters,
} from '../../api/finance-manager';
import type {
  FinanceFlightDetail,
  FinanceFlightRow,
  FinanceReportPeriod,
  FinanceReportResult,
  FinanceReportScope,
  FinanceSalesResult,
} from '../../types/finance-manager';
import { dayjs, formatJalaliDate } from '../../lib/jalali';
import { faDigits, faMoney, faMoneyCompact } from '../../lib/fa-format';

const MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
const PERIODS: { key: FinanceReportPeriod; label: string }[] = [
  { key: 'flight', label: 'پرواز' },
  { key: 'day', label: 'روزانه' },
  { key: 'month', label: 'ماهانه' },
  { key: 'q3', label: 'سه‌ماهه' },
  { key: 'q6', label: 'شش‌ماهه' },
  { key: 'year', label: 'سالانه' },
];

type TopTab = FinanceReportScope | 'FLIGHT_SEARCH' | 'SALES_ENGINE';
const PAGE_SIZE = 10;
const SEARCH_PAGE_SIZE = 6;

function useRowsPage<T>(rows: T[], pageSize = PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  useEffect(() => setPage(1), [rows]);
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);
  const start = (page - 1) * pageSize;
  return { page, setPage, totalPages, start, pageRows: rows.slice(start, start + pageSize) };
}

function useTenRowPage<T>(rows: T[]) {
  return useRowsPage(rows, PAGE_SIZE);
}

function TablePagination({ page, totalPages, start, total, onPage, pageSize = PAGE_SIZE }: { page: number; totalPages: number; start: number; total: number; onPage: (page: number) => void; pageSize?: number }) {
  if (!total) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#222e43] px-4 py-3 text-[10px] text-[#9fb0c7]">
      <span>نمایش {faDigits(start + 1)} تا {faDigits(Math.min(start + pageSize, total))} از {faDigits(total)} رکورد</span>
      <div className="flex items-center gap-2">
        <button type="button" aria-label="صفحه قبل" disabled={page === 1} onClick={() => onPage(page - 1)} className="rounded-lg border border-[#2b3852] px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-40">قبلی</button>
        <span className="font-num">{faDigits(page)} / {faDigits(totalPages)}</span>
        <button type="button" aria-label="صفحه بعد" disabled={page === totalPages} onClick={() => onPage(page + 1)} className="rounded-lg border border-[#2b3852] px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-40">بعدی</button>
      </div>
    </div>
  );
}

function jalaliMonth(month: number) {
  return dayjs().calendar('jalali').month(month).startOf('month');
}

function rangeFor(period: FinanceReportPeriod, month: number, day: number): Pick<FinanceReportFilters, 'from' | 'to'> {
  const current = jalaliMonth(month);
  if (period === 'flight') return {};
  if (period === 'day') {
    const start = current.date(day).calendar('gregory').startOf('day');
    return { from: start.toISOString(), to: start.add(1, 'day').toISOString() };
  }
  if (period === 'month') {
    const start = current.calendar('gregory');
    return { from: start.toISOString(), to: current.add(1, 'month').calendar('gregory').toISOString() };
  }
  const months = period === 'q3' ? 3 : period === 'q6' ? 6 : 12;
  const end = dayjs().calendar('jalali').add(1, 'day').calendar('gregory').startOf('day');
  return { from: dayjs().calendar('jalali').subtract(months, 'month').calendar('gregory').startOf('day').toISOString(), to: end.toISOString() };
}

function EmptyState({ text }: { text: string }) {
  return <div className="py-16 text-center text-xs text-[#6b7b94]">{text}</div>;
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center text-xs text-[#f87171]">
      <span>دریافت گزارش ناموفق بود.</span>
      <button type="button" onClick={onRetry} className="rounded-lg border border-[#f8717144] px-4 py-2 font-bold">تلاش دوباره</button>
    </div>
  );
}

function saveDownload(blob: Blob, filename: string) {
  if (blob.size === 0) throw new Error('فایل خروجی خالی است.');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking synchronously can truncate the download in Chromium/Excel flows.
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function ExportButtons({ onExport, busy }: { onExport: (format: 'csv' | 'excel' | 'pdf') => void; busy: string | null }) {
  return (
    <div className="flex gap-2" dir="ltr">
      <button type="button" disabled={Boolean(busy)} onClick={() => onExport('excel')} className="rounded-[10px] bg-[#4f7ff0] px-4 py-2.5 text-[11px] font-extrabold text-white disabled:opacity-50">
        {busy === 'excel' ? 'در حال ساخت…' : 'خروجی Excel'}
      </button>
      <button type="button" disabled={Boolean(busy)} onClick={() => onExport('csv')} className="rounded-[10px] border border-[#2b3852] bg-[#18223a] px-4 py-2.5 text-[11px] font-extrabold text-white disabled:opacity-50">
        {busy === 'csv' ? 'در حال ساخت…' : 'خروجی CSV'}
      </button>
      <button type="button" disabled={Boolean(busy)} onClick={() => onExport('pdf')} className="rounded-[10px] border border-[#2b3852] bg-[#18223a] px-4 py-2.5 text-[11px] font-extrabold text-white disabled:opacity-50">
        {busy === 'pdf' ? 'در حال ساخت…' : 'خروجی PDF'}
      </button>
    </div>
  );
}

function CalendarPicker({ month, day, onMonth, onDay }: { month: number; day: number; onMonth: (value: number) => void; onDay: (value: number) => void }) {
  const firstDay = jalaliMonth(month);
  const days = firstDay.daysInMonth();
  // Day.js numbers Sunday as zero; Persian calendars start on Saturday.
  const leadingEmptyCells = (firstDay.day() + 1) % 7;
  return (
    <div className="rounded-[14px] border border-[#28344c] bg-[#18223a] p-3">
      <div className="mb-3 grid grid-cols-[1fr_72px] gap-2">
        <select value={month} onChange={(event) => onMonth(Number(event.target.value))} className="rounded-lg border border-[#30405f] bg-[#141d2e] px-3 py-2 text-xs text-white">
          {MONTHS.map((name, index) => <option key={name} value={index}>{name}</option>)}
        </select>
        <span className="rounded-lg border border-[#30405f] bg-[#141d2e] px-3 py-2 text-center text-xs text-white">{faDigits(jalaliMonth(month).format('YYYY'))}</span>
      </div>
      <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[9px] text-[#6b7b94]">{['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'].map((name) => <span key={name}>{name}</span>)}</div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: leadingEmptyCells }, (_, index) => (
          <span key={`empty-${index}`} aria-hidden="true" className="h-7" />
        ))}
        {Array.from({ length: days }, (_, index) => index + 1).map((value) => (
          <button key={value} type="button" onClick={() => onDay(value)} className={`h-7 rounded-md text-[10px] ${day === value ? 'border border-[#5b8cff] bg-[#263f70] text-white' : 'border border-[#28344c] text-[#9fb0c7] hover:bg-white/5'}`}>
            {faDigits(value)}
          </button>
        ))}
      </div>
    </div>
  );
}

function MonthPicker({ selected, onSelect }: { selected: number; onSelect: (month: number) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {MONTHS.map((month, index) => (
        <button key={month} type="button" onClick={() => onSelect(index)} className={`rounded-[10px] border px-4 py-3 text-xs font-bold ${selected === index ? 'border-[#4f7ff0] bg-[#4f7ff0] text-white' : 'border-[#2b3852] bg-[#18223a] text-[#9fb0c7]'}`}>
          {month}
        </button>
      ))}
    </div>
  );
}

function PartnerTable({ result }: { result: Extract<FinanceReportResult, { kind: 'partners' }> }) {
  const paging = useTenRowPage(result.rows);
  if (!result.rows.length) return <EmptyState text="در این بازه گزارشی ثبت نشده است." />;
  return (
    <div>
      <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-right text-xs">
        <thead className="text-[10px] text-[#6b7b94]"><tr><th className="px-4 py-3">نام</th><th className="px-4 py-3">فروش کل</th><th className="px-4 py-3">پرداخت‌شده</th><th className="px-4 py-3">مانده</th></tr></thead>
        <tbody>{paging.pageRows.map((row) => (
          <tr key={row.id} className="border-t border-[#222e43] text-white">
            <td className="px-4 py-4 font-extrabold">{row.name}</td>
            <td className="font-num px-4 py-4">{faMoney(row.totalIrr)} تومان</td>
            <td className="font-num px-4 py-4">{faMoney(row.paidIrr)} تومان</td>
            <td className={`font-num px-4 py-4 font-bold ${BigInt(row.outstandingIrr) > 0n ? 'text-[#f59e0b]' : 'text-[#34d399]'}`}>{BigInt(row.outstandingIrr) > 0n ? `${faMoney(row.outstandingIrr)} تومان` : 'تسویه‌شده'}</td>
          </tr>
        ))}</tbody>
      </table></div>
      <TablePagination page={paging.page} totalPages={paging.totalPages} start={paging.start} total={result.rows.length} onPage={paging.setPage} />
    </div>
  );
}

function FlightTable({
  rows,
  onSelect,
  rich,
  summary,
  period,
}: {
  rows: FinanceFlightRow[];
  onSelect?: (row: FinanceFlightRow) => void;
  rich?: boolean;
  summary?: { totalIrr: string; soldSeats: number };
  period?: FinanceReportPeriod;
}) {
  const paging = useTenRowPage(rows);
  if (!rows.length) return <EmptyState text="پروازی در بازه انتخاب‌شده وجود ندارد." />;
  const periodLabel =
    period === 'day'
      ? 'روزانه'
      : period === 'month'
        ? 'ماهانه'
        : period === 'q3'
          ? 'سه‌ماهه'
          : period === 'q6'
            ? 'شش‌ماهه'
            : period === 'year'
              ? 'سالانه'
              : 'پرواز';
  return (
    <div>
      {summary && rich && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#222e43] px-5 py-4">
          <div>
            <div className="text-[10px] text-[#6b7b94]">جمع فروش مشتریان — {periodLabel}</div>
            <div className="font-num mt-1 text-lg font-black text-white">
              {faMoneyCompact(summary.totalIrr)} تومان
            </div>
          </div>
          <div className="text-[11px] text-[#9fb0c7]">
            صندلی فروخته‌شده:{' '}
            <span className="font-num font-bold text-white">{faDigits(summary.soldSeats)}</span>
          </div>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className={`w-full text-right text-xs ${rich ? 'min-w-[980px]' : 'min-w-[820px]'}`}>
          <thead className="text-[10px] text-[#6b7b94]">
            <tr>
              <th className="px-4 py-3">شماره پرواز</th>
              <th className="px-4 py-3">مسیر</th>
              <th className="px-4 py-3">تاریخ</th>
              <th className="px-4 py-3">فروش مشتریان</th>
              {rich ? (
                <>
                  <th className="px-4 py-3">عادی</th>
                  <th className="px-4 py-3">آژانس</th>
                  <th className="px-4 py-3">فروخته‌نشده</th>
                </>
              ) : (
                <th className="px-4 py-3">صندلی فروخته‌شده</th>
              )}
              <th />
            </tr>
          </thead>
          <tbody>
            {paging.pageRows.map((row) => {
              const direct = Math.max(0, row.soldSeats - row.agencySeats);
              return (
                <tr key={row.flightInstanceId} className="border-t border-[#222e43] text-white">
                  <td className="font-num px-4 py-4 font-extrabold">{row.flightNo}</td>
                  <td className="px-4 py-4">
                    {row.originCityFa} ← {row.destCityFa}
                  </td>
                  <td className="px-4 py-4 text-[#9fb0c7]">{formatJalaliDate(row.departureAt)}</td>
                  <td className="font-num px-4 py-4">{faMoneyCompact(row.totalIrr)} تومان</td>
                  {rich ? (
                    <>
                      <td className="font-num px-4 py-4">{faDigits(direct)}</td>
                      <td className="font-num px-4 py-4">{faDigits(row.agencySeats)}</td>
                      <td className="font-num px-4 py-4 text-[#f59e0b]">{faDigits(row.unsoldSeats)}</td>
                    </>
                  ) : (
                    <td className="font-num px-4 py-4">{faDigits(row.soldSeats)}</td>
                  )}
                  <td className="px-4 py-4">
                    {onSelect && (
                      <button
                        type="button"
                        onClick={() => onSelect(row)}
                        className="rounded-lg border border-[#31518a] px-3 py-1.5 text-[#7da7ff]"
                      >
                        جزئیات
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <TablePagination page={paging.page} totalPages={paging.totalPages} start={paging.start} total={rows.length} onPage={paging.setPage} />
    </div>
  );
}

function AgencySalesTable({ agencies }: { agencies: FinanceFlightDetail['agencies'] }) {
  const paging = useTenRowPage(agencies);
  if (!agencies.length) return <EmptyState text="این پرواز فروش آژانسی ندارد." />;
  return (
    <div className="rounded-xl border border-[#26334b]">
      <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-right text-xs"><thead className="text-[10px] text-[#6b7b94]"><tr><th className="p-3">نام آژانس</th><th className="p-3">تعداد صندلی</th><th className="p-3">مبلغ فروش</th><th className="p-3">پرداخت‌شده</th><th className="p-3">بدهی</th></tr></thead><tbody>{paging.pageRows.map((agency) => <tr key={agency.agencyId} className="border-t border-[#222e43]"><td className="p-3 font-bold">{agency.agencyName}</td><td className="font-num p-3">{faDigits(agency.soldSeats)}</td><td className="font-num p-3">{faMoney(agency.salesIrr)} تومان</td><td className="font-num p-3 text-[#34d399]">{faMoney(agency.paidIrr)} تومان</td><td className="font-num p-3 text-[#f59e0b]">{faMoney(agency.outstandingIrr)} تومان</td></tr>)}</tbody></table></div>
      <TablePagination page={paging.page} totalPages={paging.totalPages} start={paging.start} total={agencies.length} onPage={paging.setPage} />
    </div>
  );
}

function BookingSalesTable({ bookings }: { bookings: FinanceFlightDetail['bookings'] }) {
  const paging = useTenRowPage(bookings);
  if (!bookings.length) return <EmptyState text="برای این پرواز رزرو قطعی ثبت نشده است." />;
  return (
    <div className="rounded-xl border border-[#26334b]">
      <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-right text-[10px]"><thead className="text-[#6b7b94]"><tr>{['PNR','تاریخ رزرو','وضعیت','پرداخت','کانال','کلاس','مسافر','پایه','مالیات','خدمات','جمع'].map((header) => <th key={header} className="px-3 py-3">{header}</th>)}</tr></thead><tbody>{paging.pageRows.map((row) => <tr key={row.bookingId} className="border-t border-[#222e43] text-[#e7ecf3]"><td dir="ltr" className="px-3 py-3 font-bold text-[#7da7ff]">{row.pnr}</td><td className="px-3 py-3">{formatJalaliDate(row.bookedAt)}</td><td className="px-3 py-3">{row.bookingStatus}</td><td className="px-3 py-3">{row.paymentStatus}</td><td className="px-3 py-3">{row.channel}</td><td dir="ltr" className="px-3 py-3">{row.cabin}{row.fareClassCode ? `/${row.fareClassCode}` : ''}</td><td className="px-3 py-3">{faDigits(row.passengerCount)}</td><td className="font-num px-3 py-3">{faMoney(row.baseFareIrr)}</td><td className="font-num px-3 py-3">{faMoney(row.taxIrr)}</td><td className="font-num px-3 py-3">{faMoney(row.extrasIrr)}</td><td className="font-num px-3 py-3 font-bold">{faMoney(row.totalIrr)}</td></tr>)}</tbody></table></div>
      <TablePagination page={paging.page} totalPages={paging.totalPages} start={paging.start} total={bookings.length} onPage={paging.setPage} />
    </div>
  );
}

function FlightDetailDialog({ target, detail, loading, error, busy, onClose, onRetry, onExport }: { target: FinanceFlightRow; detail: FinanceFlightDetail | null; loading: boolean; error: boolean; busy: string | null; onClose: () => void; onRetry: () => void; onExport: (format: 'csv' | 'excel' | 'pdf') => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="finance-flight-detail-title">
      <section className="max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-2xl border border-[#2b3852] bg-[#111a2b] shadow-2xl">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-[#26334b] bg-[#111a2b] px-5 py-4">
          <div><h2 id="finance-flight-detail-title" className="text-base font-black text-white">جزئیات فروش پرواز {target.flightNo}</h2><p className="mt-1 text-[10px] text-[#9fb0c7]">{target.originCityFa} ← {target.destCityFa} · {formatJalaliDate(target.departureAt)}</p></div>
          <button type="button" aria-label="بستن جزئیات" onClick={onClose} className="h-9 w-9 rounded-lg border border-[#2b3852] text-lg text-[#9fb0c7]">×</button>
        </header>
        {loading ? <EmptyState text="در حال دریافت جزئیات فروش…" /> : error ? <ErrorState onRetry={onRetry} /> : detail ? (
          <div className="space-y-5 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3"><div className="grid flex-1 grid-cols-2 gap-3 md:grid-cols-4">{[['فروش مستقیم', detail.summary.soldSeats - detail.summary.agencySeats], ['فروش آژانس', detail.summary.agencySeats], ['فروش‌نرفته', detail.summary.unsoldSeats], ['فروش کل', `${faMoney(detail.summary.totalIrr)} تومان`]].map(([label, value]) => <div key={label} className="rounded-xl border border-[#26334b] bg-[#141d2e] p-3"><span className="block text-[9px] text-[#6b7b94]">{label}</span><strong className="font-num mt-1 block text-sm text-white">{typeof value === 'number' ? faDigits(value) : value}</strong></div>)}</div><ExportButtons busy={busy} onExport={onExport} /></div>
            <section><h3 className="mb-2 text-sm font-extrabold text-white">فروش مشتریان و رزروها</h3><BookingSalesTable bookings={detail.bookings} /></section>
            <section><h3 className="mb-2 text-sm font-extrabold text-white">تفکیک فروش آژانس‌ها</h3><AgencySalesTable agencies={detail.agencies} /></section>
          </div>
        ) : null}
      </section>
    </div>
  );
}

const EMPTY_SALES_FILTERS: FinanceSalesFilters = { limit: 250 };

function SalesEngineView({
  filters,
  onChange,
  result,
  loading,
  error,
  onApply,
  onExport,
  busy,
}: {
  filters: FinanceSalesFilters;
  onChange: (filters: FinanceSalesFilters) => void;
  result: FinanceSalesResult | null;
  loading: boolean;
  error: boolean;
  onApply: () => void;
  onExport: (format: 'csv' | 'excel' | 'pdf') => void;
  busy: string | null;
}) {
  const salesRows = useMemo(() => result?.rows ?? [], [result]);
  const paging = useTenRowPage(salesRows);
  const fieldClass = 'h-10 rounded-[9px] border border-[#2b3852] bg-[#18223a] px-3 text-[11px] text-white outline-none focus:border-[#4f7ff0]';
  const update = (key: keyof FinanceSalesFilters, value: string) =>
    onChange({ ...filters, [key]: value || undefined });
  return (
    <section className="rounded-[15px] border border-[#222e43] bg-[#141d2e]">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#222e43] p-5">
        <div>
          <h2 className="text-base font-extrabold text-white">موتور گزارش تفصیلی فروش</h2>
          <p className="mt-1 text-[10px] text-[#6b7b94]">فیلتر و تجمیع مستقیماً در سرور انجام می‌شود.</p>
        </div>
        <ExportButtons onExport={onExport} busy={busy} />
      </div>
      <div className="grid gap-3 border-b border-[#222e43] p-5 sm:grid-cols-2 lg:grid-cols-4">
        <label className="grid gap-1 text-[10px] text-[#9fb0c7]">رزرو از<input type="date" value={filters.bookedFrom ?? ''} onChange={(e) => update('bookedFrom', e.target.value)} className={fieldClass} /></label>
        <label className="grid gap-1 text-[10px] text-[#9fb0c7]">رزرو تا<input type="date" value={filters.bookedTo ?? ''} onChange={(e) => update('bookedTo', e.target.value)} className={fieldClass} /></label>
        <label className="grid gap-1 text-[10px] text-[#9fb0c7]">پرواز از<input type="date" value={filters.flightFrom ?? ''} onChange={(e) => update('flightFrom', e.target.value)} className={fieldClass} /></label>
        <label className="grid gap-1 text-[10px] text-[#9fb0c7]">پرواز تا<input type="date" value={filters.flightTo ?? ''} onChange={(e) => update('flightTo', e.target.value)} className={fieldClass} /></label>
        <label className="grid gap-1 text-[10px] text-[#9fb0c7]">وضعیت رزرو<select value={filters.bookingStatus ?? ''} onChange={(e) => update('bookingStatus', e.target.value)} className={fieldClass}><option value="">همه</option>{['DRAFT','HELD','PAID','TICKETED','CANCELLED','EXPIRED','REFUNDED','FLOWN','NO_SHOW'].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label className="grid gap-1 text-[10px] text-[#9fb0c7]">وضعیت پرداخت<select value={filters.paymentStatus ?? ''} onChange={(e) => update('paymentStatus', e.target.value)} className={fieldClass}><option value="">همه</option><option value="PENDING">در انتظار</option><option value="PAID">پرداخت‌شده</option><option value="REFUNDED">مستردشده</option><option value="CANCELLED">لغوشده</option></select></label>
        <label className="grid gap-1 text-[10px] text-[#9fb0c7]">کلاس کابین<select value={filters.cabin ?? ''} onChange={(e) => update('cabin', e.target.value)} className={fieldClass}><option value="">همه</option><option value="ECONOMY">اکونومی</option><option value="COMFORT">کامفورت</option><option value="BUSINESS">بیزینس</option><option value="FIRST">فرست</option></select></label>
        <label className="grid gap-1 text-[10px] text-[#9fb0c7]">کانال فروش<select value={filters.channel ?? ''} onChange={(e) => update('channel', e.target.value)} className={fieldClass}><option value="">همه</option><option value="SYSTEM">سایت</option><option value="AGENCY">آژانس</option><option value="CHARTER">چارتر</option></select></label>
        <label className="grid gap-1 text-[10px] text-[#9fb0c7]">مبدأ<input dir="ltr" maxLength={10} value={filters.originCode ?? ''} onChange={(e) => update('originCode', e.target.value.toUpperCase())} className={fieldClass} placeholder="THR" /></label>
        <label className="grid gap-1 text-[10px] text-[#9fb0c7]">مقصد<input dir="ltr" maxLength={10} value={filters.destCode ?? ''} onChange={(e) => update('destCode', e.target.value.toUpperCase())} className={fieldClass} placeholder="MHD" /></label>
        <div className="flex items-end gap-2 sm:col-span-2">
          <button type="button" onClick={onApply} className="h-10 flex-1 rounded-[9px] bg-[#4f7ff0] px-4 text-[11px] font-bold text-white">اعمال فیلتر</button>
          <button type="button" onClick={() => onChange(EMPTY_SALES_FILTERS)} className="h-10 rounded-[9px] border border-[#2b3852] px-4 text-[11px] font-bold text-[#9fb0c7]">پاک‌کردن</button>
        </div>
      </div>
      {loading ? <EmptyState text="در حال ساخت گزارش…" /> : error ? <ErrorState onRetry={onApply} /> : !result ? <EmptyState text="فیلترها را تنظیم و گزارش را اجرا کنید." /> : (
        <>
          <div className="grid grid-cols-2 gap-3 p-5 lg:grid-cols-5">
            {[
              ['سفارش', faDigits(result.summary.orderCount)],
              ['مسافر', faDigits(result.summary.passengerCount)],
              ['فروش ناخالص', `${faMoney(result.summary.grossIrr)} تومان`],
              ['درآمد خالص', `${faMoney(result.summary.netRevenueIrr)} تومان`],
              ['میانگین سفارش', `${faMoney(result.summary.averageOrderIrr)} تومان`],
            ].map(([label, value]) => <div key={label} className="rounded-xl border border-[#26334b] bg-[#111a2b] p-3"><span className="block text-[9px] text-[#6b7b94]">{label}</span><strong className="font-num mt-1 block text-sm text-white">{value}</strong></div>)}
          </div>
          <div className="overflow-x-auto border-t border-[#222e43]">
            <table className="w-full min-w-[1250px] text-right text-[10px]"><thead className="text-[#6b7b94]"><tr>{['PNR','تاریخ رزرو','وضعیت','پرداخت','کانال','پرواز','مسیر','تاریخ پرواز','کلاس','مسافر','پایه','مالیات','خدمات','جمع'].map((h) => <th key={h} className="px-3 py-3">{h}</th>)}</tr></thead><tbody>{paging.pageRows.map((row) => <tr key={row.bookingId} className="border-t border-[#222e43] text-[#e7ecf3]"><td dir="ltr" className="px-3 py-3 font-bold text-[#7da7ff]">{row.pnr}</td><td className="px-3 py-3">{formatJalaliDate(row.bookedAt)}</td><td className="px-3 py-3">{row.bookingStatus}</td><td className="px-3 py-3">{row.paymentStatus}</td><td className="px-3 py-3">{row.channel}</td><td dir="ltr" className="px-3 py-3">{row.flightNo}</td><td dir="ltr" className="px-3 py-3">{row.originCode}-{row.destCode}</td><td className="px-3 py-3">{formatJalaliDate(row.departureAt)}</td><td dir="ltr" className="px-3 py-3">{row.cabin}{row.fareClassCode ? `/${row.fareClassCode}` : ''}</td><td className="px-3 py-3">{faDigits(row.passengerCount)}</td><td className="font-num px-3 py-3">{faMoney(row.baseFareIrr)}</td><td className="font-num px-3 py-3">{faMoney(row.taxIrr)}</td><td className="font-num px-3 py-3">{faMoney(row.extrasIrr)}</td><td className="font-num px-3 py-3 font-bold">{faMoney(row.totalIrr)}</td></tr>)}</tbody></table>
          </div>
          <TablePagination page={paging.page} totalPages={paging.totalPages} start={paging.start} total={salesRows.length} onPage={paging.setPage} />
        </>
      )}
    </section>
  );
}

export default function FinanceReportsPage() {
  const nowJalali = dayjs().calendar('jalali');
  const [tab, setTab] = useState<TopTab>('AGENCIES');
  const [period, setPeriod] = useState<FinanceReportPeriod>('month');
  const [month, setMonth] = useState(nowJalali.month());
  const [day, setDay] = useState(nowJalali.date());
  const [result, setResult] = useState<FinanceReportResult | null>(null);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  const [exportBusy, setExportBusy] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [searchRows, setSearchRows] = useState<FinanceFlightRow[] | null>(null);
  const [selectedFlight, setSelectedFlight] = useState<FinanceFlightDetail | null>(null);
  const [detailTarget, setDetailTarget] = useState<FinanceFlightRow | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const [salesFilters, setSalesFilters] = useState<FinanceSalesFilters>(EMPTY_SALES_FILTERS);
  const [appliedSalesFilters, setAppliedSalesFilters] = useState<FinanceSalesFilters>(EMPTY_SALES_FILTERS);
  const [salesResult, setSalesResult] = useState<FinanceSalesResult | null>(null);
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesError, setSalesError] = useState(false);

  const filters = useMemo<FinanceReportFilters | null>(() => {
    if (tab === 'FLIGHT_SEARCH' || tab === 'SALES_ENGINE') return null;
    return { scope: tab, period: tab === 'CUSTOMERS' ? period : 'month', ...rangeFor(tab === 'CUSTOMERS' ? period : 'month', month, day) };
  }, [tab, period, month, day]);

  useEffect(() => {
    if (!filters) return;
    let active = true;
    setResult(null);
    setError(false);
    fetchFinanceReport(filters).then((data) => active && setResult(data)).catch(() => active && setError(true));
    return () => { active = false; };
  }, [filters, reload]);

  useEffect(() => {
    if (tab !== 'FLIGHT_SEARCH') return;
    if (appliedQuery.length < 2) {
      setSearchRows(null);
      setSelectedFlight(null);
      return;
    }
    let active = true;
    setSearchRows(null);
    searchFinanceFlights({ q: appliedQuery, limit: 18, ...rangeFor('month', month, day) })
      .then((data) => active && setSearchRows(data.rows))
      .catch(() => active && setSearchRows([]));
    return () => { active = false; };
  }, [tab, appliedQuery, month, day]);

  useEffect(() => {
    if (tab !== 'SALES_ENGINE') return;
    let active = true;
    setSalesLoading(true);
    setSalesError(false);
    fetchFinanceSales(appliedSalesFilters)
      .then((data) => active && setSalesResult(data))
      .catch(() => active && setSalesError(true))
      .finally(() => active && setSalesLoading(false));
    return () => { active = false; };
  }, [tab, appliedSalesFilters]);

  async function onExport(format: 'csv' | 'excel' | 'pdf') {
    if (!filters) return;
    setExportBusy(format);
    try {
      const blob = await downloadFinanceReport(filters, format);
      saveDownload(blob, `finance-report.${format === 'excel' ? 'xlsx' : format}`);
    } finally {
      setExportBusy(null);
    }
  }

  async function selectFlight(row: FinanceFlightRow) {
    setSelectedFlight(null);
    setSelectedFlight(await fetchFinanceFlightDetail(row.flightInstanceId));
  }

  async function openFlightDetail(row: FinanceFlightRow) {
    setDetailTarget(row);
    setSelectedFlight(null);
    setDetailLoading(true);
    setDetailError(false);
    try {
      setSelectedFlight(await fetchFinanceFlightDetail(row.flightInstanceId));
    } catch {
      setDetailError(true);
    } finally {
      setDetailLoading(false);
    }
  }

  async function exportSelectedFlight(format: 'csv' | 'excel' | 'pdf') {
    if (!selectedFlight) return;
    setExportBusy(format);
    try {
      const blob = await downloadFinanceReport(
        {
          scope: 'CUSTOMERS',
          period: 'flight',
          flightInstanceId: selectedFlight.summary.flightInstanceId,
        },
        format,
      );
      saveDownload(blob, `flight-${selectedFlight.summary.flightNo}.${format === 'excel' ? 'xlsx' : format}`);
    } finally {
      setExportBusy(null);
    }
  }

  async function exportSales(format: 'csv' | 'excel' | 'pdf') {
    setExportBusy(format);
    try {
      const blob = await downloadFinanceSales(appliedSalesFilters, format);
      saveDownload(blob, `finance-sales.${format === 'excel' ? 'xlsx' : format}`);
    } finally {
      setExportBusy(null);
    }
  }

  const searchPaging = useRowsPage(searchRows ?? [], SEARCH_PAGE_SIZE);
  const title = tab === 'AGENCIES' ? 'گزارش فروش و پرداخت آژانس‌ها' : tab === 'CHARTERS' ? 'گزارش فروش و پرداخت چارترکنندگان' : tab === 'CUSTOMERS' ? 'گزارش فروش مشتریان' : tab === 'SALES_ENGINE' ? 'موتور گزارش فروش' : 'جستجوی گزارش پرواز';

  return (
    <div dir="rtl" className="min-h-full bg-panel-canvas px-6 py-5 text-panel-ink lg:px-8" data-testid="finance-reports-page">
      <header className="mb-7 text-right">
        <h1 className="text-2xl font-black text-panel-ink">گزارشات و خروجی</h1>
        <p className="mt-1 text-[11px] text-panel-muted">خروجی Excel و CSV از فروش آژانس‌ها، چارترها و مشتریان</p>
      </header>

      <div className="mb-4 flex justify-end">
        <div className="flex rounded-[12px] border border-[#28344c] bg-[#18223a] p-1">
          {([['AGENCIES', 'آژانس‌ها'], ['CHARTERS', 'چارترها'], ['CUSTOMERS', 'مشتریان'], ['SALES_ENGINE', 'گزارش تفصیلی'], ['FLIGHT_SEARCH', 'جستجوی پرواز']] as const).map(([key, label]) => (
            <button key={key} type="button" onClick={() => setTab(key)} className={`rounded-[9px] px-5 py-2.5 text-xs font-bold ${tab === key ? 'bg-[#4f7ff0] text-white' : 'text-[#9fb0c7]'}`}>{label}</button>
          ))}
        </div>
      </div>

      {tab === 'SALES_ENGINE' ? (
        <SalesEngineView
          filters={salesFilters}
          onChange={setSalesFilters}
          result={salesResult}
          loading={salesLoading}
          error={salesError}
          onApply={() => setAppliedSalesFilters({ ...salesFilters })}
          onExport={(format) => void exportSales(format)}
          busy={exportBusy}
        />
      ) : tab !== 'FLIGHT_SEARCH' ? (
        <>
          <section className="rounded-[15px] border border-[#222e43] bg-[#141d2e]">
            <div className="flex flex-wrap items-start justify-between gap-4 p-5">
              <div><h2 className="text-base font-extrabold text-white">{title}</h2><p className="mt-1 text-[10px] text-[#6b7b94]">اطلاعات ثبت‌شده و قطعی سامانه</p></div>
              <ExportButtons onExport={onExport} busy={exportBusy} />
            </div>
            {tab === 'CUSTOMERS' && (
              <div className="flex justify-end px-5 pb-4"><div className="flex rounded-[11px] border border-[#28344c] bg-[#18223a] p-1">{PERIODS.map((item) => <button key={item.key} type="button" onClick={() => setPeriod(item.key)} className={`rounded-[8px] px-4 py-2 text-[11px] font-bold ${period === item.key ? 'bg-[#4f7ff0] text-white' : 'text-[#9fb0c7]'}`}>{item.label}</button>)}</div></div>
            )}
            <div className="border-t border-[#222e43]">
              {error ? (
                <ErrorState onRetry={() => setReload((value) => value + 1)} />
              ) : !result ? (
                <EmptyState text="در حال دریافت گزارش…" />
              ) : result.kind === 'partners' ? (
                <PartnerTable result={result} />
              ) : (
                <FlightTable
                  rows={result.rows}
                  onSelect={(row) => void openFlightDetail(row)}
                  rich={tab === 'CUSTOMERS'}
                  summary={result.summary}
                  period={result.period}
                />
              )}
            </div>
          </section>

          {tab === 'CUSTOMERS' && (period === 'day' || period === 'month') && (
            <section className="mt-4 grid gap-4 lg:grid-cols-[280px_1fr]">
              <div className="rounded-[15px] border border-[#222e43] bg-[#141d2e] p-5">
                <div className="mb-4">
                  <h2 className="text-base font-extrabold text-white">
                    {period === 'day' ? 'انتخاب روز' : 'انتخاب ماه'}
                  </h2>
                  <p className="mt-1 text-[10px] text-[#6b7b94]">
                    {period === 'day'
                      ? 'یک روز را از تقویم انتخاب کنید تا گزارش کامل پروازهای آن روز نمایش داده شود.'
                      : 'یک ماه را انتخاب کنید تا جزئیات فروش پروازهای همان ماه نمایش داده شود.'}
                  </p>
                </div>
                {period === 'month' ? (
                  <MonthPicker selected={month} onSelect={setMonth} />
                ) : (
                  <CalendarPicker month={month} day={day} onMonth={setMonth} onDay={setDay} />
                )}
              </div>
              <div className="rounded-[15px] border border-[#222e43] bg-[#141d2e] p-5">
                <h2 className="mb-2 text-base font-extrabold text-white">خلاصه بازه</h2>
                {result?.kind === 'customers' ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-[#26334b] bg-[#111a2b] p-4">
                      <span className="block text-[10px] text-[#6b7b94]">فروش مشتریان</span>
                      <strong className="font-num mt-2 block text-lg text-white">
                        {faMoneyCompact(result.summary.totalIrr)} تومان
                      </strong>
                    </div>
                    <div className="rounded-xl border border-[#26334b] bg-[#111a2b] p-4">
                      <span className="block text-[10px] text-[#6b7b94]">صندلی فروخته‌شده</span>
                      <strong className="font-num mt-2 block text-lg text-white">
                        {faDigits(result.summary.soldSeats)}
                      </strong>
                    </div>
                  </div>
                ) : (
                  <EmptyState text="در حال دریافت خلاصه…" />
                )}
              </div>
            </section>
          )}
        </>
      ) : (
        <>
          <section className="grid gap-4 rounded-[15px] border border-[#222e43] bg-[#141d2e] p-4 lg:grid-cols-[260px_1fr]">
            <CalendarPicker month={month} day={day} onMonth={setMonth} onDay={setDay} />
            <div>
              <form
                className="mb-3 flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const normalized = query.trim();
                  if (normalized.length >= 2) setAppliedQuery(normalized);
                }}
              >
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="حداقل ۲ حرف از شماره پرواز یا مسیر…" className="min-w-0 flex-1 rounded-[11px] border border-[#2b3852] bg-[#18223a] px-4 py-3 text-xs text-white outline-none focus:border-[#4f7ff0]" />
                <button type="submit" disabled={query.trim().length < 2} className="rounded-[11px] bg-[#4f7ff0] px-5 text-xs font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-40">جستجو</button>
                {appliedQuery && <button type="button" onClick={() => { setQuery(''); setAppliedQuery(''); }} className="rounded-[11px] border border-[#2b3852] px-4 text-[11px] text-[#9fb0c7]">پاک‌کردن</button>}
              </form>
              {!appliedQuery ? <EmptyState text="برای نمایش محدود نتایج، شماره پرواز یا مسیر را جستجو کنید." /> : !searchRows ? <EmptyState text="در حال جستجو…" /> : searchRows.length === 0 ? <EmptyState text="پرواز منطبق پیدا نشد." /> : (
                <div className="overflow-hidden rounded-xl border border-[#2b3852]">
                  <div className="divide-y divide-[#222e43]">
                    {searchPaging.pageRows.map((row) => <button key={row.flightInstanceId} type="button" onClick={() => void selectFlight(row)} className={`grid w-full grid-cols-[100px_1fr_auto] items-center gap-3 px-4 py-3 text-right ${selectedFlight?.summary.flightInstanceId === row.flightInstanceId ? 'bg-[#4f7ff0] text-white' : 'bg-[#111a2b] hover:bg-[#18223a]'}`}><strong className="font-num text-sm">{row.flightNo}</strong><span className="text-[11px]">{row.originCityFa} ← {row.destCityFa}</span><span className="font-num text-[9px] opacity-70">{formatJalaliDate(row.departureAt)} · {faDigits(row.soldSeats)} صندلی</span></button>)}
                  </div>
                  <TablePagination page={searchPaging.page} totalPages={searchPaging.totalPages} start={searchPaging.start} total={searchRows.length} pageSize={SEARCH_PAGE_SIZE} onPage={searchPaging.setPage} />
                </div>
              )}
            </div>
          </section>
          {selectedFlight && (
            <section className="mt-4 rounded-[15px] border border-[#222e43] bg-[#141d2e] p-5">
              <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-extrabold">گزارش پرواز {selectedFlight.summary.flightNo} — {selectedFlight.summary.originCityFa} ← {selectedFlight.summary.destCityFa}</h2>
                  <p className="mt-1 text-[10px] text-[#6b7b94]">تفکیک فروش و بدهی آژانس‌ها</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <ExportButtons
                    busy={exportBusy}
                    onExport={(format) => void exportSelectedFlight(format)}
                  />
                  <span className="font-num text-lg font-black">{faMoney(selectedFlight.summary.totalIrr)} تومان</span>
                </div>
              </div>
              <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">{[['مسافران عادی', selectedFlight.summary.soldSeats - selectedFlight.summary.agencySeats], ['صندلی آژانس‌ها', selectedFlight.summary.agencySeats], ['تعداد آژانس‌ها', selectedFlight.summary.agencyCount], ['صندلی فروش‌نرفته', selectedFlight.summary.unsoldSeats]].map(([label, value]) => <div key={label} className="rounded-xl border border-[#26334b] bg-[#111a2b] p-4"><span className="block text-[10px] text-[#6b7b94]">{label}</span><strong className="font-num mt-2 block text-lg text-white">{faDigits(value)}</strong></div>)}</div>
              <AgencySalesTable agencies={selectedFlight.agencies} />
            </section>
          )}
        </>
      )}
      {detailTarget && (
        <FlightDetailDialog
          target={detailTarget}
          detail={selectedFlight}
          loading={detailLoading}
          error={detailError}
          busy={exportBusy}
          onClose={() => { setDetailTarget(null); setSelectedFlight(null); }}
          onRetry={() => void openFlightDetail(detailTarget)}
          onExport={(format) => void exportSelectedFlight(format)}
        />
      )}
    </div>
  );
}
