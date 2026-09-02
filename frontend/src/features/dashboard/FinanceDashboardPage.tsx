import { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import {
  fetchCompletedFlightsSummary,
  fetchFinanceDashboardStats,
  fetchSalesChart,
} from '../../api/reporting';
import { fetchCartable } from '../../api/cartable';
import type { CartableListResult } from '../../types/cartable';
import { faDigits, faMoney } from '../../lib/fa-format';
import type {
  CompletedFlightsSummary,
  FinanceDashboardStats,
  SalesChartPeriod,
  SalesGranularity,
} from '../../types/reporting';
import SalesBarChart from '../../components/SalesBarChart';
import LowSalesBanner from '../../components/LowSalesBanner';
import type { PanelShellContext } from '../../types/panel-shell';

const CHART_MODES: { key: SalesGranularity; label: string }[] = [
  { key: 'q3', label: '۳ ماهه' },
  { key: 'q6', label: '۶ ماهه' },
  { key: 'year', label: 'سالانه' },
];

function trendLabel(pct: number): string {
  if (pct === 0) return '۰٪';
  return `${pct > 0 ? '+' : '−'}${faDigits(Math.abs(pct))}٪`;
}

function StatCard({
  label,
  value,
  trendPct,
  icon,
  iconClass,
}: {
  label: string;
  value: string;
  trendPct: number;
  icon: React.ReactNode;
  iconClass: string;
}) {
  const trendUp = trendPct >= 0;
  return (
    <div className="rounded-xl border border-[#1f2a3d] bg-[#141d2e] p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconClass}`}>{icon}</span>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
            trendUp ? 'bg-[#34d39924] text-[#34d399]' : 'bg-[#f8717124] text-[#f87171]'
          }`}
        >
          {trendLabel(trendPct)}
        </span>
      </div>
      <div className="font-num text-xl font-black text-white">{value}</div>
      <div className="mt-1 text-[11px] text-[#6b7b94]">{label}</div>
    </div>
  );
}

export default function FinanceDashboardPage() {
  const { lowSalesAlerts = [] } = useOutletContext<PanelShellContext>();
  const bannerAlert = lowSalesAlerts[0] ?? null;
  const [stats, setStats] = useState<FinanceDashboardStats | null>(null);
  const [granularity, setGranularity] = useState<SalesGranularity>('q6');
  const [periodKey, setPeriodKey] = useState<string | null>(null);
  const [periods, setPeriods] = useState<SalesChartPeriod[]>([]);
  const [flights, setFlights] = useState<CompletedFlightsSummary | null>(null);
  const [cartable, setCartable] = useState<CartableListResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFinanceDashboardStats()
      .then(setStats)
      .catch(() => setError('خطا در دریافت آمار داشبورد.'));
    fetchCartable()
      .then(setCartable)
      .catch(() => setCartable(null));
  }, []);

  useEffect(() => {
    setPeriodKey(null);
  }, [granularity]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetchSalesChart({ granularity }),
      fetchCompletedFlightsSummary({ granularity, periodKey: periodKey ?? undefined }),
    ])
      .then(([chartData, flightsData]) => {
        if (cancelled) return;
        setPeriods(chartData);
        setFlights(flightsData);
      })
      .catch(() => {
        if (!cancelled) setError('خطا در دریافت نمودار فروش.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [granularity, periodKey]);

  const channelSums = {
    system: periods.reduce((s, p) => s + Number(p.systemIrr), 0),
    charter: periods.reduce((s, p) => s + Number(p.charterIrr), 0),
    agency: periods.reduce((s, p) => s + Number(p.agencyIrr), 0),
  };

  return (
    <div className="px-[21px] pb-[34px] pt-[18px]">
      <div className="mb-6">
        <h1 className="text-[20.5px] font-black text-white">داشبورد</h1>
        <p className="mt-1 text-sm text-[#6b7b94]">نمای کلی فروش و کارهای در انتظار اقدام</p>
      </div>

      {error && <p className="mb-4 rounded-lg bg-danger/10 p-3 text-sm text-danger">{error}</p>}

      {stats && (
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard
            label="آژانس فعال"
            value={faDigits(stats.activeAgencies)}
            trendPct={stats.activeAgenciesTrendPct}
            iconClass="bg-accent/10 text-accent"
            icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M3 21h18M6 21V5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v16M19 21V10a1 1 0 0 0-1-1h-3" />
              </svg>
            }
          />
          <StatCard
            label="مسافر این ماه"
            value={faDigits(stats.passengersThisMonth)}
            trendPct={stats.passengersTrendPct}
            iconClass="bg-[#a855f71a] text-[#a855f7]"
            icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="9" cy="8" r="3.2" />
                <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
              </svg>
            }
          />
          <StatCard
            label="بلیط فروخته‌شده"
            value={faDigits(stats.ticketsSoldThisMonth)}
            trendPct={stats.ticketsTrendPct}
            iconClass="bg-[#10b98118] text-[#059669]"
            icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2 2 2 0 0 0 0 4 2 2 0 0 1-2 2H5a2 2 0 0 1-2-2 2 2 0 0 0 0-4z" />
                <path d="M14 7v10" />
              </svg>
            }
          />
          <StatCard
            label="درآمد (تومان)"
            value={faMoney(stats.revenueThisMonthIrr)}
            trendPct={stats.revenueTrendPct}
            iconClass="bg-[#f59e0b18] text-[#b45309]"
            icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="3" y="6" width="18" height="13" rx="2" />
                <path d="M3 10h18" />
              </svg>
            }
          />
        </div>
      )}

      <LowSalesBanner alert={bannerAlert} variant="dark" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.7fr_1fr]">
        <div className="rounded-xl border border-[#1f2a3d] bg-[#141d2e] p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-white">نمودار فروش</h2>
              <p className="mt-0.5 text-[11px] text-[#6b7b94]">به تفکیک کانال · تومان</p>
            </div>
            <div className="flex gap-1 rounded-lg border border-[#28344c] bg-[#18223a] p-1">
              {CHART_MODES.map((m) => (
                <button
                  key={m.key}
                  onClick={() => setGranularity(m.key)}
                  className={`rounded-md px-3 py-1.5 text-[11px] transition ${
                    granularity === m.key ? 'bg-[#3b82f6] font-bold text-white' : 'text-[#6b7b94] hover:text-white'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-4 grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-[#28344c] bg-[#18223a] p-3 text-xs">
              <div className="mb-1 flex items-center gap-1.5 text-[10px] text-[#6b7b94]">
                <span className="h-2 w-2 rounded-sm bg-[#3b82f6]" />
                سیستمی
              </div>
              <div className="font-num font-black text-[#60a5fa]">{faMoney(channelSums.system)}</div>
            </div>
            <div className="rounded-lg border border-[#28344c] bg-[#18223a] p-3 text-xs">
              <div className="mb-1 flex items-center gap-1.5 text-[10px] text-[#6b7b94]">
                <span className="h-2 w-2 rounded-sm bg-[#a855f7]" />
                چارتر
              </div>
              <div className="font-num font-black text-[#c084fc]">{faMoney(channelSums.charter)}</div>
            </div>
            <div className="rounded-lg border border-[#28344c] bg-[#18223a] p-3 text-xs">
              <div className="mb-1 flex items-center gap-1.5 text-[10px] text-[#6b7b94]">
                <span className="h-2 w-2 rounded-sm bg-[#34d399]" />
                آژانس
              </div>
              <div className="font-num font-black text-[#34d399]">{faMoney(channelSums.agency)}</div>
            </div>
          </div>

          {loading ? (
            <p className="py-10 text-center text-sm text-[#6b7b94]">در حال بارگذاری…</p>
          ) : (
            <SalesBarChart periods={periods} selectedPeriodKey={periodKey} onSelectPeriod={setPeriodKey} />
          )}

          {flights && (
            <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-[#28344c] bg-gradient-to-br from-[#1a2740] to-[#141d2e] p-4 md:grid-cols-4">
              <div>
                <div className="font-num text-lg font-black text-white">{faDigits(flights.flightCount)}</div>
                <div className="text-xs text-[#6b7b94]">پروازهای انجام‌شده</div>
              </div>
              <div>
                <div className="font-num text-lg font-black text-white">{faDigits(flights.totalSeats)}</div>
                <div className="text-xs text-[#6b7b94]">مجموع صندلی</div>
              </div>
              <div>
                <div className="font-num text-lg font-black text-[#34d399]">{faDigits(flights.soldSeats)}</div>
                <div className="text-xs text-[#6b7b94]">فروخته‌شده</div>
              </div>
              <div>
                <div className="font-num text-lg font-black text-[#f87171]">{faDigits(flights.unsoldSeats)}</div>
                <div className="text-xs text-[#6b7b94]">فروش‌نرفته</div>
              </div>
            </div>
          )}
        </div>

        {cartable && (
          <section className="rounded-xl border border-[#1f2a3d] bg-[#141d2e] p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-bold text-white">
                کارتابل
                {cartable.totalOpen > 0 && (
                  <span className="mr-2 rounded-full bg-[#f8717124] px-2.5 py-0.5 text-[11px] font-bold text-[#f87171]">
                    {faDigits(cartable.totalOpen)}
                  </span>
                )}
              </h2>
            </div>
            {cartable.tasks.length === 0 ? (
              <p className="py-6 text-center text-xs text-[#6b7b94]">کارتابل خالی است ✓</p>
            ) : (
              <ul className="divide-y divide-[#22304a]">
                {cartable.tasks.slice(0, 4).map((t) => (
                  <li key={t.id} className="flex items-start gap-3 py-3 text-xs">
                    <span className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-[#3b82f624] text-[#60a5fa]">
                      ✉
                    </span>
                    <div className="min-w-0">
                      <div className="font-bold text-white">{t.title}</div>
                      <div className="mt-0.5 text-[10px] text-[#6b7b94]">
                        {t.senderLabelFa ?? t.sender?.fullName ?? ''}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <Link to="/panel/cartable" className="mt-4 block text-center text-xs font-bold text-[#60a5fa]">
              مشاهده‌ی همه‌ی کارها ←
            </Link>
          </section>
        )}
      </div>
    </div>
  );
}
