import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  cancelBooking,
  changeSeat,
  fetchPnrDetail,
  fetchPnrList,
  fetchAgencyApiAccess,
  fetchReservationDashboardStats,
  fetchReservationFlights,
  markNoShow,
} from '../../api/reservation';
import { airportCityName } from '../../lib/airport-cities';
import { faDigits, faMoney } from '../../lib/fa-format';
import { dayjs, formatJalaliDateTime } from '../../lib/jalali';
import PanelAlert from '../panel/PanelAlert';
import PanelModal from '../panel/PanelModal';
import MdSeatMapModal from './MdSeatMapModal';
import {
  panelBtnGhost,
  panelInput,
  panelMuted,
  panelMuted2,
  panelText,
} from '../panel/panel-theme';
import type { FlightRow } from '../../types/flights';
import type {
  PnrDetail,
  PnrGroup,
  ReservationDashboardStats,
  ReservationFlightRow,
} from '../../types/reservation';

type Tab = 'dash' | 'pnr' | 'agency' | 'flights';

/** Design: PNR | مسیر | مسافر | وضعیت — gap + isolate so LTR PNR doesn't stick to route */
const RECENT_PNR_GRID =
  'grid grid-cols-[minmax(7rem,1fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.9fr)] gap-x-2.5 items-center';
const PNR_CODE_CELL =
  'font-num font-bold text-[#60a5fa] [direction:ltr] [unicode-bidi:isolate] text-right';

const STATUS_LABEL: Record<string, { label: string; className: string; color: string; bg: string }> = {
  TICKETED: {
    label: 'صادرشده',
    className: 'bg-[rgba(52,211,153,.16)] text-[#34d399]',
    color: '#34d399',
    bg: 'rgba(16,185,129,.14)',
  },
  CANCELLED: {
    label: 'لغوشده',
    className: 'bg-[rgba(248,113,113,.16)] text-[#f87171]',
    color: '#f87171',
    bg: 'rgba(248,113,113,.14)',
  },
  DRAFT: {
    label: 'پیش‌نویس',
    className: 'bg-panel-elevated text-panel-muted-2',
    color: '#9fb0c7',
    bg: 'rgba(148,163,184,.14)',
  },
  HELD: {
    label: 'در انتظار',
    className: 'bg-[rgba(245,158,11,.16)] text-[#fbbf24]',
    color: '#f59e0b',
    bg: 'rgba(245,158,11,.14)',
  },
  PAID: {
    label: 'پرداخت‌شده',
    className: 'bg-[rgba(59,130,246,.16)] text-[#60a5fa]',
    color: '#60a5fa',
    bg: 'rgba(59,130,246,.14)',
  },
  EXPIRED: {
    label: 'منقضی',
    className: 'bg-panel-elevated text-panel-muted',
    color: '#6b7b94',
    bg: 'rgba(148,163,184,.14)',
  },
  REFUNDED: {
    label: 'مستردشده',
    className: 'bg-panel-elevated text-panel-muted',
    color: '#6b7b94',
    bg: 'rgba(148,163,184,.14)',
  },
  FLOWN: {
    label: 'پرواز شده',
    className: 'bg-[rgba(59,130,246,.16)] text-[#60a5fa]',
    color: '#60a5fa',
    bg: 'rgba(59,130,246,.14)',
  },
  NO_SHOW: {
    label: 'عدم حضور',
    className: 'bg-[rgba(248,113,113,.16)] text-[#f87171]',
    color: '#f87171',
    bg: 'rgba(248,113,113,.14)',
  },
};

function toLatinDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

function normalizeSeatCode(raw: string): string {
  return toLatinDigits(raw).toUpperCase().replace(/\s/g, '');
}

function routeFa(originCode: string, destCode: string): string {
  return `${airportCityName(originCode, 'fa')} ← ${airportCityName(destCode, 'fa')}`;
}

function formatFlightDateTime(iso: string): { date: string; time: string } {
  const d = dayjs(iso).calendar('jalali');
  return {
    date: faDigits(d.format('D MMMM')),
    time: faDigits(d.format('HH:mm')),
  };
}

