import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { fetchAgencyRequests } from '../../api/agencies';
import { fetchCartable } from '../../api/cartable';
import { fetchRefunds } from '../../api/refunds';
import { fetchSiteAdminOverview } from '../../api/reporting';
import { faDigits, faMoney } from '../../lib/fa-format';
import { formatJalaliDate } from '../../lib/jalali';
import type { AgencyMembershipRequest } from '../../types/agencies';
import type { CartableListResult } from '../../types/cartable';
import type { RefundListRow, RefundStatus } from '../../types/refunds';
import type { SiteAdminOverview } from '../../types/reporting';

/**
 * پنل ادمین سایت dashboard — matches design screenshots:
 * 4 KPIs + agency requests + refunds + pending cartable + اعلان‌های جدید.
 */

const REFUND_STATUS: Record<RefundStatus, { label: string; className: string }> = {
  SUBMITTED: {
    label: 'در انتظار بررسی',
    className: 'bg-[rgba(245,158,11,.14)] text-[#f59e0b]',
  },
  REVIEW: {
    label: 'در حال بررسی',
    className: 'bg-[rgba(59,130,246,.14)] text-[#60a5fa]',
  },
  FINANCE: {
    label: 'ارجاع به مالی',
    className: 'bg-[rgba(168,85,247,.14)] text-[#c084fc]',
  },
  PAID: {
    label: 'پرداخت شد',
    className: 'bg-[rgba(52,211,153,.14)] text-[#34d399]',
  },
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '؟';
  if (parts.length === 1) return parts[0]!.slice(0, 2);
  return `${parts[0]!.slice(0, 1)}${parts[parts.length - 1]!.slice(0, 1)}`;
}

function routeLabel(origin: string, dest: string): string {
  const cities: Record<string, string> = {
    THR: 'تهران',
    MHD: 'مشهد',
    SYZ: 'شیراز',
    IFN: 'اصفهان',
    KIH: 'کیش',
    DXB: 'دبی',
    IST: 'استانبول',
  };
  return `${cities[origin] ?? origin} به ${cities[dest] ?? dest}`;
}

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

function TrendBadge({ pct }: { pct: number | null }) {
  if (pct === null) return null;
  const positive = pct >= 0;
  return (
    <span
      className={`font-num text-[11px] font-bold ${positive ? 'text-[#34d399]' : 'text-[#f87171]'}`}
    >
      {positive ? '+' : ''}
      {faDigits(pct)}٪
    </span>
  );
}

