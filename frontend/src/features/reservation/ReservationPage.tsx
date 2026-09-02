import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import {
  cancelBooking,
  changeSeat,
  fetchAgencyApiAccess,
  fetchPnrDetail,
  fetchPnrList,
  fetchReservationDashboardStats,
  fetchReservationFlights,
  fetchSeatMap,
  issuePnr,
  lockSeat,
  markNoShow,
  releaseLock,
  searchFlights,
} from '../../api/reservation';
import { faDigits, faMoney } from '../../lib/fa-format';
import { airportCityName } from '../../lib/airport-cities';
import { formatJalaliDate, formatJalaliDateTime, parseJalaliDateToIso } from '../../lib/jalali';
import Modal from '../../components/Modal';
import Pagination from '../../components/Pagination';
import { usePagination } from '../../hooks/usePagination';
import BoardChairPlaneMode from './BoardChairPlaneMode';
import FlightSeatMapModal from './FlightSeatMapModal';
import ReservationMd80SeatMap, {
  isMd80Aircraft,
} from './ReservationMd80SeatMap';
import type {
  AgencyApiAccessRow,
  BookingStatus,
  FlightSearchResult,
  PnrDetail,
  PnrGroup,
  ReservationDashboardStats,
  ReservationFlightRow,
  ReservationFlightStatusKey,
  SeatCell,
  SeatMap,
} from '../../types/reservation';

/**
 * Merge of three reservation panels:
 *  - IT_MANAGER: four-tab «سامانه رزرواسیون» + view-only FlightSeatMapModal
 *  - BOARD_CHAIR: design four-tab ReservationSystem (BoardChairPlaneMode)
 *  - CEO / SENIOR_MANAGER: executive «هواپیما» dark shell
 */

/** Design: PNR | مسیر | مسافر | وضعیت — gap + isolate so LTR PNR doesn't stick to route */
const RECENT_PNR_GRID =
  'grid grid-cols-[minmax(7rem,1fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.9fr)] gap-x-2.5 items-center';
const PNR_CODE_CELL =
  'font-num font-bold text-[#60a5fa] [direction:ltr] [unicode-bidi:isolate] text-right';

export default function ReservationPage() {
  const { user } = useAuth();
  if (user?.role === 'BOARD_CHAIR') return <BoardChairPlaneMode />;
  if (user?.role === 'CEO' || user?.role === 'SENIOR_MANAGER') {
    return <ExecReservationView />;
  }
  return <ItReservationView />;
}

/* ------------------------------------------------------------------ *
 * IT_MANAGER — four-tab reservation system (سامانه رزرواسیون)
 * ------------------------------------------------------------------ */

type ItSubTab = 'dash' | 'pnr' | 'agency' | 'flights';

const IT_STATUS_LABEL: Record<BookingStatus, { label: string; className: string }> = {
  TICKETED: { label: 'صادرشده', className: 'bg-[rgba(16,185,129,.14)] text-[#34d399]' },
  CANCELLED: { label: 'لغوشده', className: 'bg-[rgba(248,113,113,.14)] text-[#f87171]' },
  DRAFT: { label: 'پیش‌نویس', className: 'bg-[#18223a] text-[#9fb0c7]' },
  HELD: { label: 'در انتظار', className: 'bg-[rgba(245,158,11,.14)] text-[#f59e0b]' },
  PAID: { label: 'پرداخت‌شده', className: 'bg-[rgba(59,130,246,.14)] text-[#60a5fa]' },
  EXPIRED: { label: 'منقضی', className: 'bg-[#18223a] text-[#9fb0c7]' },
  REFUNDED: { label: 'مستردشده', className: 'bg-[#18223a] text-[#9fb0c7]' },
  FLOWN: { label: 'پرواز شده', className: 'bg-[rgba(59,130,246,.14)] text-[#60a5fa]' },
  NO_SHOW: { label: 'عدم حضور', className: 'bg-[rgba(248,113,113,.14)] text-[#f87171]' },
};

const FLIGHT_STATUS: Record<
  ReservationFlightStatusKey,
  { label: string; className: string; bar: string }
> = {
  SELLING: {
    label: 'در حال فروش',
    className: 'bg-[rgba(59,130,246,.14)] text-[#60a5fa]',
    bar: '#34d399',
  },
  NEAR_FULL: {
    label: 'رو به تکمیل',
    className: 'bg-[rgba(245,158,11,.14)] text-[#f59e0b]',
    bar: '#f59e0b',
  },
  FULL: {
    label: 'تکمیل‌شده',
    className: 'bg-[rgba(248,113,113,.14)] text-[#f87171]',
    bar: '#f87171',
  },
};

const TABS: { key: ItSubTab; label: string; icon: ReactNode }[] = [
  {
    key: 'dash',
    label: 'داشبورد',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="7" height="9" />
        <rect x="14" y="3" width="7" height="5" />
        <rect x="14" y="12" width="7" height="9" />
        <rect x="3" y="16" width="7" height="5" />
      </svg>
    ),
  },
  {
    key: 'pnr',
    label: 'مدیریت رزروها',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 10h18M8 4v16" />
      </svg>
    ),
  },
  {
    key: 'agency',
    label: 'دسترسی آژانس‌ها',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      </svg>
    ),
  },
  {
    key: 'flights',
    label: 'پروازها',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
      </svg>
    ),
  },
];

function initialsOf(name: string) {
  const compact = name.replace(/\s+/g, '');
  return compact.slice(0, 2) || '؟';
}

