import { useEffect, useState, type ReactNode } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { fetchCartable } from '../../api/cartable';
import { fetchCommercialOverview, fetchRevenueMix } from '../../api/reporting';
import type { CartableListResult } from '../../types/cartable';
import type { CommercialOverview, RevenueMixResult } from '../../types/reporting';
import type { PanelShellContext } from '../../types/panel-shell';
import { faDigits, faMoney, faPercent } from '../../lib/fa-format';
import LowSalesBanner from '../../components/LowSalesBanner';
import PanelNotifBell from '../../components/PanelNotifBell';
import PanelSearchBox from '../../components/PanelSearchBox';

const MIX_COLORS = { SYSTEM: '#3b82f6', CHARTER: '#a855f7', AGENCY: '#34d399' };

function KpiIcon({ children, bg, color }: { children: ReactNode; bg: string; color: string }) {
  return (
    <span
      className="flex h-10 w-10 items-center justify-center rounded-[11px]"
      style={{ background: bg, color }}
    >
      {children}
    </span>
  );
}

function KpiCard({
  label,
  value,
  trend,
  icon,
}: {
  label: string;
  value: string;
  trend?: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-[14px] border border-panel-border bg-panel-surface p-[14px] shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        {icon}
        {trend ? (
          <span className="text-[11px] font-bold text-[#34d399]">{trend}</span>
        ) : null}
      </div>
      <div className="font-num text-[22.5px] font-black text-panel-ink">{value}</div>
      <div className="mt-1 text-[11.5px] text-panel-muted">{label}</div>
    </div>
  );
}

function FinancialSummaryCard({ mix }: { mix: RevenueMixResult }) {
  const total = mix.totalIrr;
  const sys = mix.channels.find((c) => c.channel === 'SYSTEM');
  const ch = mix.channels.find((c) => c.channel === 'CHARTER');
  const ag = mix.channels.find((c) => c.channel === 'AGENCY');
  const sysPct = sys?.pct ?? 0;
  const chPct = ch?.pct ?? 0;
  const agPct = ag?.pct ?? 0;

  return (
    <div className="rounded-[14px] border border-panel-border bg-panel-surface p-[15px] shadow-sm">
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2.5">
        <div>
          <h2 className="m-0 text-[14.5px] font-extrabold text-panel-ink">گزارش مالی</h2>
          <p className="mt-1 text-[11px] text-panel-muted">
            خلاصه فروش سال جاری — جزئیات و فیلترها در صفحه مالی
          </p>
        </div>
        <Link
          to="/panel/finance"
          className="rounded-[9px] border border-[rgba(59,130,246,.3)] bg-[rgba(59,130,246,.12)] px-3 py-1.5 text-[11.5px] font-bold text-[#60a5fa]"
        >
          مشاهده جزئیات ←
        </Link>
      </div>

      <div className="mb-1.5 flex h-4 overflow-hidden rounded-lg bg-panel-surface-2">
        <div style={{ width: `${sysPct}%`, background: MIX_COLORS.SYSTEM }} />
        <div style={{ width: `${chPct}%`, background: MIX_COLORS.CHARTER }} />
        <div style={{ width: `${agPct}%`, background: MIX_COLORS.AGENCY }} />
      </div>
      <div className="mb-3.5 flex flex-wrap gap-3 text-[10px] text-panel-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: MIX_COLORS.SYSTEM }} />
          سیستمی {faPercent(sysPct)}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: MIX_COLORS.CHARTER }} />
          چارتر {faPercent(chPct)}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: MIX_COLORS.AGENCY }} />
          آژانس {faPercent(agPct)}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-[12px] border border-panel-border bg-panel-surface-2 p-3">
          <div className="mb-1 text-[10.5px] text-panel-muted">جمع فروش سال</div>
          <div className="font-num text-base font-black text-panel-ink">{faMoney(total)}</div>
        </div>
        <div className="rounded-[12px] border border-panel-border bg-panel-surface-2 p-3">
          <div className="mb-1 flex items-center gap-1.5 text-[10.5px] text-panel-muted">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: MIX_COLORS.SYSTEM }} />
            فروش سیستمی
          </div>
          <div className="font-num text-[13.5px] font-extrabold text-[#60a5fa]">
            {faMoney(sys?.amountIrr ?? 0)}
          </div>
        </div>
        <div className="rounded-[12px] border border-panel-border bg-panel-surface-2 p-3">
          <div className="mb-1 flex items-center gap-1.5 text-[10.5px] text-panel-muted">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: MIX_COLORS.CHARTER }} />
            فروش چارتری
          </div>
          <div className="font-num text-[13.5px] font-extrabold text-[#a855f7]">
            {faMoney(ch?.amountIrr ?? 0)}
          </div>
        </div>
        <div className="rounded-[12px] border border-panel-border bg-panel-surface-2 p-3">
          <div className="mb-1 flex items-center gap-1.5 text-[10.5px] text-panel-muted">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: MIX_COLORS.AGENCY }} />
            فروش آژانس
          </div>
          <div className="font-num text-[13.5px] font-extrabold text-[#34d399]">
            {faMoney(ag?.amountIrr ?? 0)}
          </div>
        </div>
      </div>
    </div>
  );
}

