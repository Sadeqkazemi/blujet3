import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import FinanceDashboardPage from './FinanceDashboardPage';
import * as reportingApi from '../../api/reporting';
import * as cartableApi from '../../api/cartable';

const STATS = {
  activeAgencies: 12,
  activeAgenciesTrendPct: 8,
  passengersThisMonth: 340,
  passengersTrendPct: 15,
  ticketsSoldThisMonth: 280,
  ticketsTrendPct: 10,
  revenueThisMonthIrr: '4200000000',
  revenueTrendPct: 12,
};

const SALES_CHART = [
  {
    periodKey: '2026-06-01',
    startDate: '2026-06-01T00:00:00.000Z',
    endDate: '2026-07-01T00:00:00.000Z',
    systemIrr: '1200000000',
    charterIrr: '800000000',
    agencyIrr: '600000000',
  },
];

const FLIGHTS = { flightCount: 6, totalSeats: 1080, soldSeats: 900, unsoldSeats: 180 };

function renderFinanceDashboard() {
  return render(
    <MemoryRouter>
      <Routes>
        <Route element={<Outlet context={{ nav: [], lowSalesAlerts: [] }} />}>
          <Route index element={<FinanceDashboardPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('FinanceDashboardPage', () => {
  it('renders finance-specific stat cards, sales chart, and cartable widget', async () => {
    vi.spyOn(reportingApi, 'fetchFinanceDashboardStats').mockResolvedValue(STATS);
    vi.spyOn(reportingApi, 'fetchSalesChart').mockResolvedValue(SALES_CHART);
    vi.spyOn(reportingApi, 'fetchCompletedFlightsSummary').mockResolvedValue(FLIGHTS);
    vi.spyOn(cartableApi, 'fetchCartable').mockResolvedValue({
      totalOpen: 2,
      counts: { ADMIN: 0, AGENCY: 0, MANAGER: 2 },
      tasks: [
        {
          id: 't1',
          category: 'MANAGER',
          title: 'بررسی تسویه آژانس',
          description: 'لطفاً بررسی شود.',
          senderLabelFa: 'مدیر بازرگانی',
          sender: null,
          sourceType: 'MANAGER_MESSAGE',
          sourceId: 'm1',
          status: 'OPEN',
          resolutionNote: null,
          createdAt: '2026-07-10T10:00:00.000Z',
        },
      ],
    });

    renderFinanceDashboard();

    expect(await screen.findByText('آژانس فعال')).toBeInTheDocument();
    expect(screen.getByText('مسافر این ماه')).toBeInTheDocument();
    expect(screen.getByText('بلیط فروخته‌شده')).toBeInTheDocument();
    expect(screen.getByText('درآمد (تومان)')).toBeInTheDocument();
    expect(screen.getByText('نمودار فروش')).toBeInTheDocument();
    expect(screen.getByText('کارتابل')).toBeInTheDocument();
    expect(screen.getByText('بررسی تسویه آژانس')).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText('۶')).toBeInTheDocument());
  });
});
