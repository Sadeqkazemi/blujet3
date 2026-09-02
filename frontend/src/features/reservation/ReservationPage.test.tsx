import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import ReservationPage from './ReservationPage';
import * as reservationApi from '../../api/reservation';
import * as useAuthModule from '../../hooks/useAuth';
import { mockAuthUserWithRole } from '../../test/mockAuthUser';
import type {
  AgencyApiAccessRow,
  PnrDetail,
  PnrGroup,
  ReservationDashboardStats,
  ReservationFlightRow,
  SeatMap,
} from '../../types/reservation';
import type { Role } from '../../types/auth';

function renderPage() {
  return render(
    <MemoryRouter>
      <ReservationPage />
    </MemoryRouter>,
  );
}

const GROUPS: PnrGroup[] = [
  {
    flightInstanceId: 'fi1',
    flightNo: 'EP-821',
    route: 'THR → DXB',
    departureAt: '2026-08-01T05:00:00.000Z',
    rows: [{ pnr: 'BJDEMO1', passenger: 'نگار رضایی', channel: 'SYSTEM', status: 'TICKETED' }],
  },
];

const DETAIL: PnrDetail = {
  pnr: 'BJDEMO1',
  status: 'TICKETED',
  channel: 'SYSTEM',
  priceIrr: '380000000',
  flightNo: 'EP-821',
  originCode: 'THR',
  destCode: 'DXB',
  departureAt: '2026-08-01T05:00:00.000Z',
  arrivalAt: '2026-08-01T08:00:00.000Z',
  flightInstanceId: 'fi1',
  passenger: { fullName: 'نگار رضایی', seatCode: '3A' },
};

const STATS: ReservationDashboardStats = {
  todayBookings: 2,
  activePnrs: 5,
  seatsSold: 12,
  revenueIrr: '1000000000',
  channels: [
    { key: 'SYSTEM', label: 'فروش مستقیم سایت', color: '#3b82f6', count: 8, pct: 66.7 },
    { key: 'AGENCY', label: 'API آژانس‌های همکار', color: '#34d399', count: 4, pct: 33.3 },
  ],
  services: [
    {
      name: 'reservation-api',
      fa: 'سرویس رزرواسیون مرکزی',
      ok: true,
      latencyMs: 12,
      statusLabel: 'سالم',
    },
  ],
  servicesStable: true,
};

const AGENCIES: AgencyApiAccessRow[] = [
  {
    id: 'k1',
    agencyId: 'a1',
    name: 'آژانس blujet',
    initials: 'آج',
    keyHint: 'bjk_••••abcd',
    callCount: 12,
    lastUsedAt: '2026-08-18T10:00:00.000Z',
    status: 'ACTIVE',
  },
];

const FLIGHTS: ReservationFlightRow[] = [
  {
    flightInstanceId: 'fi1',
    route: 'THR → DXB',
    flightNo: 'EP-821',
    departureAt: '2026-08-01T05:00:00.000Z',
    aircraftType: 'MD-80',
    sold: 10,
    capacity: 155,
    occupancyPct: 6,
    statusKey: 'SELLING',
  },
];

function mockRole(role: Role) {
  vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
    status: 'authenticated',
    user: mockAuthUserWithRole(role),
    requestLogin: vi.fn(),
    confirmTwoFactor: vi.fn(),
    agencyLogin: vi.fn(),
    signOut: vi.fn(),
  });
}

