import { useEffect, useMemo, useState } from 'react';
import { fetchManagerReportsPaged } from '../../api/audit';
import JalaliDatePicker from '../../components/JalaliDatePicker';
import Pagination from '../../components/Pagination';
import { usePagination } from '../../hooks/usePagination';
import { useAuth } from '../../hooks/useAuth';
import { faDigits } from '../../lib/fa-format';
import { dayjs, formatJalaliDateTime } from '../../lib/jalali';
import type { ManagerReportRow } from '../../types/audit';

const ROLE_LABEL: Record<string, string> = {
  CEO: 'مدیر عامل',
  BOARD_CHAIR: 'رئیس هیئت مدیره',
  SENIOR_MANAGER: 'مدیر ارشد',
  FINANCE_MANAGER: 'مدیر مالی',
  COMMERCIAL_MANAGER: 'مدیر بازرگانی',
  IT_MANAGER: 'مدیر فناوری اطلاعات',
  SITE_ADMIN: 'ادمین سایت',
  EMPLOYEE: 'کارمند',
  AGENCY: 'آژانس',
};

const CATEGORY_META: Record<string, { label: string; color: string; bg: string }> = {
  FINANCE: { label: 'مالی', color: '#a855f7', bg: 'rgba(168,85,247,.14)' },
  AGENCY: { label: 'آژانس', color: '#34d399', bg: 'rgba(16,185,129,.14)' },
  ACCOUNT: { label: 'حساب کاربری', color: '#60a5fa', bg: 'rgba(59,130,246,.14)' },
  SECURITY: { label: 'امنیت', color: '#f87171', bg: 'rgba(248,113,113,.14)' },
  ACCESS: { label: 'دسترسی', color: '#f59e0b', bg: 'rgba(245,158,11,.14)' },
  SYSTEM: { label: 'فنی/سامانه', color: '#22d3ee', bg: 'rgba(34,211,238,.14)' },
  RESERVATION: { label: 'رزرواسیون', color: '#60a5fa', bg: 'rgba(59,130,246,.14)' },
  CLUB: { label: 'باشگاه VIP', color: '#fbbf24', bg: 'rgba(251,191,36,.14)' },
  PRICING: { label: 'نرخ‌گذاری', color: '#60a5fa', bg: 'rgba(59,130,246,.14)' },
  REFUND: { label: 'استرداد', color: '#f87171', bg: 'rgba(248,113,113,.14)' },
};

const ROLE_AVATAR: Record<string, string> = {
  COMMERCIAL_MANAGER: 'linear-gradient(135deg,#2563eb,#1e40af)',
  FINANCE_MANAGER: 'linear-gradient(135deg,#7c3aed,#5b21b6)',
  IT_MANAGER: 'linear-gradient(135deg,#0891b2,#155e75)',
  SITE_ADMIN: 'linear-gradient(135deg,#059669,#065f46)',
};

/** Design chips: همه مدیران / بازرگانی / مالی / IT */
const UNIT_FILTERS: { key: string | null; label: string; role?: string }[] = [
  { key: null, label: 'همه مدیران' },
  { key: 'commercial', label: 'بازرگانی', role: 'COMMERCIAL_MANAGER' },
  { key: 'finance', label: 'مالی', role: 'FINANCE_MANAGER' },
  { key: 'it', label: 'IT', role: 'IT_MANAGER' },
];

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('');
}

function isSameJalaliDay(iso: string, dayIso: string): boolean {
  const a = dayjs(iso).calendar('jalali');
  const b = dayjs(dayIso).calendar('jalali');
  return a.year() === b.year() && a.month() === b.month() && a.date() === b.date();
}

function isToday(iso: string): boolean {
  return isSameJalaliDay(iso, new Date().toISOString());
}