function CartableWidget({ cartable }: { cartable: CartableListResult }) {
  return (
    <div className="overflow-hidden rounded-[14px] border border-panel-border bg-panel-surface shadow-sm">
      <div className="flex items-center gap-2 border-b border-panel-border px-3.5 py-3">
        <span className="relative flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-[rgba(248,113,113,.16)] text-[#f87171]">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.5 21a2 2 0 0 1-3 0" />
          </svg>
        </span>
        <h3 className="m-0 flex-1 text-[13.5px] font-extrabold text-panel-ink">کارتابل</h3>
        {cartable.totalOpen > 0 && (
          <span className="font-num flex h-[22px] min-w-[22px] items-center justify-center rounded-[11px] bg-[#f87171] px-1.5 text-[10px] font-extrabold text-white">
            {faDigits(cartable.totalOpen)}
          </span>
        )}
      </div>
      <div className="px-1.5 py-1">
        {cartable.tasks.length === 0 ? (
          <p className="px-2.5 py-[18px] text-center text-[11.5px] text-[#6b7b94]">کارتابل خالی است ✓</p>
        ) : (
          cartable.tasks.slice(0, 4).map((t) => (
            <Link
              key={t.id}
              to="/panel/cartable"
              className="flex items-start gap-2.5 rounded-[10px] px-2.5 py-2.5 transition hover:bg-panel-surface-2"
            >
              <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[9px] bg-[rgba(59,130,246,.16)] text-[#60a5fa]">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M9 11l3 3L22 4" />
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                </svg>
              </span>
              <div className="min-w-0 leading-snug">
                <div className="text-[11.5px] font-bold text-panel-ink">{t.title}</div>
                <div className="mt-0.5 text-[10.5px] text-panel-muted">
                  {t.senderLabelFa ?? t.sender?.fullName ?? ''}
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
      <Link
        to="/panel/cartable"
        className="block border-t border-panel-border py-2.5 text-center text-[11.5px] font-bold text-accent"
      >
        مشاهده‌ی همه‌ی کارها ←
      </Link>
    </div>
  );
}

export default function CommercialDashboardPage() {
  const { nav, lowSalesAlerts = [] } = useOutletContext<PanelShellContext>();
  const bannerAlert = lowSalesAlerts[0] ?? null;
  const notifAlerts = lowSalesAlerts.slice(1);
  const [overview, setOverview] = useState<CommercialOverview | null>(null);
  const [mix, setMix] = useState<RevenueMixResult | null>(null);
  const [cartable, setCartable] = useState<CartableListResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetchCommercialOverview(),
      fetchRevenueMix({ granularity: 'year' }),
      fetchCartable(),
    ])
      .then(([ov, mixData, cartableData]) => {
        setOverview(ov);
        setMix(mixData);
        setCartable(cartableData);
      })
      .catch(() => setError('خطا در دریافت اطلاعات داشبورد.'));
  }, []);

  if (error) {
    return <p className="px-[21px] py-8 text-sm text-[#f87171]">{error}</p>;
  }
  if (!overview || !mix || !cartable) {
    return <p className="px-[21px] py-8 text-sm text-[#6b7b94]">در حال بارگذاری…</p>;
  }

  return (
    <div className="px-[21px] pb-[34px] pt-[18px]">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="m-0 text-[20.5px] font-black text-panel-ink">داشبورد</h1>
          <p className="mt-1 text-[11.5px] text-[#6b7b94]">نمای کلی فروش و کارهای در انتظار اقدام</p>
        </div>
        <div className="flex items-center gap-2.5">
          <PanelSearchBox nav={nav ?? []} />
          <PanelNotifBell alerts={notifAlerts} variant="light" />
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-[13px] md:grid-cols-3">
        <KpiCard
          label="آژانس فعال"
          value={faDigits(overview.activeAgencies)}
          icon={
            <KpiIcon bg="rgba(59,130,246,.16)" color="#3b82f6">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M3 21h18" />
                <path d="M6 21V5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v16" />
                <path d="M19 21V10a1 1 0 0 0-1-1h-3" />
              </svg>
            </KpiIcon>
          }
        />
        <KpiCard
          label="مسافر این ماه"
          value={faDigits(overview.passengersThisMonth)}
          icon={
            <KpiIcon bg="rgba(147,51,234,.16)" color="#a855f7">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="9" cy="8" r="3.2" />
                <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
                <path d="M16 5a3.2 3.2 0 0 1 0 6.4" />
                <path d="M18 14.5c1.9.6 3.4 2.4 3.4 4.5" />
              </svg>
            </KpiIcon>
          }
        />
        <KpiCard
          label="درخواست همکاری آژانس‌ها"
          value={faDigits(overview.pendingAgencyRequests)}
          icon={
            <KpiIcon bg="rgba(16,185,129,.16)" color="#34d399">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M14 3v4a1 1 0 0 0 1 1h4" />
                <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z" />
                <path d="M12 11v6M9 14h6" />
              </svg>
            </KpiIcon>
          }
        />
      </div>

      <LowSalesBanner alert={bannerAlert} variant="light" />

      <div className="mt-[15px] grid grid-cols-1 items-start gap-[15px] lg:grid-cols-[1.7fr_1fr]">
        <FinancialSummaryCard mix={mix} />
        <CartableWidget cartable={cartable} />
      </div>
    </div>
  );
}