type AgencyCard = {
  id: string;
  name: string;
  initials: string;
  apiKey: string;
  calls: number;
  active: boolean;
};

function asFlightRow(row: ReservationFlightRow): FlightRow {
  const [routeOrigin = '', routeDest = ''] = (row.route ?? '')
    .split(/→|←/)
    .map((part) => part.trim());
  const sold = row.soldCount ?? row.sold ?? 0;
  return {
    id: row.flightInstanceId,
    flightNo: row.flightNo,
    originCode: row.originCode ?? routeOrigin,
    destCode: row.destCode ?? routeDest,
    departureAt: row.departureAt,
    capacity: row.capacity,
    charterSeats: 0,
    sold,
    basePriceIrr: row.basePriceIrr ?? null,
    derivedStatus: row.statusKey === 'FULL' ? 'FULL' : 'SELLING',
  };
}

type TabBtnProps = { active: boolean; label: string; onClick: () => void; children: ReactNode };

function TabBtn({ active, label, onClick, children }: TabBtnProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-[9px] px-[13px] py-[7px] text-[11.5px] ${
        active ? 'bg-[#1668c4] font-extrabold text-white' : 'bg-transparent font-semibold text-[#9fb0c7]'
      }`}
    >
      {children}
      {label}
    </button>
  );
}

export default function BoardChairPlaneMode() {
  const [tab, setTab] = useState<Tab>('dash');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [stats, setStats] = useState<ReservationDashboardStats | null>(null);
  const [pnrGroups, setPnrGroups] = useState<PnrGroup[]>([]);
  const [pnrCode, setPnrCode] = useState('');
  const [pnrLname, setPnrLname] = useState('');
  const [pnrSearched, setPnrSearched] = useState(false);
  const [searchHits, setSearchHits] = useState<PnrGroup[] | null>(null);

  const [agencies, setAgencies] = useState<AgencyCard[]>([]);
  const [flights, setFlights] = useState<FlightRow[]>([]);

  const [detailPnr, setDetailPnr] = useState<string | null>(null);
  const [detail, setDetail] = useState<PnrDetail | null>(null);
  const [changeSeatInput, setChangeSeatInput] = useState('');

  const [seatFlight, setSeatFlight] = useState<FlightRow | null>(null);

  const loadStats = useCallback(() => {
    fetchReservationDashboardStats()
      .then(setStats)
      .catch(() => undefined);
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
      const rows = await fetchAgencyApiAccess();
      setAgencies(
        rows.map((row) => ({
          id: row.agencyId,
          name: row.name,
          initials: row.initials,
          apiKey: row.keyHint,
          calls: row.callCount,
          active: row.status === 'ACTIVE',
        })),
      );
    } catch {
      setError('خطا در دریافت دسترسی API آژانس‌ها.');
      setAgencies([]);
    }
  }, []);

  const loadFlights = useCallback(async () => {
    try {
      const rows = await fetchReservationFlights();
      setFlights(rows.map(asFlightRow));
    } catch {
      setError('خطا در دریافت فهرست پروازها.');
      setFlights([]);
    }
  }, []);

  useEffect(() => {
    loadStats();
    void loadPnrList();
  }, [loadStats, loadPnrList]);

  useEffect(() => {
    if (tab === 'agency') void loadAgencies();
    if (tab === 'flights') void loadFlights();
  }, [tab, loadAgencies, loadFlights]);

  const channels = useMemo(() => {
    const counts = { SYSTEM: 0, AGENCY: 0, CHARTER: 0, OTHER: 0 };
    for (const g of pnrGroups) {
      for (const r of g.rows) {
        if (r.channel === 'SYSTEM') counts.SYSTEM += 1;
        else if (r.channel === 'AGENCY') counts.AGENCY += 1;
        else if (r.channel === 'CHARTER') counts.CHARTER += 1;
        else counts.OTHER += 1;
      }
    }
    const total = Math.max(1, counts.SYSTEM + counts.AGENCY + counts.CHARTER + counts.OTHER);
    return [
      { label: 'فروش مستقیم سایت', color: '#3b82f6', n: counts.SYSTEM },
      { label: 'اپلیکیشن موبایل', color: '#a855f7', n: counts.OTHER },
      { label: 'API آژانس‌های همکار', color: '#34d399', n: counts.AGENCY + counts.CHARTER },
    ].map((c) => ({
      ...c,
      pct: Math.round((c.n / total) * 100),
    }));
  }, [pnrGroups]);

  const recentRows = useMemo(() => {
    return pnrGroups
      .flatMap((g) =>
        g.rows.map((r) => ({
          pnr: r.pnr,
          route: g.route.includes('→')
            ? g.route
                .split('→')
                .map((p) => p.trim())
                .reverse()
                .join(' ← ')
            : g.route,
          passenger: r.passenger,
          status: r.status,
        })),
      )
      .slice(0, 12);
  }, [pnrGroups]);

  async function doPnrSearch() {
    setPnrSearched(true);
    const q = [pnrCode.trim(), pnrLname.trim()].filter(Boolean).join(' ');
    if (!q) {
      setSearchHits([]);
      return;
    }
    try {
      setSearchHits(await fetchPnrList(q));
    } catch {
      setError('خطا در جستجوی رزرو.');
      setSearchHits([]);
    }
  }

  async function openPnrDetail(pnr: string) {
    setDetailPnr(pnr);
    try {
      setDetail(await fetchPnrDetail(pnr));
    } catch {
      setError('خطا در دریافت جزئیات رزرو.');
    }
  }

  function openSeatMap(flight: FlightRow) {
    setSeatFlight(flight);
  }

  async function onCancel() {
    if (!detailPnr) return;
    try {
      await cancelBooking(detailPnr);
      setNotice('رزرو لغو شد.');
      setDetailPnr(null);
      await loadPnrList();
      loadStats();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطا در لغو رزرو.');
    }
  }

  async function onChangeSeat() {
    if (!detailPnr || !changeSeatInput.trim()) return;
    try {
      await changeSeat(detailPnr, normalizeSeatCode(changeSeatInput));
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
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطا در ثبت عدم حضور.');
    }
  }

  const searchFlat = searchHits?.flatMap((g) =>
    g.rows.map((r) => ({
      ...r,
      route: g.route,
      flightNo: g.flightNo,
      departureAt: g.departureAt,
    })),
  );

  return (
    <div className="flex flex-col gap-[13px]">
      {error && <PanelAlert>{error}</PanelAlert>}
      {notice && <PanelAlert tone="success">{notice}</PanelAlert>}

      <div className="flex max-w-full flex-wrap items-center gap-1.5 rounded-[13px] border border-[#28344c] bg-[#18223a] p-1 w-max">
        <TabBtn active={tab === 'dash'} label="داشبورد" onClick={() => setTab('dash')}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="9" />
            <rect x="14" y="3" width="7" height="5" />
            <rect x="14" y="12" width="7" height="9" />
            <rect x="3" y="16" width="7" height="5" />
          </svg>
        </TabBtn>
        <TabBtn active={tab === 'pnr'} label="مدیریت رزروها" onClick={() => setTab('pnr')}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M3 10h18M8 4v16" />
          </svg>
        </TabBtn>
        <TabBtn active={tab === 'agency'} label="دسترسی آژانس‌ها" onClick={() => setTab('agency')}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          </svg>
        </TabBtn>
        <TabBtn active={tab === 'flights'} label="پروازها" onClick={() => setTab('flights')}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
          </svg>
        </TabBtn>
      </div>

      {tab === 'dash' && (
        <div className="flex flex-col gap-[13px]">
          <div className="grid grid-cols-2 gap-[11px] md:grid-cols-4">
            <Kpi label="رزروهای امروز" value={faDigits(stats?.todayBookings ?? 0)} valueClass="text-white" />
            <Kpi label="PNRهای فعال" value={faDigits(stats?.activePnrs ?? 0)} valueClass="text-[#60a5fa]" />
            <Kpi label="صندلی فروخته‌شده" value={faDigits(stats?.seatsSold ?? 0)} valueClass="text-[#34d399]" />
            <Kpi
              label="درآمد رزروها"
              value={stats ? `${faMoney(stats.revenueIrr)} تومان` : '—'}
              valueClass="text-[16px] text-[#fcd34d]"
            />
          </div>

          <div className="grid grid-cols-1 items-start gap-[13px]">
            <section className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-[15px]">
              <h3 className="mb-4 text-[13.5px] font-extrabold text-white">تفکیک کانال رزرو</h3>
              <div className="flex flex-col gap-[11px]">
                {channels.map((c) => (
                  <div key={c.label}>
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-[11.5px] text-[#9fb0c7]">
                        <span className="inline-block rounded-[3px]" style={{ background: c.color, width: 10, height: 10 }} />
                        {c.label}
                      </span>
                      <span className="text-[11.5px] font-extrabold text-[#e7ecf3]">
                        {faDigits(c.pct)}٪
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded bg-[#0f1623]">
                      <div className="h-full" style={{ width: `${c.pct}%`, background: c.color }} />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      )}

      {tab === 'pnr' && (
        <div className="flex flex-col gap-[13px]">
          <section className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-[15px]">
            <h3 className="mb-4 text-[13.5px] font-extrabold text-white">جستجوی رزرو</h3>
            <div className="grid grid-cols-1 items-end gap-2.5 sm:grid-cols-[1fr_1fr_auto]">
              <label className="block">
                <div className="mb-1.5 text-[10.5px] text-[#6b7b94]">کد رزرو (PNR)</div>
                <input
                  value={pnrCode}
                  onChange={(e) => setPnrCode(e.target.value)}
                  placeholder="مثلاً AS-88421"
                  dir="ltr"
                  className="font-num h-11 w-full rounded-[10px] border border-[#28344c] bg-[#0f1623] px-[11px] text-xs text-[#e7ecf3] outline-none"
                />
              </label>
              <label className="block">
                <div className="mb-1.5 text-[10.5px] text-[#6b7b94]">نام خانوادگی مسافر</div>
                <input
                  value={pnrLname}
                  onChange={(e) => setPnrLname(e.target.value)}
                  placeholder="نام خانوادگی"
                  className="h-11 w-full rounded-[10px] border border-[#28344c] bg-[#0f1623] px-[11px] text-xs text-[#e7ecf3] outline-none"
                />
              </label>
              <button
                type="button"
                onClick={() => void doPnrSearch()}
                className="flex h-11 items-center justify-center gap-1.5 rounded-[10px] bg-[#1668c4] px-5 text-[12.5px] font-extrabold text-white"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="7" />
                  <path d="M21 21l-4-4" />
                </svg>
                جستجو
              </button>
            </div>
          </section>

          {pnrSearched && searchFlat && searchFlat.length > 0 && (
            <section className="overflow-hidden rounded-[14px] border border-[#1f2a3d] bg-[#141d2e]">
              {searchFlat.slice(0, 5).map((r) => {
                const st = STATUS_LABEL[r.status] ?? STATUS_LABEL.DRAFT;
                return (
                  <button
                    key={r.pnr}
                    type="button"
                    onClick={() => void openPnrDetail(r.pnr)}
                    className="flex w-full flex-wrap items-center justify-between gap-2 border-b border-[#1f2a3d] px-4 py-3 text-start last:border-b-0"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="font-num text-sm font-extrabold text-white" dir="ltr">
                        {r.pnr}
                      </span>
                      <span className={`rounded-[14px] px-2.5 py-0.5 text-[10px] font-bold ${st.className}`}>
                        {st.label}
                      </span>
                    </div>
                    <div className="text-[11.5px] text-[#9fb0c7]">
                      {r.route} · {formatJalaliDateTime(r.departureAt)}
                    </div>
                  </button>
                );
              })}
            </section>
          )}
          {pnrSearched && searchFlat && searchFlat.length === 0 && (
            <div className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] px-4 py-8 text-center text-xs text-[#6b7b94]">
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
              <div className="px-4 py-6 text-center text-xs text-[#6b7b94]">رزروی ثبت نشده است.</div>
            ) : (
              recentRows.map((r) => {
                const st = STATUS_LABEL[r.status] ?? STATUS_LABEL.DRAFT;
                return (
                  <button
                    key={r.pnr}
                    type="button"
                    onClick={() => void openPnrDetail(r.pnr)}
                    className={`${RECENT_PNR_GRID} w-full border-b border-[#16202e] px-[15px] py-3 text-start text-xs last:border-b-0 hover:bg-[#18223a]`}
                  >
                    <span className={PNR_CODE_CELL}>{r.pnr}</span>
                    <span className="min-w-0 truncate text-[#cdd6e3]">{r.route}</span>
                    <span className="min-w-0 truncate text-[#9fb0c7]">{r.passenger}</span>
                    <span
                      className="w-max rounded-[14px] px-2.5 py-0.5 text-[10px] font-bold"
                      style={{ color: st.color, background: st.bg }}
                    >
                      {st.label}
                    </span>
                  </button>
                );
              })
            )}
          </section>
        </div>
      )}

      {tab === 'agency' && (
        <div className="flex flex-col gap-[11px]">
          {agencies.length === 0 ? (
            <div className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] px-4 py-8 text-center text-xs text-[#6b7b94]">
              آژانسی با دسترسی API ثبت نشده است.
            </div>
          ) : (
            agencies.map((a) => (
              <div
                key={a.id}
                className="flex flex-wrap items-center gap-3.5 rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-3.5"
              >
                <span className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[11px] bg-[rgba(147,51,234,.14)] text-xs font-extrabold text-[#a855f7]">
                  {a.initials}
                </span>
                <div className="min-w-[180px] flex-1">
                  <div className="text-[13px] font-extrabold text-white">{a.name}</div>
                  <div className="font-num mt-0.5 text-[10.5px] text-[#6b7b94]" dir="ltr">
                    {a.apiKey}
                  </div>
                </div>
                <div className="shrink-0 text-center">
                  <div className="text-[10px] text-[#6b7b94]">درخواست امروز</div>
                  <div className="mt-0.5 text-[13px] font-extrabold text-[#e7ecf3]">{faDigits(a.calls)}</div>
                </div>
                <span
                  className={`shrink-0 rounded-[14px] px-2.5 py-1 text-[10.5px] font-bold ${
                    a.active
                      ? 'bg-[rgba(16,185,129,.14)] text-[#34d399]'
                      : 'bg-[rgba(248,113,113,.14)] text-[#f87171]'
                  }`}
                >
                  {a.active ? 'فعال' : 'معلق'}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'flights' && (
        <section className="overflow-hidden rounded-[14px] border border-[#1f2a3d] bg-[#141d2e]">
          <div className="grid grid-cols-[1.6fr_1fr_1.2fr_1fr_0.9fr] gap-x-3.5 border-b border-[#1f2a3d] px-[15px] py-[11px] text-[10.5px] font-bold text-[#6b7b94]">
            <span>مسیر</span>
            <span>شماره پرواز</span>
            <span>تاریخ / ساعت</span>
            <span>ظرفیت</span>
            <span>وضعیت</span>
          </div>
          {flights.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-[#6b7b94]">پروازی ثبت نشده است.</div>
          ) : (
            flights.map((f) => {
              const { date, time } = formatFlightDateTime(f.departureAt);
              const pct = f.capacity > 0 ? Math.round((f.sold / f.capacity) * 100) : 0;
              const nearlyFull = pct >= 90;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => void openSeatMap(f)}
                  className="grid w-full grid-cols-[1.6fr_1fr_1.2fr_1fr_0.9fr] items-center gap-x-3.5 border-b border-[#16202e] px-[15px] py-3 text-start text-xs last:border-b-0 hover:bg-[#101827]"
                >
                  <span className="min-w-0 truncate font-bold text-[#e7ecf3]">
                    {routeFa(f.originCode, f.destCode)}
                  </span>
                  <span className="font-num text-[#9fb0c7] [direction:ltr] [unicode-bidi:isolate] text-right">
                    {f.flightNo}
                  </span>
                  <span className="text-[#9fb0c7]">
                    {date} · {time}
                  </span>
                  <div className="flex flex-col gap-1">
                    <div className="text-[10.5px] text-[#9fb0c7]">
                      {faDigits(f.sold)} / {faDigits(f.capacity)}
                    </div>
                    <div className="h-1.5 overflow-hidden rounded bg-[#0f1623]">
                      <div
                        className="h-full"
                        style={{
                          width: `${Math.min(100, pct)}%`,
                          background: nearlyFull ? '#f59e0b' : '#34d399',
                        }}
                      />
                    </div>
                  </div>
                  <span
                    className={`w-max rounded-[14px] px-2.5 py-1 text-[10.5px] font-bold ${
                      nearlyFull
                        ? 'bg-[rgba(245,158,11,.14)] text-[#f59e0b]'
                        : 'bg-[rgba(59,130,246,.14)] text-[#60a5fa]'
                    }`}
                  >
                    {nearlyFull ? 'رو به تکمیل' : 'در حال فروش'}
                  </span>
                </button>
              );
            })
          )}
        </section>
      )}

      {seatFlight && (
        <MdSeatMapModal
          flight={seatFlight}
          canManageOverride
          onClose={() => setSeatFlight(null)}
          onNotice={setNotice}
          onError={setError}
          onChanged={() => {
            void loadPnrList();
            loadStats();
          }}
        />
      )}

      {detailPnr && detail && (
        <PanelModal title={`رزرو ${detail.pnr}`} onClose={() => setDetailPnr(null)} wide>
          <div className="mb-4 rounded-xl bg-[#0f1726] p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className={`ltr font-num text-xs ${panelMuted2}`}>PNR {detail.pnr}</span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${STATUS_LABEL[detail.status]?.className}`}
              >
                {STATUS_LABEL[detail.status]?.label}
              </span>
            </div>
            <div className={`flex items-center justify-between text-lg font-black ${panelText}`}>
              <span className="ltr">{detail.originCode}</span>
              <span>✈</span>
              <span className="ltr">{detail.destCode}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-4 border-t border-panel-border pt-3 text-[11px]">
              <div>
                <div className={panelMuted}>مسافر</div>
                <div className={`font-bold ${panelText}`}>{detail.passenger?.fullName ?? '—'}</div>
              </div>
              <div>
                <div className={panelMuted}>صندلی</div>
                <div className="font-num font-bold text-[#fcd34d]">{detail.passenger?.seatCode ?? '—'}</div>
              </div>
              <div>
                <div className={panelMuted}>تاریخ</div>
                <div className={`font-bold ${panelText}`}>{formatJalaliDateTime(detail.departureAt)}</div>
              </div>
              <div>
                <div className={panelMuted}>مبلغ</div>
                <div className="font-bold text-[#34d399]">{faMoney(detail.priceIrr)} تومان</div>
              </div>
            </div>
          </div>
          {detail.status !== 'CANCELLED' && (
            <div className="flex flex-col gap-3">
              <div className="flex gap-2">
                <input
                  value={changeSeatInput}
                  onChange={(e) => setChangeSeatInput(e.target.value)}
                  placeholder="شماره صندلی جدید"
                  dir="ltr"
                  className={`font-num flex-1 p-2.5 ${panelInput}`}
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
                <button type="button" onClick={() => void onMarkNoShow()} className={panelBtnGhost}>
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
        </PanelModal>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass: string;
}) {
  return (
    <div className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-[13px]">
      <div className="mb-1.5 text-[11px] text-[#6b7b94]">{label}</div>
      <div className={`text-[21.5px] font-black ${valueClass}`}>{value}</div>
    </div>
  );
}