export default function ManagerReportsPage() {
  const { user } = useAuth();
  const dark =
    user?.role === 'CEO' ||
    user?.role === 'BOARD_CHAIR' ||
    user?.role === 'SENIOR_MANAGER';

  const [rows, setRows] = useState<ManagerReportRow[] | null>(null);
  const [unitFilter, setUnitFilter] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [dayIso, setDayIso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const actorRole = UNIT_FILTERS.find((f) => f.key === unitFilter)?.role;

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      fetchManagerReportsPaged({
        actorRole: actorRole ?? undefined,
        q: q.trim() || undefined,
        dateFrom: dayIso ?? undefined,
        page: 1,
        limit: 100,
      })
        .then(({ data }) => {
          if (!cancelled) {
            setRows(data);
            setError(null);
          }
        })
        .catch(() => {
          if (!cancelled) setError('خطا در دریافت گزارش مدیران.');
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [actorRole, q, dayIso]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    if (!dayIso) return rows;
    return rows.filter((r) => isSameJalaliDay(r.createdAt, dayIso));
  }, [rows, dayIso]);

  const filteredPager = usePagination(filtered);

  const kpis = useMemo(() => {
    const all = rows ?? [];
    const todayCount = all.filter((r) => isToday(r.createdAt)).length;
    const managers = new Set(
      all.map((r) => r.actorName?.trim() || r.actorId).filter(Boolean),
    );
    return {
      total: all.length,
      today: todayCount,
      managers: managers.size,
    };
  }, [rows]);

  const isFiltered = unitFilter !== null || !!q.trim() || !!dayIso;

  if (error && !dark) return <p className="p-8 text-sm text-danger">{error}</p>;

  const shell = dark ? 'px-[21px] pb-[34px] pt-[18px]' : 'p-8';

  return (
    <div className={shell}>
      {dark ? (
        <div className="mb-5">
          <h1 className="text-[20.5px] font-black text-white">گزارش عملکرد مدیران</h1>
          <p className="mt-1 text-[11.5px] text-[#6b7b94]">
            اقدامات کلیدی مدیران واحدهای زیرمجموعه که برای مدیر عامل ثبت و ارسال شده است
          </p>
        </div>
      ) : (
        <>
          <h1 className="mb-1 text-xl font-black text-ink">گزارش مدیران</h1>
          <p className="mb-6 text-sm text-muted">
            فعالیت‌های ثبت‌شدهٔ مدیران و ادمین‌ها — از دفتر رویدادهای واقعی سامانه
          </p>
        </>
      )}

      {error && dark && (
        <p className="mb-4 rounded-lg bg-[rgba(248,113,113,.12)] p-3 text-sm text-[#f87171]">
          {error}
        </p>
      )}

      {dark && (
        <div className="mb-[15px] grid grid-cols-1 gap-[13px] sm:grid-cols-3">
          <KpiCard label="کل گزارش‌ها" value={faDigits(kpis.total)} valueClass="text-white" />
          <KpiCard label="اقدامات امروز" value={faDigits(kpis.today)} valueClass="text-[#34d399]" />
          <KpiCard label="مدیران فعال" value={faDigits(kpis.managers)} valueClass="text-[#60a5fa]" />
        </div>
      )}

      <section
        className={
          dark
            ? 'rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-[15px]'
            : ''
        }
      >
        {dark && (
          <div className="mb-3.5 flex flex-wrap items-start justify-between gap-2.5">
            <div>
              <h2 className="m-0 text-[14.5px] font-extrabold text-white">اقدامات کلیدی مدیران</h2>
              <p className="mt-1 text-[11.5px] text-[#6b7b94]">
                هر اقدام مهم مدیران واحدها به‌صورت خودکار برای مدیر عامل ثبت می‌شود.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {UNIT_FILTERS.map((f) => {
                const on = unitFilter === f.key;
                return (
                  <button
                    key={f.key ?? 'all'}
                    type="button"
                    onClick={() => setUnitFilter(f.key)}
                    className={`rounded-[9px] px-[13px] py-[7px] text-[11px] transition ${
                      on
                        ? 'bg-[#3b82f6] font-extrabold text-white'
                        : 'bg-[#18223a] font-medium text-[#9fb0c7]'
                    }`}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div
          className={
            dark
              ? 'mb-3.5 flex flex-wrap items-center gap-2.5'
              : 'mb-4 flex flex-wrap items-center gap-2'
          }
        >
          <div className={dark ? 'relative min-w-[210px] flex-1' : ''}>
            {dark && (
              <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-[#6b7b94]">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="7" />
                  <path d="M21 21l-4.3-4.3" />
                </svg>
              </span>
            )}
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={dark ? 'جستجو در نام مدیر، اقدام یا شرح…' : 'جستجو در اقدامات…'}
              className={
                dark
                  ? 'h-[42px] w-full rounded-[10px] border border-[#2a3550] bg-[#0f1626] px-9 text-xs text-[#e7ecf3] outline-none placeholder:text-[#6b7b94] focus:border-[#3b82f6]'
                  : 'w-64 rounded-lg border border-border bg-white px-3.5 py-2 text-xs outline-none focus:border-accent'
              }
            />
            {dark && q && (
              <button
                type="button"
                aria-label="پاک کردن جستجو"
                onClick={() => setQ('')}
                className="absolute end-3 top-1/2 -translate-y-1/2 text-[15px] leading-none text-[#6b7b94] hover:text-white"
              >
                ×
              </button>
            )}
          </div>

          {dark ? (
            <>
              <div className="rounded-[10px] border border-[#2a3550] bg-[#0f1626]">
                <JalaliDatePicker
                  label="روز"
                  value={dayIso}
                  onChange={setDayIso}
                  placeholder="همهٔ روزها"
                  theme="dark"
                  compact
                  testId="mgr-day-picker"
                />
              </div>
              {dayIso && (
                <button
                  type="button"
                  onClick={() => setDayIso(null)}
                  className="rounded-[10px] border border-[#2a3550] bg-[#0f1626] px-3 py-2.5 text-[11px] font-bold text-[#9fb0c7]"
                >
                  همهٔ روزها
                </button>
              )}
              {isFiltered && (
                <button
                  type="button"
                  onClick={() => {
                    setUnitFilter(null);
                    setQ('');
                    setDayIso(null);
                  }}
                  className="px-3 py-2.5 text-[11px] font-bold text-[#f87171]"
                >
                  پاک‌کردن فیلترها
                </button>
              )}
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setUnitFilter(null)}
                className={`rounded-lg px-3 py-2 text-[11px] transition ${
                  unitFilter === null
                    ? 'bg-accent font-bold text-white'
                    : 'bg-body text-muted hover:text-ink'
                }`}
              >
                همه نقش‌ها
              </button>
              {UNIT_FILTERS.filter((f) => f.role).map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setUnitFilter(unitFilter === f.key ? null : f.key)}
                  className={`rounded-lg px-3 py-2 text-[11px] transition ${
                    unitFilter === f.key
                      ? 'bg-accent font-bold text-white'
                      : 'bg-body text-muted hover:text-ink'
                  }`}
                >
                  {ROLE_LABEL[f.role!]}
                </button>
              ))}
            </>
          )}
        </div>

        {rows === null ? (
          <p className={`text-sm ${dark ? 'text-[#6b7b94]' : 'text-muted'}`}>در حال بارگذاری…</p>
        ) : (
          <>
            {dark && (
              <div className="mb-2.5 text-[11.5px] text-[#6b7b94]">
                نمایش <span className="font-extrabold text-[#cdd9ec]">{faDigits(filtered.length)}</span>{' '}
                گزارش
              </div>
            )}

            {filtered.length === 0 ? (
              <div
                className={
                  dark
                    ? 'px-3 py-6 text-center text-xs text-[#6b7b94]'
                    : 'rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted'
                }
              >
                {dark
                  ? isFiltered
                    ? 'گزارشی برای این فیلتر یافت نشد.'
                    : 'گزارشی وجود ندارد'
                  : 'گزارشی با این فیلتر یافت نشد.'}
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {!dark && (
                  <div className="text-xs text-muted">
                    <span className="font-num font-bold text-ink">{faDigits(filtered.length)}</span>{' '}
                    گزارش
                  </div>
                )}
                {filteredPager.pageItems.map((r) =>
                  dark ? (
                    <DarkReportCard key={r.id} row={r} />
                  ) : (
                    <LightReportCard key={r.id} row={r} />
                  ),
                )}
              </div>
            )}
            <Pagination
              page={filteredPager.page}
              totalPages={filteredPager.totalPages}
              onChange={filteredPager.setPage}
              variant={dark ? 'dark' : 'light'}
            />
          </>
        )}
      </section>
    </div>
  );
}

function KpiCard({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass: string;
}) {
  return (
    <div className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] px-[18px] py-4">
      <div className="mb-2 text-[11.5px] text-[#6b7b94]">{label}</div>
      <div className={`font-num text-[26px] font-black leading-none ${valueClass}`}>{value}</div>
    </div>
  );
}

function DarkReportCard({ row }: { row: ManagerReportRow }) {
  const cat = CATEGORY_META[row.category] ?? {
    label: row.category,
    color: '#9fb0c7',
    bg: 'rgba(159,176,199,.12)',
  };
  const name = row.actorName?.trim() || ROLE_LABEL[row.actorRole] || row.actorRole;
  return (
    <div className="flex gap-[13px] rounded-[13px] border border-[#1f2a3d] px-3.5 py-[13px]">
      <span
        className="flex h-11 w-11 flex-none items-center justify-center rounded-xl text-[13px] font-extrabold text-white"
        style={{ background: ROLE_AVATAR[row.actorRole] ?? 'linear-gradient(135deg,#059669,#065f46)' }}
      >
        {initials(name) || '—'}
      </span>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-extrabold text-white">{row.action}</span>
            <span
              className="rounded-[14px] px-[9px] py-[3px] text-[10px] font-bold"
              style={{ color: cat.color, background: cat.bg }}
            >
              {cat.label}
            </span>
          </div>
          <span className="font-num flex-none text-[10.5px] text-[#6b7b94]">
            {formatJalaliDateTime(row.createdAt)}
          </span>
        </div>
        <div className="mb-1.5 text-[11.5px] leading-[1.8] text-[#9fb0c7]">{row.detail}</div>
        <div className="text-[11px] text-[#6b7b94]">
          توسط <span className="font-bold text-[#cdd9ec]">{name}</span> ·{' '}
          {ROLE_LABEL[row.actorRole] ?? row.actorRole}
        </div>
      </div>
    </div>
  );
}

function LightReportCard({ row }: { row: ManagerReportRow }) {
  return (
    <div className="rounded-xl border border-border bg-white p-4">
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-extrabold text-ink">{row.action}</span>
        <span className="rounded-full bg-accent/10 px-2.5 py-0.5 text-[10px] font-bold text-accent">
          {CATEGORY_META[row.category]?.label ?? row.category}
        </span>
        <span className="rounded-full bg-body px-2.5 py-0.5 text-[10px] font-bold text-muted">
          {ROLE_LABEL[row.actorRole] ?? row.actorRole}
        </span>
      </div>
      <div className="text-[11.5px] leading-6 text-text-2">{row.detail}</div>
      <div className="font-num mt-2 text-[10.5px] text-muted">{formatJalaliDateTime(row.createdAt)}</div>
    </div>
  );
}
