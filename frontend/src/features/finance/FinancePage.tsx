import { useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useOutletContext } from 'react-router-dom';
import {
  fetchAgencySettlements,
  fetchCompletedFlightsSummary,
  fetchFinanceDashboardStats,
  fetchFlightSales,
  fetchKpis,
  fetchRecentTransactions,
  fetchRevenueMix,
  fetchSalesChart,
} from '../../api/reporting';
import { fetchEmployeeContext } from '../../api/panels';
import { fetchCommercialPricing, runAiAnalysis } from '../../api/pricing';
import Pagination from '../../components/Pagination';
import { usePagination } from '../../hooks/usePagination';
import type { PanelShellContext } from '../../types/panel-shell';
import { remindAgencyInvoice } from '../../api/agencies';
import { fetchReconciliationQueue, resolveReconciliation } from '../../api/reconciliation';
import {
  faDigits,
  faMoney,
  faMoneyCompact,
  faMoneyCompactNumber,
  faPercent,
  latinDigits,
} from '../../lib/fa-format';
import { dayjs, formatJalaliDate, formatJalaliDateTime } from '../../lib/jalali';
import SalesBarChart from '../../components/SalesBarChart';
import SalesChartControls from '../../components/SalesChartControls';
import LowSalesBanner from '../../components/LowSalesBanner';
import { useSalesChartQuery } from '../../hooks/useSalesChartQuery';
import type {
  AgencySettlementsResult,
  CompletedFlightsSummary,
  FinanceDashboardStats,
  FlightSalesRow,
  KpiResult,
  RecentTransactionsResult,
  RevenueMixResult,
  SalesChartPeriod,
  SettlementStatus,
} from '../../types/reporting';
import type { ReconciliationItem } from '../../types/reconciliation';

const SETTLEMENT_STATUS: Record<SettlementStatus, { label: string; className: string }> = {
  SETTLED: { label: 'تسویه شد', className: 'bg-[#10b98124] text-[#34d399]' },
  PENDING: { label: 'در انتظار پرداخت', className: 'bg-[#f59e0b24] text-[#fbbf24]' },
  OVERDUE: { label: 'معوق', className: 'bg-[#f8717124] text-[#f87171]' },
};

const MIX_COLORS_LIGHT: Record<string, string> = {
  SYSTEM: '#1668c4',
  CHARTER: '#a855f7',
  AGENCY: '#34d399',
};

const MIX_COLORS_DARK: Record<string, string> = {
  SYSTEM: '#3b82f6',
  CHARTER: '#a855f7',
  AGENCY: '#34d399',
};

function compactFinanceMoney(amountIrr: number | string): string {
  const toman = Number(amountIrr) / 10;
  const format = (value: number, maximumFractionDigits: number) =>
    faDigits(value.toLocaleString('en-US', { maximumFractionDigits }).replace(/,/g, '٬').replace('.', '٫'));

  if (Math.abs(toman) >= 1_000_000_000) return `${format(toman / 1_000_000_000, 1)} میلیارد`;
  if (Math.abs(toman) >= 1_000_000) return `${format(toman / 1_000_000, 0)} میلیون`;
  return `${format(toman, 0)} تومان`;
}

function agencyInitials(name: string): string {
  return name
    .replace(/^آژانس\s+/, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('');
}

function RevenueMixCard({ mix, theme = 'light' }: { mix: RevenueMixResult; theme?: 'light' | 'dark' }) {
  const colors = theme === 'dark' ? MIX_COLORS_DARK : MIX_COLORS_LIGHT;
  const dark = theme === 'dark';
  const [c0, c1] = [mix.channels[0]?.pct ?? 0, (mix.channels[0]?.pct ?? 0) + (mix.channels[1]?.pct ?? 0)];
  const gradient = `conic-gradient(${colors.SYSTEM} 0% ${c0}%, ${colors.CHARTER} ${c0}% ${c1}%, ${colors.AGENCY} ${c1}% 100%)`;
  return (
    <div
      data-testid="finance-revenue-mix"
      className={
        dark
          ? 'rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-5'
          : 'rounded-xl border border-border bg-white p-5'
      }
    >
      <div className={`mb-1 text-sm font-bold ${dark ? 'text-white' : 'text-ink'}`}>ترکیب درآمد</div>
      <div className={`mb-4 text-[11px] ${dark ? 'text-[#6b7b94]' : 'text-muted'}`}>بر اساس کانال فروش</div>
      <div className="mb-4 flex items-center justify-center">
        <div
          className="flex h-36 w-36 items-center justify-center rounded-full"
          style={{ background: gradient }}
          role="img"
          aria-label="نمودار ترکیب درآمد"
        >
          <div
            className={`flex h-[88px] w-[88px] flex-col items-center justify-center rounded-full ${
              dark ? 'bg-[#141d2e]' : 'bg-white'
            }`}
          >
            <span className={`font-num text-xs font-black ${dark ? 'text-white' : 'text-ink'}`}>
              {dark ? faMoneyCompact(mix.totalIrr) : faMoney(mix.totalIrr)}
            </span>
            <span className={`text-[9px] ${dark ? 'text-[#6b7b94]' : 'text-muted'}`}>
              {dark ? 'کل' : 'کل (تومان)'}
            </span>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-2.5">
        {mix.channels.map((c) => (
          <div
            key={c.channel}
            className={`flex items-center justify-between gap-2 text-xs ${dark ? 'text-[#e7ecf3]' : ''}`}
          >
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: colors[c.channel] }} />
              {c.labelFa}
            </span>
            <span className="flex items-center gap-2">
              <span className={`font-num font-bold ${dark ? 'text-white' : ''}`}>
                {dark ? faMoneyCompact(c.amountIrr) : faMoney(c.amountIrr)}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  dark
                    ? 'border border-[#28344c] bg-[#18223a] text-[#9fb0c7]'
                    : 'bg-body text-muted'
                }`}
              >
                {faPercent(c.pct)}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const TX_STATUS_CLASS: Record<string, string> = {
  success: 'bg-[#10b98124] text-[#34d399]',
  warning: 'bg-[#f59e0b24] text-[#fbbf24]',
  danger: 'bg-[#f8717124] text-[#f87171]',
};

const TX_ICON_CLASS: Record<string, string> = {
  SALE: 'bg-[#3b82f624] text-[#60a5fa]',
  SETTLEMENT: 'bg-[#10b98124] text-[#34d399]',
  COMMISSION: 'bg-[#f59e0b24] text-[#fbbf24]',
  REFUND: 'bg-[#f8717124] text-[#f87171]',
};

function trendBadge(pct: number): string {
  if (pct === 0) return '۰٪';
  return `${pct > 0 ? '+' : '−'}${faDigits(Math.abs(pct))}٪`;
}

function FinanceKpiCard({
  kind,
  label,
  value,
  badge,
}: {
  kind: 'revenue' | 'profit' | 'cost' | 'debt';
  label: string;
  value: string;
  badge: string;
}) {
  const iconTone = {
    revenue: 'bg-[#34d39924] text-[#34d399]',
    profit: 'bg-[#3b82f624] text-[#60a5fa]',
    cost: 'bg-[#f59e0b24] text-[#f59e0b]',
    debt: 'bg-[#f8717124] text-[#f87171]',
  }[kind];
  const badgeTone = {
    revenue: 'bg-[#34d3991f] text-[#34d399]',
    profit: 'bg-[#34d3991f] text-[#34d399]',
    cost: 'bg-[#f59e0b1f] text-[#f59e0b]',
    debt: 'bg-[#f871711f] text-[#f87171]',
  }[kind];

  return (
    <article
      className="rounded-[14px] border border-white/10 bg-panel-surface p-3"
      data-testid={`finance-kpi-${kind}`}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className={`flex h-10 w-10 items-center justify-center rounded-[11px] ${iconTone}`}>
          {kind === 'revenue' && (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
              <path d="M12 3v18" />
              <path d="M16.5 7.5C16.5 6 14.7 5 12.5 5S8.5 6 8.5 7.8 10.2 10 12.5 10.4 16.5 11.5 16.5 13.5 14.7 16 12.5 16 8.5 15 8.5 13.5" />
            </svg>
          )}
          {kind === 'profit' && (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 17l6-6 4 4 8-8" />
              <path d="M17 7h4v4" />
            </svg>
          )}
          {kind === 'cost' && (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 7l9-4 9 4-9 4-9-4z" />
              <path d="M3 7v10l9 4 9-4V7" />
            </svg>
          )}
          {kind === 'debt' && (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 8v4l3 2" />
              <circle cx="12" cy="12" r="9" />
            </svg>
          )}
        </span>
        <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${badgeTone}`}>{badge}</span>
      </div>
      <div className="font-num text-[21.5px] font-black leading-none text-panel-ink">{value}</div>
      <div className="mt-1 text-[11px] text-panel-muted">{label}</div>
    </article>
  );
}