function ItReservationView() {
  const { user } = useAuth();
  const canLock =
    user?.role === 'CEO' ||
    user?.role === 'BOARD_CHAIR' ||
    user?.role === 'SENIOR_MANAGER';

  const [subTab, setSubTab] = useState<ItSubTab>('dash');
  const [stats, setStats] = useState<ReservationDashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [pnrGroups, setPnrGroups] = useState<PnrGroup[]>([]);
  const [pnrQ, setPnrQ] = useState('');
  const [lnameQ, setLnameQ] = useState('');
  const [searchHit, setSearchHit] = useState<PnrDetail | null>(null);
  const [searchMiss, setSearchMiss] = useState(false);
  const [detailPnr, setDetailPnr] = useState<string | null>(null);
  const [detail, setDetail] = useState<PnrDetail | null>(null);
  const [changeSeatInput, setChangeSeatInput] = useState('');

  const [agencies, setAgencies] = useState<AgencyApiAccessRow[] | null>(null);
  const [flights, setFlights] = useState<ReservationFlightRow[] | null>(null);
  const [flightQ, setFlightQ] = useState('');
  const [seatMapFlightId, setSeatMapFlightId] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    try {
      setStats(await fetchReservationDashboardStats());
    } catch {
      setError('خطا در دریافت آمار داشبورد.');
    }
  }, []);

  const loadPnrList = useCallback(async () => {
    try {
      setPnrGroups(await fetchPnrList());
    } catch {
      setError('خطا در دریافت فهرست رزروها.');
    }
  }, []);

  const loadAgencies = useCallback(async () => {
    try {
      setAgencies(await fetchAgencyApiAccess());
    } catch {
      setError('خطا در دریافت دسترسی آژانس‌ها.');
      setAgencies([]);
    }
  }, []);

  const loadFlights = useCallback(async (q?: string) => {
    try {
      setFlights(await fetchReservationFlights(q));
    } catch {
      setError('خطا در دریافت فهرست پروازها.');
      setFlights([]);
    }
  }, []);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  useEffect(() => {
    if (subTab === 'pnr') void loadPnrList();
    if (subTab === 'agency') void loadAgencies();
    if (subTab === 'flights') void loadFlights();
  }, [subTab, loadPnrList, loadAgencies, loadFlights]);

  useEffect(() => {
    if (subTab !== 'flights') return;
    const t = window.setTimeout(() => void loadFlights(flightQ.trim() || undefined), 280);
    return () => window.clearTimeout(t);
  }, [flightQ, subTab, loadFlights]);

  useEffect(() => {
    if (!detailPnr) {
      setDetail(null);
      return;
    }
    void fetchPnrDetail(detailPnr)
      .then(setDetail)
      .catch(() => setError('خطا در دریافت جزئیات رزرو.'));
  }, [detailPnr]);

  const recentRows = useMemo(
    () =>
      pnrGroups.flatMap((g) =>
        g.rows.map((r) => ({
          pnr: r.pnr,
          route: g.route,
          passenger: r.passenger,
          status: r.status,
        })),
      ),
    [pnrGroups],
  );

  const issuedRows = useMemo(
    () => recentRows.filter((r) => r.status === 'TICKETED' || r.status === 'FLOWN'),
    [recentRows],
  );

  const recentPager = usePagination(recentRows);
  const issuedPager = usePagination(issuedRows);
  const agenciesPager = usePagination(agencies ?? []);
  const flightsPager = usePagination(flights ?? []);

  async function onPnrSearch() {
    setError(null);
    setSearchHit(null);
    setSearchMiss(false);
    const pnr = pnrQ.trim();
    const lname = lnameQ.trim();
    if (!pnr && !lname) {
      setError('کد رزرو یا نام خانوادگی را وارد کنید.');
      return;
    }
    try {
      if (pnr) {
        try {
          const d = await fetchPnrDetail(pnr);
          if (lname && !(d.passenger?.fullName ?? '').includes(lname)) {
            setSearchMiss(true);
            return;
          }
          setSearchHit(d);
          return;
        } catch {
          setSearchMiss(true);
          return;
        }
      }
      const groups = await fetchPnrList(lname);
      const flat = groups.flatMap((g) => g.rows.map((r) => ({ ...r, route: g.route, departureAt: g.departureAt })));
      const first = flat[0];
      if (!first) {
        setSearchMiss(true);
        return;
      }
      setSearchHit(await fetchPnrDetail(first.pnr));
    } catch {
      setError('خطا در جستجوی رزرو.');
    }
  }

  async function onChangeSeat() {
    if (!detailPnr || !changeSeatInput.trim()) return;
    try {
      setDetail(await changeSeat(detailPnr, changeSeatInput.trim()));
      setNotice('صندلی با موفقیت تغییر کرد.');
      setChangeSeatInput('');
      await loadPnrList();
    } catch {
      setError('تغییر صندلی ممکن نشد.');
    }
  }

  async function onCancel() {
    if (!detailPnr) return;
    try {
      setDetail(await cancelBooking(detailPnr));
      setNotice('رزرو لغو شد.');
      await loadPnrList();
    } catch {
      setError('لغو رزرو ممکن نشد.');
    }
  }

  async function onMarkNoShow() {
    if (!detailPnr) return;
    try {
      setDetail(await markNoShow(detailPnr));
      setNotice('عدم حضور مسافر ثبت شد.');
      await loadPnrList();
    } catch {
      setError('ثبت عدم حضور ممکن نشد.');
    }
  }

  return (
    <div className="px-[21px] pb-[34px] pt-[18px]">
      <div className="mb-5">
        <h1 className="text-[20.5px] font-black text-white">سامانه رزرواسیون پرواز</h1>
        <p className="mt-1 text-[11.5px] text-[#6b7b94]">
          جستجو و رزرو، مدیریت PNRها، صدور بلیط و دسترسی API آژانس‌ها
        </p>
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-[rgba(248,113,113,.12)] p-3 text-sm text-[#f87171]" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="mb-4 rounded-lg bg-[rgba(16,185,129,.12)] p-3 text-sm text-[#34d399]">{notice}</p>
      )}

      <div className="mb-[18px] flex w-max max-w-full flex-wrap gap-[5px] rounded-[13px] border border-[#28344c] bg-[#18223a] p-1">
        {TABS.map((t) => {
          const active = subTab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                setError(null);
                setNotice(null);
                setSubTab(t.key);
              }}
              className={`flex items-center gap-1.5 rounded-[9px] px-[13px] py-[7px] text-[11.5px] transition ${
                active ? 'bg-[#3b82f6] font-extrabold text-white' : 'font-semibold text-[#9fb0c7]'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          );
        })}
      </div>

      {subTab === 'dash' && (
        <div className="flex flex-col gap-[13px]">
          <div className="grid grid-cols-2 gap-[11px] lg:grid-cols-4">
            <KpiCard label="رزروهای امروز" value={faDigits(stats?.todayBookings ?? 0)} />
            <KpiCard
              label="PNRهای فعال"
              value={faDigits(stats?.activePnrs ?? 0)}
              valueClass="text-[#60a5fa]"
            />
            <KpiCard
              label="صندلی فروخته‌شده"
              value={faDigits(stats?.seatsSold ?? 0)}
              valueClass="text-[#34d399]"
            />
            <KpiCard
              label="درآمد رزروها"
              value={stats ? `${faMoney(stats.revenueIrr)} تومان` : '۰ تومان'}
              valueClass="text-[16px] text-[#fcd34d]"
            />
          </div>

          <div className="grid grid-cols-1 gap-[13px] lg:grid-cols-[1.3fr_1fr]">
            <section className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-[15px]">
              <div className="mb-1 flex items-center justify-between gap-2">
                <h2 className="m-0 text-[13.5px] font-extrabold text-white">وضعیت سرویس‌های سامانه</h2>
                <span
                  className={`rounded-[14px] px-2.5 py-1 text-[10px] font-bold ${
                    stats?.servicesStable !== false
                      ? 'bg-[rgba(16,185,129,.14)] text-[#34d399]'
                      : 'bg-[rgba(248,113,113,.14)] text-[#f87171]'
                  }`}
                >
                  {stats?.servicesStable !== false ? 'پایدار' : 'ناپایدار'}
                </span>
              </div>
              <p className="mb-4 text-[11px] text-[#6b7b94]">
                معماری میکروسرویس رزرواسیون — از API Gateway تا پلتفرم API شرکا
              </p>
              <div className="flex flex-col gap-[7px]">
                {(stats?.services ?? []).map((s) => (
                  <div
                    key={s.name}
                    className="flex items-center gap-2.5 rounded-[11px] border border-[#22304a] bg-[#0f1623] px-[11px] py-[9px]"
                  >
                    <span
                      className={`h-[9px] w-[9px] flex-none rounded-full ${
                        s.ok ? 'bg-[#34d399] shadow-[0_0_0_3px_rgba(16,185,129,.18)]' : 'bg-[#f87171]'
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="ltr text-xs font-bold text-[#e7ecf3]">{s.name}</div>
                      <div className="text-[10px] text-[#6b7b94]">{s.fa}</div>
                    </div>
                    <span className="font-num ltr text-[10px] text-[#7d8aa0]">
                      {s.latencyMs != null ? `${faDigits(s.latencyMs)}ms` : '—'}
                    </span>
                    <span
                      className={`w-16 flex-none text-left text-[10px] font-bold ${
                        s.ok ? 'text-[#34d399]' : 'text-[#f87171]'
                      }`}
                    >
                      {s.statusLabel}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-[15px]">
              <h2 className="mb-4 text-[13.5px] font-extrabold text-white">تفکیک کانال رزرو</h2>
              {(stats?.channels.length ?? 0) === 0 ? (
                <p className="py-6 text-center text-xs text-[#6b7b94]">کانال رزروی ثبت نشده است.</p>
              ) : (
                <div className="flex flex-col gap-[11px]">
                  {stats!.channels.map((c) => (
                    <div key={c.key}>
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-[11.5px] text-[#9fb0c7]">
                          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: c.color }} />
                          {c.label}
                        </span>
                        <span className="font-num text-[11.5px] font-extrabold text-[#e7ecf3]">
                          {faDigits(c.pct)}٪
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded bg-[#0f1623]">
                        <div className="h-full" style={{ width: `${c.pct}%`, background: c.color }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {subTab === 'pnr' && (
        <div className="flex flex-col gap-[13px]">
          <section className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-[15px]">
            <h2 className="mb-4 text-[13.5px] font-extrabold text-white">جستجوی رزرو</h2>
            <div className="grid grid-cols-1 items-end gap-[9px] md:grid-cols-[1fr_1fr_auto]">
              <label className="block">
                <span className="mb-1.5 block text-[10.5px] text-[#6b7b94]">کد رزرو (PNR)</span>
                <input
                  value={pnrQ}
                  onChange={(e) => {
                    setPnrQ(e.target.value);
                    setSearchHit(null);
                    setSearchMiss(false);
                  }}
                  placeholder="مثلاً AS-88421"
                  dir="ltr"
                  className="font-num h-11 w-full rounded-[10px] border border-[#28344c] bg-[#0f1623] px-[11px] text-xs text-[#e7ecf3] outline-none focus:border-[#3b82f6]"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[10.5px] text-[#6b7b94]">نام خانوادگی مسافر</span>
                <input
                  value={lnameQ}
                  onChange={(e) => {
                    setLnameQ(e.target.value);
                    setSearchHit(null);
                    setSearchMiss(false);
                  }}
                  placeholder="نام خانوادگی"
                  className="h-11 w-full rounded-[10px] border border-[#28344c] bg-[#0f1623] px-[11px] text-xs text-[#e7ecf3] outline-none focus:border-[#3b82f6]"
                />
              </label>
              <button
                type="button"
                onClick={() => void onPnrSearch()}
                className="flex h-11 items-center justify-center gap-1.5 rounded-[10px] bg-[#3b82f6] px-5 text-[12.5px] font-extrabold text-white"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <circle cx="11" cy="11" r="7" />
                  <path d="M21 21l-4-4" />
                </svg>
                جستجو
              </button>
            </div>
          </section>

          {searchHit && (
            <section className="overflow-hidden rounded-[14px] border border-[#1f2a3d] bg-[#141d2e]">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1f2a3d] px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setDetailPnr(searchHit.pnr)}
                    className="font-num ltr text-sm font-extrabold text-white underline decoration-dashed underline-offset-4"
                  >
                    {searchHit.pnr}
                  </button>
                  <span
                    className={`rounded-[14px] px-2.5 py-0.5 text-[10px] font-bold ${
                      IT_STATUS_LABEL[searchHit.status]?.className ?? ''
                    }`}
                  >
                    {IT_STATUS_LABEL[searchHit.status]?.label ?? searchHit.status}
                  </span>
                </div>
                <div className="text-[11.5px] text-[#9fb0c7]">
                  {searchHit.originCode} → {searchHit.destCode} · {formatJalaliDate(searchHit.departureAt)}
                </div>
              </div>
              <div className="flex flex-col gap-2 p-4">
                <div className="flex items-center justify-between rounded-[11px] border border-[#22304a] bg-[#0f1623] px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full bg-[rgba(59,130,246,.16)] text-[11px] font-extrabold text-[#60a5fa]">
                      {initialsOf(searchHit.passenger?.fullName ?? '؟')}
                    </span>
                    <div>
                      <div className="text-xs font-bold text-[#e7ecf3]">
                        {searchHit.passenger?.fullName ?? '—'}
                      </div>
                      <div className="text-[10px] text-[#6b7b94]">
                        صندلی {searchHit.passenger?.seatCode ?? '—'}
                      </div>
                    </div>
                  </div>
                  <span className="text-[10.5px] font-bold text-[#34d399]">
                    {IT_STATUS_LABEL[searchHit.status]?.label ?? searchHit.status}
                  </span>
                </div>
              </div>
            </section>
          )}

          {searchMiss && (
            <div className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] px-4 py-[34px] text-center text-xs text-[#6b7b94]">
              رزروی با این مشخصات یافت نشد.
            </div>
          )}

          <section className="overflow-hidden rounded-[14px] border border-[#1f2a3d] bg-[#141d2e]">
            <div className="border-b border-[#1f2a3d] px-[15px] py-3 text-[13px] font-extrabold text-white">
              آخرین رزروهای ثبت‌شده
            </div>
            <div
              className={`${RECENT_PNR_GRID} border-b border-[#1f2a3d] px-[15px] py-[11px] text-[10.5px] font-bold text-[#6b7b94]`}
            >
              <span>PNR</span>
              <span>مسیر</span>
              <span>مسافر</span>
              <span>وضعیت</span>
            </div>
            {recentRows.length === 0 ? (
              <div className="px-[15px] py-[26px] text-center text-xs text-[#6b7b94]">رزروی ثبت نشده است.</div>
            ) : (
              recentPager.pageItems.map((r) => {
                const st = IT_STATUS_LABEL[r.status] ?? {
                  label: r.status,
                  className: 'bg-[#18223a] text-[#9fb0c7]',
                };
                return (
                  <div
                    key={r.pnr}
                    className={`${RECENT_PNR_GRID} border-b border-[#16202e] px-[15px] py-3 text-xs last:border-0`}
                  >
                    <button
                      type="button"
                      onClick={() => setDetailPnr(r.pnr)}
                      className={`${PNR_CODE_CELL} underline decoration-dashed underline-offset-4`}
                    >
                      {r.pnr}
                    </button>
                    <span className="min-w-0 truncate text-[#cdd6e3]">{r.route}</span>
                    <span className="min-w-0 truncate text-[#9fb0c7]">{r.passenger}</span>
                    <span className={`w-max rounded-[14px] px-2.5 py-0.5 text-[10px] font-bold ${st.className}`}>
                      {st.label}
                    </span>
                  </div>
                );
              })
            )}
            <Pagination
              page={recentPager.page}
              totalPages={recentPager.totalPages}
              onChange={recentPager.setPage}
              variant="dark"
            />
          </section>

          <section className="overflow-hidden rounded-[14px] border border-[#1f2a3d] bg-[#141d2e]">
            <div className="border-b border-[#1f2a3d] px-[15px] py-3">
              <h2 className="text-[13.5px] font-extrabold text-white">بلیط‌های صادرشده</h2>
              <p className="mt-1 text-[10.5px] text-[#6b7b94]">
                رزروهایی با وضعیت صادرشده یا پروازشده
              </p>
            </div>
            <div
              className={`${RECENT_PNR_GRID} border-b border-[#1f2a3d] px-[15px] py-[11px] text-[10.5px] font-bold text-[#6b7b94]`}
            >
              <span>PNR</span>
              <span>مسیر</span>
              <span>مسافر</span>
              <span>وضعیت</span>
            </div>
            {issuedRows.length === 0 ? (
              <div className="px-[15px] py-[34px] text-center text-xs text-[#6b7b94]">
                بلیط صادرشده‌ای ثبت نشده است.
              </div>
            ) : (
              issuedPager.pageItems.map((r) => {
                const st = IT_STATUS_LABEL[r.status] ?? IT_STATUS_LABEL.TICKETED;
                return (
                  <div
                    key={`issued-${r.pnr}`}
                    className={`${RECENT_PNR_GRID} border-b border-[#16202e] px-[15px] py-3 text-xs last:border-0`}
                  >
                    <button
                      type="button"
                      onClick={() => setDetailPnr(r.pnr)}
                      className={`${PNR_CODE_CELL} underline decoration-dashed underline-offset-4`}
                    >
                      {r.pnr}
                    </button>
                    <span className="min-w-0 truncate text-[#cdd6e3]">{r.route}</span>
                    <span className="min-w-0 truncate text-[#9fb0c7]">{r.passenger}</span>
                    <span className={`w-max rounded-[14px] px-2.5 py-0.5 text-[10px] font-bold ${st.className}`}>
                      {st.label}
                    </span>
                  </div>
                );
              })
            )}
            <Pagination
              page={issuedPager.page}
              totalPages={issuedPager.totalPages}
              onChange={issuedPager.setPage}
              variant="dark"
            />
          </section>
        </div>
      )}

      {subTab === 'agency' && (
        <div className="flex flex-col gap-[11px]">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] px-4 py-3">
            <p className="text-[11px] text-[#9fb0c7]">
              مدیریت کامل کلیدها، Scope و سیاست دسترسی در وب‌سرویس‌ها انجام می‌شود.
            </p>
            <Link
              to="/panel/webservices"
              className="rounded-[10px] bg-[#3b82f6] px-3.5 py-2 text-[11px] font-extrabold text-white"
            >
              وب‌سرویس‌ها و API ←
            </Link>
          </div>
          {agencies === null ? (
            <p className="py-8 text-center text-xs text-[#6b7b94]">در حال بارگذاری…</p>
          ) : agencies.length === 0 ? (
            <div className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] px-4 py-[34px] text-center text-xs text-[#6b7b94]">
              آژانسی با دسترسی API ثبت نشده است.
            </div>
          ) : (
            agenciesPager.pageItems.map((a) => (
              <div
                key={a.id}
                className="flex flex-wrap items-center gap-3.5 rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-3.5"
              >
                <span className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[11px] bg-[rgba(147,51,234,.14)] text-xs font-extrabold text-[#a855f7]">
                  {a.initials}
                </span>
                <div className="min-w-[180px] flex-1">
                  <div className="text-[13px] font-extrabold text-white">{a.name}</div>
                  <div className="font-num ltr mt-1 text-[10.5px] text-[#6b7b94]">{a.keyHint}</div>
                </div>
                <div className="flex-none text-center">
                  <div className="text-[10px] text-[#6b7b94]">درخواست‌ها</div>
                  <div className="font-num mt-0.5 text-[13px] font-extrabold text-[#e7ecf3]">
                    {faDigits(a.callCount)}
                  </div>
                </div>
                <div className="flex-none text-center">
                  <div className="text-[10px] text-[#6b7b94]">آخرین اتصال</div>
                  <div className="mt-0.5 text-[11px] font-bold text-[#9fb0c7]">
                    {a.lastUsedAt ? formatJalaliDateTime(a.lastUsedAt) : '—'}
                  </div>
                </div>
                <span
                  className={`flex-none rounded-[14px] px-[11px] py-1 text-[10.5px] font-bold ${
                    a.status === 'ACTIVE'
                      ? 'bg-[rgba(16,185,129,.14)] text-[#34d399]'
                      : 'bg-[rgba(248,113,113,.14)] text-[#f87171]'
                  }`}
                >
                  {a.status === 'ACTIVE' ? 'فعال' : 'معلق'}
                </span>
              </div>
            ))
          )}
          <Pagination
            page={agenciesPager.page}
            totalPages={agenciesPager.totalPages}
            onChange={agenciesPager.setPage}
            variant="dark"
          />
        </div>
      )}

      {subTab === 'flights' && (
        <section className="overflow-hidden rounded-[14px] border border-[#1f2a3d] bg-[#141d2e]">
          <div className="border-b border-[#1f2a3d] p-3">
            <input
              value={flightQ}
              onChange={(e) => setFlightQ(e.target.value)}
              placeholder="جستجوی پرواز - مسیر یا شماره پرواز"
              className="h-[42px] w-full rounded-[10px] border border-[#28344c] bg-[#0f1623] px-3 text-xs text-[#e7ecf3] outline-none placeholder:text-[#6b7b94] focus:border-[#3b82f6]"
            />
          </div>
          <div className="grid grid-cols-[1.4fr_0.9fr_1.1fr_0.9fr_0.9fr_0.9fr] gap-x-3.5 border-b border-[#1f2a3d] px-[15px] py-[11px] text-[10.5px] font-bold text-[#6b7b94]">
            <span>مسیر</span>
            <span>شماره پرواز</span>
            <span>تاریخ / ساعت</span>
            <span>نوع هواپیما</span>
            <span>ظرفیت</span>
            <span>وضعیت</span>
          </div>
          {flights === null ? (
            <div className="px-[15px] py-[34px] text-center text-xs text-[#6b7b94]">در حال بارگذاری…</div>
          ) : flights.length === 0 ? (
            <div className="px-[15px] py-[34px] text-center text-xs text-[#6b7b94]">پروازی ثبت نشده است.</div>
          ) : (
            flightsPager.pageItems.map((f) => {
              const st = FLIGHT_STATUS[f.statusKey ?? 'SELLING'];
              return (
                <button
                  key={f.flightInstanceId}
                  type="button"
                  onClick={() => setSeatMapFlightId(f.flightInstanceId)}
                  className="grid w-full grid-cols-[1.4fr_0.9fr_1.1fr_0.9fr_0.9fr_0.9fr] items-center gap-x-3.5 border-b border-[#16202e] px-[15px] py-3 text-right text-xs transition last:border-0 hover:bg-[#18223a]"
                >
                  <span className="min-w-0 truncate font-bold text-[#e7ecf3]">{flightRouteLabel(f)}</span>
                  <span className="font-num text-[#9fb0c7] [direction:ltr] [unicode-bidi:isolate] text-right">
                    {f.flightNo}
                  </span>
                  <span className="text-[#9fb0c7]">{formatJalaliDateTime(f.departureAt)}</span>
                  <span className="font-num ltr text-[#9fb0c7]">{f.aircraftType}</span>
                  <div className="flex flex-col gap-1">
                    <div className="font-num ltr text-[10.5px] text-[#9fb0c7]" dir="ltr">
                      {faDigits(f.sold ?? 0)} / {faDigits(f.capacity)}
                    </div>
                    <div className="h-1.5 overflow-hidden rounded bg-[#0f1623]">
                      <div
                        className="h-full"
                        style={{ width: `${Math.min(f.occupancyPct ?? 0, 100)}%`, background: st.bar }}
                      />
                    </div>
                  </div>
                  <span className={`w-max rounded-[14px] px-2.5 py-1 text-[10.5px] font-bold ${st.className}`}>
                    {st.label}
                  </span>
                </button>
              );
            })
          )}
          <Pagination
            page={flightsPager.page}
            totalPages={flightsPager.totalPages}
            onChange={flightsPager.setPage}
            variant="dark"
          />
        </section>
      )}

      {seatMapFlightId && (
        <FlightSeatMapModal
          flightInstanceId={seatMapFlightId}
          onClose={() => setSeatMapFlightId(null)}
          lockDisabledNote={
            user?.role === 'IT_MANAGER'
              ? 'مدیر فناوری اطلاعات امکان قفل دستی صندلی را ندارد؛ فقط مشاهدهٔ وضعیت و مشخصات رزروکننده.'
              : 'در این نما فقط مشاهدهٔ نقشه و رزرو فعال است؛ قفل دستی از این پاپ‌آپ انجام نمی‌شود.'
          }
        />
      )}

      {detailPnr && detail && (
        <Modal variant="dark" title={`رزرو ${detail.pnr}`} onClose={() => setDetailPnr(null)}>
          <div className="mb-4 rounded-xl border border-[#1f2a3d] bg-[#0f1726] p-4 text-white">
            <div className="mb-2 flex items-center justify-between">
              <span className="ltr font-num text-xs">PNR {detail.pnr}</span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                  IT_STATUS_LABEL[detail.status]?.className ?? ''
                }`}
              >
                {IT_STATUS_LABEL[detail.status]?.label}
              </span>
            </div>
            <div className="flex items-center justify-between text-lg font-black">
              <span className="ltr">{detail.originCode}</span>
              <span>✈</span>
              <span className="ltr">{detail.destCode}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-4 border-t border-white/15 pt-3 text-[11px]">
              <div>
                <div className="text-white/50">مسافر</div>
                <div className="font-bold">{detail.passenger?.fullName ?? '—'}</div>
              </div>
              <div>
                <div className="text-white/50">صندلی</div>
                <div className="font-num font-bold text-[#fcd34d]">{detail.passenger?.seatCode ?? '—'}</div>
              </div>
              <div>
                <div className="text-white/50">تاریخ</div>
                <div className="font-bold">{formatJalaliDateTime(detail.departureAt)}</div>
              </div>
              <div>
                <div className="text-white/50">مبلغ</div>
                <div className="font-bold text-[#34d399]">{faMoney(detail.priceIrr)} تومان</div>
              </div>
            </div>
          </div>

          {canLock && detail.status !== 'CANCELLED' && (
            <div className="flex flex-col gap-3">
              <div className="flex gap-2">
                <input
                  value={changeSeatInput}
                  onChange={(e) => setChangeSeatInput(e.target.value)}
                  placeholder="شماره صندلی جدید"
                  dir="ltr"
                  className="font-num flex-1 rounded-lg border border-[#1f2a3d] bg-[#0f1726] p-2.5 text-xs text-[#e7ecf3] outline-none placeholder:text-[#6b7b94] focus:border-[#3b82f6]"
                />
                <button
                  type="button"
                  onClick={() => void onChangeSeat()}
                  className="rounded-lg bg-[#f59e0b] px-4 py-2 text-xs font-bold text-white"
                >
                  ثبت تغییر
                </button>
              </div>
              <button
                type="button"
                onClick={() => void onCancel()}
                className="rounded-lg bg-[rgba(248,113,113,.12)] px-4 py-2 text-xs font-bold text-[#f87171]"
              >
                لغو رزرو
              </button>
              {(detail.status === 'TICKETED' || detail.status === 'FLOWN') && (
                <button
                  type="button"
                  onClick={() => void onMarkNoShow()}
                  className="rounded-lg bg-[#18223a] px-4 py-2 text-xs font-bold text-[#cdd6e3]"
                >
                  ثبت عدم حضور مسافر
                </button>
              )}
            </div>
          )}
          {detail.status === 'CANCELLED' && (
            <p className="rounded-lg bg-[rgba(248,113,113,.12)] p-3 text-xs font-bold text-[#f87171]">
              این رزرو لغو شده است.
            </p>
          )}
        </Modal>
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  valueClass = 'text-white',
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-[13px]">
      <div className="mb-[7px] text-[11px] text-[#6b7b94]">{label}</div>
      <div className={`font-num text-[21.5px] font-black ${valueClass}`}>{value}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * CEO / BOARD_CHAIR / SENIOR_MANAGER — executive «هواپیما» dark shell
 * ------------------------------------------------------------------ */

type SubTab = 'dash' | 'pnr' | 'flights' | 'new';

const STATUS_LABEL: Record<string, { label: string; className: string; darkClass: string }> = {
  TICKETED: {
    label: 'صادرشده',
    className: 'bg-[#10b98124] text-[#059669]',
    darkClass: 'bg-[rgba(16,185,129,.14)] text-[#34d399]',
  },
  CANCELLED: {
    label: 'لغوشده',
    className: 'bg-danger/15 text-danger',
    darkClass: 'bg-[rgba(248,113,113,.14)] text-[#f87171]',
  },
  DRAFT: {
    label: 'پیش‌نویس',
    className: 'bg-surface text-text-2',
    darkClass: 'bg-[#18223a] text-[#9fb0c7]',
  },
  HELD: {
    label: 'در انتظار',
    className: 'bg-[#f59e0b24] text-[#b45309]',
    darkClass: 'bg-[rgba(245,158,11,.14)] text-[#fbbf24]',
  },
  PAID: {
    label: 'پرداخت‌شده',
    className: 'bg-[#3b82f624] text-[#1d4ed8]',
    darkClass: 'bg-[rgba(59,130,246,.14)] text-[#60a5fa]',
  },
  EXPIRED: {
    label: 'منقضی',
    className: 'bg-surface text-muted',
    darkClass: 'bg-[#18223a] text-[#6b7b94]',
  },
  REFUNDED: {
    label: 'مستردشده',
    className: 'bg-surface text-muted',
    darkClass: 'bg-[#18223a] text-[#6b7b94]',
  },
  FLOWN: {
    label: 'پرواز شده',
    className: 'bg-[#3b82f624] text-[#1d4ed8]',
    darkClass: 'bg-[rgba(59,130,246,.14)] text-[#60a5fa]',
  },
  NO_SHOW: {
    label: 'عدم حضور',
    className: 'bg-danger/15 text-danger',
    darkClass: 'bg-[rgba(248,113,113,.14)] text-[#f87171]',
  },
};

const AIRCRAFT_LABEL: Record<string, string> = {
  'MD-80': 'مک‌دانل داگلاس MD-80',
  'MD-88': 'مک‌دانل داگلاس MD-88',
  A320: 'ایرباس A320',
  'Airbus A320': 'ایرباس A320',
};

function aircraftLabel(type: string): string {
  return AIRCRAFT_LABEL[type] ?? type;
}

function remainingMs(iso: string | null | undefined): number {
  if (!iso) return 0;
  return Math.max(0, new Date(iso).getTime() - Date.now());
}

function formatCountdown(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${faDigits(String(m).padStart(2, '0'))}:${faDigits(String(s).padStart(2, '0'))}`;
}

function ExecReservationView() {
  const { user } = useAuth();
  const dark =
    user?.role === 'CEO' ||
    user?.role === 'BOARD_CHAIR' ||
    user?.role === 'SENIOR_MANAGER';
  const canLock =
    user?.role === 'CEO' ||
    user?.role === 'BOARD_CHAIR' ||
    user?.role === 'SENIOR_MANAGER' ||
    user?.role === 'IT_MANAGER';

  const [subTab, setSubTab] = useState<SubTab>('pnr');
  const [stats, setStats] = useState<ReservationDashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [pnrGroups, setPnrGroups] = useState<PnrGroup[]>([]);
  const [pnrQuery, setPnrQuery] = useState('');
  const [pnrLname, setPnrLname] = useState('');
  const [detailPnr, setDetailPnr] = useState<string | null>(null);
  const [detail, setDetail] = useState<PnrDetail | null>(null);
  const [changeSeatInput, setChangeSeatInput] = useState('');

  const [flightRows, setFlightRows] = useState<ReservationFlightRow[]>([]);
  const [flightQ, setFlightQ] = useState('');

  const [activeFlightInstanceId, setActiveFlightInstanceId] = useState<string | null>(null);
  const [seatMap, setSeatMap] = useState<SeatMap | null>(null);
  const [seatMapOpen, setSeatMapOpen] = useState(false);
  const [selectedSeat, setSelectedSeat] = useState<SeatCell | null>(null);
  const [seatFormMode, setSeatFormMode] = useState<'lock' | 'issue' | 'sold'>('lock');
  const [seatForm, setSeatForm] = useState({ name: '', nid: '', mobile: '', emergency: false });
  const [tick, setTick] = useState(0);

  const [searchForm, setSearchForm] = useState({ origin: '', dest: '', date: '' });
  const [searchResults, setSearchResults] = useState<FlightSearchResult[]>([]);

  const loadStats = useCallback(() => {
    fetchReservationDashboardStats().then(setStats).catch(() => undefined);
  }, []);

  const loadPnrList = useCallback(async () => {
    try {
      setPnrGroups(await fetchPnrList(pnrQuery.trim() || undefined));
    } catch {
      setError('خطا در دریافت فهرست رزروها.');
    }
  }, [pnrQuery]);

  const recentRows = useMemo(() => {
    const lname = pnrLname.trim();
    return pnrGroups.flatMap((g) =>
      g.rows
        .filter((r) => !lname || r.passenger.includes(lname))
        .map((r) => ({
          pnr: r.pnr,
          route: g.route,
          passenger: r.passenger,
          status: r.status,
        })),
    );
  }, [pnrGroups, pnrLname]);

  const recentPager = usePagination(recentRows);
  const pnrGroupsPager = usePagination(pnrGroups);
  const searchResultsPager = usePagination(searchResults);

  const loadFlights = useCallback(async () => {
    try {
      setFlightRows(await fetchReservationFlights(flightQ || undefined));
    } catch {
      setError('خطا در دریافت فهرست پروازها.');
    }
  }, [flightQ]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    const timer = setTimeout(() => void loadPnrList(), 250);
    return () => clearTimeout(timer);
  }, [loadPnrList]);

  useEffect(() => {
    if (subTab !== 'flights' && subTab !== 'dash') return;
    const timer = setTimeout(() => void loadFlights(), 250);
    return () => clearTimeout(timer);
  }, [loadFlights, subTab]);

  useEffect(() => {
    if (!seatMapOpen) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [seatMapOpen]);

  const loadSeatMap = useCallback(async (flightInstanceId: string, openModal = true) => {
    try {
      const map = await fetchSeatMap(flightInstanceId);
      setSeatMap(map);
      setActiveFlightInstanceId(flightInstanceId);
      setSelectedSeat(null);
      if (openModal) setSeatMapOpen(true);
    } catch {
      setError('خطا در دریافت نقشهٔ صندلی.');
    }
  }, []);

  async function openPnrDetail(pnr: string) {
    setDetailPnr(pnr);
    try {
      setDetail(await fetchPnrDetail(pnr));
    } catch {
      setError('خطا در دریافت جزئیات رزرو.');
    }
  }

  async function onCancel() {
    if (!detailPnr) return;
    try {
      await cancelBooking(detailPnr);
      setNotice('رزرو لغو شد.');
      setDetailPnr(null);
      await loadPnrList();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطا در لغو رزرو.');
    }
  }

  async function onChangeSeat() {
    if (!detailPnr || !changeSeatInput.trim()) return;
    try {
      await changeSeat(detailPnr, changeSeatInput.trim());
      setNotice('صندلی رزرو تغییر کرد.');
      setDetail(await fetchPnrDetail(detailPnr));
      setChangeSeatInput('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطا در تغییر صندلی.');
    }
  }

  async function onMarkNoShow() {
    if (!detailPnr) return;
    try {
      await markNoShow(detailPnr);
      setNotice('عدم حضور مسافر ثبت شد.');
      setDetail(await fetchPnrDetail(detailPnr));
      await loadPnrList();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطا در ثبت عدم حضور.');
    }
  }

  function onSeatClick(seat: SeatCell) {
    setSelectedSeat(seat);
    setSeatForm({ name: '', nid: '', mobile: '', emergency: false });
    if (seat.status === 'SOLD' && seat.occupant) {
      setSeatFormMode('sold');
      return;
    }
    if (!canLock) return;
    if (seat.status === 'LOCKED') {
      // Release via the countdown chips; selecting the seat only highlights it.
      setSeatFormMode('lock');
      setSelectedSeat(seat);
      return;
    }
    setSeatFormMode(subTab === 'new' ? 'issue' : 'lock');
  }

  async function onReleaseChip(lockId: string) {
    try {
      await releaseLock(lockId);
      if (activeFlightInstanceId) await loadSeatMap(activeFlightInstanceId, false);
    } catch {
      setError('خطا در آزادسازی صندلی.');
    }
  }

  async function onSubmitSeatForm() {
    if (!selectedSeat || !activeFlightInstanceId) return;
    try {
      if (seatFormMode === 'lock') {
        await lockSeat(activeFlightInstanceId, {
          seatCode: selectedSeat.seatCode,
          reason: seatForm.emergency
            ? 'لاک اضطراری بدون مسافر'
            : seatForm.name.trim()
              ? `رزرو مدیریتی برای ${seatForm.name.trim()}`
              : 'لاک مدیریتی از پنل هواپیما',
          classification: 'PAYABLE',
          passengerName: seatForm.emergency ? undefined : seatForm.name || undefined,
          passengerNationalId: seatForm.emergency ? undefined : seatForm.nid || undefined,
          passengerMobile: seatForm.emergency ? undefined : seatForm.mobile || undefined,
        });
        setNotice(`صندلی ${selectedSeat.seatCode} لاک شد ✓`);
      } else if (seatFormMode === 'issue') {
        if (!seatForm.name.trim()) {
          setError('نام مسافر الزامی است.');
          return;
        }
        const pnr = await issuePnr({
          flightInstanceId: activeFlightInstanceId,
          seatCode: selectedSeat.seatCode,
          passengerName: seatForm.name.trim(),
          passengerNationalId: seatForm.nid || undefined,
          passengerMobile: seatForm.mobile || undefined,
        });
        setNotice(`رزرو ${pnr.pnr} صادر شد ✓`);
      }
      setSelectedSeat(null);
      await loadSeatMap(activeFlightInstanceId, false);
      await loadPnrList();
      await loadFlights();
      loadStats();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطا در ثبت.');
    }
  }

  async function onSearch() {
    if (!searchForm.origin.trim() || !searchForm.dest.trim() || !searchForm.date.trim()) {
      setError('مبدأ، مقصد و تاریخ الزامی است.');
      return;
    }
    const iso = parseJalaliDateToIso(searchForm.date) ?? searchForm.date;
    try {
      setSearchResults(await searchFlights(searchForm.origin.trim(), searchForm.dest.trim(), iso));
    } catch {
      setError('خطا در جستجوی پرواز.');
    }
  }

  const lockedSeats = useMemo(() => {
    void tick;
    if (!seatMap) return [];
    return seatMap.rows
      .flatMap((r) => r.seats)
      .filter((s) => s.status === 'LOCKED' && s.lockId);
  }, [seatMap, tick]);

  const shell = dark ? 'px-[21px] pb-[34px] pt-[18px]' : 'p-8';
  const tabs: [SubTab, string][] = dark
    ? [
        ['dash', 'داشبورد'],
        ['pnr', 'مدیریت رزروها'],
        ['flights', 'پروازها'],
        ['new', 'رزرو جدید'],
      ]
    : [
        ['pnr', 'مدیریت رزروها'],
        ['flights', 'پروازها'],
        ['new', 'رزرو جدید'],
      ];

  return (
    <div className={shell}>
      <div className={dark ? 'mb-5' : 'mb-6'}>
        <h1 className={dark ? 'text-[20.5px] font-black text-white' : 'text-xl font-black text-ink'}>
          سامانه رزرواسیون{dark ? ' پرواز' : ''}
        </h1>
        <p className={dark ? 'mt-1 text-[11.5px] text-[#6b7b94]' : 'mt-1 text-sm text-muted'}>
          {dark
            ? 'جستجو و رزرو، مدیریت PNRها، صدور بلیط و دسترسی API آژانس‌ها'
            : 'مدیریت رزروها، نقشهٔ صندلی و صدور دستی PNR'}
        </p>
      </div>

      {error && (
        <p
          className={`mb-4 rounded-lg p-3 text-sm ${
            dark ? 'bg-[rgba(248,113,113,.12)] text-[#f87171]' : 'bg-danger/10 text-danger'
          }`}
          role="alert"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          className={`mb-4 rounded-lg p-3 text-sm ${
            dark ? 'bg-[rgba(16,185,129,.12)] text-[#34d399]' : 'bg-[#10b98115] text-[#059669]'
          }`}
        >
          {notice}
        </p>
      )}

      <div
        className={
          dark
            ? 'mb-[18px] flex w-max max-w-full flex-wrap gap-1 rounded-[13px] border border-[#28344c] bg-[#18223a] p-1'
            : 'mb-6 flex w-max gap-1 rounded-xl border border-border bg-surface p-1'
        }
      >
        {tabs.map(([key, label]) => {
          const on = subTab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setSubTab(key)}
              className={
                dark
                  ? `rounded-[9px] px-[13px] py-[7px] text-[11.5px] transition ${
                      on ? 'bg-[#3b82f6] font-extrabold text-white' : 'font-medium text-[#9fb0c7]'
                    }`
                  : `rounded-lg px-4 py-2 text-xs font-bold transition ${
                      on ? 'bg-white text-ink shadow-sm' : 'text-text-2'
                    }`
              }
            >
              {label}
            </button>
          );
        })}
      </div>

      {subTab === 'dash' && <DashboardTab dark={dark} stats={stats} />}

      {subTab === 'pnr' && dark && (
        <div className="flex flex-col gap-[13px]">
          <section className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-[15px]">
            <h3 className="mb-4 text-[13.5px] font-extrabold text-white">جستجوی رزرو</h3>
            <div className="grid grid-cols-1 items-end gap-[9px] md:grid-cols-[1fr_1fr_auto]">
              <label className="block">
                <span className="mb-1.5 block text-[10.5px] text-[#6b7b94]">کد رزرو (PNR)</span>
                <input
                  value={pnrQuery}
                  onChange={(e) => setPnrQuery(e.target.value)}
                  placeholder="مثلاً AS-88421"
                  dir="ltr"
                  className="font-num h-11 w-full rounded-[10px] border border-[#28344c] bg-[#0f1623] px-[11px] text-right text-xs text-[#e7ecf3] outline-none focus:border-[#3b82f6]"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[10.5px] text-[#6b7b94]">نام خانوادگی مسافر</span>
                <input
                  value={pnrLname}
                  onChange={(e) => setPnrLname(e.target.value)}
                  placeholder="نام خانوادگی"
                  className="h-11 w-full rounded-[10px] border border-[#28344c] bg-[#0f1623] px-[11px] text-xs text-[#e7ecf3] outline-none focus:border-[#3b82f6]"
                />
              </label>
              <button
                type="button"
                onClick={() => void loadPnrList()}
                className="flex h-11 items-center justify-center gap-1.5 rounded-[10px] bg-[#3b82f6] px-5 text-[12.5px] font-extrabold text-white"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <circle cx="11" cy="11" r="7" />
                  <path d="M21 21l-4-4" />
                </svg>
                جستجو
              </button>
            </div>
          </section>

          <section className="overflow-hidden rounded-[14px] border border-[#1f2a3d] bg-[#141d2e]">
            <div className="border-b border-[#1f2a3d] px-[15px] py-3 text-[13px] font-extrabold text-white">
              آخرین رزروهای ثبت‌شده
            </div>
            <div
              className={`${RECENT_PNR_GRID} border-b border-[#1f2a3d] px-[15px] py-[11px] text-[10.5px] font-bold text-[#6b7b94]`}
            >
              <span>PNR</span>
              <span>مسیر</span>
              <span>مسافر</span>
              <span>وضعیت</span>
            </div>
            {recentRows.length === 0 ? (
              <div className="px-[15px] py-[26px] text-center text-xs text-[#6b7b94]">رزروی ثبت نشده است.</div>
            ) : (
              recentPager.pageItems.map((r) => {
                const st = STATUS_LABEL[r.status] ?? {
                  label: r.status,
                  darkClass: 'bg-[#18223a] text-[#9fb0c7]',
                };
                return (
                  <div
                    key={r.pnr}
                    className={`${RECENT_PNR_GRID} border-b border-[#16202e] px-[15px] py-3 text-xs last:border-0 hover:bg-[#18223a]`}
                  >
                    <button
                      type="button"
                      onClick={() => void openPnrDetail(r.pnr)}
                      className={`${PNR_CODE_CELL} underline decoration-dashed underline-offset-4`}
                    >
                      {r.pnr}
                    </button>
                    <span className="min-w-0 truncate text-[#cdd6e3]">{r.route}</span>
                    <span className="min-w-0 truncate text-[#9fb0c7]">{r.passenger}</span>
                    <span
                      className={`w-max rounded-[14px] px-2.5 py-0.5 text-[10px] font-bold ${st.darkClass}`}
                    >
                      {st.label}
                    </span>
                  </div>
                );
              })
            )}
            <Pagination
              page={recentPager.page}
              totalPages={recentPager.totalPages}
              onChange={recentPager.setPage}
              variant="dark"
            />
          </section>
        </div>
      )}

      {subTab === 'pnr' && !dark && (
        <section className="rounded-xl border border-border bg-white p-5">
          <input
            value={pnrQuery}
            onChange={(e) => setPnrQuery(e.target.value)}
            placeholder="جستجو با کد PNR یا نام مسافر…"
            className="mb-4 h-[42px] w-full rounded-xl border border-border bg-white px-4 text-xs outline-none transition focus:border-accent"
          />
          {pnrGroups.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted">رزروی یافت نشد.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {pnrGroupsPager.pageItems.map((g) => (
                <div key={g.flightInstanceId} className="overflow-hidden rounded-xl border border-border">
                  <div className="flex items-center gap-3 bg-surface px-4 py-2.5 text-xs">
                    <span className="ltr font-num font-bold text-[#60a5fa]">{g.flightNo}</span>
                    <span className="flex-1 font-bold text-ink">{g.route}</span>
                    <button
                      type="button"
                      onClick={() => void loadSeatMap(g.flightInstanceId)}
                      className="text-[11px] font-bold text-[#60a5fa]"
                    >
                      نقشهٔ صندلی {g.flightNo}
                    </button>
                    <span className="text-muted">{formatJalaliDate(g.departureAt)}</span>
                  </div>
                  <ul className="divide-y divide-border">
                    {g.rows.map((r) => {
                      const st = STATUS_LABEL[r.status] ?? {
                        label: r.status,
                        className: 'bg-surface text-text-2',
                      };
                      return (
                        <li key={r.pnr} className="flex items-center gap-3 px-4 py-2.5 text-xs">
                          <button
                            type="button"
                            onClick={() => void openPnrDetail(r.pnr)}
                            className="ltr font-num font-bold text-text-2 underline decoration-dashed underline-offset-4"
                          >
                            {r.pnr}
                          </button>
                          <span className="flex-1 text-ink">{r.passenger}</span>
                          <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${st.className}`}>
                            {st.label}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
          <Pagination
            page={pnrGroupsPager.page}
            totalPages={pnrGroupsPager.totalPages}
            onChange={pnrGroupsPager.setPage}
            variant="light"
          />
        </section>
      )}


      {subTab === 'flights' && (
        <FlightsTab
          dark={dark}
          rows={flightRows}
          q={flightQ}
          onQ={setFlightQ}
          onOpenSeatMap={(id) => void loadSeatMap(id)}
        />
      )}

      {subTab === 'new' && (
        <div className="flex flex-col gap-4">
          <section
            className={
              dark
                ? 'rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-[15px]'
                : 'rounded-xl border border-border bg-white p-5'
            }
          >
            <h2 className={`mb-4 text-sm font-bold ${dark ? 'text-white' : 'text-ink'}`}>
              جستجوی پرواز
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              {(
                [
                  ['origin', 'مبدأ'],
                  ['dest', 'مقصد'],
                  ['date', '۱۴۰۵/۰۵/۱۲'],
                ] as const
              ).map(([key, ph]) => (
                <input
                  key={key}
                  value={searchForm[key]}
                  onChange={(e) => setSearchForm({ ...searchForm, [key]: e.target.value })}
                  placeholder={ph}
                  className={
                    dark
                      ? 'font-num h-[42px] rounded-[10px] border border-[#28344c] bg-[#0f1623] px-3 text-xs text-[#e7ecf3] outline-none focus:border-[#3b82f6]'
                      : 'font-num h-[42px] rounded-lg border border-border px-3 text-xs outline-none focus:border-accent'
                  }
                />
              ))}
              <button
                type="button"
                onClick={() => void onSearch()}
                className="rounded-[10px] bg-[#3b82f6] px-4 text-xs font-bold text-white"
              >
                جستجو
              </button>
            </div>
          </section>

          {searchResults.length > 0 && (
            <section className="flex flex-col gap-2">
              {searchResultsPager.pageItems.map((f) => (
                <div
                  key={f.flightInstanceId}
                  className={
                    dark
                      ? 'flex flex-wrap items-center gap-4 rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-4 text-xs'
                      : 'flex items-center gap-4 rounded-xl border border-border bg-white p-4 text-xs'
                  }
                >
                  <span className="ltr font-num font-bold text-[#60a5fa]">{f.flightNo}</span>
                  <span className={`flex-1 ${dark ? 'text-[#e7ecf3]' : 'text-ink'}`}>
                    {f.originCode} → {f.destCode} · {formatJalaliDateTime(f.departureAt)}
                  </span>
                  <span className="font-bold text-[#34d399]">{faMoney(f.priceIrr)} تومان</span>
                  <span className={dark ? 'text-[#6b7b94]' : 'text-muted'}>
                    {faDigits(f.seatsLeft)} صندلی
                  </span>
                  <button
                    type="button"
                    onClick={() => void loadSeatMap(f.flightInstanceId)}
                    className="rounded-[10px] bg-[#3b82f6] px-3 py-1.5 text-[11px] font-bold text-white"
                  >
                    انتخاب صندلی
                  </button>
                </div>
              ))}
            </section>
          )}
          <Pagination
            page={searchResultsPager.page}
            totalPages={searchResultsPager.totalPages}
            onChange={searchResultsPager.setPage}
            variant={dark ? 'dark' : 'light'}
          />
        </div>
      )}

      {seatMapOpen && seatMap && (
        <SeatMapModal
          dark={dark}
          seatMap={seatMap}
          canLock={canLock}
          selectedSeat={selectedSeat}
          seatFormMode={seatFormMode}
          seatForm={seatForm}
          lockedSeats={lockedSeats}
          onClose={() => {
            setSeatMapOpen(false);
            setSelectedSeat(null);
          }}
          onSeatClick={onSeatClick}
          onReleaseChip={(id) => void onReleaseChip(id)}
          onFormChange={setSeatForm}
          onSubmit={() => void onSubmitSeatForm()}
          onOpenSoldPnr={(pnr) => void openPnrDetail(pnr)}
          onClearSelection={() => setSelectedSeat(null)}
        />
      )}

      {detailPnr && detail && (
        <Modal
          title={`رزرو ${detail.pnr}`}
          onClose={() => setDetailPnr(null)}
          variant={dark ? 'dark' : 'light'}
        >
          <div className="mb-4 rounded-xl bg-[#0f1726] p-4 text-white">
            <div className="mb-2 flex items-center justify-between">
              <span className="ltr font-num text-xs">PNR {detail.pnr}</span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                  dark
                    ? STATUS_LABEL[detail.status]?.darkClass
                    : STATUS_LABEL[detail.status]?.className
                }`}
              >
                {STATUS_LABEL[detail.status]?.label}
              </span>
            </div>
            <div className="flex items-center justify-between text-lg font-black">
              <span className="ltr">{detail.originCode}</span>
              <span>✈</span>
              <span className="ltr">{detail.destCode}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-4 border-t border-white/15 pt-3 text-[11px]">
              <div>
                <div className="text-white/50">مسافر</div>
                <div className="font-bold">{detail.passenger?.fullName ?? '—'}</div>
              </div>
              <div>
                <div className="text-white/50">صندلی</div>
                <div className="font-num font-bold text-[#fcd34d]">
                  {detail.passenger?.seatCode ?? '—'}
                </div>
              </div>
              <div>
                <div className="text-white/50">تاریخ</div>
                <div className="font-bold">{formatJalaliDateTime(detail.departureAt)}</div>
              </div>
              <div>
                <div className="text-white/50">مبلغ</div>
                <div className="font-bold text-[#34d399]">{faMoney(detail.priceIrr)} تومان</div>
              </div>
            </div>
          </div>

          {canLock && detail.status !== 'CANCELLED' && (
            <div className="flex flex-col gap-3">
              <div className="flex gap-2">
                <input
                  value={changeSeatInput}
                  onChange={(e) => setChangeSeatInput(e.target.value)}
                  placeholder="شماره صندلی جدید"
                  dir="ltr"
                  className={`font-num flex-1 rounded-lg p-2.5 text-xs outline-none ${
                    dark
                      ? 'border border-[#28344c] bg-[#0f1623] text-white focus:border-[#3b82f6]'
                      : 'border border-border focus:border-accent'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => void onChangeSeat()}
                  className="rounded-lg bg-[#f59e0b] px-4 py-2 text-xs font-bold text-white"
                >
                  ثبت تغییر
                </button>
              </div>
              <button
                type="button"
                onClick={() => void onCancel()}
                className="rounded-lg bg-danger/10 px-4 py-2 text-xs font-bold text-danger"
              >
                لغو رزرو
              </button>
              {(detail.status === 'TICKETED' || detail.status === 'FLOWN') && (
                <button
                  type="button"
                  onClick={() => void onMarkNoShow()}
                  className={`rounded-lg px-4 py-2 text-xs font-bold ${
                    dark ? 'bg-[#18223a] text-[#9fb0c7]' : 'bg-surface text-text-2'
                  }`}
                >
                  ثبت عدم حضور مسافر
                </button>
              )}
            </div>
          )}
          {detail.status === 'CANCELLED' && (
            <p className="rounded-lg bg-danger/10 p-3 text-xs font-bold text-danger">
              این رزرو لغو شده است.
            </p>
          )}
        </Modal>
      )}
    </div>
  );
}

function DashboardTab({
  dark,
  stats,
}: {
  dark: boolean;
  stats: ReservationDashboardStats | null;
}) {
  if (!stats) {
    return <p className={`text-sm ${dark ? 'text-[#6b7b94]' : 'text-muted'}`}>در حال بارگذاری…</p>;
  }
  const cards = [
    { label: 'رزروهای امروز', value: faDigits(stats.todayBookings), color: 'text-white' },
    { label: 'PNRهای فعال', value: faDigits(stats.activePnrs), color: 'text-[#60a5fa]' },
    { label: 'صندلی فروخته‌شده', value: faDigits(stats.seatsSold), color: 'text-[#34d399]' },
    {
      label: 'درآمد رزروها',
      value: `${faMoney(stats.revenueIrr)} تومان`,
      color: 'text-[#fcd34d]',
    },
  ];
  return (
    <div className="grid grid-cols-1 gap-[11px] sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => (
        <div
          key={c.label}
          className={
            dark
              ? 'rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-[13px]'
              : 'rounded-xl border border-border bg-white p-4'
          }
        >
          <div className={`mb-2 text-[11px] ${dark ? 'text-[#6b7b94]' : 'text-muted'}`}>
            {c.label}
          </div>
          <div className={`font-num text-[21px] font-black ${dark ? c.color : 'text-ink'}`}>
            {c.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function flightRouteLabel(f: ReservationFlightRow): string {
  if (f.originCityFa?.trim() && f.destCityFa?.trim()) {
    return `${f.originCityFa} ← ${f.destCityFa}`;
  }
  if (f.route?.trim()) {
    // Prefer already-Persian route; expand bare airport codes via local map.
    const codePair = f.route.match(/^([A-Z]{3})\s*[→←↔\-]+\s*([A-Z]{3})$/i);
    if (codePair) {
      const o = airportCityName(codePair[1], 'fa');
      const d = airportCityName(codePair[2], 'fa');
      return `${o} ← ${d}`;
    }
    return f.route;
  }
  if (f.originCode && f.destCode) {
    return `${airportCityName(f.originCode, 'fa')} ← ${airportCityName(f.destCode, 'fa')}`;
  }
  return '—';
}

function FlightsTab({
  dark,
  rows,
  q,
  onQ,
  onOpenSeatMap,
}: {
  dark: boolean;
  rows: ReservationFlightRow[];
  q: string;
  onQ: (v: string) => void;
  onOpenSeatMap: (id: string) => void;
}) {
  const rowsPager = usePagination(rows);

  if (dark) {
    return (
      <section className="overflow-hidden rounded-[14px] border border-[#1f2a3d] bg-[#141d2e]">
        <div className="border-b border-[#1f2a3d] p-3">
          <input
            value={q}
            onChange={(e) => onQ(e.target.value)}
            placeholder="جستجوی پرواز — مسیر یا شماره پرواز"
            className="h-[42px] w-full rounded-[10px] border border-[#28344c] bg-[#0f1623] px-3 text-xs text-[#e7ecf3] outline-none placeholder:text-[#6b7b94] focus:border-[#3b82f6]"
          />
        </div>
        <div className="grid grid-cols-[1.6fr_1fr_1.2fr_1fr_0.9fr] gap-x-3.5 border-b border-[#1f2a3d] px-[15px] py-[11px] text-[10.5px] font-bold text-[#6b7b94]">
          <span>مسیر</span>
          <span>شماره پرواز</span>
          <span>تاریخ / ساعت</span>
          <span>ظرفیت</span>
          <span>وضعیت</span>
        </div>
        {rows.length === 0 ? (
          <div className="px-[15px] py-[34px] text-center text-xs text-[#6b7b94]">پروازی ثبت نشده است.</div>
        ) : (
          rowsPager.pageItems.map((f) => {
            const sold = f.soldCount ?? f.sold ?? 0;
            const occ =
              f.occupancyPct ??
              (f.capacity === 0 ? 0 : Math.round((sold / f.capacity) * 100));
            const stKey = f.statusKey ?? (occ >= 100 ? 'FULL' : occ >= 90 ? 'NEAR_FULL' : 'SELLING');
            const st = FLIGHT_STATUS[stKey] ?? FLIGHT_STATUS.SELLING;
            return (
              <button
                key={f.flightInstanceId}
                type="button"
                onClick={() => onOpenSeatMap(f.flightInstanceId)}
                className="grid w-full grid-cols-[1.6fr_1fr_1.2fr_1fr_0.9fr] items-center gap-x-3.5 border-b border-[#16202e] px-[15px] py-3 text-start text-xs transition last:border-0 hover:bg-[#18223a]"
              >
                <span className="min-w-0 truncate font-bold text-[#e7ecf3]">{flightRouteLabel(f)}</span>
                <span className="font-num text-[#9fb0c7] [direction:ltr] [unicode-bidi:isolate] text-right">
                  {f.flightNo}
                </span>
                <span className="text-[#9fb0c7]">{formatJalaliDateTime(f.departureAt)}</span>
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="font-num text-[10.5px] text-[#9fb0c7]">
                    {faDigits(sold)} / {faDigits(f.capacity)}
                  </div>
                  <div className="h-1.5 overflow-hidden rounded bg-[#0f1623]">
                    <div
                      className="h-full"
                      style={{ width: `${Math.min(100, occ)}%`, background: st.bar }}
                    />
                  </div>
                </div>
                <span className={`w-max rounded-[14px] px-2.5 py-1 text-[10.5px] font-bold ${st.className}`}>
                  {st.label}
                </span>
              </button>
            );
          })
        )}
        <Pagination
          page={rowsPager.page}
          totalPages={rowsPager.totalPages}
          onChange={rowsPager.setPage}
          variant="dark"
        />
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-border bg-white p-5">
      <input
        value={q}
        onChange={(e) => onQ(e.target.value)}
        placeholder="جستجوی پرواز — مسیر یا شماره پرواز"
        className="mb-4 h-[42px] w-full rounded-xl border border-border px-4 text-xs outline-none focus:border-accent"
      />
      {rows.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted">پروازی یافت نشد.</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {rowsPager.pageItems.map((f) => {
            const soldCount = f.soldCount ?? f.sold ?? 0;
            return (
              <button
                key={f.flightInstanceId}
                type="button"
                onClick={() => onOpenSeatMap(f.flightInstanceId)}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-border px-4 py-3 text-start text-xs hover:border-accent"
              >
                <div>
                  <div className="text-[13px] font-extrabold text-ink">{flightRouteLabel(f)}</div>
                  <div className="ltr mt-0.5 text-[10px] text-muted">
                    {f.originCode} → {f.destCode}
                  </div>
                </div>
                <div className="ltr font-num font-bold text-[#60a5fa]">{f.flightNo}</div>
                <div className="font-num text-[11px] text-ink">{formatJalaliDateTime(f.departureAt)}</div>
                <div className="text-[11px] text-text-2">{aircraftLabel(f.aircraftType)}</div>
                <div className="font-num text-[11px] font-bold text-ink">
                  {faDigits(soldCount)} / {faDigits(f.capacity)}
                </div>
                <span className="rounded-full bg-[rgba(59,130,246,.16)] px-2.5 py-1 text-[10px] font-bold text-[#60a5fa]">
                  در حال فروش
                </span>
              </button>
            );
          })}
        </div>
      )}
      <Pagination
        page={rowsPager.page}
        totalPages={rowsPager.totalPages}
        onChange={rowsPager.setPage}
        variant="light"
      />
    </section>
  );
}

function SeatMapModal({
  dark,
  seatMap,
  canLock,
  selectedSeat,
  seatFormMode,
  seatForm,
  lockedSeats,
  onClose,
  onSeatClick,
  onReleaseChip,
  onFormChange,
  onSubmit,
  onOpenSoldPnr,
  onClearSelection,
}: {
  dark: boolean;
  seatMap: SeatMap;
  canLock: boolean;
  selectedSeat: SeatCell | null;
  seatFormMode: 'lock' | 'issue' | 'sold';
  seatForm: { name: string; nid: string; mobile: string; emergency: boolean };
  lockedSeats: SeatCell[];
  onClose: () => void;
  onSeatClick: (seat: SeatCell) => void;
  onReleaseChip: (lockId: string) => void;
  onFormChange: (v: { name: string; nid: string; mobile: string; emergency: boolean }) => void;
  onSubmit: () => void;
  onOpenSoldPnr: (pnr: string) => void;
  onClearSelection: () => void;
}) {
  const route =
    seatMap.originCityFa && seatMap.destCityFa
      ? `${seatMap.originCityFa} ← ${seatMap.destCityFa}`
      : `${seatMap.originCode ?? ''} ← ${seatMap.destCode ?? ''}`;

  const useMd80 = isMd80Aircraft(seatMap.aircraftType);

  const seatsByCode = useMemo(() => {
    const map = new Map<string, SeatCell>();
    for (const row of seatMap.rows) {
      for (const s of row.seats) map.set(s.seatCode, s);
    }
    return map;
  }, [seatMap.rows]);

  const cabinSections = useMemo(() => {
    const sections: {
      cabin: 'BUSINESS' | 'COMFORT' | 'ECONOMY';
      label: string;
      rows: SeatMap['rows'];
    }[] = [];
    for (const row of seatMap.rows) {
      const last = sections[sections.length - 1];
      if (!last || last.cabin !== row.cabin) {
        sections.push({
          cabin: row.cabin,
          label:
            row.cabin === 'BUSINESS'
              ? 'کلاس بیزینس (Business)'
              : row.cabin === 'COMFORT'
                ? 'کلاس کامفورت (Comfort)'
                : 'کلاس اقتصادی (Economy)',
          rows: [row],
        });
      } else {
        last.rows.push(row);
      }
    }
    return sections;
  }, [seatMap.rows]);

  const freeCount =
    seatMap.freeCount ??
    Math.max(0, seatMap.capacity - seatMap.soldCount - seatMap.lockedCount);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-[#060a12]/72 p-[22px] backdrop-blur-[3px]"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label={`نقشه صندلی‌ها – ${seatMap.flightNo ?? ''}`}
        className="w-full max-w-[600px] overflow-hidden rounded-[18px] border border-[#22304a] bg-[#0f1725] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-[#1f2a3d] bg-gradient-to-l from-[#15233c] to-[#131c30] px-[18px] py-4">
          <div className="min-w-0 flex-1">
            <h3 className="m-0 text-[15px] font-extrabold text-white">
              نقشه صندلی‌ها – <span className="ltr font-num">{seatMap.flightNo}</span>
            </h3>
            <div className="mt-0.5 text-[11px] text-[#9fb0c7]">
              {route} • {aircraftLabel(seatMap.aircraftType)}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-white/10 text-lg text-[#cdd9ec]"
            aria-label="بستن"
          >
            ×
          </button>
        </div>

        <div className="px-[18px] py-[15px]">
          <div className="mb-3.5 flex flex-wrap gap-2">
            <Legend chip="free" label={`آزاد (${faDigits(freeCount)})`} />
            <Legend chip="locked" label={`قفل موقت (${faDigits(seatMap.lockedCount)})`} />
            <Legend chip="sold" label={`رزرو قطعی (${faDigits(seatMap.soldCount)})`} />
          </div>

          <div className="mb-4">
            {useMd80 ? (
              <ReservationMd80SeatMap
                seatsByCode={seatsByCode}
                selectedSeatCode={selectedSeat?.seatCode ?? null}
                canLock={canLock}
                onSeatClick={onSeatClick}
              />
            ) : (
              <div className="max-h-[350px] overflow-auto">
                {cabinSections.map((section) => (
                  <div key={section.cabin} className="mb-3">
                    <div className="mb-2 text-[11px] font-bold text-[#9fb0c7]">{section.label}</div>
                    <div className="flex flex-col gap-1.5">
                      {section.rows.map((row) => {
                        const aisleAfterIndex =
                          seatMap.cabinLayout[row.cabin]?.aisleAfterIndex ??
                          seatMap.cabinLayout.ECONOMY?.aisleAfterIndex ??
                          2;
                        return (
                          <div key={row.row} className="flex items-center justify-center gap-1.5">
                            <span className="font-num w-5 text-center text-[9px] font-bold text-[#6b7b94]">
                              {faDigits(row.row)}
                            </span>
                            {row.seats.map((s, idx) => {
                              const selected = selectedSeat?.seatCode === s.seatCode;
                              return (
                                <span key={s.seatCode} className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => onSeatClick(s)}
                                    disabled={s.status !== 'SOLD' && !canLock}
                                    aria-label={s.seatCode}
                                    className={`ltr font-num flex h-[30px] w-[30px] items-center justify-center rounded-[8px] border-[1.5px] text-[8.5px] font-bold transition ${seatTone(s.status, selected)} ${
                                      s.status === 'SOLD' || canLock
                                        ? 'cursor-pointer'
                                        : 'cursor-default'
                                    }`}
                                  >
                                    {s.seatCode.replace(String(row.row), '')}
                                  </button>
                                  {idx === aisleAfterIndex - 1 && (
                                    <span data-testid={`aisle-gap-${row.row}`} className="w-4" />
                                  )}
                                </span>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {selectedSeat && seatFormMode === 'sold' && selectedSeat.occupant && (
            <div className="mb-3 rounded-[14px] border border-[#2a3550] bg-[#141d2e] p-[14px]">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-[13px] font-extrabold text-white">
                  لاک دستی صندلی {selectedSeat.seatCode}
                </div>
                <button type="button" onClick={onClearSelection} className="text-[#9fb0c7]">
                  ×
                </button>
              </div>
              <div className="space-y-1.5 text-[12px] text-[#cdd9ec]">
                <div>
                  مسافر: <span className="font-bold">{selectedSeat.occupant.passengerName}</span>
                </div>
                <div>
                  وضعیت:{' '}
                  <span className="font-bold text-[#34d399]">
                    {STATUS_LABEL[selectedSeat.occupant.bookingStatus]?.label ??
                      selectedSeat.occupant.bookingStatus}
                  </span>
                </div>
                {seatMap.departureAt && (
                  <div>تاریخ پرواز: {formatJalaliDateTime(seatMap.departureAt)}</div>
                )}
                <div className="ltr font-num text-[#60a5fa]">PNR {selectedSeat.occupant.pnr}</div>
              </div>
              <button
                type="button"
                onClick={() => onOpenSoldPnr(selectedSeat.occupant!.pnr)}
                className="mt-3 text-[11.5px] font-extrabold text-[#60a5fa]"
              >
                مشاهده جزئیات رزرو
              </button>
            </div>
          )}

          {selectedSeat &&
            seatFormMode !== 'sold' &&
            selectedSeat.status === 'FREE' &&
            canLock && (
            <div className="mb-3 rounded-[14px] border border-[#2a3550] bg-[#141d2e] p-[14px]">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-[13px] font-extrabold text-white">
                  {seatFormMode === 'issue'
                    ? `صدور PNR — صندلی ${selectedSeat.seatCode}`
                    : `لاک دستی صندلی ${selectedSeat.seatCode}`}
                </div>
                <button type="button" onClick={onClearSelection} className="text-[#9fb0c7]">
                  ×
                </button>
              </div>
              <label className="mb-1 block text-[11px] text-[#9fb0c7]" htmlFor="seat-pname">
                نام مسافر{seatFormMode === 'issue' ? '' : ' (اختیاری)'}
              </label>
              <input
                id="seat-pname"
                value={seatForm.name}
                onChange={(e) => onFormChange({ ...seatForm, name: e.target.value })}
                placeholder="مثلاً علی رضایی"
                disabled={seatForm.emergency}
                className="mb-2 h-10 w-full rounded-[9px] border border-[#28344c] bg-[#0f1725] px-3 text-xs text-white outline-none focus:border-[#3b82f6] disabled:opacity-50"
              />
              <label className="mb-1 block text-[11px] text-[#9fb0c7]" htmlFor="seat-nid">
                کد ملی (اختیاری)
              </label>
              <input
                id="seat-nid"
                dir="ltr"
                value={seatForm.nid}
                onChange={(e) => onFormChange({ ...seatForm, nid: e.target.value })}
                placeholder="مثلاً 0012345678"
                disabled={seatForm.emergency}
                className="font-num mb-3 h-10 w-full rounded-[9px] border border-[#28344c] bg-[#0f1725] px-3 text-xs text-white outline-none focus:border-[#3b82f6] disabled:opacity-50"
              />
              {seatFormMode === 'lock' && (
                <label className="mb-3 flex items-center gap-2 text-[11px] text-[#9fb0c7]">
                  <input
                    type="checkbox"
                    checked={seatForm.emergency}
                    onChange={(e) =>
                      onFormChange({
                        ...seatForm,
                        emergency: e.target.checked,
                        name: '',
                        nid: '',
                      })
                    }
                  />
                  قفل بدون نام مسافر (لاک اضطراری / نگه‌داشت صندلی)
                </label>
              )}
              <button
                type="button"
                onClick={onSubmit}
                className="mb-2 w-full rounded-[11px] bg-[#f59e0b] py-3 text-[12px] font-extrabold text-[#1a1206]"
              >
                {seatFormMode === 'issue' ? 'صدور PNR و بلیط' : 'لاک صندلی'}
              </button>
            </div>
          )}

          {canLock && lockedSeats.length > 0 && (
            <div className="border-t border-[#1f2a3d] pt-3">
              <div className="mb-2 text-[11px] font-bold text-[#9fb0c7]">
                صندلی‌های قفل‌شده – شمارش معکوس آزادسازی خودکار
              </div>
              <div className="flex flex-col gap-1.5">
                {lockedSeats.map((s) => (
                  <div
                    key={s.seatCode}
                    className="flex items-center justify-between rounded-[10px] border border-[rgba(245,158,11,.35)] bg-[rgba(245,158,11,.1)] px-3 py-2"
                  >
                    <button
                      type="button"
                      onClick={() => s.lockId && onReleaseChip(s.lockId)}
                      className="ltr font-num text-[12px] font-extrabold text-[#fcd34d]"
                      title="برای آزادسازی کلیک کنید"
                    >
                      {s.seatCode} ×
                    </button>
                    <span className="font-num text-[12px] font-bold text-[#f59e0b]">
                      {formatCountdown(remainingMs(s.lockExpiresAt))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!dark && (
            <p className="mt-3 text-[10px] text-[#6b7b94]">
              نقشه برای مدیر IT فقط خواندنی است؛ لاک دستی فقط توسط مدیرعامل، مدیر ارشد یا رئیس هیئت‌مدیره مجاز است.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Legend({ chip, label }: { chip: 'free' | 'locked' | 'sold'; label: string }) {
  const styles = {
    free: 'border-[#28344c] bg-[#18223a]',
    locked: 'border-[#f59e0b] bg-[#f59e0b]',
    sold: 'border-[#3b82f6] bg-[#3b82f6]',
  };
  return (
    <span className="flex items-center gap-1.5 rounded-[13px] border border-[#22304a] bg-[#0f1623] px-2.5 py-1 text-[10.5px] text-[#9fb0c7]">
      <span className={`h-3 w-3 rounded-[4px] border ${styles[chip]}`} />
      {label}
    </span>
  );
}

function seatTone(status: string, selected: boolean): string {
  if (selected) return 'border-white bg-[#f59e0b] text-[#1a1206]';
  if (status === 'SOLD') return 'border-[#3b82f6] bg-[#3b82f6] text-white';
  if (status === 'LOCKED') return 'border-[#f59e0b] bg-[#f59e0b] text-[#1a1206]';
  return 'border-[#28344c] bg-[#18223a] text-[#9fb0c7]';
}
