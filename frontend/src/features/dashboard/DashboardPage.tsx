import { useEffect, useState, type ReactNode } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { fetchFinanceDashboardStats, fetchRevenueMix } from '../../api/reporting';
import { fetchCartable } from '../../api/cartable';
import type { CartableListResult } from '../../types/cartable';
import { faDigits, faMoney, faPercent } from '../../lib/fa-format';
import type { FinanceDashboardStats, RevenueMixResult } from '../../types/reporting';
import type { PanelShellContext } from '../../types/panel-shell';
import LowSalesBanner from '../../components/LowSalesBanner';
import PanelNotifBell from '../../components/PanelNotifBell';

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
  icon: ReactNode;
  iconClass: string;
}) {
  return (
    <div className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-3.5">
      <div className="mb-3 flex items-center justify-between">
        <span className={`flex h-10 w-10 items-center justify-center rounded-[11px] ${iconClass}`}>
          {icon}
        </span>
        <span className="text-[11px] font-bold text-[#34d399]">{trendLabel(trendPct)}</span>
      </div>
      <div className="font-num text-[22.5px] font-black text-white">{value}</div>
      <div className="mt-1 text-[11.5px] text-[#6b7b94]">{label}</div>
    </div>
  );
}

function ChannelSummary({ mix }: { mix: RevenueMixResult }) {
  const sys = mix.channels.find((c) => c.channel === 'SYSTEM');
  const ch = mix.channels.find((c) => c.channel === 'CHARTER');
  const ag = mix.channels.find((c) => c.channel === 'AGENCY');
  const sysPct = sys?.pct ?? 0;
  const chPct = ch?.pct ?? 0;
  const agPct = ag?.pct ?? 0;

  return (
    <div className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-[15px]">
      <div className="mb-[13px] flex flex-wrap items-start justify-between gap-2.5">
        <div>
          <h2 className="m-0 text-[14.5px] font-extrabold text-white">گزارش مالی</h2>
          <p className="mt-[3px] text-[11px] text-[#6b7b94]">
            خلاصه فروش سال جاری — جزئیات و فیلترها در صفحه مالی
          </p>
        </div>
        <Link
          to="/panel/finance"
          className="rounded-[9px] border border-[rgba(59,130,246,.3)] bg-[rgba(59,130,246,.12)] px-3 py-[7px] text-[11.5px] font-bold text-[#60a5fa]"
        >
          مشاهده جزئیات ←
        </Link>
      </div>

      <div className="mb-[7px] flex h-4 overflow-hidden rounded-lg bg-[#18223a]">
        <div className="bg-[#3b82f6]" style={{ width: `${sysPct}%` }} />
        <div className="bg-[#a855f7]" style={{ width: `${chPct}%` }} />
        <div className="bg-[#34d399]" style={{ width: `${agPct}%` }} />
      </div>
      <div className="mb-[13px] flex flex-wrap items-center gap-[11px] text-[10px] text-[#9fb0c7]">
        <span className="flex items-center gap-[5px]">
          <span className="inline-block h-[9px] w-[9px] rounded-sm bg-[#3b82f6]" />
          سیستمی {faPercent(sysPct)}
        </span>
        <span className="flex items-center gap-[5px]">
          <span className="inline-block h-[9px] w-[9px] rounded-sm bg-[#a855f7]" />
          چارتر {faPercent(chPct)}
        </span>
        <span className="flex items-center gap-[5px]">
          <span className="inline-block h-[9px] w-[9px] rounded-sm bg-[#34d399]" />
          آژانس {faPercent(agPct)}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-xl border border-[#28344c] bg-[#18223a] p-3">
          <div className="mb-[5px] text-[10.5px] text-[#6b7b94]">جمع فروش سال</div>
          <div className="font-num text-base font-black text-white">
            {faMoney(mix.totalIrr)} تومان
          </div>
        </div>
        <div className="rounded-xl border border-[#28344c] bg-[#18223a] p-3">
          <div className="mb-[5px] flex items-center gap-1.5 text-[10.5px] text-[#6b7b94]">
            <span className="inline-block h-[9px] w-[9px] rounded-sm bg-[#3b82f6]" />
            فروش سیستمی
          </div>
          <div className="font-num text-[13.5px] font-extrabold text-[#60a5fa]">
            {faMoney(sys?.amountIrr ?? '0')} تومان
          </div>
        </div>
        <div className="rounded-xl border border-[#28344c] bg-[#18223a] p-3">
          <div className="mb-[5px] flex items-center gap-1.5 text-[10.5px] text-[#6b7b94]">
            <span className="inline-block h-[9px] w-[9px] rounded-sm bg-[#a855f7]" />
            فروش چارتری
          </div>
          <div className="font-num text-[13.5px] font-extrabold text-[#a855f7]">
            {faMoney(ch?.amountIrr ?? '0')} تومان
          </div>
        </div>
        <div className="rounded-xl border border-[#28344c] bg-[#18223a] p-3">
          <div className="mb-[5px] flex items-center gap-1.5 text-[10.5px] text-[#6b7b94]">
            <span className="inline-block h-[9px] w-[9px] rounded-sm bg-[#34d399]" />
            فروش آژانس
          </div>
          <div className="font-num text-[13.5px] font-extrabold text-[#34d399]">
            {faMoney(ag?.amountIrr ?? '0')} تومان
          </div>
        </div>
      </div>
    </div>
  );
}

function CartableWidget({ cartable }: { cartable: CartableListResult }) {
  return (
    <section className="overflow-hidden rounded-[14px] border border-[#2a3550] bg-[#141d2e]">
      <div className="flex items-center gap-2 border-b border-[#1f2a3d] px-3.5 py-3">
        <span className="relative flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-[rgba(248,113,113,.16)] text-[#f87171]">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.5 21a2 2 0 0 1-3 0" />
          </svg>
        </span>
        <h2 className="flex-1 text-[13.5px] font-extrabold text-white">کارتابل</h2>
        {cartable.totalOpen > 0 && (
          <span className="flex h-[22px] min-w-[22px] items-center justify-center rounded-[11px] bg-[#f87171] px-1.5 text-[10px] font-extrabold text-white">
            {faDigits(cartable.totalOpen)}
          </span>
        )}
      </div>
      <div className="px-[7px] py-[5px]">
        {cartable.tasks.length === 0 ? (
          <p className="px-3 py-[18px] text-center text-[11.5px] text-[#6b7b94]">کارتابل خالی است ✓</p>
        ) : (
          <ul>
            {cartable.tasks.slice(0, 4).map((t) => (
              <li key={t.id}>
                <Link
                  to="/panel/cartable"
                  className="flex items-start gap-[9px] rounded-[10px] px-2.5 py-2.5 hover:bg-[#18223a]"
                >
                  <div className="min-w-0 leading-relaxed">
                    <div className="text-[11.5px] font-bold text-[#e7ecf3]">{t.title}</div>
                    <div className="mt-0.5 text-[10.5px] text-[#6b7b94]">
                      {t.senderLabelFa ?? t.sender?.fullName ?? ''}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Link
        to="/panel/cartable"
        className="block border-t border-[#1f2a3d] py-[11px] text-center text-[11.5px] font-bold text-[#60a5fa]"
      >
        مشاهده‌ی همه‌ی کارها ←
      </Link>
    </section>
  );
}

export default function DashboardPage() {
  const { lowSalesAlerts = [] } = useOutletContext<PanelShellContext>();
  const bannerAlert = lowSalesAlerts[0] ?? null;
  const notifAlerts = lowSalesAlerts.slice(1);
  const [stats, setStats] = useState<FinanceDashboardStats | null>(null);
  const [mix, setMix] = useState<RevenueMixResult | null>(null);
  const [cartable, setCartable] = useState<CartableListResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.allSettled([
      fetchFinanceDashboardStats(),
      fetchRevenueMix({ granularity: 'year' }),
      fetchCartable(),
    ])
      .then(([statsResult, mixResult, cartableResult]) => {
        if (cancelled) return;
        if (statsResult.status === 'fulfilled') setStats(statsResult.value);
        if (mixResult.status === 'fulfilled') setMix(mixResult.value);
        if (cartableResult.status === 'fulfilled') setCartable(cartableResult.value);

        const failed = [statsResult, mixResult, cartableResult].filter(
          (result) => result.status === 'rejected',
        ).length;
        setError(
          failed === 0
            ? null
            : failed === 3
              ? 'خطا در دریافت اطلاعات داشبورد.'
              : 'خطا در دریافت بخشی از اطلاعات داشبورد.',
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="px-[21px] pb-[34px] pt-[18px]">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[20.5px] font-black text-white">داشبورد</h1>
          <p className="mt-[3px] text-[11.5px] text-[#6b7b94]">نمای کلی فروش و کارهای در انتظار اقدام</p>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="flex h-[42px] w-[230px] items-center gap-2 rounded-[10px] border border-[#28344c] bg-[#18223a] px-3 text-[12px] text-[#6b7b94]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
            <span>جستجو…</span>
          </div>
          <PanelNotifBell alerts={notifAlerts} variant="dark" />
        </div>
      </div>

      {error && (
        <p className="mb-4 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-[#f87171]">
          {error}
        </p>
      )}

      {loading && !stats && <p className="text-sm text-[#6b7b94]">در حال بارگذاری…</p>}

      {stats && (
        <div className="mb-6 grid grid-cols-2 gap-[13px] md:grid-cols-4">
          <StatCard
            label="آژانس فعال"
            value={faDigits(stats.activeAgencies)}
            trendPct={stats.activeAgenciesTrendPct}
            iconClass="bg-[rgba(59,130,246,.16)] text-[#3b82f6]"
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
            iconClass="bg-[rgba(147,51,234,.16)] text-[#a855f7]"
            icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="9" cy="8" r="3.2" />
                <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
                <path d="M16 5a3.2 3.2 0 0 1 0 6.4" />
                <path d="M18 14.5c1.9.6 3.4 2.4 3.4 4.5" />
              </svg>
            }
          />
          <StatCard
            label="بلیط فروخته‌شده"
            value={faDigits(stats.ticketsSoldThisMonth)}
            trendPct={stats.ticketsTrendPct}
            iconClass="bg-[rgba(16,185,129,.16)] text-[#34d399]"
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
            iconClass="bg-[rgba(245,158,11,.16)] text-[#f59e0b]"
            icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="3" y="6" width="18" height="13" rx="2" />
                <path d="M3 10h18" />
                <circle cx="16.5" cy="14.5" r="1.3" fill="currentColor" />
              </svg>
            }
          />
        </div>
      )}

      <LowSalesBanner alert={bannerAlert} variant="dark" />

      {(mix || cartable) && (
        <div
          className={`grid grid-cols-1 items-start gap-[15px] ${mix && cartable ? 'lg:grid-cols-[1.7fr_1fr]' : ''}`}
        >
          {mix && <ChannelSummary mix={mix} />}
          {cartable && <CartableWidget cartable={cartable} />}
        </div>
      )}
    </div>
  );
}
