import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardPage from './DashboardPage';
import * as reportingApi from '../../api/reporting';
import * as cartableApi from '../../api/cartable';
import type { LowSalesAlert } from '../../types/reporting';

const STATS = {
  activeAgencies: 12,
  activeAgenciesTrendPct: 8,
  passengersThisMonth: 24890,
  passengersTrendPct: 12,
  ticketsSoldThisMonth: 38210,
  ticketsTrendPct: 5,
  revenueThisMonthIrr: '824000000000',
  revenueTrendPct: 15,
};

const MIX = {
  totalIrr: '21280000000',
  channels: [
    { channel: 'SYSTEM' as const, labelFa: 'سیستمی', amountIrr: '9120000000', pct: 43 },
    { channel: 'CHARTER' as const, labelFa: 'چارتر', amountIrr: '7600000000', pct: 36 },
    { channel: 'AGENCY' as const, labelFa: 'آژانس', amountIrr: '4560000000', pct: 21 },
  ],
};

const ALERTS: LowSalesAlert[] = [
  {
    flightNo: 'IR-655',
    originCode: 'THR',
    destCode: 'IST',
    departureAt: '2026-07-04T08:00:00.000Z',
    capacity: 146,
    soldSeats: 75,
    occupancyPct: 51,
  },
  {
    flightNo: 'BJ-100',
    originCode: 'MHD',
    destCode: 'THR',
    departureAt: '2026-07-05T08:00:00.000Z',
    capacity: 180,
    soldSeats: 0,
    occupancyPct: 0,
  },
  {
    flightNo: 'BJ-200',
    originCode: 'THR',
    destCode: 'SYZ',
    departureAt: '2026-07-06T08:00:00.000Z',
    capacity: 180,
    soldSeats: 10,
    occupancyPct: 6,
  },
];

function Shell({ alerts = [] as LowSalesAlert[] }) {
  return <Outlet context={{ nav: [], lowSalesAlerts: alerts }} />;
}

function renderDashboard(alerts: LowSalesAlert[] = []) {
  return render(
    <MemoryRouter>
      <Routes>
        <Route element={<Shell alerts={alerts} />}>
          <Route index element={<DashboardPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.spyOn(reportingApi, 'fetchFinanceDashboardStats').mockResolvedValue(STATS);
    vi.spyOn(reportingApi, 'fetchRevenueMix').mockResolvedValue(MIX);
    vi.spyOn(cartableApi, 'fetchCartable').mockResolvedValue({
      tasks: [],
      counts: { ADMIN: 0, AGENCY: 0, MANAGER: 0 },
      totalOpen: 0,
    });
  });

  it('renders design KPI cards, channel summary, and cartable with real-shaped data', async () => {
    renderDashboard();

    expect(await screen.findByText('آژانس فعال')).toBeInTheDocument();
    expect(screen.getByText('مسافر این ماه')).toBeInTheDocument();
    expect(screen.getByText('بلیط فروخته‌شده')).toBeInTheDocument();
    expect(screen.getByText('درآمد (تومان)')).toBeInTheDocument();
    expect(screen.getByText('گزارش مالی')).toBeInTheDocument();
    expect(screen.getByText('کارتابل')).toBeInTheDocument();
  });

  it('shows only one low-sales banner and puts the rest in notifications', async () => {
    renderDashboard(ALERTS);

    expect(await screen.findByTestId('low-sales-banner')).toBeInTheDocument();
    expect(screen.getByText('IR-655')).toBeInTheDocument();
    expect(screen.queryByText('BJ-100')).not.toBeInTheDocument();

    expect(screen.getByTestId('panel-notif-badge')).toHaveTextContent('۲');
    await userEvent.click(screen.getByTestId('panel-notif-toggle'));
    expect(await screen.findByTestId('panel-notif-dropdown')).toBeInTheDocument();
    expect(screen.getByText('BJ-100')).toBeInTheDocument();
    expect(screen.getByText('BJ-200')).toBeInTheDocument();
  });

  it('shows an error message when the reporting API fails', async () => {
    vi.spyOn(reportingApi, 'fetchFinanceDashboardStats').mockRejectedValue(new Error('network error'));
    vi.spyOn(reportingApi, 'fetchRevenueMix').mockRejectedValue(new Error('network error'));
    vi.spyOn(cartableApi, 'fetchCartable').mockRejectedValue(new Error('network error'));

    renderDashboard();

    expect(await screen.findByText('خطا در دریافت اطلاعات داشبورد.')).toBeInTheDocument();
  });

  it('keeps healthy dashboard widgets visible when one feed fails', async () => {
    vi.spyOn(reportingApi, 'fetchRevenueMix').mockRejectedValue(new Error('mix unavailable'));

    renderDashboard();

    expect(await screen.findByText('آژانس فعال')).toBeInTheDocument();
    expect(screen.getByText('کارتابل')).toBeInTheDocument();
    expect(screen.getByText('خطا در دریافت بخشی از اطلاعات داشبورد.')).toBeInTheDocument();
    expect(screen.queryByText('گزارش مالی')).not.toBeInTheDocument();
  });

  it('does not render a banner when there are no alerts', async () => {
    renderDashboard([]);
    await waitFor(() => expect(screen.getByText('آژانس فعال')).toBeInTheDocument());
    expect(screen.queryByTestId('low-sales-banner')).not.toBeInTheDocument();
    expect(screen.queryByTestId('panel-notif-badge')).not.toBeInTheDocument();
  });
});