/** صف مغایرت‌های پرداخت — no design mock exists for this (it's a Phase 13
 * backend-only addition: a real "payment succeeded, ticket not issued"
 * queue), so this is a new, functionally-styled card rather than a
 * redesign of an existing one — same approach as other un-mocked
 * backend-only controls added later in this project. */
function ReconciliationQueueCard({
  items,
  onResolve,
}: {
  items: ReconciliationItem[];
  onResolve: (id: string, note: string) => Promise<void>;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const itemsPager = usePagination(items);

  async function submit(id: string) {
    if (note.trim().length < 3) {
      setError('توضیح رفع مغایرت باید حداقل ۳ نویسه باشد.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await onResolve(id, note.trim());
      setOpenId(null);
      setNote('');
    } catch {
      setError('خطا در رفع مغایرت.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-[14px] border border-white/10 bg-panel-surface p-[15px]">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h2 className="text-[14.5px] font-extrabold text-panel-ink">صف مغایرت‌های پرداخت</h2>
        <span className="rounded-full bg-[#f871711f] px-3 py-1 text-[11px] font-extrabold text-[#f87171]">
          {faDigits(items.length)} مورد
        </span>
      </div>
      <p className="mb-4 text-[11px] text-panel-muted">
        پرداخت‌هایی که با موفقیت انجام شده‌اند اما صدور بلیط آن‌ها کامل نشده است
      </p>
      {items.length === 0 && (
        <p className="rounded-xl border border-dashed border-white/10 bg-panel-canvas/60 px-4 py-6 text-center text-xs text-panel-muted">
          موردی برای بررسی وجود ندارد.
        </p>
      )}
      <div className="flex flex-col gap-3">
        {itemsPager.pageItems.map((item) => (
          <div
            key={item.id}
            data-testid="reconciliation-item"
            className="rounded-xl border border-white/10 bg-panel-canvas/70 px-4 py-3"
          >
            <div className="flex flex-wrap items-center gap-4">
              <div className="min-w-[110px] text-xs">
                <div className="text-[9px] text-panel-muted">کد رزرو</div>
                <div className="font-num font-extrabold text-panel-ink">{item.pnr}</div>
              </div>
              <div className="min-w-[110px] text-xs">
                <div className="text-[9px] text-panel-muted">شناسه درگاه</div>
                <div className="font-num font-bold text-[#cdd7e5]">{item.gatewayRefId}</div>
              </div>
              <div className="min-w-[110px] text-xs">
                <div className="text-[9px] text-panel-muted">مبلغ</div>
                <div className="font-num font-bold text-[#cdd7e5]">{faMoney(item.amountIrr)} تومان</div>
              </div>
              <div className="min-w-[110px] text-xs">
                <div className="text-[9px] text-panel-muted">تاریخ</div>
                <div className="text-[#cdd7e5]">{formatJalaliDateTime(item.createdAt)}</div>
              </div>
              <button
                onClick={() => {
                  setOpenId(openId === item.id ? null : item.id);
                  setError(null);
                  setNote('');
                }}
                className="mr-auto rounded-lg border border-[#3b82f64d] bg-[#3b82f61f] px-3 py-1.5 text-[11px] font-extrabold text-[#60a5fa] transition hover:bg-[#3b82f633]"
              >
                رفع مغایرت
              </button>
            </div>
            {openId === item.id && (
              <div className="mt-3 flex flex-col gap-2 border-t border-white/10 pt-3">
                {error && <p role="alert" className="text-[11px] text-[#f87171]">{error}</p>}
                <textarea
                  data-testid="reconciliation-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="توضیح رفع مغایرت (مثلاً: بلیط دستی صادر و مغایرت رفع شد.)"
                  className="w-full rounded-lg border border-white/10 bg-panel-surface-2 p-2 text-xs text-panel-ink outline-none placeholder:text-panel-muted-2 focus:border-accent"
                  rows={2}
                />
                <button
                  disabled={busy}
                  onClick={() => void submit(item.id)}
                  className="self-start rounded-lg bg-accent px-4 py-1.5 text-[11px] font-extrabold text-white transition hover:bg-[#2878d5] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? 'در حال ثبت…' : 'ثبت رفع مغایرت'}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      <Pagination
        page={itemsPager.page}
        totalPages={itemsPager.totalPages}
        onChange={itemsPager.setPage}
        variant="dark"
      />
    </section>
  );
}

/** FINANCE_MANAGER's finance-ops layout — the only panel with transactions
 * and agency settlements, per the design. */
function FinanceOpsView() {
  const { lowSalesAlerts = [] } = useOutletContext<PanelShellContext>();
  const bannerAlert = lowSalesAlerts[0] ?? null;
  const [kpis, setKpis] = useState<KpiResult | null>(null);
  const [flights, setFlights] = useState<CompletedFlightsSummary | null>(null);
  const [tx, setTx] = useState<RecentTransactionsResult | null>(null);
  const [mix, setMix] = useState<RevenueMixResult | null>(null);
  const [settlements, setSettlements] = useState<AgencySettlementsResult | null>(null);
  const [reconciliation, setReconciliation] = useState<ReconciliationItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [remindingAgencyId, setRemindingAgencyId] = useState<string | null>(null);

  const txPager = usePagination(tx?.rows ?? []);
  const settlementsPager = usePagination(settlements?.rows ?? []);

  useEffect(() => {
    const financeQuery = { granularity: 'year' as const };
    let cancelled = false;
    Promise.all([
      fetchKpis(financeQuery),
      fetchCompletedFlightsSummary(financeQuery),
      fetchRecentTransactions(),
      fetchRevenueMix(financeQuery),
      fetchAgencySettlements(),
      fetchReconciliationQueue(),
    ])
      .then(([k, f, t, m, s, r]) => {
        if (cancelled) return;
        setKpis(k);
        setFlights(f);
        setTx(t);
        setMix(m);
        setSettlements(s);
        setReconciliation(r);
        setLoadError(null);
      })
      .catch(() => {
        if (!cancelled) setLoadError('خطا در دریافت اطلاعات مالی.');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function onResolveReconciliation(id: string, note: string) {
    await resolveReconciliation(id, note);
    setReconciliation((prev) => (prev ? prev.filter((r) => r.id !== id) : prev));
  }

  async function onRemind(agencyId: string, invoiceId: string, agencyName: string) {
    setRemindingAgencyId(agencyId);
    setActionError(null);
    setNotice(null);
    try {
      await remindAgencyInvoice(agencyId, invoiceId);
      setNotice(`یادآوری تسویه برای «${agencyName}» ارسال شد ✓`);
    } catch {
      setActionError('خطا در ارسال یادآوری؛ لطفاً دوباره تلاش کنید.');
    } finally {
      setRemindingAgencyId(null);
    }
  }

  if (loadError) return <p className="rounded-xl bg-danger/10 p-4 text-sm text-[#f87171]">{loadError}</p>;
  if (!kpis || !flights || !tx || !mix || !settlements || !reconciliation)
    return <p className="rounded-xl border border-white/10 bg-panel-surface p-8 text-center text-sm text-panel-muted">در حال بارگذاری…</p>;
  const jalaliYear = faDigits(dayjs().calendar('jalali').year());

  const kpiCards = [
    {
      kind: 'revenue' as const,
      label: `کل درآمد · سال ${jalaliYear}`,
      value: compactFinanceMoney(kpis.revenueIrr),
      badge: trendBadge(kpis.trends.revenuePct),
    },
    {
      kind: 'profit' as const,
      label: `سود خالص · حاشیه ${faPercent(kpis.marginPct)}`,
      value: compactFinanceMoney(kpis.profitIrr),
      badge: trendBadge(kpis.trends.profitPct),
    },
    {
      kind: 'cost' as const,
      label: 'هزینه عملیاتی',
      value: compactFinanceMoney(kpis.operatingCostIrr),
      badge: trendBadge(kpis.trends.operatingCostPct),
    },
    {
      kind: 'debt' as const,
      label: 'مطالبات معوق آژانس‌ها',
      value: compactFinanceMoney(kpis.agencyDebtIrr),
      badge: `${faDigits(kpis.agencyDebtCount)} آژانس`,
    },
  ];

  return (
    <div className="flex flex-col gap-[15px]" data-testid="finance-ops-view">
      {notice && (
        <p aria-live="polite" className="rounded-xl border border-[#34d39933] bg-[#10b98118] p-3 text-xs font-bold text-[#34d399]">
          {notice}
        </p>
      )}
      {actionError && (
        <p role="alert" className="rounded-xl border border-[#f8717133] bg-[#f8717118] p-3 text-xs font-bold text-[#f87171]">
          {actionError}
        </p>
      )}

      <div className="grid grid-cols-1 gap-[13px] sm:grid-cols-2 xl:grid-cols-4">
        {kpiCards.map((k) => (
          <FinanceKpiCard key={k.label} {...k} />
        ))}
      </div>

      <LowSalesBanner alert={bannerAlert} variant="dark" />

      <FlightsStrip flights={flights} />

      <div className="grid grid-cols-1 gap-[13px] xl:grid-cols-[1.7fr_1fr]">
        <section className="rounded-[14px] border border-white/10 bg-panel-surface p-[15px]">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-[14.5px] font-extrabold text-panel-ink">تراکنش‌های مالی اخیر</h2>
              <p className="mt-1 text-[11px] text-panel-muted">فروش، تسویه، کمیسیون و استرداد</p>
            </div>
            <span className="rounded-lg border border-white/10 bg-panel-surface-2 px-3 py-1.5 text-[11px] font-bold text-panel-muted">
              {faDigits(tx.totalCount)} تراکنش
            </span>
          </div>
          <div className="mb-3 text-[11px] text-muted">فروش، تسویه، کمیسیون و استرداد</div>
          <div className="flex flex-col divide-y divide-border/60">
            {txPager.pageItems.map((t) => (
              <div key={t.id} className="flex items-center gap-3 py-2.5 text-xs">
                <span
                  className={`flex h-9 w-9 flex-none items-center justify-center rounded-[10px] text-sm ${TX_ICON_CLASS[t.type] ?? 'bg-panel-surface-2 text-panel-muted'}`}
                  aria-hidden="true"
                >
                  {t.type === 'REFUND' ? '↩' : t.type === 'COMMISSION' ? '₪' : '✓'}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-extrabold text-panel-ink">{t.titleFa}</div>
                  <div className="mt-0.5 text-[10px] text-panel-muted">
                    {t.party} · {formatJalaliDateTime(t.occurredAt)}
                  </div>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${TX_STATUS_CLASS[t.statusTone]}`}
                >
                  {t.statusFa}
                </span>
                <span
                  className={`font-num font-black whitespace-nowrap ${
                    Number(t.signedAmountIrr) >= 0 && t.type !== 'REFUND' ? 'text-[#34d399]' : 'text-[#f87171]'
                  }`}
                >
                  {Number(t.signedAmountIrr) >= 0 ? '+' : '−'} {faMoney(Math.abs(Number(t.signedAmountIrr)))}
                </span>
              </div>
            ))}
          </div>
          <Pagination
            page={txPager.page}
            totalPages={txPager.totalPages}
            onChange={txPager.setPage}
            variant="dark"
          />
        </section>
        <RevenueMixCard mix={mix} theme="dark" />
      </div>

      <section className="rounded-[14px] border border-white/10 bg-panel-surface p-[15px]">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-[14.5px] font-extrabold text-panel-ink">تسویه‌حساب آژانس‌های همکار</h2>
            <p className="mt-1 text-[11px] text-panel-muted">وضعیت پرداخت دوره‌ای و مطالبات معوق</p>
          </div>
          <span className="rounded-full bg-[#f871711f] px-3 py-1.5 text-[11px] font-extrabold text-[#f87171]">
            مجموع مطالبات: {faMoney(settlements.outstandingIrr)} تومان
          </span>
        </div>
        <div className="flex flex-col gap-3">
          {settlementsPager.pageItems.map((s) => {
            const st = SETTLEMENT_STATUS[s.status];
            const paidPct = Math.min(Math.max(s.paidPct, 0), 100);
            return (
              <div
                key={s.agencyId}
                className="flex flex-wrap items-center gap-4 rounded-xl border border-white/10 bg-panel-canvas/70 px-4 py-3"
              >
                <span className="flex h-10 w-10 flex-none items-center justify-center rounded-[11px] bg-[#1d2a40] text-xs font-extrabold text-panel-muted">
                  {agencyInitials(s.agencyName)}
                </span>
                <div className="min-w-[150px]">
                  <div className="text-xs font-extrabold text-panel-ink">{s.agencyName}</div>
                  <div className="mt-0.5 text-[10px] text-panel-muted">دوره تسویه جاری</div>
                </div>
                <div className="min-w-[110px] text-xs">
                  <div className="text-[9px] text-panel-muted">مبلغ دوره</div>
                  <div className="font-num mt-0.5 font-bold text-panel-ink">{faMoney(s.totalIrr)} تومان</div>
                </div>
                <div className="min-w-[100px] text-xs">
                  <div className="text-[9px] text-panel-muted">سررسید</div>
                  <div className="mt-0.5 font-bold text-[#cdd7e5]">{s.dueAt ? formatJalaliDate(s.dueAt) : '—'}</div>
                </div>
                <div className="min-w-[140px] flex-1">
                  <div className="mb-1 flex items-center justify-between text-[10px]">
                    <span className="text-panel-muted">پرداخت‌شده</span>
                    <span className={`font-num font-extrabold ${s.status === 'SETTLED' ? 'text-[#34d399]' : s.status === 'OVERDUE' ? 'text-[#f87171]' : 'text-[#fbbf24]'}`}>
                      {faPercent(paidPct)}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded bg-panel-surface-2">
                    <div
                      className={`h-full rounded ${
                        s.status === 'SETTLED'
                          ? 'bg-[#34d399]'
                          : s.status === 'OVERDUE'
                            ? 'bg-[#f87171]'
                            : 'bg-[#f59e0b]'
                      }`}
                      style={{ width: `${paidPct}%` }}
                    />
                  </div>
                </div>
                <span className={`rounded-full px-3 py-1 text-[10px] font-extrabold ${st.className}`}>
                  {st.label}
                  {s.status === 'OVERDUE' && ` — ${faDigits(s.overdueDays)} روز`}
                </span>
                {s.remindInvoiceId && (
                  <button
                    type="button"
                    disabled={remindingAgencyId === s.agencyId}
                    onClick={() => void onRemind(s.agencyId, s.remindInvoiceId!, s.agencyName)}
                    className="rounded-lg border border-[#3b82f64d] bg-[#3b82f61f] px-3 py-2 text-[11px] font-extrabold text-[#60a5fa] transition hover:bg-[#3b82f633] disabled:cursor-wait disabled:opacity-60"
                  >
                    {remindingAgencyId === s.agencyId ? 'در حال ارسال…' : 'ارسال یادآوری'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <Pagination
          page={settlementsPager.page}
          totalPages={settlementsPager.totalPages}
          onChange={settlementsPager.setPage}
          variant="dark"
        />
      </section>

      <ReconciliationQueueCard items={reconciliation} onResolve={onResolveReconciliation} />
    </div>
  );
}

function EmployeeFinanceView() {
  const [permissions, setPermissions] = useState<string[] | null>(null);
  const [stats, setStats] = useState<FinanceDashboardStats | null>(null);
  const [tx, setTx] = useState<RecentTransactionsResult | null>(null);
  const [settlements, setSettlements] = useState<AgencySettlementsResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchEmployeeContext()
      .then(async (context) => {
        if (cancelled) return;
        const keys = context.permissionKeys;
        setPermissions(keys);
        const [dashboardResult, transactionResult, settlementResult] = await Promise.all([
          keys.includes('fn_dashboard') ? fetchFinanceDashboardStats() : Promise.resolve(null),
          keys.includes('fn_transactions') ? fetchRecentTransactions() : Promise.resolve(null),
          keys.includes('fn_settlements') ? fetchAgencySettlements() : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setStats(dashboardResult);
        setTx(transactionResult);
        setSettlements(settlementResult);
      })
      .catch(() => {
        if (!cancelled) setError('خطا در دریافت دسترسی‌ها یا اطلاعات مالی.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return <p role="alert" className="rounded-xl bg-danger/10 p-4 text-sm text-[#f87171]">{error}</p>;
  }
  if (!permissions) {
    return <p className="rounded-xl border border-white/10 bg-panel-surface p-8 text-center text-sm text-panel-muted">در حال بارگذاری…</p>;
  }

  return (
    <div data-testid="employee-finance-view" className="flex flex-col gap-4">
      {stats && (
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ['درآمد ماه جاری', `${faMoney(stats.revenueThisMonthIrr)} تومان`],
            ['آژانس فعال', faDigits(stats.activeAgencies)],
            ['مسافر ماه جاری', faDigits(stats.passengersThisMonth)],
            ['بلیط فروخته‌شده', faDigits(stats.ticketsSoldThisMonth)],
          ].map(([label, value]) => (
            <article key={label} className="rounded-[14px] border border-white/10 bg-panel-surface p-4">
              <div className="font-num text-xl font-black text-panel-ink">{value}</div>
              <div className="mt-1 text-[11px] text-panel-muted">{label}</div>
            </article>
          ))}
        </section>
      )}

      {tx && (
        <section className="rounded-[14px] border border-white/10 bg-panel-surface p-4">
          <h2 className="mb-3 text-sm font-extrabold text-panel-ink">تراکنش‌های مالی اخیر</h2>
          <div className="divide-y divide-white/10">
            {tx.rows.map((row) => (
              <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-xs">
                <span className="font-bold text-panel-ink">{row.titleFa} · {row.party}</span>
                <span className="font-num text-panel-muted">{faMoney(row.signedAmountIrr)} تومان</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {settlements && (
        <section className="rounded-[14px] border border-white/10 bg-panel-surface p-4">
          <h2 className="mb-3 text-sm font-extrabold text-panel-ink">تسویه‌حساب آژانس‌های همکار</h2>
          <div className="divide-y divide-white/10">
            {settlements.rows.map((row) => (
              <div key={row.agencyId} className="flex flex-wrap items-center justify-between gap-2 py-3 text-xs">
                <span className="font-bold text-panel-ink">{row.agencyName}</span>
                <span className="font-num text-panel-muted">{faMoney(row.totalIrr)} تومان</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function chartCaption(granularity: string): string {
  switch (granularity) {
    case 'q3':
      return '۳ ماه اخیر';
    case 'q6':
      return '۶ ماه اخیر';
    case 'year':
      return 'سال جاری';
    case 'month':
      return 'گزارش ماهانه';
    case 'day':
      return 'گزارش روزانه — انتخاب از تقویم';
    case 'flight':
      return 'گزارش مالی بر اساس شماره پرواز';
    default:
      return 'خلاصه فروش';
  }
}

function kpiPeriodLabel(granularity: string): string {
  const year = faDigits(dayjs().calendar('jalali').year());
  switch (granularity) {
    case 'year':
      return `سال ${year}`;
    case 'q6':
      return '۶ ماهه';
    case 'q3':
      return '۳ ماهه';
    case 'month':
      return 'ماهانه';
    case 'day':
      return 'روزانه';
    case 'flight':
      return 'پرواز';
    default:
      return `سال ${year}`;
  }
}

function AnalyticKpiCard({
  label,
  value,
  badge,
  badgeTone,
  iconClass,
  icon,
}: {
  label: string;
  value: string;
  badge: string;
  badgeTone: 'good' | 'warn' | 'danger';
  iconClass: string;
  icon: ReactNode;
}) {
  const badgeClass =
    badgeTone === 'good'
      ? 'bg-[rgba(52,211,153,.12)] text-[#34d399]'
      : badgeTone === 'warn'
        ? 'bg-[rgba(245,158,11,.12)] text-[#f59e0b]'
        : 'bg-[rgba(248,113,113,.12)] text-[#f87171]';
  return (
    <div className="rounded-[14px] border border-panel-border bg-panel-surface p-3 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <span className={`flex h-10 w-10 items-center justify-center rounded-[11px] ${iconClass}`}>
          {icon}
        </span>
        <span className={`rounded-full px-[7px] py-0.5 text-[10.5px] font-bold ${badgeClass}`}>{badge}</span>
      </div>
      <div className="font-num text-[21.5px] font-black leading-tight text-panel-ink">{value}</div>
      <div className="mt-1 text-[11px] text-panel-muted">{label}</div>
    </div>
  );
}

function FlightsStrip({ flights }: { flights: CompletedFlightsSummary }) {
  return (
    <div className="flex flex-wrap items-center gap-5 rounded-[14px] border border-panel-border bg-panel-surface px-4 py-[13px] shadow-sm">
      <div className="flex min-w-[200px] items-center gap-[11px]">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] bg-[rgba(59,130,246,.14)] text-[#60a5fa]">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
            <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
          </svg>
        </span>
        <div>
          <div className="text-[11px] text-[#6b7b94]">پروازهای انجام‌شده</div>
          <div className="font-num mt-0.5 text-[19px] font-black text-panel-ink">
            {faDigits(flights.flightCount)}{' '}
            <span className="text-[10px] font-normal text-[#7c8aa2]">پرواز</span>
          </div>
        </div>
      </div>
      <div className="grid min-w-[300px] flex-1 grid-cols-3 gap-2.5">
        <div className="rounded-xl border border-panel-border bg-panel-surface-2 px-[13px] py-[9px]">
          <div className="text-[9.5px] text-[#6b7b94]">مجموع صندلی پروازها</div>
          <div className="font-num mt-[3px] text-sm font-extrabold text-panel-ink">
            {faDigits(flights.totalSeats)}
          </div>
        </div>
        <div className="rounded-xl border border-panel-border bg-panel-surface-2 px-[13px] py-[9px]">
          <div className="text-[9.5px] text-[#6b7b94]">صندلی فروخته‌شده</div>
          <div className="font-num mt-[3px] text-sm font-extrabold text-[#34d399]">
            {faDigits(flights.soldSeats)}
          </div>
        </div>
        <div className="rounded-xl border border-panel-border bg-panel-surface-2 px-[13px] py-[9px]">
          <div className="text-[9.5px] text-[#6b7b94]">صندلی فروش‌نرفته</div>
          <div className="font-num mt-[3px] text-sm font-extrabold text-[#f87171]">
            {faDigits(flights.unsoldSeats)}
          </div>
        </div>
      </div>
    </div>
  );
}

function ChannelSummaryTiles({
  viewLabel,
  totalIrr,
  systemIrr,
  charterIrr,
  agencyIrr,
  flights,
}: {
  viewLabel: string;
  totalIrr: number | string;
  systemIrr: number | string;
  charterIrr: number | string;
  agencyIrr: number | string;
  flights: CompletedFlightsSummary;
}) {
  const total = Number(totalIrr);
  const useBillionUnit = total >= 10_000_000_000;
  const viewUnit = useBillionUnit ? 'میلیارد تومان' : 'تومان';
  const totalDisplay = useBillionUnit ? faMoneyCompactNumber(total) : faMoneyCompact(total);
  const channelDisplay = (n: number | string) =>
    useBillionUnit ? faMoneyCompactNumber(n) : faMoneyCompact(n);

  return (
    <div className="mb-3.5 flex flex-wrap gap-2.5">
      <div className="min-w-[150px] rounded-xl border border-panel-border bg-panel-surface px-3.5 py-2.5 shadow-sm">
        <div className="text-[9.5px] text-[#6b7b94]">{viewLabel}</div>
        <div className="font-num mt-[3px] text-[19px] font-black text-panel-ink">
          {totalDisplay} <span className="text-[9.5px] font-normal text-[#7c8aa2]">{viewUnit}</span>
        </div>
      </div>
      <div className="grid min-w-[230px] flex-1 grid-cols-3 gap-2">
        <div className="rounded-xl border border-panel-border bg-panel-surface-2 px-[11px] py-[9px]">
          <div className="mb-1 flex items-center gap-1.5 text-[9.5px] text-[#6b7b94]">
            <span className="h-2 w-2 rounded-sm bg-[#3b82f6]" />
            سیستمی
          </div>
          <div className="font-num text-[12.5px] font-extrabold text-[#60a5fa]">
            {channelDisplay(systemIrr)}
          </div>
        </div>
        <div className="rounded-xl border border-panel-border bg-panel-surface-2 px-[11px] py-[9px]">
          <div className="mb-1 flex items-center gap-1.5 text-[9.5px] text-[#6b7b94]">
            <span className="h-2 w-2 rounded-sm bg-[#a855f7]" />
            چارتر
          </div>
          <div className="font-num text-[12.5px] font-extrabold text-[#c084fc]">
            {channelDisplay(charterIrr)}
          </div>
        </div>
        <div className="rounded-xl border border-panel-border bg-panel-surface-2 px-[11px] py-[9px]">
          <div className="mb-1 flex items-center gap-1.5 text-[9.5px] text-[#6b7b94]">
            <span className="h-2 w-2 rounded-sm bg-[#34d399]" />
            آژانس
          </div>
          <div className="font-num text-[12.5px] font-extrabold text-[#34d399]">
            {channelDisplay(agencyIrr)}
          </div>
        </div>
      </div>
      <div className="min-w-[280px] rounded-xl border border-panel-border bg-panel-surface px-3.5 py-2.5 shadow-sm">
        <div className="flex items-baseline justify-between gap-2.5">
          <div className="text-[9.5px] text-[#6b7b94]">پروازهای انجام‌شده</div>
          <div className="font-num text-base font-black text-panel-ink">
            {faDigits(flights.flightCount)}{' '}
            <span className="text-[9px] font-normal text-[#7c8aa2]">پرواز</span>
          </div>
        </div>
        <div className="mt-[7px] grid grid-cols-3 gap-2">
          <div>
            <div className="text-[9px] text-[#6b7b94]">مجموع صندلی</div>
            <div className="font-num mt-0.5 text-xs font-extrabold text-panel-ink">
              {faDigits(flights.totalSeats)}
            </div>
          </div>
          <div>
            <div className="text-[9px] text-[#6b7b94]">فروخته‌شده</div>
            <div className="font-num mt-0.5 text-xs font-extrabold text-[#34d399]">
              {faDigits(flights.soldSeats)}
            </div>
          </div>
          <div>
            <div className="text-[9px] text-[#6b7b94]">فروش‌نرفته</div>
            <div className="font-num mt-0.5 text-xs font-extrabold text-[#f87171]">
              {faDigits(flights.unsoldSeats)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** One card per flight number (design: unique EP-805 / W5-098…), not per date. */
export type AggregatedFlightSales = {
  flightNo: string;
  originCode: string;
  destCode: string;
  originCityFa: string;
  destCityFa: string;
  /** Newest departure among instances — used when flightCount === 1. */
  departureAt: string;
  systemIrr: string;
  charterIrr: string;
  agencyIrr: string;
  totalIrr: string;
  capacity: number;
  soldSeats: number;
  flightCount: number;
};

function sumIrrStrings(amounts: string[]): string {
  let total = 0n;
  for (const a of amounts) {
    const whole = String(a).split('.')[0] || '0';
    total += BigInt(whole);
  }
  return total.toString();
}

/** Collapse instance rows → one row per flightNo (newest-first order preserved). */
export function aggregateFlightSalesByFlightNo(rows: FlightSalesRow[]): AggregatedFlightSales[] {
  const order: string[] = [];
  const groups = new Map<string, FlightSalesRow[]>();
  for (const row of rows) {
    const key = row.flightNo;
    const list = groups.get(key);
    if (list) list.push(row);
    else {
      groups.set(key, [row]);
      order.push(key);
    }
  }
  return order.map((flightNo) => {
    const group = groups.get(flightNo)!;
    // API returns newest departure first; keep that as the representative date.
    const newest = group[0];
    return {
      flightNo,
      originCode: newest.originCode,
      destCode: newest.destCode,
      originCityFa: newest.originCityFa,
      destCityFa: newest.destCityFa,
      departureAt: newest.departureAt,
      systemIrr: sumIrrStrings(group.map((r) => r.systemIrr)),
      charterIrr: sumIrrStrings(group.map((r) => r.charterIrr)),
      agencyIrr: sumIrrStrings(group.map((r) => r.agencyIrr)),
      totalIrr: sumIrrStrings(group.map((r) => r.totalIrr)),
      capacity: group.reduce((s, r) => s + r.capacity, 0),
      soldSeats: group.reduce((s, r) => s + r.soldSeats, 0),
      flightCount: group.length,
    };
  });
}

/**
 * Search-driven list: empty query → no cards; with query → matching flights only.
 * Never dumps the full catalog by default.
 */
export function filterFlightSalesRows(
  rows: AggregatedFlightSales[],
  search: string,
): AggregatedFlightSales[] {
  const raw = search.trim();
  if (!raw) return [];
  const q = latinDigits(raw).toLowerCase();
  return rows.filter((r) => {
    const flightNo = latinDigits(r.flightNo).toLowerCase();
    const route = `${r.originCityFa} ${r.destCityFa} ${r.originCode} ${r.destCode}`.toLowerCase();
    return flightNo.includes(q) || route.includes(q) || r.originCityFa.includes(raw) || r.destCityFa.includes(raw);
  });
}

export type FinancePriceSuggestion = {
  suggestedIrr: string;
  reason: string;
  deltaPct: number | null;
};

function buildFinanceSuggestions(
  flights: Awaited<ReturnType<typeof fetchCommercialPricing>>['flights'],
): Record<string, FinancePriceSuggestion> {
  const out: Record<string, FinancePriceSuggestion> = {};
  for (const f of flights) {
    const flightNo = f.flight.flightNo;
    const currentIrr = BigInt(
      f.pricing?.proposedPriceIrr ?? f.pricing?.registeredPriceIrr ?? f.basePriceIrr ?? '0',
    );
    const ai = f.pricing?.aiSuggestion;
    if (ai?.priceIrr) {
      const suggested = BigInt(Math.round(ai.priceIrr));
      const delta =
        currentIrr > 0n
          ? Number(((suggested - currentIrr) * 100n) / currentIrr)
          : null;
      out[flightNo] = {
        suggestedIrr: suggested.toString(),
        reason: ai.reason,
        deltaPct: delta,
      };
      continue;
    }
    if (!f.competitorPriceIrr) continue;
    const competitor = BigInt(f.competitorPriceIrr);
    const suggested = (competitor * 98n) / 100n;
    const delta =
      currentIrr > 0n ? Number(((suggested - currentIrr) * 100n) / currentIrr) : null;
    out[flightNo] = {
      suggestedIrr: suggested.toString(),
      reason:
        suggested < competitor
          ? 'کاهش برای رقابت با رقبا'
          : 'ظرفیت بازار اجازه می‌دهد',
      deltaPct: delta,
    };
  }
  return out;
}

function FinanceCompetitorAnalysis({
  suggestions,
  state,
  onAnalyze,
}: {
  suggestions: Record<string, FinancePriceSuggestion>;
  state: 'idle' | 'loading' | 'done';
  onAnalyze: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-panel-border bg-panel-surface px-4 py-3.5 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[rgba(168,85,247,.2)] text-[#c084fc]">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <path d="M12 3l1.9 5.8L20 9l-4.8 3.6L17 19l-5-3.6L7 19l1.8-6.4L4 9l6.1-.2L12 3z" />
          </svg>
        </span>
        <div>
          <div className="text-[14.5px] font-extrabold text-panel-ink">تحلیل هوشمند قیمت رقبا</div>
          <div className="mt-0.5 text-[11.5px] text-panel-muted">
            هوش مصنوعی با بررسی قیمت رقبا برای هر پرواز قیمت بهینه پیشنهاد می‌دهد
            {state === 'done' && Object.keys(suggestions).length > 0
              ? ` — ${faDigits(Object.keys(suggestions).length)} پرواز`
              : ''}
          </div>
        </div>
      </div>
      {state === 'loading' ? (
        <span className="flex items-center gap-2 text-[12.5px] font-semibold text-panel-ink">
          <span className="inline-block h-[18px] w-[18px] animate-spin rounded-full border-2 border-white/30 border-t-white" />
          در حال تحلیل رقبا…
        </span>
      ) : state === 'done' ? (
        <button
          type="button"
          onClick={onAnalyze}
          className="rounded-[10px] border border-panel-border px-4 py-2 text-xs font-bold text-panel-ink"
        >
          تحلیل دوباره
        </button>
      ) : (
        <button
          type="button"
          onClick={onAnalyze}
          className="rounded-[10px] bg-[#3b82f6] px-[18px] py-2.5 text-[12.5px] font-extrabold text-white"
        >
          تحلیل و پیشنهاد قیمت
        </button>
      )}
    </div>
  );
}

function FlightSalesPicker({
  rows,
  selectedFlightNo,
  onSelect,
  search,
  onSearchChange,
  priceSuggestions,
}: {
  rows: AggregatedFlightSales[];
  selectedFlightNo: string | null;
  onSelect: (row: AggregatedFlightSales) => void;
  search: string;
  onSearchChange: (v: string) => void;
  priceSuggestions?: Record<string, FinancePriceSuggestion>;
}) {
  const hasQuery = search.trim().length > 0;
  const filtered = filterFlightSalesRows(rows, search);
  const filteredPager = usePagination(filtered);

  if (rows.length === 0) {
    return (
      <div className="px-3.5 py-[22px] text-center text-[11.5px] text-[#6b7b94]">
        پرواز انجام‌شده‌ای ثبت نشده است.
      </div>
    );
  }

  return (
    <div className="pt-[13px]">
      <div className="relative mb-[13px] max-w-[430px]">
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#5b6b84"
          strokeWidth="2"
          className="pointer-events-none absolute right-[11px] top-1/2 -translate-y-1/2"
          aria-hidden
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" />
        </svg>
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="جستجوی شماره پرواز یا مسیر…"
          aria-label="جستجوی شماره پرواز یا مسیر"
          className="w-full rounded-[11px] border border-[#28344c] bg-[#141d2e] py-2.5 pl-3 pr-[34px] text-[11.5px] text-[#e7ecf3] outline-none placeholder:text-[#6b7b94] focus:border-[#3b82f6]"
        />
      </div>
      {!hasQuery ? (
        <div className="px-3.5 py-[18px] text-center text-[11.5px] text-[#6b7b94]">
          شماره پرواز یا مسیر را جستجو کنید.
        </div>
      ) : filtered.length === 0 ? (
        <div className="px-3.5 py-[18px] text-center text-[11.5px] text-[#6b7b94]">
          پروازی با این مشخصات یافت نشد.
        </div>
      ) : (
        <>
          <div
            className="flex max-w-[430px] flex-col gap-[9px]"
            data-testid="flight-sales-list"
          >
            {filteredPager.pageItems.map((r) => {
              const on = r.flightNo === selectedFlightNo;
              const meta =
                r.flightCount > 1
                  ? `${faDigits(r.flightCount)} پرواز`
                  : formatJalaliDate(r.departureAt);
              const sug = priceSuggestions?.[r.flightNo];
              return (
                <button
                  key={r.flightNo}
                  type="button"
                  onClick={() => onSelect(r)}
                  aria-pressed={on}
                  className={`flex w-full items-center justify-between gap-2.5 rounded-xl border px-[13px] py-[11px] text-start transition ${
                    on
                      ? 'border-[#3b82f6] bg-[rgba(59,130,246,.16)] shadow-[0_0_0_1px_rgba(59,130,246,.35)]'
                      : 'border-[#1f2a3d] bg-[#141d2e] hover:border-[#28344c]'
                  }`}
                >
                  <div className="min-w-0 leading-normal">
                    <div className={`text-[12.5px] font-extrabold ${on ? 'text-white' : 'text-[#e7ecf3]'}`}>
                      {r.originCityFa} ← {r.destCityFa}
                    </div>
                    <div className="text-[10px] text-[#6b7b94]">
                      پرواز <span dir="ltr">{r.flightNo}</span> · {meta}
                    </div>
                    {sug && (
                      <div className="mt-1 text-[10px] font-bold text-[#34d399]">
                        پیشنهاد: {faMoney(sug.suggestedIrr)} تومان
                        {sug.deltaPct != null && (
                          <span className={sug.deltaPct >= 0 ? ' text-[#34d399]' : ' text-[#f87171]'}>
                            {' '}
                            {sug.deltaPct >= 0 ? '▲' : '▼'} {faDigits(Math.abs(sug.deltaPct))}٪
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 text-left whitespace-nowrap">
                    <div className="font-num text-xs font-extrabold text-[#60a5fa]">
                      {faMoneyCompact(r.totalIrr)}
                    </div>
                    <div className="text-[9px] text-[#6b7b94]">فروش</div>
                  </div>
                </button>
              );
            })}
          </div>
          <Pagination
            page={filteredPager.page}
            totalPages={filteredPager.totalPages}
            onChange={filteredPager.setPage}
            variant="dark"
          />
        </>
      )}
    </div>
  );
}

/** Analytic مالی view for CEO / Board Chair / Senior / Commercial. */
function FinanceAnalyticView() {
  const chart = useSalesChartQuery({ includeFlightMode: true });
  const isFlightMode = chart.granularity === 'flight';
  const [periods, setPeriods] = useState<SalesChartPeriod[]>([]);
  const [kpis, setKpis] = useState<KpiResult | null>(null);
  const [flights, setFlights] = useState<CompletedFlightsSummary | null>(null);
  const [mix, setMix] = useState<RevenueMixResult | null>(null);
  const [flightRows, setFlightRows] = useState<AggregatedFlightSales[]>([]);
  const [selectedFlightNo, setSelectedFlightNo] = useState<string | null>(null);
  const [flightSearch, setFlightSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [finAiState, setFinAiState] = useState<'idle' | 'loading' | 'done'>('idle');
  const [priceSuggestions, setPriceSuggestions] = useState<Record<string, FinancePriceSuggestion>>({});

  async function analyzeFinancePrices() {
    setFinAiState('loading');
    setError(null);
    try {
      await runAiAnalysis();
      const pricing = await fetchCommercialPricing();
      setPriceSuggestions(buildFinanceSuggestions(pricing.flights));
      setFinAiState('done');
    } catch {
      setError('تحلیل قیمت رقبا انجام نشد؛ دوباره تلاش کنید.');
      setFinAiState('idle');
    }
  }

  // Bar / day / month modes: existing chart + period-scoped KPIs.
  useEffect(() => {
    if (isFlightMode) return;
    if (!chart.isQueryReady) {
      setPeriods([]);
      return;
    }

    let cancelled = false;
    Promise.allSettled([
      fetchSalesChart(chart.query),
      fetchKpis(chart.query),
      fetchCompletedFlightsSummary(chart.query),
      fetchRevenueMix(chart.query),
    ])
      .then(([chartResult, kpiResult, flightsResult, mixResult]) => {
        if (cancelled) return;
        setPeriods(chartResult.status === 'fulfilled' ? chartResult.value : []);
        setKpis(kpiResult.status === 'fulfilled' ? kpiResult.value : null);
        setFlights(flightsResult.status === 'fulfilled' ? flightsResult.value : null);
        setMix(mixResult.status === 'fulfilled' ? mixResult.value : null);
        const partialFailure = [chartResult, kpiResult, flightsResult, mixResult]
          .some((result) => result.status === 'rejected');
        setError(partialFailure ? 'بخشی از اطلاعات مالی در دسترس نیست؛ سایر گزارش‌ها نمایش داده شده‌اند.' : null);
      });
    return () => {
      cancelled = true;
    };
  }, [chart.query, chart.isQueryReady, isFlightMode]);

  // Flight mode: picker list + year-scoped KPIs/donut (matches design).
  useEffect(() => {
    if (!isFlightMode) {
      setFlightRows([]);
      setSelectedFlightNo(null);
      setFlightSearch('');
      return;
    }

    let cancelled = false;
    Promise.allSettled([
      fetchFlightSales(),
      fetchKpis({ granularity: 'year' }),
      fetchRevenueMix({ granularity: 'year' }),
      fetchCompletedFlightsSummary({ granularity: 'year' }),
    ])
      .then(([salesResult, kpiResult, mixResult, flightsResult]) => {
        if (cancelled) return;
        // One card per flight number (not per departure date).
        const aggregated = salesResult.status === 'fulfilled'
          ? aggregateFlightSalesByFlightNo(salesResult.value.rows)
          : [];
        setFlightRows(aggregated);
        setKpis(kpiResult.status === 'fulfilled' ? kpiResult.value : null);
        setMix(mixResult.status === 'fulfilled' ? mixResult.value : null);
        setFlights(flightsResult.status === 'fulfilled' ? flightsResult.value : null);
        // No default selection — cards appear only after search.
        setSelectedFlightNo(null);
        const partialFailure = [salesResult, kpiResult, mixResult, flightsResult]
          .some((result) => result.status === 'rejected');
        setError(partialFailure ? 'بخشی از اطلاعات مالی در دسترس نیست؛ سایر گزارش‌ها نمایش داده شده‌اند.' : null);
      });
    return () => {
      cancelled = true;
    };
  }, [isFlightMode]);

  // Search-driven: empty query clears selection; a query selects the first match
  // so channel tiles follow the shown flight.
  useEffect(() => {
    if (!isFlightMode) return;
    if (!flightSearch.trim()) {
      setSelectedFlightNo(null);
      return;
    }
    if (flightRows.length === 0) return;
    const matches = filterFlightSalesRows(flightRows, flightSearch);
    if (matches.length === 0) {
      setSelectedFlightNo(null);
      return;
    }
    setSelectedFlightNo((prev) => {
      if (prev && matches.some((r) => r.flightNo === prev)) return prev;
      return matches[0].flightNo;
    });
  }, [isFlightMode, flightRows, flightSearch]);

  const hasLoadedSection = periods.length > 0 || flightRows.length > 0 || kpis != null || flights != null || mix != null;
  if (!hasLoadedSection && !error) return <p className="text-sm text-panel-muted">در حال بارگذاری…</p>;
  const safeFlights = flights ?? { flightCount: 0, totalSeats: 0, soldSeats: 0, unsoldSeats: 0 };

  const selectedFlight =
    selectedFlightNo != null
      ? (flightRows.find((r) => r.flightNo === selectedFlightNo) ?? null)
      : null;

  const barSums = {
    system: periods.reduce((s, p) => s + Number(p.systemIrr), 0),
    charter: periods.reduce((s, p) => s + Number(p.charterIrr), 0),
    agency: periods.reduce((s, p) => s + Number(p.agencyIrr), 0),
  };
  const barTotal = barSums.system + barSums.charter + barSums.agency;

  // Seat strip uses the aggregated card (all departed instances of that flightNo).
  const flightSeats: CompletedFlightsSummary | null = selectedFlight
    ? {
        flightCount: selectedFlight.flightCount,
        totalSeats: selectedFlight.capacity,
        soldSeats: selectedFlight.soldSeats,
        unsoldSeats: Math.max(0, selectedFlight.capacity - selectedFlight.soldSeats),
      }
    : null;

  return (
    <div className="flex flex-col gap-[15px]">
      {error && (
        <div role="alert" className="finance-partial-alert rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-xs">
          {error}
        </div>
      )}
      <div className="rounded-[14px] border border-panel-border bg-panel-surface p-[15px] shadow-sm">
        <div className="mb-3.5 flex flex-wrap items-start justify-between gap-2.5">
          <div>
            <h2 className="m-0 text-[14.5px] font-extrabold text-panel-ink">نمودار فروش</h2>
            <p className="mt-[3px] text-[11px] text-panel-muted">
              {chartCaption(chart.granularity)} · میلیارد تومان
            </p>
          </div>
          <SalesChartControls
            modes={chart.modes}
            granularity={chart.granularity}
            onGranularityChange={chart.setGranularity}
            selectedDate={chart.selectedDate}
            onSelectedDateChange={chart.setSelectedDate}
            selectedMonthStart={chart.selectedMonthStart}
            onSelectedMonthStartChange={chart.setSelectedMonthStart}
            flightNo={chart.flightNo}
            onFlightNoChange={chart.setFlightNo}
            onApplyFlightNo={chart.applyFlightNo}
            variant="segmented"
            theme="dark"
          />
        </div>

        {isFlightMode ? (
          selectedFlight && flightSeats ? (
            <>
              <ChannelSummaryTiles
                viewLabel={`پرواز ${selectedFlight.flightNo}`}
                totalIrr={selectedFlight.totalIrr}
                systemIrr={selectedFlight.systemIrr}
                charterIrr={selectedFlight.charterIrr}
                agencyIrr={selectedFlight.agencyIrr}
                flights={flightSeats}
              />
              <FlightSalesPicker
                rows={flightRows}
                selectedFlightNo={selectedFlight.flightNo}
                onSelect={(row) => setSelectedFlightNo(row.flightNo)}
                search={flightSearch}
                onSearchChange={setFlightSearch}
                priceSuggestions={priceSuggestions}
              />
            </>
          ) : (
            <FlightSalesPicker
              rows={flightRows}
              selectedFlightNo={null}
              onSelect={(row) => setSelectedFlightNo(row.flightNo)}
              search={flightSearch}
              onSearchChange={setFlightSearch}
              priceSuggestions={priceSuggestions}
            />
          )
        ) : !chart.isQueryReady ? (
          <p className="py-10 text-center text-sm text-[#6b7b94]">شماره پرواز را وارد کنید.</p>
        ) : periods.length === 0 && chart.granularity !== 'day' ? (
          <p className="py-[60px] text-center text-[12.5px] text-[#6b7b94]">اطلاعاتی وجود ندارد</p>
        ) : (
          <>
            <ChannelSummaryTiles
              viewLabel={chartCaption(chart.granularity)}
              totalIrr={barTotal}
              systemIrr={barSums.system}
              charterIrr={barSums.charter}
              agencyIrr={barSums.agency}
              flights={safeFlights}
            />
            <SalesBarChart
              periods={periods}
              selectedPeriodKey={chart.periodKey}
              onSelectPeriod={chart.setPeriodKey}
              theme="dark"
            />
          </>
        )}
      </div>

      {kpis && (
        <div className="grid grid-cols-2 gap-[13px] md:grid-cols-4">
          <AnalyticKpiCard
            label={`کل درآمد · ${kpiPeriodLabel(isFlightMode ? 'year' : chart.granularity)}`}
            value={faMoneyCompact(kpis.revenueIrr)}
            badge={trendBadge(kpis.trends.revenuePct)}
            badgeTone="good"
            iconClass="bg-[rgba(52,211,153,.14)] text-[#34d399]"
            icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                <path d="M12 3v18" />
                <path d="M16.5 7.5C16.5 6 14.7 5 12.5 5S8.5 6 8.5 7.8 10.2 10 12.5 10.4 16.5 11.5 16.5 13.5 14.7 16 12.5 16 8.5 15 8.5 13.5" />
              </svg>
            }
          />
          <AnalyticKpiCard
            label={`سود خالص · حاشیه ${faPercent(kpis.marginPct)}`}
            value={faMoneyCompact(kpis.profitIrr)}
            badge={trendBadge(kpis.trends.profitPct)}
            badgeTone="good"
            iconClass="bg-[rgba(59,130,246,.14)] text-[#60a5fa]"
            icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                <path d="M3 17l6-6 4 4 8-8" />
                <path d="M17 7h4v4" />
              </svg>
            }
          />
          <AnalyticKpiCard
            label="هزینه عملیاتی"
            value={faMoneyCompact(kpis.operatingCostIrr)}
            badge={trendBadge(kpis.trends.operatingCostPct)}
            badgeTone="warn"
            iconClass="bg-[rgba(245,158,11,.14)] text-[#f59e0b]"
            icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                <path d="M3 7l9-4 9 4-9 4-9-4z" />
                <path d="M3 7v10l9 4 9-4V7" />
              </svg>
            }
          />
          <AnalyticKpiCard
            label="مطالبات معوق آژانس‌ها"
            value={faMoneyCompact(kpis.agencyDebtIrr)}
            badge={`${faDigits(kpis.agencyDebtCount)} آژانس`}
            badgeTone="danger"
            iconClass="bg-[rgba(248,113,113,.14)] text-[#f87171]"
            icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                <path d="M12 8v4l3 2" />
                <circle cx="12" cy="12" r="9" />
              </svg>
            }
          />
        </div>
      )}

      <FlightsStrip flights={isFlightMode && flightSeats ? flightSeats : safeFlights} />
      <FinanceCompetitorAnalysis
        suggestions={priceSuggestions}
        state={finAiState}
        onAnalyze={() => void analyzeFinancePrices()}
      />
      {mix ? <RevenueMixCard mix={mix} theme="dark" /> : (
        <div className="rounded-[14px] border border-panel-border bg-panel-surface p-6 text-center text-xs text-panel-muted">
          تفکیک کانال‌های درآمد در حال حاضر در دسترس نیست.
        </div>
      )}
    </div>
  );
}

export default function FinancePage() {
  const { user } = useAuth();
  const isFinanceOps = user?.role === 'FINANCE_MANAGER';

  if (user?.role === 'EMPLOYEE') {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <h1 className="mb-1 text-xl font-black text-panel-ink">مالی</h1>
        <p className="mb-6 text-sm text-panel-muted">اطلاعات مالی مطابق دسترسی اعطاشده توسط مدیر فناوری اطلاعات</p>
        <EmployeeFinanceView />
      </div>
    );
  }

  if (isFinanceOps) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <h1 className="mb-1 text-xl font-black text-panel-ink">مالی</h1>
        <p className="mb-6 text-sm text-panel-muted">
          مانیتورینگ فروش، تراکنش‌ها و تسویه آژانس‌ها
        </p>
        <FinanceOpsView />
      </div>
    );
  }

  return (
    <div className="px-[21px] pb-[34px] pt-[18px]">
      <div className="mb-6">
        <h1 className="text-[20.5px] font-black text-panel-ink">مالی</h1>
        <p className="mt-1 text-[11.5px] text-panel-muted">
          فروش هر پرواز بر اساس کانال و پیشنهاد قیمت هوش مصنوعی
        </p>
      </div>
      <FinanceAnalyticView />
    </div>
  );
}