function KpiCard({
  label,
  value,
  icon,
  trend,
  to,
}: {
  label: string;
  value: string;
  icon: ReactNode;
  trend?: number | null;
  to?: string;
}) {
  const body = (
    <div className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-[14px] transition hover:border-[#2f3f5c]">
      <div className="mb-3 flex items-center justify-between">
        {icon}
        <TrendBadge pct={trend ?? null} />
      </div>
      <div className="font-num text-[22.5px] font-black text-white">{value}</div>
      <div className="mt-1 text-[11.5px] text-[#6b7b94]">{label}</div>
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

export default function SiteAdminDashboardPage() {
  const [overview, setOverview] = useState<SiteAdminOverview | null>(null);
  const [requests, setRequests] = useState<AgencyMembershipRequest[] | null>(null);
  const [refunds, setRefunds] = useState<RefundListRow[] | null>(null);
  const [allRefunds, setAllRefunds] = useState<RefundListRow[]>([]);
  const [cartable, setCartable] = useState<CartableListResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const results = await Promise.allSettled([
        fetchSiteAdminOverview(),
        fetchAgencyRequests('PENDING'),
        fetchRefunds(),
        fetchCartable(),
      ]);

      if (cancelled) return;

      const [ovRes, reqRes, refundRes, cartRes] = results;
      const ov = ovRes.status === 'fulfilled' ? ovRes.value : null;
      const reqs = reqRes.status === 'fulfilled' ? reqRes.value : [];
      const refundResult = refundRes.status === 'fulfilled' ? refundRes.value : null;
      const cartableData = cartRes.status === 'fulfilled' ? cartRes.value : null;

      if (!ov && !refundResult && !cartableData && reqRes.status === 'rejected') {
        setError('خطا در دریافت اطلاعات داشبورد.');
        return;
      }

      setOverview(
        ov ?? {
          activeAgencies: 0,
          passengersThisMonth: 0,
          ticketsSoldThisMonth: 0,
          pendingActionCount: 0,
          agenciesTrendPct: null,
          passengersTrendPct: null,
          ticketsTrendPct: null,
        },
      );
      setRequests(reqs);
      const rows = refundResult?.requests ?? [];
      setAllRefunds(rows);
      setRefunds(rows.filter((r) => r.status === 'SUBMITTED' || r.status === 'REVIEW'));
      setCartable(
        cartableData ?? { tasks: [], counts: { ADMIN: 0, AGENCY: 0, MANAGER: 0 }, totalOpen: 0 },
      );
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const notifs = useMemo(() => {
    const items: {
      id: string;
      kind: 'agency' | 'customer';
      title: string;
      detail: string;
      href: string;
    }[] = [];
    for (const r of requests ?? []) {
      items.push({
        id: `ag-${r.id}`,
        kind: 'agency',
        title: `درخواست عضویت آژانس «${r.applicantName}»`,
        detail: `${r.city} · ${formatJalaliDate(r.createdAt)}`,
        href: `/panel/agencies/requests/${r.id}`,
      });
    }
    for (const r of (refunds ?? []).slice(0, 4)) {
      const route = r.booking.flightInstance.flight.route;
      items.push({
        id: `rf-${r.id}`,
        kind: 'customer',
        title: `درخواست استرداد — ${r.passengerName}`,
        detail: `${routeLabel(route.originCode, route.destCode)} · ${faMoney(r.refundableIrr)} تومان`,
        href: '/panel/refund',
      });
    }
    return items.slice(0, 6);
  }, [requests, refunds]);

  if (error) {
    return <p className="px-[21px] py-8 text-sm text-[#f87171]">{error}</p>;
  }
  if (!overview || requests === null || refunds === null || !cartable) {
    return <p className="px-[21px] py-8 text-sm text-[#6b7b94]">در حال بارگذاری…</p>;
  }

  const refundShow = allRefunds.slice(0, 5);
  const pendingActionHref =
    cartable.totalOpen > 0
      ? '/panel/cartable'
      : requests.length > 0
        ? '/panel/agencies'
        : refunds.length > 0
          ? '/panel/refund'
          : '/panel/tickets';

  return (
    <div className="px-[21px] pb-[34px] pt-[18px]">
      <div className="mb-6">
        <h1 className="m-0 text-[20.5px] font-black text-white">داشبورد</h1>
        <p className="mt-1 text-[11.5px] text-[#6b7b94]">
          درخواست‌ها، استرداد بلیط و کارهای در انتظار اقدام
        </p>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-[13px] sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="آژانس فعال"
          value={faDigits(overview.activeAgencies)}
          trend={overview.agenciesTrendPct}
          to="/panel/agencies"
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
          trend={overview.passengersTrendPct}
          to="/panel/reports"
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
          label="بلیط فروخته‌شده"
          value={faDigits(overview.ticketsSoldThisMonth)}
          trend={overview.ticketsTrendPct}
          to="/panel/reports"
          icon={
            <KpiIcon bg="rgba(16,185,129,.16)" color="#34d399">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2 2 2 0 0 0 0 4 2 2 0 0 1-2 2H5a2 2 0 0 1-2-2 2 2 0 0 0 0-4z" />
                <path d="M14 7v10" />
              </svg>
            </KpiIcon>
          }
        />
        <KpiCard
          label="درخواست در انتظار اقدام"
          value={faDigits(overview.pendingActionCount)}
          to={pendingActionHref}
          icon={
            <KpiIcon bg="rgba(245,158,11,.16)" color="#f59e0b">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.5 21a2 2 0 0 1-3 0" />
              </svg>
            </KpiIcon>
          }
        />
      </div>

      <div className="grid grid-cols-1 items-start gap-[15px] lg:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-[15px]">
          <section className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-[15px]">
            <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h2 className="m-0 text-[14.5px] font-extrabold text-white">درخواست‌های آژانس‌ها</h2>
                {requests.length > 0 && (
                  <span className="rounded-full bg-[rgba(245,158,11,.14)] px-2.5 py-0.5 text-[11px] font-bold text-[#f59e0b]">
                    {faDigits(requests.length)} در انتظار
                  </span>
                )}
              </div>
              <Link
                to="/panel/agencies"
                className="rounded-[9px] border border-[rgba(59,130,246,.3)] bg-[rgba(59,130,246,.12)] px-3 py-1.5 text-[11.5px] font-bold text-[#60a5fa]"
              >
                مدیریت آژانس‌ها ←
              </Link>
            </div>
            {requests.length === 0 ? (
              <p className="py-5 text-center text-xs text-[#6b7b94]">
                درخواست جدیدی در انتظار تأیید نیست.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {requests.slice(0, 5).map((r) => (
                  <li key={r.id}>
                    <Link
                      to={`/panel/agencies/requests/${r.id}`}
                      className="flex items-center justify-between gap-3 rounded-[12px] border border-[#28344c] bg-[#18223a] px-3.5 py-2.5 transition hover:border-[#3b82f6]"
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-[rgba(59,130,246,.16)] text-[11px] font-bold text-[#60a5fa]">
                          {initials(r.applicantName)}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-extrabold text-[#e7ecf3]">
                            {r.applicantName}
                          </span>
                          <span className="mt-0.5 block text-[11px] text-[#6b7b94]">
                            مدیر: {r.managerName} · {r.city}
                          </span>
                        </span>
                      </span>
                      <span className="shrink-0 text-[11.5px] font-bold text-[#60a5fa]">بررسی ←</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-[15px]">
            <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h2 className="m-0 text-[14.5px] font-extrabold text-white">درخواست‌های استرداد بلیط</h2>
                {refunds.length > 0 && (
                  <span className="rounded-full bg-[rgba(245,158,11,.14)] px-2.5 py-0.5 text-[11px] font-bold text-[#f59e0b]">
                    {faDigits(refunds.length)} در انتظار
                  </span>
                )}
              </div>
              <Link
                to="/panel/refund"
                className="rounded-[9px] border border-[rgba(59,130,246,.3)] bg-[rgba(59,130,246,.12)] px-3 py-1.5 text-[11.5px] font-bold text-[#60a5fa]"
              >
                مدیریت استرداد بلیط ←
              </Link>
            </div>
            {refundShow.length === 0 ? (
              <p className="py-5 text-center text-xs text-[#6b7b94]">درخواست استردادی ثبت نشده است.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {refundShow.map((r) => {
                  const st = REFUND_STATUS[r.status];
                  const route = r.booking.flightInstance.flight.route;
                  return (
                    <li key={r.id}>
                      <Link
                        to="/panel/refund"
                        className="flex items-center justify-between gap-3 rounded-[12px] border border-[#28344c] bg-[#18223a] px-3.5 py-2.5 transition hover:border-[#3b82f6]"
                      >
                        <span className="flex min-w-0 items-center gap-2.5">
                          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-[rgba(248,113,113,.14)] text-[11px] font-bold text-[#f87171]">
                            {initials(r.passengerName)}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-[13px] font-extrabold text-[#e7ecf3]">
                              {r.passengerName}
                            </span>
                            <span className="mt-0.5 block text-[11px] text-[#6b7b94]">
                              {routeLabel(route.originCode, route.destCode)} ·{' '}
                              <span className="font-num">{faMoney(r.refundableIrr)} تومان</span>
                            </span>
                          </span>
                        </span>
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-bold ${st.className}`}
                        >
                          {st.label}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <div className="flex flex-col gap-[15px]">
          <section className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-[15px]">
            <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h2 className="m-0 text-[14.5px] font-extrabold text-white">کارهای در انتظار اقدام</h2>
                {cartable.totalOpen > 0 && (
                  <span className="rounded-full bg-[#f8717124] px-2.5 py-0.5 text-[11px] font-bold text-[#f87171]">
                    {faDigits(cartable.totalOpen)}
                  </span>
                )}
              </div>
              <Link
                to="/panel/cartable"
                className="text-[11.5px] font-bold text-[#60a5fa] hover:underline"
              >
                مشاهده‌ی همه‌ی کارها ←
              </Link>
            </div>
            {cartable.tasks.length === 0 ? (
              <p className="py-6 text-center text-xs text-[#6b7b94]">کارتابل خالی است ✓</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {cartable.tasks.slice(0, 6).map((t) => (
                  <li
                    key={t.id}
                    className="flex items-start gap-2.5 rounded-[12px] border border-[#28344c] bg-[#18223a] px-3 py-2.5"
                  >
                    <span className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-[#3b82f624] text-[#60a5fa]">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M9 11l3 3L22 4" />
                        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                      </svg>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12.5px] font-extrabold text-[#e7ecf3]">{t.title}</span>
                      <span className="mt-0.5 block text-[10.5px] text-[#6b7b94]">
                        {t.senderLabelFa ?? t.sender?.fullName ?? 'سیستم'}
                        {' · '}
                        {formatJalaliDate(t.createdAt)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-[15px]">
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-[rgba(59,130,246,.16)] text-[#60a5fa]">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.5 21a2 2 0 0 1-3 0" />
                </svg>
              </span>
              <h2 className="m-0 text-[14.5px] font-extrabold text-white">اعلان‌های جدید</h2>
              {notifs.length > 0 && (
                <span className="rounded-full bg-[rgba(59,130,246,.16)] px-2.5 py-0.5 text-[11px] font-bold text-[#60a5fa]">
                  {faDigits(notifs.length)}
                </span>
              )}
            </div>
            <p className="mb-3 text-[11px] text-[#6b7b94]">
              درخواست‌های جدید مشتریان سایت و آژانس‌های همکار
            </p>
            {notifs.length === 0 ? (
              <p className="py-5 text-center text-xs text-[#6b7b94]">اعلان جدیدی نیست ✓</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {notifs.map((n) => (
                  <li key={n.id}>
                    <Link
                      to={n.href}
                      className="flex items-start justify-between gap-2 rounded-[12px] border border-[#28344c] bg-[#18223a] px-3 py-2.5 transition hover:border-[#3b82f6]"
                    >
                      <span className="min-w-0">
                        <span className="mb-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold">
                          <span
                            className={
                              n.kind === 'agency'
                                ? 'rounded-full bg-[rgba(245,158,11,.14)] px-2 py-0.5 text-[#f59e0b]'
                                : 'rounded-full bg-[rgba(59,130,246,.14)] px-2 py-0.5 text-[#60a5fa]'
                            }
                          >
                            {n.kind === 'agency' ? 'آژانس' : 'مشتری سایت'}
                          </span>
                        </span>
                        <span className="mt-1 block text-[12px] font-extrabold text-[#e7ecf3]">
                          {n.title}
                        </span>
                        <span className="mt-0.5 block text-[10.5px] text-[#6b7b94]">{n.detail}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
