import { useEffect, useState, type FormEvent } from 'react';
import { searchPassengers } from '../../api/reporting';
import Pagination from '../../components/Pagination';
import { usePagination } from '../../hooks/usePagination';
import { faDigits, faMoney } from '../../lib/fa-format';
import { formatJalaliDate, formatJalaliDateTime } from '../../lib/jalali';
import type { PassengerReportHit } from '../../types/reporting';

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'پیش‌نویس',
  HELD: 'رزرو موقت',
  PAID: 'پرداخت‌شده',
  TICKETED: 'صادرشده',
  CANCELLED: 'لغوشده',
  EXPIRED: 'منقضی‌شده',
  REFUNDED: 'مستردشده',
};

function downloadPassengerExcel(hits: PassengerReportHit[]) {
  const rows = hits
    .map(
      (h) =>
        `<tr><td>${h.fullName}</td><td>${h.maskedNationalId ?? ''}</td><td>${h.pnr}</td><td>${STATUS_LABEL[h.status] ?? h.status}</td><td>${h.flightNo}</td><td>${h.originCode} → ${h.destCode}</td><td>${formatJalaliDate(h.departureAt)}</td><td>${h.seatCode ?? ''}</td><td>${faMoney(h.priceIrr)}</td></tr>`,
    )
    .join('');
  const html = `<!DOCTYPE html><html lang="fa" dir="rtl"><head><meta charset="utf-8"/></head><body><table><thead><tr><th>نام</th><th>کد ملی</th><th>PNR</th><th>وضعیت</th><th>پرواز</th><th>مسیر</th><th>تاریخ</th><th>صندلی</th><th>مبلغ</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
  const blob = new Blob([`\ufeff${html}`], { type: 'application/vnd.ms-excel' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'passenger-report.xls';
  a.click();
  URL.revokeObjectURL(url);
}

const QUICK_NAMES_KEY = 'blujet_pax_report_quick_names';
const MAX_QUICK_NAMES = 8;

function readQuickNames(): string[] {
  try {
    const raw = sessionStorage.getItem(QUICK_NAMES_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((n): n is string => typeof n === 'string' && n.trim().length > 0);
  } catch {
    return [];
  }
}

function rememberQuickNames(names: string[]) {
  const prev = readQuickNames();
  const merged = [...names, ...prev.filter((n) => !names.includes(n))].slice(0, MAX_QUICK_NAMES);
  sessionStorage.setItem(QUICK_NAMES_KEY, JSON.stringify(merged));
  return merged;
}

export default function PassengerReportsPage() {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<PassengerReportHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [quickNames, setQuickNames] = useState<string[]>([]);
  const hitsPager = usePagination(hits ?? []);

  useEffect(() => {
    setQuickNames(readQuickNames());
  }, []);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 3200);
    return () => window.clearTimeout(t);
  }, [notice]);

  async function runSearch(q: string) {
    const trimmed = q.trim();
    if (trimmed.length < 2) return;
    setSearching(true);
    setError(null);
    try {
      const next = await searchPassengers(trimmed);
      setHits(next);
      if (next.length > 0) {
        const names = Array.from(new Set(next.map((h) => h.fullName.trim()).filter(Boolean)));
        setQuickNames(rememberQuickNames(names));
      }
    } catch {
      setError('خطا در جستجوی مسافر.');
    } finally {
      setSearching(false);
    }
  }

  async function onSearch(e: FormEvent) {
    e.preventDefault();
    await runSearch(query);
  }

  function onQuickName(name: string) {
    setQuery(name);
    void runSearch(name);
  }

  function exportPassengerExcel() {
    if (!hits || hits.length === 0) {
      setNotice('ابتدا جستجو کنید تا نتیجه‌ای برای خروجی وجود داشته باشد.');
      return;
    }
    downloadPassengerExcel(hits);
    setNotice('خروجی Excel دانلود شد ✓');
  }

  function exportPassengerPdf() {
    if (!hits || hits.length === 0) {
      setNotice('ابتدا جستجو کنید تا نتیجه‌ای برای خروجی وجود داشته باشد.');
      return;
    }
    const html = `<!DOCTYPE html><html lang="fa" dir="rtl"><head><meta charset="utf-8"/><title>گزارش مسافران</title>
      <style>body{font-family:Tahoma,sans-serif;padding:24px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:8px;font-size:12px}th{background:#f3f4f6}</style></head><body>
      <h1>گزارش مسافران</h1><table><thead><tr><th>نام</th><th>PNR</th><th>پرواز</th><th>مسیر</th><th>تاریخ</th><th>مبلغ</th></tr></thead><tbody>
      ${hits.map((h) => `<tr><td>${h.fullName}</td><td>${h.pnr}</td><td>${h.flightNo}</td><td>${h.originCode} → ${h.destCode}</td><td>${formatJalaliDate(h.departureAt)}</td><td>${faMoney(h.priceIrr)}</td></tr>`).join('')}
      </tbody></table></body></html>`;
    const w = window.open('', '_blank');
    if (!w) {
      setNotice('مرورگر اجازه باز کردن پنجره چاپ را نداد.');
      return;
    }
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
    setNotice('پنجره چاپ PDF باز شد ✓');
  }

  return (
    <div className="px-[21px] pb-[34px] pt-[18px]">
      <h1 className="mb-1 text-[20.5px] font-black text-white">گزارش مسافران</h1>
      <p className="mb-6 text-sm text-[#6b7b94]">جستجوی مسافر و مشاهده‌ی جزئیات بلیط</p>

      {notice && (
        <p role="status" className="mb-4 rounded-[10px] border border-[#28344c] bg-[#18223a] px-3.5 py-2.5 text-xs text-[#9fb0c7]">
          {notice}
        </p>
      )}

      <div className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-5">
        <div className="mb-4 flex items-start justify-between gap-2.5">
          <div>
            <div className="mb-1 text-[14.5px] font-extrabold text-white">جستجوی مسافر</div>
            <p className="text-[11.5px] text-[#6b7b94]">
              نام و نام خانوادگی مسافر (یا کد ملی) را وارد کنید تا جزئیات بلیط، پرواز و تاریخ نمایش داده شود.
            </p>
          </div>
          <div className="flex shrink-0 gap-[7px]">
            <button
              type="button"
              onClick={exportPassengerExcel}
              className="flex items-center gap-[5px] rounded-[9px] border border-[rgba(16,185,129,.4)] bg-[rgba(16,185,129,.1)] px-[11px] py-[7px] text-[11px] font-bold text-[#34d399]"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 3v12M8 11l4 4 4-4M5 21h14" />
              </svg>
              Excel
            </button>
            <button
              type="button"
              onClick={exportPassengerPdf}
              className="flex items-center gap-[5px] rounded-[9px] border border-[rgba(248,113,113,.4)] bg-[rgba(248,113,113,.1)] px-[11px] py-[7px] text-[11px] font-bold text-[#f87171]"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M14 3v4a1 1 0 0 0 1 1h4" />
                <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z" />
              </svg>
              PDF
            </button>
          </div>
        </div>

        <form onSubmit={onSearch} className="flex max-w-xl gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="نام مسافر یا کد ملی"
            className="flex-1 rounded-[10px] border border-[#28344c] bg-[#0f1726] px-3.5 py-2.5 text-sm text-[#e7ecf3] outline-none placeholder:text-[#6b7b94] focus:border-[#3b82f6]"
          />
          <button
            type="submit"
            disabled={searching || query.trim().length < 2}
            className="rounded-[10px] bg-[#3b82f6] px-6 py-2.5 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-60"
          >
            {searching ? 'در حال جستجو…' : 'جستجو'}
          </button>
        </form>

        {quickNames.length > 0 && (
          <div className="mt-3.5 flex flex-wrap items-center gap-[7px]">
            <span className="text-[11px] text-[#6b7b94]">جستجوی سریع:</span>
            {quickNames.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => onQuickName(name)}
                className="rounded-[14px] border border-[#28344c] bg-[#18223a] px-2.5 py-1 text-[11px] text-[#9fb0c7] hover:text-white"
              >
                {name}
              </button>
            ))}
          </div>
        )}

        {error && (
          <p role="alert" className="mt-4 text-xs text-[#f87171]">
            {error}
          </p>
        )}

        {hits !== null && hits.length === 0 && (
          <div className="mt-6 rounded-xl border border-dashed border-[#28344c] p-5 text-center text-xs text-[#6b7b94]">
            مسافری با این نام یافت نشد.
          </div>
        )}

        {hits !== null && hits.length > 0 && (
          <div className="mt-6 flex flex-col gap-4">
            {hitsPager.pageItems.map((h) => (
              <div
                key={`${h.pnr}-${h.fullName}`}
                className="overflow-hidden rounded-[14px] border border-[#22304a] bg-[#0f1726]"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1a2436] bg-[#18223a] px-4 py-3">
                  <div>
                    <div className="text-sm font-extrabold text-[#e7ecf3]">{h.fullName}</div>
                    {h.maskedNationalId && (
                      <div className="ltr font-num mt-0.5 text-[11px] text-[#6b7b94]">
                        کد ملی: {faDigits(h.maskedNationalId)}
                      </div>
                    )}
                  </div>
                  <span className="rounded-full bg-[rgba(59,130,246,.14)] px-3 py-1 text-[11px] font-bold text-[#60a5fa]">
                    {STATUS_LABEL[h.status] ?? h.status}
                  </span>
                </div>
                <dl className="grid grid-cols-2 gap-x-5 gap-y-4 p-4 text-xs md:grid-cols-4">
                  <div>
                    <dt className="text-[10px] text-[#6b7b94]">کد رزرو (PNR)</dt>
                    <dd className="ltr font-num mt-1 font-bold text-[#e7ecf3]">{h.pnr}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] text-[#6b7b94]">شماره پرواز</dt>
                    <dd className="ltr font-num mt-1 font-bold text-[#e7ecf3]">{h.flightNo}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] text-[#6b7b94]">مسیر</dt>
                    <dd className="ltr font-num mt-1 font-bold text-[#e7ecf3]">
                      {h.originCode} → {h.destCode}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] text-[#6b7b94]">ایرلاین</dt>
                    <dd className="mt-1 font-bold text-[#e7ecf3]">blujet</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] text-[#6b7b94]">تاریخ پرواز</dt>
                    <dd className="font-num mt-1 font-bold text-[#e7ecf3]">{formatJalaliDate(h.departureAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] text-[#6b7b94]">ساعت</dt>
                    <dd className="font-num mt-1 font-bold text-[#e7ecf3]">
                      {formatJalaliDateTime(h.departureAt).split(' ')[1] ?? ''}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] text-[#6b7b94]">صندلی / کلاس</dt>
                    <dd className="mt-1 font-bold text-[#e7ecf3]">
                      {h.seatCode ? `${faDigits(h.seatCode)} · ` : ''}
                      {h.cabin === 'BUSINESS' ? 'بیزنس' : h.cabin === 'COMFORT' ? 'کامفورت' : h.cabin === 'ECONOMY' ? 'اکونومی' : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] text-[#6b7b94]">مبلغ بلیط</dt>
                    <dd className="font-num mt-1 font-bold text-[#34d399]">{faMoney(h.priceIrr)} تومان</dd>
                  </div>
                </dl>
              </div>
            ))}
            <Pagination
              page={hitsPager.page}
              totalPages={hitsPager.totalPages}
              onChange={hitsPager.setPage}
              variant="dark"
            />
          </div>
        )}
      </div>
    </div>
  );
}
