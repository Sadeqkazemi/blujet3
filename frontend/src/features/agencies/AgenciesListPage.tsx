import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import {
  fetchAgencies,
  fetchAgencyRequests,
  fetchAllWebserviceRequests,
  notifyAllDebtors,
  settleAgency,
  fetchAggregateInvoices,
  fetchAggregateSeatRequests,
} from '../../api/agencies';
import { faDigits, faMoney, faNumber } from '../../lib/fa-format';
import { formatJalaliDate } from '../../lib/jalali';
import Pagination from '../../components/Pagination';
import { usePagination } from '../../hooks/usePagination';
import { TIER_LABELS, seatRequestTermLabel, statusBadge } from './agency-labels';
import WebserviceRequestDetailModal from './WebserviceRequestDetailModal';
import SeatRequestDetailModal from './SeatRequestDetailModal';
import type {
  AgencyAggregateInvoiceRow,
  AgencyListResult,
  AgencyListRow,
  AgencyMembershipRequest,
  AgencySeatRequestRow,
  AggregateInvoiceStatus,
} from '../../types/agencies';
import type { AgencyWebserviceQueueRow } from '../../types/agency-portal';

type SubTab = 'list' | 'credit';

/** Commercial Manager's own tab bar (design: AGENCIES: MAIN TABS). */
type CommercialTab = 'list' | 'coop' | 'debtors';
type CommercialDrilldown = 'all-invoices' | 'all-seat-requests' | null;

const INVOICE_TAB_LABEL: Record<AggregateInvoiceStatus, string> = {
  UNPAID: 'فاکتورهای صادرشده',
  PAID: 'فاکتورهای پرداخت‌شده',
  VOIDED: 'فاکتورهای باطل‌شده',
};

const SEAT_REQUEST_STATUS_LABEL: Record<AgencySeatRequestRow['status'], { label: string; color: string; bg: string }> = {
  PENDING: { label: 'در انتظار بررسی', color: '#f59e0b', bg: 'rgba(245,158,11,.14)' },
  PENDING_FINANCE: { label: 'در انتظار مالی', color: '#a78bfa', bg: 'rgba(167,139,250,.14)' },
  APPROVED: { label: 'تأیید شده', color: '#34d399', bg: 'rgba(52,211,153,.14)' },
  REJECTED: { label: 'رد شده', color: '#f87171', bg: 'rgba(248,113,113,.14)' },
};

function KpiCard({ label, value, valueClass }: { label: string; value: string; valueClass: string }) {
  return (
    <div className="rounded-xl border border-panel-border bg-panel-surface p-4">
      <div className="text-[11px] text-panel-muted">{label}</div>
      <div className={`font-num mt-1 text-lg font-black ${valueClass}`}>{value}</div>
    </div>
  );
}

