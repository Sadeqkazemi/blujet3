import { render, screen } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import CommercialDashboardPage from './CommercialDashboardPage';
import * as reportingApi from '../../api/reporting';
import * as cartableApi from '../../api/cartable';

function Host() {
  return (
    <Outlet
      context={{
        nav: [
          { key: 'dashboard', labelFa: 'داشبورد', implemented: true },
          { key: 'agencies', labelFa: 'آژانس‌ها', implemented: true },
        ],
        lowSalesAlerts: [],
      }}
    />
  );
}

describe('CommercialDashboardPage', () => {
  it('matches the approved KPI, warning, finance and cartable composition without filler sections', async () => {
    vi.spyOn(reportingApi, 'fetchCommercialOverview').mockResolvedValue({
      activeAgencies: 142,
      passengersThisMonth: 24890,
      pendingAgencyRequests: 27,
    });
    vi.spyOn(reportingApi, 'fetchRevenueMix').mockResolvedValue({
      totalIrr: '0',
      channels: [
        { channel: 'SYSTEM', labelFa: 'سیستمی', amountIrr: '0', pct: 0 },
        { channel: 'CHARTER', labelFa: 'چارتر', amountIrr: '0', pct: 0 },
        { channel: 'AGENCY', labelFa: 'آژانس', amountIrr: '0', pct: 0 },
      ],
    });
    vi.spyOn(cartableApi, 'fetchCartable').mockResolvedValue({
      tasks: [],
      counts: { ADMIN: 0, AGENCY: 0, MANAGER: 0 },
      totalOpen: 0,
    });

    render(
      <MemoryRouter initialEntries={['/panel']}>
        <Routes>
          <Route element={<Host />}>
            <Route path="/panel" element={<CommercialDashboardPage />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'داشبورد' })).toBeInTheDocument();
    expect(screen.getByText('آژانس فعال')).toBeInTheDocument();
    expect(screen.getByText('مسافر این ماه')).toBeInTheDocument();
    expect(screen.getByText('درخواست همکاری آژانس‌ها')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'گزارش مالی' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'کارتابل' })).toBeInTheDocument();
    expect(screen.getByLabelText('جستجو در صفحات این پنل')).toBeInTheDocument();
    expect(screen.queryByText('نمودار فروش')).not.toBeInTheDocument();
    expect(screen.queryByText('آژانس‌های بدهکار')).not.toBeInTheDocument();
    expect(screen.getAllByText('۰').length).toBeGreaterThan(0);
  });
});
