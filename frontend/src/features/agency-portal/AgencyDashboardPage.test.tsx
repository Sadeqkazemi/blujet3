import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AgencyDashboardPage from './AgencyDashboardPage';
import * as portalApi from '../../api/agency-portal';
import * as useLocaleModule from '../../hooks/useLocale';
import * as useIsMobileModule from '../../hooks/useIsMobile';
import type { AgencyDashboard } from '../../types/agency-portal';

function mockLocale(locale: 'fa' | 'en' | 'ar') {
  vi.spyOn(useLocaleModule, 'useLocale').mockReturnValue({ locale, setLocale: vi.fn() });
}

afterEach(() => {
  vi.restoreAllMocks();
});

const DASHBOARD: AgencyDashboard = {
  credit: { limitIrr: '1800000000', usedIrr: '500000000', remainingIrr: '1300000000' },
  kpis: { salesThisMonthIrr: '384000000', ticketsIssuedTotal: 142, seatsSoldThisMonth: 12 },
  monthlySales: [
    { month: '2026-02', salesIrr: '100000000' },
    { month: '2026-03', salesIrr: '120000000' },
    { month: '2026-04', salesIrr: '90000000' },
    { month: '2026-05', salesIrr: '200000000' },
    { month: '2026-06', salesIrr: '150000000' },
    { month: '2026-07', salesIrr: '384000000' },
  ],
};

describe('AgencyDashboardPage', () => {
  beforeEach(() => {
    vi.spyOn(useIsMobileModule, 'useIsMobile').mockReturnValue(false);
    vi.spyOn(portalApi, 'fetchAllotments').mockResolvedValue([
      {
        id: 'a1',
        flightNo: 'EP-821',
        route: 'THR → DXB',
        departureAt: '2026-07-25T08:30:00.000Z',
        aircraftType: 'A320',
        seatsAllocated: 30,
        seatsUsed: 18,
        type: 'SOFT',
        releaseAt: null,
        contractPriceIrr: '380000000',
        active: true,
      },
    ]);
  });

  it('renders real KPI cards and the 6-month sales chart from the API, not fabricated data', async () => {
    vi.spyOn(portalApi, 'fetchDashboard').mockResolvedValue(DASHBOARD);
    render(
      <MemoryRouter>
        <AgencyDashboardPage />
      </MemoryRouter>,
    );

    expect(await screen.findByTestId('agency-dashboard')).toBeInTheDocument();
    expect(screen.getByText('فروش این ماه')).toBeInTheDocument();
    expect(screen.getAllByText(/۳۸٬۴۰۰٬۰۰۰/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/۱۳۰٬۰۰۰٬۰۰۰/).length).toBeGreaterThan(0);
    expect(screen.getByText('صندلی تخصیص‌یافته')).toBeInTheDocument();
    expect(screen.getByText('۳۰')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'نمودار فروش ۶ ماه اخیر' })).toBeInTheDocument();
    expect(screen.getByTestId('agency-view-statement')).toHaveAttribute('href', '/agency/credit');
  });

  it('renders translated KPI labels in English', async () => {
    mockLocale('en');
    vi.spyOn(portalApi, 'fetchDashboard').mockResolvedValue(DASHBOARD);
    render(
      <MemoryRouter>
        <AgencyDashboardPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Sales this month')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Last 6 months sales chart' })).toBeInTheDocument();
    expect(screen.getByText('May')).toBeInTheDocument();
    expect(screen.getByText('View statement')).toBeInTheDocument();
  });

  it('renders translated KPI labels in Arabic', async () => {
    mockLocale('ar');
    vi.spyOn(portalApi, 'fetchDashboard').mockResolvedValue(DASHBOARD);
    render(
      <MemoryRouter>
        <AgencyDashboardPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('مبيعات هذا الشهر')).toBeInTheDocument();
    expect(screen.getByText('عرض كشف الحساب')).toBeInTheDocument();
  });

  it('renders a real zero-value empty state (e.g. the UAT sandbox agency account) without an error message', async () => {
    vi.spyOn(portalApi, 'fetchAllotments').mockResolvedValue([]);
    vi.spyOn(portalApi, 'fetchDashboard').mockResolvedValue({
      credit: { limitIrr: '0', usedIrr: '0', remainingIrr: '0' },
      kpis: { salesThisMonthIrr: '0', ticketsIssuedTotal: 0, seatsSoldThisMonth: 0 },
      monthlySales: [],
    });
    render(
      <MemoryRouter>
        <AgencyDashboardPage />
      </MemoryRouter>,
    );

    expect(await screen.findByTestId('agency-dashboard')).toBeInTheDocument();
    expect(screen.queryByText('خطا در دریافت داشبورد.')).not.toBeInTheDocument();
    expect(screen.getByText('فروش این ماه')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'نمودار فروش ۶ ماه اخیر' })).toBeInTheDocument();
    expect(screen.getAllByText('۰ تومان').length).toBeGreaterThan(0);
  });
});