function CreditBar({ usedIrr, limitIrr }: { usedIrr: number; limitIrr: number }) {
  const pct = limitIrr > 0 ? Math.min((usedIrr / limitIrr) * 100, 100) : usedIrr > 0 ? 100 : 0;
  const tone = pct >= 90 ? 'bg-danger' : pct >= 60 ? 'bg-[#f59e0b]' : 'bg-[#34d399]';
  return (
    <div className="h-1.5 w-full overflow-hidden rounded bg-panel-canvas">
      <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function SeatRequestRowCard({ rq, onOpen }: { rq: AgencySeatRequestRow; onOpen: () => void }) {
  const status = SEAT_REQUEST_STATUS_LABEL[rq.status];
  return (
    <div
      onClick={onOpen}
      className="flex cursor-pointer flex-wrap items-center justify-between gap-2.5 rounded-[11px] border border-panel-border bg-panel-surface-2 px-[13px] py-[11px] transition hover:border-accent/50"
    >
      <div>
        <div className="text-[13px] font-extrabold text-panel-ink">
          {rq.agencyName} · {rq.routeFa}
        </div>
        <div className="mt-[3px] text-[11px] text-panel-muted">
          {faDigits(rq.seats)} صندلی · {seatRequestTermLabel(rq.months)} · {faMoney(rq.totalIrr)} تومان
        </div>
      </div>
      <span
        className="rounded-[14px] px-2.5 py-1 text-[10px] font-bold"
        style={{ color: status.color, background: status.bg }}
      >
        {status.label}
      </span>
    </div>
  );
}

export default function AgenciesListPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const role = user?.role;
  const isCommercial = role === 'COMMERCIAL_MANAGER';

  const [q, setQ] = useState('');
  const [subTab, setSubTab] = useState<SubTab>('list');
  const [commercialTab, setCommercialTab] = useState<CommercialTab>('list');
  const [drilldown, setDrilldown] = useState<CommercialDrilldown>(null);
  const [invoiceTab, setInvoiceTab] = useState<AggregateInvoiceStatus>('UNPAID');
  const [result, setResult] = useState<AgencyListResult | null>(null);
  const [requests, setRequests] = useState<AgencyMembershipRequest[]>([]);
  const [wsRequests, setWsRequests] = useState<AgencyWebserviceQueueRow[]>([]);
  const [seatRequests, setSeatRequests] = useState<AgencySeatRequestRow[]>([]);
  const [invoices, setInvoices] = useState<AgencyAggregateInvoiceRow[]>([]);
  const [openWsRequest, setOpenWsRequest] = useState<AgencyWebserviceQueueRow | null>(null);
  const [openSeatRequest, setOpenSeatRequest] = useState<AgencySeatRequestRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [settlingId, setSettlingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      if (isCommercial) {
        const [list, reqs, ws, seatReqs, allInv] = await Promise.all([
          fetchAgencies({ q: q || undefined }),
          fetchAgencyRequests(),
          fetchAllWebserviceRequests('PENDING'),
          fetchAggregateSeatRequests(),
          fetchAggregateInvoices(),
        ]);
        setResult(list);
        setRequests(reqs);
        setWsRequests(ws);
        setSeatRequests(seatReqs);
        setInvoices(allInv);
      } else {
        const [list, reqs] = await Promise.all([fetchAgencies({ q: q || undefined }), fetchAgencyRequests()]);
        setResult(list);
        setRequests(reqs);
      }
    } catch {
      setError('خطا در دریافت فهرست آژانس‌ها.');
    } finally {
      setLoading(false);
    }
  }, [q, isCommercial]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 300);
    return () => clearTimeout(timer);
  }, [load]);

  const pendingRequests = useMemo(
    () => requests.filter((r) => r.status === 'PENDING' || r.status === 'REFERRED'),
    [requests],
  );

  const debtors = useMemo(
    () => (result?.agencies ?? []).filter((a) => Number(a.usedIrr) > 0 || a.pendingInvoiceCount > 0),
    [result],
  );

  const pendingSeatRequests = useMemo(() => seatRequests.filter((r) => r.status === 'PENDING'), [seatRequests]);
  const invoicesInTab = useMemo(() => invoices.filter((v) => v.status === invoiceTab), [invoices, invoiceTab]);

  const pendingPager = usePagination(pendingRequests);
  const debtorsPager = usePagination(debtors);
  const agenciesPager = usePagination(result?.agencies ?? []);
  const allSeatReqPager = usePagination(seatRequests);
  const allInvPager = usePagination(invoicesInTab);

  async function onSettle(agency: AgencyListRow) {
    setSettlingId(agency.id);
    setNotice(null);
    try {
      await settleAgency(agency.id);
      setNotice(`تسویه حساب ${agency.fullName} ثبت شد ✓`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطا در ثبت تسویه.');
    } finally {
      setSettlingId(null);
    }
  }

  async function onNotifyAll() {
    setNotice(null);
    try {
      const { notifiedCount } = await notifyAllDebtors();
      setNotice(`اعلان بدهی برای ${faDigits(notifiedCount)} آژانس ارسال شد ✓`);
    } catch {
      setError('خطا در ارسال اعلان.');
    }
  }

  const kpis = result?.kpis;

  const seatRequestsPreview = (
    <div
      className="overflow-hidden rounded-[14px] border"
      style={{ borderColor: 'rgba(245,158,11,.35)', background: 'var(--color-panel-surface)' }}
    >
      <div className="flex flex-wrap items-center gap-[9px] border-b border-panel-border px-[15px] py-3">
        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px] bg-[rgba(245,158,11,.16)] text-[#f59e0b]">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z" />
          </svg>
        </span>
        <h3 className="m-0 text-sm font-extrabold text-panel-ink">درخواست‌های خرید صندلی آژانس‌ها</h3>
        <span className="rounded-[18px] bg-[rgba(245,158,11,.14)] px-[9px] py-0.5 text-[11px] font-bold text-[#f59e0b]">
          {faDigits(pendingSeatRequests.length)}
        </span>
        <button
          onClick={() => setDrilldown('all-seat-requests')}
          className="mr-auto flex items-center gap-1.5 rounded-[9px] border border-[rgba(245,158,11,.3)] bg-[rgba(245,158,11,.12)] px-[11px] py-[7px] text-[11.5px] font-bold text-[#f59e0b] transition hover:brightness-110"
        >
          مشاهده همه
        </button>
      </div>
      <div className="flex flex-col gap-[9px] px-2 py-2">
        {pendingSeatRequests.length === 0 ? (
          <p className="py-3.5 text-center text-[11.5px] text-[#6b7b94]">درخواستی ثبت نشده است.</p>
        ) : (
          pendingSeatRequests.map((rq) => (
            <SeatRequestRowCard key={rq.id} rq={rq} onOpen={() => setOpenSeatRequest(rq)} />
          ))
        )}
      </div>
    </div>
  );

  const webserviceRequestsPreview = wsRequests.length > 0 && (
    <div className="overflow-hidden rounded-[14px] border border-panel-border bg-panel-surface">
      <div className="flex flex-wrap items-center gap-[9px] border-b border-panel-border px-[15px] py-3">
        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px] bg-[rgba(59,130,246,.16)] text-[#60a5fa]">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="M2 9h20" />
            <path d="M6 14h4" />
          </svg>
        </span>
        <h3 className="m-0 text-sm font-extrabold text-panel-ink">درخواست‌های خرید وب‌سرویس آژانس‌ها</h3>
        <span className="rounded-[18px] bg-[rgba(59,130,246,.14)] px-[9px] py-0.5 text-[11px] font-bold text-[#60a5fa]">
          {faDigits(wsRequests.length)}
        </span>
      </div>
      <div className="flex flex-col gap-[9px] px-2 py-2">
        {wsRequests.map((r) => (
          <div
            key={r.id}
            onClick={() => setOpenWsRequest(r)}
            className="flex cursor-pointer flex-wrap items-center justify-between gap-2.5 rounded-[11px] border border-panel-border bg-panel-surface-2 px-[13px] py-[11px] transition hover:border-accent/50"
          >
            <div>
              <div className="text-[13px] font-extrabold text-panel-ink">{r.agencyName}</div>
              <div className="mt-[3px] text-[11px] text-panel-muted">
                {faDigits(r.months)} ماهه · {faMoney(r.priceIrr)} تومان
              </div>
            </div>
            <span className="rounded-[14px] bg-[rgba(245,158,11,.14)] px-2.5 py-1 text-[10px] font-bold text-[#f59e0b]">
              در انتظار بررسی
            </span>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="p-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-panel-ink">
            {isCommercial ? 'مدیریت آژانس‌ها' : 'آژانس‌ها'}
          </h1>
          <p className="mt-1 text-sm text-panel-muted">
            {isCommercial
              ? 'آژانس‌های همکار، درخواست‌ها و پروفایل هر آژانس'
              : 'مدیریت آژانس‌های همکار، اعتبار و تسویه'}
          </p>
        </div>
      </div>

      {error && <p className="mb-4 rounded-lg bg-danger/10 p-3 text-sm text-danger">{error}</p>}
      {notice && <p className="mb-4 rounded-lg bg-[#34d39915] p-3 text-sm text-[#34d399]">{notice}</p>}

      {isCommercial ? (
        <div className="flex flex-col gap-[15px]">
          {drilldown === null && (
            <div className="flex gap-[7px] rounded-xl border border-panel-border bg-panel-surface p-1">
              {(
                [
                  { key: 'list', label: 'آژانس‌های همکار' },
                  { key: 'coop', label: 'درخواست همکاری' },
                  { key: 'debtors', label: 'آژانس‌های دارای بدهی' },
                ] as { key: CommercialTab; label: string }[]
              ).map((t) => (
                <button
                  key={t.key}
                  onClick={() => setCommercialTab(t.key)}
                  className={`flex-1 rounded-[9px] py-[9px] text-center text-xs font-bold transition ${
                    commercialTab === t.key ? 'bg-accent text-white' : 'text-panel-muted hover:bg-panel-surface-2'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}

          {drilldown === 'all-seat-requests' && (
            <div className="flex flex-col gap-[15px]">
              <button
                onClick={() => setDrilldown(null)}
                className="flex w-max items-center gap-1.5 text-xs text-panel-muted transition hover:text-panel-ink"
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 6l-6 6 6 6" />
                </svg>
                بازگشت به فهرست آژانس‌ها
              </button>
              <div
                className="overflow-hidden rounded-[14px] border"
                style={{ borderColor: 'rgba(245,158,11,.35)', background: 'var(--color-panel-surface)' }}
              >
                <div className="flex flex-wrap items-center gap-[9px] border-b border-panel-border px-[15px] py-3">
                  <h3 className="m-0 text-sm font-extrabold text-panel-ink">همهٔ درخواست‌های خرید صندلی آژانس‌ها</h3>
                  <span className="rounded-[18px] bg-[rgba(245,158,11,.14)] px-[9px] py-0.5 text-[11px] font-bold text-[#f59e0b]">
                    {faDigits(seatRequests.length)}
                  </span>
                </div>
                <div className="flex flex-col gap-[9px] px-2 py-2">
                  {allSeatReqPager.pageItems.length === 0 ? (
                    <p className="py-4 text-center text-[11.5px] text-[#6b7b94]">درخواستی ثبت نشده است.</p>
                  ) : (
                    allSeatReqPager.pageItems.map((rq) => (
                      <SeatRequestRowCard key={rq.id} rq={rq} onOpen={() => setOpenSeatRequest(rq)} />
                    ))
                  )}
                </div>
                <Pagination page={allSeatReqPager.page} totalPages={allSeatReqPager.totalPages} onChange={allSeatReqPager.setPage} variant="dark" />
              </div>
            </div>
          )}

          {drilldown === 'all-invoices' && (
            <div className="flex flex-col gap-[15px]">
              <button
                onClick={() => setDrilldown(null)}
                className="flex w-max items-center gap-1.5 text-xs text-panel-muted transition hover:text-panel-ink"
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 6l-6 6 6 6" />
                </svg>
                بازگشت به فهرست آژانس‌ها
              </button>
              <div className="flex gap-[7px] rounded-xl border border-panel-border bg-panel-surface p-1">
                {(Object.keys(INVOICE_TAB_LABEL) as AggregateInvoiceStatus[]).map((st) => (
                  <button
                    key={st}
                    onClick={() => setInvoiceTab(st)}
                    className={`flex-1 rounded-[9px] py-[9px] text-center text-xs font-bold transition ${
                      invoiceTab === st ? 'bg-accent text-white' : 'text-panel-muted hover:bg-panel-surface-2'
                    }`}
                  >
                    {INVOICE_TAB_LABEL[st]} ({faDigits(invoices.filter((v) => v.status === st).length)})
                  </button>
                ))}
              </div>
              <div className="overflow-hidden rounded-[14px] border border-panel-border bg-panel-surface">
                <div className="flex items-center gap-2 border-b border-panel-border px-[15px] py-[13px]">
                  <h3 className="m-0 text-sm font-extrabold text-panel-ink">همهٔ فاکتورهای صادرشده برای آژانس‌ها</h3>
                  <span className="rounded-xl bg-panel-surface-2 px-2 py-0.5 text-[10.5px] font-bold text-panel-muted">
                    {faDigits(invoicesInTab.length)}
                  </span>
                </div>
                <div className="flex flex-col gap-[9px] px-2 py-2">
                  {allInvPager.pageItems.length === 0 ? (
                    <p className="py-5 text-center text-[11.5px] text-[#6b7b94]">فاکتوری در این وضعیت وجود ندارد.</p>
                  ) : (
                    allInvPager.pageItems.map((v) => (
                      <div
                        key={v.id}
                        className="flex flex-wrap items-center gap-3.5 rounded-xl border border-panel-border bg-panel-surface-2 px-[15px] py-[13px]"
                      >
                        <span className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[10px] bg-[rgba(59,130,246,.14)] text-[#60a5fa]">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 3v4a1 1 0 0 0 1 1h4" />
                            <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z" />
                          </svg>
                        </span>
                        <div className="min-w-[220px] flex-1">
                          <div className="mb-[3px] flex flex-wrap items-center gap-2">
                            <span className="ltr font-num text-[12.5px] font-extrabold text-panel-ink">{v.invoiceNo}</span>
                            <span className="h-[3px] w-[3px] rounded-full bg-[#3a4a63]" />
                            <span className="text-[12.5px] font-bold text-panel-muted">{v.agencyName}</span>
                          </div>
                          <div className="text-[11px] text-[#6b7b94]">{v.descriptionFa}</div>
                        </div>
                        <div className="flex-none text-left">
                          <div className="mb-[3px] text-[9.5px] text-[#6b7b94]">تاریخ صدور</div>
                          <div className="text-[11.5px] text-[#9fb0c7]">{formatJalaliDate(v.issuedAt)}</div>
                        </div>
                        <div className="min-w-[110px] flex-none text-left">
                          <div className="mb-[3px] text-[9.5px] text-[#6b7b94]">مبلغ</div>
                          <div className="font-num text-[13px] font-extrabold text-panel-ink">{faMoney(v.amountIrr)} تومان</div>
                        </div>
                        <span
                          className="flex-none rounded-2xl px-3 py-1.5 text-[10.5px] font-bold"
                          style={
                            v.status === 'PAID'
                              ? { color: '#34d399', background: 'rgba(52,211,153,.14)' }
                              : v.status === 'VOIDED'
                                ? { color: '#8494ac', background: '#18223a' }
                                : { color: '#f59e0b', background: 'rgba(245,158,11,.14)' }
                          }
                        >
                          {v.status === 'PAID' ? 'پرداخت‌شده' : v.status === 'VOIDED' ? 'باطل‌شده' : 'صادرشده'}
                        </span>
                      </div>
                    ))
                  )}
                </div>
                <Pagination page={allInvPager.page} totalPages={allInvPager.totalPages} onChange={allInvPager.setPage} variant="dark" />
              </div>
            </div>
          )}

          {drilldown === null && commercialTab === 'coop' && (
            <section className="overflow-hidden rounded-[14px] border border-panel-border bg-panel-surface">
              <div className="flex flex-wrap items-center gap-[9px] border-b border-panel-border px-[15px] py-3">
                <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px] bg-[rgba(245,158,11,.16)] text-[#f59e0b]">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 3v4a1 1 0 0 0 1 1h4" />
                    <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z" />
                    <path d="M9 13h6M9 17h4" />
                  </svg>
                </span>
                <h2 className="m-0 text-sm font-extrabold text-panel-ink">درخواست‌های همکاری آژانس‌ها</h2>
                <span className="rounded-full bg-[rgba(245,158,11,.14)] px-3 py-1 text-[11px] font-bold text-[#f59e0b]">
                  {faDigits(pendingRequests.length)} درخواست
                </span>
                <span className="mr-auto text-[10.5px] text-[#6b7b94]">ارسال‌شده از سوی ادمین سایت</span>
              </div>
              <div className="px-2 py-1.5">
                {pendingRequests.length === 0 ? (
                  <p className="py-[18px] text-center text-xs text-panel-muted">درخواست همکاری جدیدی وجود ندارد.</p>
                ) : (
                  <ul>
                    {pendingPager.pageItems.map((r) => (
                      <li
                        key={r.id}
                        className="flex flex-wrap items-center justify-between gap-3 border-b border-panel-border px-2.5 py-[11px] last:border-b-0"
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-2.5">
                          <span className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-[#241d12] text-sm font-black text-[#f59e0b]">
                            {r.applicantName.slice(0, 1)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="text-[12.5px] font-extrabold text-panel-ink">{r.applicantName}</div>
                            <div className="mt-0.5 text-[11px] text-panel-muted">
                              مدیر: {r.managerName} · مجوز <span className="ltr font-num">{r.licenseNo}</span> · {r.city}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-none items-center gap-[9px]">
                          {r.status === 'REFERRED' && (
                            <span className="rounded-full bg-accent/10 px-2.5 py-1 text-[10px] font-bold text-accent">ارجاع‌شده</span>
                          )}
                          <Link
                            to={`/panel/agencies/requests/${r.id}`}
                            className="rounded-[9px] bg-accent px-[13px] py-2 text-[11.5px] font-bold text-white transition hover:bg-accent/90"
                          >
                            بررسی و اقدام
                          </Link>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <Pagination page={pendingPager.page} totalPages={pendingPager.totalPages} onChange={pendingPager.setPage} variant="dark" />
              </div>
            </section>
          )}

          {drilldown === null && commercialTab === 'debtors' && (
            <section
              className="overflow-hidden rounded-[14px] border"
              style={{ borderColor: 'rgba(248,113,113,.35)', background: 'var(--color-panel-surface)' }}
            >
              <div className="flex flex-wrap items-center gap-[9px] border-b border-panel-border px-3.5 py-[11px]">
                <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px] bg-[rgba(248,113,113,.16)] text-[#f87171]">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.3 3.9l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3l-8-14a2 2 0 0 0-3.4 0z" />
                    <path d="M12 9v4M12 17h.01" />
                  </svg>
                </span>
                <h2 className="m-0 text-sm font-extrabold text-panel-ink">آژانس‌های دارای بدهی یا فاکتور پرداخت‌نشده</h2>
                <span className="rounded-[18px] bg-[rgba(248,113,113,.14)] px-[9px] py-0.5 text-[11px] font-bold text-[#f87171]">
                  {faDigits(debtors.length)} آژانس
                </span>
                <button
                  onClick={() => void onNotifyAll()}
                  className="mr-auto flex items-center gap-1.5 rounded-[9px] bg-[#3b82f6] px-[11px] py-[7px] text-[11.5px] font-bold text-white transition hover:brightness-110"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.7 21a2 2 0 0 1-3.4 0" />
                  </svg>
                  ارسال اعلان به همه
                </button>
                <button
                  onClick={() => setDrilldown('all-invoices')}
                  className="flex items-center gap-1.5 rounded-[9px] border border-panel-border bg-panel-surface-2 px-[11px] py-[7px] text-[11.5px] font-bold text-panel-muted transition hover:text-panel-ink"
                >
                  فاکتورهای همه آژانس‌ها
                </button>
              </div>
              <ul className="px-2 py-1.5">
                {debtors.length === 0 ? (
                  <p className="py-[18px] text-center text-[11.5px] text-[#6b7b94]">
                    آژانسی با بدهی یا فاکتور پرداخت‌نشده وجود ندارد.
                  </p>
                ) : (
                  debtorsPager.pageItems.map((d) => {
                    const unpaid = d.pendingInvoiceCount > 0;
                    const label = unpaid ? 'فاکتور پرداخت‌نشده' : 'بدهی جاری';
                    return (
                      <li
                        key={d.id}
                        className="flex items-center justify-between gap-2.5 border-b border-panel-border px-2.5 py-[11px] last:border-b-0"
                      >
                        <div className="flex min-w-0 items-center gap-[9px]">
                          <span className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[10px] bg-panel-surface-2 text-[11.5px] font-extrabold text-panel-muted">
                            {d.fullName.slice(0, 1)}
                          </span>
                          <div className="min-w-0 leading-[1.6]">
                            <div className="text-[12.5px] font-bold text-panel-ink">{d.fullName}</div>
                            <span
                              className={`rounded-xl px-[7px] py-0.5 text-[10px] font-bold ${
                                unpaid ? 'bg-[rgba(245,158,11,.14)] text-[#f59e0b]' : 'bg-[rgba(248,113,113,.14)] text-[#f87171]'
                              }`}
                            >
                              {label}
                            </span>
                          </div>
                        </div>
                        <div className="flex-none text-left">
                          <div className="text-[9.5px] text-[#6b7b94]">مبلغ</div>
                          <div className="font-num text-[12.5px] font-extrabold text-[#f87171]">{faMoney(d.usedIrr)} تومان</div>
                        </div>
                      </li>
                    );
                  })
                )}
              </ul>
              <Pagination page={debtorsPager.page} totalPages={debtorsPager.totalPages} onChange={debtorsPager.setPage} variant="dark" />
            </section>
          )}

          {drilldown === null && commercialTab === 'list' && (
            <>
              <h3 className="m-0 mt-1 text-[14.5px] font-extrabold text-panel-ink">آژانس‌های همکار</h3>

              <div className="relative mb-0.5">
                <span className="pointer-events-none absolute right-[14px] top-1/2 flex -translate-y-1/2 text-[#6b7b94]">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="7" />
                    <path d="M21 21l-4-4" />
                  </svg>
                </span>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="جستجوی آژانس بر اساس نام، مجوز، مدیر یا شهر…"
                  className="h-[46px] w-full rounded-xl border border-panel-border bg-panel-surface py-0 pl-[11px] pr-[34px] text-xs text-panel-ink outline-none transition focus:border-accent"
                />
              </div>

              {loading ? (
                <p className="py-10 text-center text-sm text-panel-muted">در حال بارگذاری…</p>
              ) : (result?.agencies.length ?? 0) === 0 ? (
                <p className="rounded-[14px] border border-panel-border bg-panel-surface py-[21px] text-center text-xs text-panel-muted">
                  آژانسی با این عبارت یافت نشد.
                </p>
              ) : (
                <ul className="space-y-2.5">
                  {agenciesPager.pageItems.map((a) => {
                    const badge = statusBadge(a.isActive);
                    return (
                      <li key={a.id}>
                        <button
                          onClick={() => navigate(`/panel/agencies/${a.id}`)}
                          className="flex w-full flex-wrap items-center gap-4 rounded-xl border border-panel-border bg-panel-surface p-4 text-right transition hover:border-accent/40"
                        >
                          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-panel-surface-2 text-base font-black text-accent">
                            {a.fullName.slice(0, 1)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-bold text-panel-ink">{a.fullName}</div>
                            <div className="mt-0.5 text-[11px] text-panel-muted">
                              مجوز <span className="ltr font-num">{a.licenseNo}</span> · {a.city}
                            </div>
                          </div>
                          <div className="min-w-[118px] text-left">
                            <div className="text-[10px] text-panel-muted">فروش این ماه</div>
                            <div className="font-num mt-0.5 text-sm font-black text-panel-ink">
                              {faNumber(a.monthlyTicketsSold)} بلیط
                            </div>
                            <div className="font-num mt-0.5 text-[10px] font-bold text-[#34d399]">
                              {faMoney(a.monthlySalesIrr)} تومان
                            </div>
                          </div>
                          <div className="text-left">
                            <div className="text-[10px] text-panel-muted">بدهی جاری</div>
                            <div className={`font-num text-sm font-black ${Number(a.usedIrr) > 0 ? 'text-danger' : 'text-[#34d399]'}`}>
                              {faMoney(Math.max(Number(a.usedIrr), 0))} تومان
                            </div>
                          </div>
                          <span className={`rounded-full px-3 py-1 text-[10px] font-bold ${badge.className}`}>{badge.label}</span>
                          <span aria-hidden className="text-lg text-panel-muted">‹</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {!loading && (result?.agencies.length ?? 0) > 0 && (
                <Pagination page={agenciesPager.page} totalPages={agenciesPager.totalPages} onChange={agenciesPager.setPage} variant="dark" />
              )}

              {(pendingSeatRequests.length > 0 || wsRequests.length > 0) && (
                <div className="mt-2 flex flex-col gap-[15px]" data-testid="commercial-agency-request-queues">
                  {seatRequestsPreview}
                  {webserviceRequestsPreview}
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <>
          <section className="mb-6 rounded-[14px] border border-panel-border bg-panel-surface p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-bold text-panel-ink">درخواست‌های جدید عضویت</h2>
              <span className="rounded-full bg-[#f59e0b1f] px-3 py-1 text-[11px] font-bold text-[#b45309]">
                {faDigits(pendingRequests.length)} در انتظار
              </span>
            </div>
            {pendingRequests.length === 0 ? (
              <p className="py-3 text-center text-xs text-panel-muted">درخواست جدیدی در انتظار تأیید نیست.</p>
            ) : (
              <ul className="divide-y divide-panel-border">
                {pendingPager.pageItems.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-3 py-3">
                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
                      <span className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-panel-surface-2 text-sm font-black text-accent">
                        {r.applicantName.slice(0, 1)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-bold text-panel-ink">{r.applicantName}</div>
                        <div className="mt-0.5 text-[11px] text-panel-muted">
                          مدیر: {r.managerName} · مجوز <span className="ltr font-num">{r.licenseNo}</span> · {r.city}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-none items-center gap-[9px]">
                      {r.status === 'REFERRED' && (
                        <span className="rounded-full bg-accent/10 px-2.5 py-1 text-[10px] font-bold text-accent">ارجاع‌شده</span>
                      )}
                      <Link
                        to={`/panel/agencies/requests/${r.id}`}
                        className="rounded-[9px] bg-accent px-[13px] py-2 text-[11.5px] font-bold text-white transition hover:bg-accent/90"
                      >
                        بررسی درخواست
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <Pagination page={pendingPager.page} totalPages={pendingPager.totalPages} onChange={pendingPager.setPage} variant="dark" />
          </section>

          {kpis && (
            <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
              <KpiCard label="آژانس‌های فعال" value={faDigits(kpis.activeCount)} valueClass="text-panel-ink" />
              <KpiCard label="مجموع اعتبار اعطاشده" value={`${faMoney(kpis.totalCreditGrantedIrr)} تومان`} valueClass="text-accent" />
              <KpiCard label="اعتبار مصرف‌شده (بدهی)" value={`${faMoney(kpis.totalUsedIrr)} تومان`} valueClass="text-danger" />
              <KpiCard label="در انتظار تسویه" value={faDigits(kpis.pendingSettlementCount)} valueClass="text-[#b45309]" />
            </div>
          )}

          <div className="mb-4 flex gap-1.5">
            {(
              [
                { key: 'list', label: 'آژانس‌های همکار' },
                { key: 'credit', label: 'اعتبار و تسویه' },
              ] as { key: SubTab; label: string }[]
            ).map((t) => (
              <button
                key={t.key}
                onClick={() => setSubTab(t.key)}
                className={`rounded-full px-4 py-2 text-xs font-bold transition ${
                  subTab === t.key ? 'bg-accent text-white' : 'bg-panel-canvas text-panel-muted hover:bg-panel-surface-2'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="mb-4">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="جستجوی آژانس بر اساس نام، مجوز، مدیر یا شهر…"
              className="h-[46px] w-full rounded-xl border border-panel-border-2 bg-panel-canvas px-4 text-xs text-panel-ink outline-none transition focus:border-accent"
            />
          </div>

          {loading ? (
            <p className="py-10 text-center text-sm text-panel-muted">در حال بارگذاری…</p>
          ) : (result?.agencies.length ?? 0) === 0 ? (
            <p className="py-10 text-center text-sm text-panel-muted">آژانسی با این عبارت یافت نشد.</p>
          ) : subTab === 'credit' ? (
            <ul className="space-y-3">
              {agenciesPager.pageItems.map((a) => {
                const settled = Number(a.usedIrr) <= 0;
                return (
                  <li key={a.id} className="flex flex-wrap items-center gap-4 rounded-xl border border-panel-border bg-panel-surface p-4">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-panel-surface-2 text-sm font-black text-accent">
                      {a.fullName.slice(0, 1)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold text-panel-ink">{a.fullName}</div>
                      <div className="mt-0.5 text-[11px] text-panel-muted">
                        مجوز <span className="ltr font-num">{a.licenseNo}</span> · {a.city}
                      </div>
                    </div>
                    <div className="text-left">
                      <div className="text-[10px] text-panel-muted">بدهی جاری</div>
                      <div className={`font-num text-sm font-black ${settled ? 'text-[#34d399]' : 'text-danger'}`}>
                        {faMoney(Math.max(Number(a.usedIrr), 0))} تومان
                      </div>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-[10px] font-bold ${
                        settled ? 'bg-[#34d39924] text-[#34d399]' : 'bg-[#f59e0b24] text-[#b45309]'
                      }`}
                    >
                      {settled ? 'تسویه شد' : 'در انتظار پرداخت'}
                    </span>
                    <button
                      disabled={settled || settlingId === a.id}
                      onClick={() => void onSettle(a)}
                      className={`rounded-lg px-3 py-2 text-xs font-bold transition ${
                        settled ? 'cursor-default bg-panel-canvas text-panel-muted' : 'bg-[#34d399] text-white hover:bg-[#2bb583]'
                      }`}
                    >
                      {settled ? 'تسویه شده' : settlingId === a.id ? 'در حال ثبت…' : 'ثبت تسویه'}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <ul className="space-y-3">
              {agenciesPager.pageItems.map((a) => {
                const badge = statusBadge(a.isActive);
                return (
                  <li key={a.id}>
                    <button
                      onClick={() => navigate(`/panel/agencies/${a.id}`)}
                      className="flex w-full flex-wrap items-center gap-4 rounded-xl border border-panel-border bg-panel-surface p-4 text-right transition hover:border-accent/40"
                    >
                      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-panel-surface-2 text-base font-black text-accent">
                        {a.fullName.slice(0, 1)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-bold text-panel-ink">{a.fullName}</div>
                        <div className="mt-0.5 text-[11px] text-panel-muted">
                          مجوز <span className="ltr font-num">{a.licenseNo}</span> · {a.city} · سطح همکاری{' '}
                          <span className="font-bold text-[#b45309]">{TIER_LABELS[a.tier]}</span>
                        </div>
                      </div>
                      <div className="w-44">
                        <div className="mb-1 flex items-center justify-between text-[10px] text-panel-muted">
                          <span>اعتبار (مانده / سقف)</span>
                          <span className="font-num">
                            {faMoney(Math.max(Number(a.remainingIrr), 0))} / {faMoney(a.limitIrr)}
                          </span>
                        </div>
                        <CreditBar usedIrr={Math.max(Number(a.usedIrr), 0)} limitIrr={Number(a.limitIrr)} />
                      </div>
                      <div className="text-left">
                        <div className="text-[10px] text-panel-muted">بدهی جاری</div>
                        <div className={`font-num text-sm font-black ${Number(a.usedIrr) > 0 ? 'text-danger' : 'text-[#34d399]'}`}>
                          {faMoney(Math.max(Number(a.usedIrr), 0))} تومان
                        </div>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-[10px] font-bold ${badge.className}`}>{badge.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {!loading && (result?.agencies.length ?? 0) > 0 && (
            <Pagination page={agenciesPager.page} totalPages={agenciesPager.totalPages} onChange={agenciesPager.setPage} variant="dark" />
          )}
        </>
      )}

      {openWsRequest && (
        <WebserviceRequestDetailModal
          request={openWsRequest}
          onClose={() => setOpenWsRequest(null)}
          onDecided={() => {
            setOpenWsRequest(null);
            void load();
          }}
        />
      )}
      {openSeatRequest && (
        <SeatRequestDetailModal
          request={openSeatRequest}
          onClose={() => setOpenSeatRequest(null)}
          onDecided={() => {
            setOpenSeatRequest(null);
            void load();
          }}
        />
      )}
    </div>
  );
}