describe('ReservationPage', () => {
  it('BOARD_CHAIR dashboard hides operational service health', async () => {
    mockRole('BOARD_CHAIR');
    vi.spyOn(reservationApi, 'fetchReservationDashboardStats').mockResolvedValue({
      ...STATS,
      services: [],
      servicesStable: false,
    });
    vi.spyOn(reservationApi, 'fetchPnrList').mockResolvedValue([]);

    renderPage();

    expect(await screen.findByText('تفکیک کانال رزرو')).toBeInTheDocument();
    expect(screen.queryByText('وضعیت سرویس‌های سامانه')).not.toBeInTheDocument();
    expect(screen.queryByText('داده‌ای از وضعیت سرویس‌ها دریافت نشده است.')).not.toBeInTheDocument();
    expect(screen.queryByText('reservation-api')).not.toBeInTheDocument();
  });

  it('BOARD_CHAIR loads agency access from the reservation API', async () => {
    mockRole('BOARD_CHAIR');
    vi.spyOn(reservationApi, 'fetchReservationDashboardStats').mockResolvedValue(STATS);
    vi.spyOn(reservationApi, 'fetchPnrList').mockResolvedValue([]);
    const agencySpy = vi
      .spyOn(reservationApi, 'fetchAgencyApiAccess')
      .mockResolvedValue(AGENCIES);

    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /دسترسی آژانس‌ها/ }));

    expect(await screen.findByText('آژانس blujet')).toBeInTheDocument();
    expect(screen.getByText('bjk_••••abcd')).toBeInTheDocument();
    expect(agencySpy).toHaveBeenCalledTimes(1);
  });

  it('BOARD_CHAIR loads reservation flights and can open the managerial MD-80 seat map', async () => {
    mockRole('BOARD_CHAIR');
    vi.spyOn(reservationApi, 'fetchReservationDashboardStats').mockResolvedValue(STATS);
    vi.spyOn(reservationApi, 'fetchPnrList').mockResolvedValue([]);
    const flightSpy = vi
      .spyOn(reservationApi, 'fetchReservationFlights')
      .mockResolvedValue([
        {
          ...FLIGHTS[0],
          originCode: 'THR',
          destCode: 'DXB',
          soldCount: 10,
          lockedCount: 0,
          freeCount: 145,
        },
      ]);
    vi.spyOn(reservationApi, 'fetchSeatLockAgencies').mockResolvedValue([]);
    vi.spyOn(reservationApi, 'fetchSeatMap').mockResolvedValue({
      flightInstanceId: 'fi1',
      aircraftType: 'MD-80',
      flightNo: 'EP-821',
      originCode: 'THR',
      destCode: 'DXB',
      originCityFa: 'تهران',
      destCityFa: 'دبی',
      departureAt: '2026-08-01T05:00:00.000Z',
      capacity: 1,
      soldCount: 0,
      lockedCount: 0,
      freeCount: 1,
      occupancyPct: 0,
      cabinLayout: { ECONOMY: { aisleAfterIndex: 2 } },
      rows: [
        {
          row: 20,
          cabin: 'ECONOMY',
          seats: [{ seatCode: '20A', status: 'FREE', lockId: null }],
        },
      ],
    });

    renderPage();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'پروازها' }));
    await user.click(await screen.findByRole('button', { name: /EP-821/ }));

    expect(flightSpy).toHaveBeenCalledTimes(1);
    expect(await screen.findByTestId('reservation-md80-seat-map')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '20A' }));
    expect(await screen.findByRole('button', { name: 'قفل برای آژانس' })).toBeInTheDocument();
  });

  it('renders the design four-tab shell and dashboard KPIs/services/channels', async () => {
    mockRole('IT_MANAGER');
    vi.spyOn(reservationApi, 'fetchReservationDashboardStats').mockResolvedValue(STATS);

    renderPage();
    expect(await screen.findByText('سامانه رزرواسیون پرواز')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /داشبورد/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /مدیریت رزروها/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /دسترسی آژانس‌ها/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /پروازها/ })).toBeInTheDocument();

    expect(await screen.findByText('رزروهای امروز')).toBeInTheDocument();
    expect(screen.getByText('وضعیت سرویس‌های سامانه')).toBeInTheDocument();
    expect(screen.getByText('reservation-api')).toBeInTheDocument();
    expect(screen.getByText('فروش مستقیم سایت')).toBeInTheDocument();
  });

  it('CEO dark shell shows سامانه رزرواسیون پرواز and پروازها table matching design', async () => {
    mockRole('CEO');
    vi.spyOn(reservationApi, 'fetchReservationDashboardStats').mockResolvedValue(STATS);
    vi.spyOn(reservationApi, 'fetchPnrList').mockResolvedValue(GROUPS);
    vi.spyOn(reservationApi, 'fetchReservationFlights').mockResolvedValue([
      {
        flightInstanceId: 'fi1',
        flightNo: 'EP-821',
        aircraftType: 'MD-80',
        originCode: 'THR',
        destCode: 'DXB',
        originCityFa: 'تهران',
        destCityFa: 'دبی',
        departureAt: '2026-08-01T05:00:00.000Z',
        capacity: 121,
        soldCount: 10,
        lockedCount: 1,
        freeCount: 110,
      },
    ]);

    renderPage();
    expect(await screen.findByRole('heading', { name: /سامانه رزرواسیون پرواز/ })).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'پروازها' }));
    expect(await screen.findByText('تهران ← دبی')).toBeInTheDocument();
    expect(screen.getByText('شماره پرواز')).toBeInTheDocument();
    expect(screen.getByText('مسیر')).toBeInTheDocument();
  });

  it('SENIOR_MANAGER uses the same هواپیما ExecReservationView as CEO', async () => {
    mockRole('SENIOR_MANAGER');
    vi.spyOn(reservationApi, 'fetchReservationDashboardStats').mockResolvedValue(STATS);
    vi.spyOn(reservationApi, 'fetchPnrList').mockResolvedValue(GROUPS);
    vi.spyOn(reservationApi, 'fetchReservationFlights').mockResolvedValue([
      {
        flightInstanceId: 'fi1',
        flightNo: 'BJ-100',
        aircraftType: 'MD-80',
        originCode: 'THR',
        destCode: 'MHD',
        originCityFa: 'تهران',
        destCityFa: 'مشهد',
        route: 'تهران ← مشهد',
        departureAt: '2026-08-01T05:00:00.000Z',
        capacity: 180,
        soldCount: 0,
        sold: 0,
        lockedCount: 0,
        freeCount: 180,
        occupancyPct: 0,
        statusKey: 'SELLING',
      },
    ]);

    renderPage();
    expect(await screen.findByRole('heading', { name: /سامانه رزرواسیون پرواز/ })).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'پروازها' }));
    expect(await screen.findByText('تهران ← مشهد')).toBeInTheDocument();
    expect(screen.getByText('BJ-100')).toBeInTheDocument();
    expect(screen.getByText('در حال فروش')).toBeInTheDocument();
    expect(screen.queryByText('مک‌دانل داگلاس MD-80')).not.toBeInTheDocument();
  });

  it('clicking a sold seat shows occupant info and opens PNR detail', async () => {
    mockRole('CEO');
    vi.spyOn(reservationApi, 'fetchReservationDashboardStats').mockResolvedValue(STATS);
    vi.spyOn(reservationApi, 'fetchPnrList').mockResolvedValue(GROUPS);
    vi.spyOn(reservationApi, 'fetchPnrDetail').mockResolvedValue(DETAIL);
    vi.spyOn(reservationApi, 'fetchReservationFlights').mockResolvedValue([
      {
        flightInstanceId: 'fi1',
        flightNo: 'EP-821',
        aircraftType: 'MD-80',
        originCode: 'THR',
        destCode: 'DXB',
        originCityFa: 'تهران',
        destCityFa: 'دبی',
        departureAt: '2026-08-01T05:00:00.000Z',
        capacity: 140,
        soldCount: 1,
        lockedCount: 0,
        freeCount: 139,
      },
    ]);
    const seatMap: SeatMap = {
      flightInstanceId: 'fi1',
      flightNo: 'EP-821',
      originCityFa: 'تهران',
      destCityFa: 'دبی',
      departureAt: '2026-08-01T05:00:00.000Z',
      aircraftType: 'MD-80',
      cabinLayout: { BUSINESS: { aisleAfterIndex: 2 }, ECONOMY: { aisleAfterIndex: 2 } },
      capacity: 140,
      soldCount: 1,
      lockedCount: 0,
      freeCount: 139,
      occupancyPct: 0.7,
      rows: [
        {
          row: 3,
          cabin: 'BUSINESS',
          seats: [
            {
              seatCode: '3A',
              status: 'SOLD',
              lockId: null,
              occupant: { pnr: 'BJDEMO1', passengerName: 'نگار رضایی', bookingStatus: 'TICKETED' },
            },
            { seatCode: '3B', status: 'FREE', lockId: null },
            { seatCode: '3E', status: 'FREE', lockId: null },
            { seatCode: '3F', status: 'FREE', lockId: null },
          ],
        },
      ],
    };
    vi.spyOn(reservationApi, 'fetchSeatMap').mockResolvedValue(seatMap);

    renderPage();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'پروازها' }));
    await user.click(await screen.findByRole('button', { name: /EP-821/ }));
    expect(await screen.findByTestId('reservation-md80-seat-map')).toBeInTheDocument();
    expect(screen.getByTestId('reservation-section-first')).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: '3A' }));
    expect(await screen.findByText(/مسافر:/)).toHaveTextContent('نگار رضایی');
    await user.click(screen.getByRole('button', { name: 'مشاهده جزئیات رزرو' }));
    expect(await screen.findByText('رزرو BJDEMO1')).toBeInTheDocument();
  });

  it('BOARD_CHAIR sees the PNR list and change-seat/cancel controls in the detail modal', async () => {
    mockRole('BOARD_CHAIR');
    vi.spyOn(reservationApi, 'fetchReservationDashboardStats').mockResolvedValue(STATS);
    vi.spyOn(reservationApi, 'fetchPnrList').mockResolvedValue(GROUPS);
    vi.spyOn(reservationApi, 'fetchPnrDetail').mockResolvedValue(DETAIL);

    renderPage();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /مدیریت رزروها/ }));

    expect(await screen.findByText('آخرین رزروهای ثبت‌شده')).toBeInTheDocument();
    expect(await screen.findByText('نگار رضایی')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /BJDEMO1/ }));
    expect(await screen.findByRole('button', { name: 'ثبت تغییر' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'لغو رزرو' })).toBeInTheDocument();
  });

  it('SENIOR_MANAGER can change seat and cancel in the detail modal', async () => {
    mockRole('SENIOR_MANAGER');
    vi.spyOn(reservationApi, 'fetchReservationDashboardStats').mockResolvedValue(STATS);
    vi.spyOn(reservationApi, 'fetchPnrList').mockResolvedValue(GROUPS);
    vi.spyOn(reservationApi, 'fetchPnrDetail').mockResolvedValue(DETAIL);

    renderPage();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /مدیریت رزروها/ }));
    expect(await screen.findByText('آخرین رزروهای ثبت‌شده')).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'BJDEMO1' }));

    await waitFor(() => expect(screen.getByText('رزرو BJDEMO1')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'ثبت تغییر' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'لغو رزرو' })).toBeInTheDocument();
  });

  it('CEO/SENIOR مدیریت رزروها shows flat PNR|مسیر|مسافر|وضعیت columns', async () => {
    mockRole('CEO');
    vi.spyOn(reservationApi, 'fetchReservationDashboardStats').mockResolvedValue(STATS);
    vi.spyOn(reservationApi, 'fetchPnrList').mockResolvedValue(GROUPS);

    renderPage();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /مدیریت رزروها/ }));

    expect(await screen.findByText('آخرین رزروهای ثبت‌شده')).toBeInTheDocument();
    expect(screen.getByText('جستجوی رزرو')).toBeInTheDocument();
    expect(screen.getByText('PNR')).toBeInTheDocument();
    expect(screen.getByText('مسیر')).toBeInTheDocument();
    expect(screen.getByText('مسافر')).toBeInTheDocument();
    expect(screen.getByText('وضعیت')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'BJDEMO1' })).toBeInTheDocument();
    expect(screen.getByText('THR → DXB')).toBeInTheDocument();
    expect(screen.getByText('نگار رضایی')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /نقشهٔ صندلی/ })).not.toBeInTheDocument();
  });

  it('searches by PNR on the bookings tab', async () => {
    mockRole('IT_MANAGER');
    vi.spyOn(reservationApi, 'fetchReservationDashboardStats').mockResolvedValue(STATS);
    vi.spyOn(reservationApi, 'fetchPnrList').mockResolvedValue(GROUPS);
    const detailSpy = vi.spyOn(reservationApi, 'fetchPnrDetail').mockResolvedValue(DETAIL);

    renderPage();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /مدیریت رزروها/ }));
    await screen.findByText('آخرین رزروهای ثبت‌شده');

    await user.type(screen.getByPlaceholderText('مثلاً AS-88421'), 'BJDEMO1');
    await user.click(screen.getByRole('button', { name: 'جستجو' }));

    await waitFor(() => expect(detailSpy).toHaveBeenCalledWith('BJDEMO1'));
    expect(await screen.findByText('صندلی 3A')).toBeInTheDocument();
  });

  it('agency tab shows empty state when no API keys exist', async () => {
    mockRole('IT_MANAGER');
    vi.spyOn(reservationApi, 'fetchReservationDashboardStats').mockResolvedValue(STATS);
    vi.spyOn(reservationApi, 'fetchAgencyApiAccess').mockResolvedValue([]);

    renderPage();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /دسترسی آژانس‌ها/ }));

    expect(await screen.findByText('آژانسی با دسترسی API ثبت نشده است.')).toBeInTheDocument();
  });

  it('agency tab lists agencies with API access', async () => {
    mockRole('IT_MANAGER');
    vi.spyOn(reservationApi, 'fetchReservationDashboardStats').mockResolvedValue(STATS);
    vi.spyOn(reservationApi, 'fetchAgencyApiAccess').mockResolvedValue(AGENCIES);

    renderPage();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /دسترسی آژانس‌ها/ }));

    expect(await screen.findByText('آژانس blujet')).toBeInTheDocument();
    expect(screen.getByText('bjk_••••abcd')).toBeInTheDocument();
  });

  it('flights tab renders occupancy rows and opens the seat-map modal on row click', async () => {
    mockRole('IT_MANAGER');
    vi.spyOn(reservationApi, 'fetchReservationDashboardStats').mockResolvedValue(STATS);
    vi.spyOn(reservationApi, 'fetchReservationFlights').mockResolvedValue(FLIGHTS);
    vi.spyOn(reservationApi, 'fetchSeatMap').mockResolvedValue({
      flightInstanceId: 'fi1',
      aircraftType: 'MD-80',
      flightNo: 'EP-821',
      originCode: 'THR',
      destCode: 'DXB',
      originCityFa: 'تهران',
      destCityFa: 'دبی',
      departureAt: '2026-08-01T05:00:00.000Z',
      capacity: 1,
      soldCount: 0,
      lockedCount: 0,
      freeCount: 1,
      occupancyPct: 0,
      cabinLayout: { BUSINESS: { aisleAfterIndex: 2 }, ECONOMY: { aisleAfterIndex: 2 } },
      rows: [
        {
          row: 3,
          cabin: 'BUSINESS',
          seats: [
            {
              seatCode: '3A',
              status: 'FREE',
              lockId: null,
              lockExpiresAt: null,
              passenger: null,
            },
          ],
        },
      ],
    });

    renderPage();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /پروازها/ }));

    expect(await screen.findByText('EP-821')).toBeInTheDocument();
    expect(screen.getByText('در حال فروش')).toBeInTheDocument();
    expect(screen.getByText('MD-80')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /EP-821/ }));
    expect(await screen.findByRole('dialog', { name: 'نقشه صندلی‌ها' })).toBeInTheDocument();
    expect(screen.getByText(/امکان قفل دستی صندلی را ندارد/)).toBeInTheDocument();
  });

  it('a canLock role can mark a TICKETED booking as no-show', async () => {
    mockRole('BOARD_CHAIR');
    vi.spyOn(reservationApi, 'fetchReservationDashboardStats').mockResolvedValue(STATS);
    vi.spyOn(reservationApi, 'fetchPnrList').mockResolvedValue(GROUPS);
    vi.spyOn(reservationApi, 'fetchPnrDetail').mockResolvedValue(DETAIL);
    const noShowSpy = vi
      .spyOn(reservationApi, 'markNoShow')
      .mockResolvedValue({ ...DETAIL, status: 'NO_SHOW' });

    renderPage();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /مدیریت رزروها/ }));
    await user.click(await screen.findByRole('button', { name: /BJDEMO1/ }));
    await user.click(await screen.findByRole('button', { name: 'ثبت عدم حضور مسافر' }));

    await waitFor(() => expect(noShowSpy).toHaveBeenCalledWith('BJDEMO1'));
    expect(await screen.findByText('عدم حضور مسافر ثبت شد.')).toBeInTheDocument();
  });

  it('no-show is not offered for a CANCELLED booking', async () => {
    mockRole('BOARD_CHAIR');
    vi.spyOn(reservationApi, 'fetchReservationDashboardStats').mockResolvedValue(STATS);
    vi.spyOn(reservationApi, 'fetchPnrList').mockResolvedValue(GROUPS);
    vi.spyOn(reservationApi, 'fetchPnrDetail').mockResolvedValue({ ...DETAIL, status: 'CANCELLED' });

    renderPage();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /مدیریت رزروها/ }));
    await user.click(await screen.findByRole('button', { name: /BJDEMO1/ }));

    const dialog = await screen.findByRole('dialog', { name: 'رزرو BJDEMO1' });
    expect(within(dialog).queryByRole('button', { name: 'ثبت عدم حضور مسافر' })).not.toBeInTheDocument();
  });
});
