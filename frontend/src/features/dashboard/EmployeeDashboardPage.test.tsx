import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EmployeeDashboardPage from './EmployeeDashboardPage';
import * as cartableApi from '../../api/cartable';
import * as panelsApi from '../../api/panels';
import type { PanelNavItem } from '../../types/panels';

function Shell({ nav }: { nav: PanelNavItem[] | null }) {
  return <Outlet context={{ nav, lowSalesAlerts: [] }} />;
}

function renderWithNav(nav: PanelNavItem[] | null) {
  return render(
    <MemoryRouter initialEntries={['/panel']}>
      <Routes>
        <Route path="/panel" element={<Shell nav={nav} />}>
          <Route index element={<EmployeeDashboardPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('EmployeeDashboardPage', () => {
  beforeEach(() => {
    vi.spyOn(panelsApi, 'fetchEmployeeContext').mockResolvedValue({
      dept: 'commercial',
      deptLabelFa: 'بازرگانی',
      rank: 'کارشناس',
      permissionLabelsFa: ['داشبورد', 'مدیریت آژانس‌ها', 'گزارش‌ها', 'کارتابل', 'ارجاعات'],
      permissionKeys: ['ag_list', 'rp_sales', 'ct_list', 'ct_process'],
    });
    vi.spyOn(cartableApi, 'fetchMyReferrals').mockResolvedValue({
      referrals: [],
      counts: { total: 0, awaitingMyReport: 2 },
    });
  });

  it('shows permission chips from employee context (no flights)', async () => {
    vi.spyOn(cartableApi, 'fetchCartable').mockResolvedValue({
      tasks: [],
      counts: { ADMIN: 0, AGENCY: 0, MANAGER: 0 },
      totalOpen: 0,
    });
    renderWithNav([
      { key: 'dashboard', labelFa: 'داشبورد', implemented: true },
      { key: 'agencies', labelFa: 'مدیریت آژانس‌ها', implemented: true },
      { key: 'reports', labelFa: 'گزارش‌ها', implemented: true },
      { key: 'cartable', labelFa: 'کارتابل', implemented: true },
      { key: 'referrals', labelFa: 'ارجاعات', implemented: true },
    ]);

    expect(await screen.findByText('دسترسی‌های شما در این واحد')).toBeInTheDocument();
    expect(screen.getByText('مدیریت آژانس‌ها')).toBeInTheDocument();
    expect(screen.getByText('گزارش‌ها')).toBeInTheDocument();
    expect(screen.queryByText('مدیریت پروازها')).not.toBeInTheDocument();
  });

  it('shows KPI cards for cartable count, referrals count, and unit label', async () => {
    vi.spyOn(cartableApi, 'fetchCartable').mockResolvedValue({
      tasks: [],
      counts: { ADMIN: 3, AGENCY: 0, MANAGER: 0 },
      totalOpen: 3,
    });
    renderWithNav([
      { key: 'dashboard', labelFa: 'داشبورد', implemented: true },
      { key: 'cartable', labelFa: 'کارتابل', implemented: true },
      { key: 'referrals', labelFa: 'ارجاعات', implemented: true },
    ]);

    await waitFor(() => {
      expect(screen.getByText('کارهای باز کارتابل')).toBeInTheDocument();
    });
    expect(screen.getByText('۳')).toBeInTheDocument();
    expect(screen.getByText('۲')).toBeInTheDocument();
    expect(screen.getAllByText('بازرگانی').length).toBeGreaterThan(0);
  });

  it('shows a no-access message when nothing has been granted yet', async () => {
    vi.spyOn(panelsApi, 'fetchEmployeeContext').mockResolvedValue({
      dept: 'commercial',
      deptLabelFa: 'بازرگانی',
      rank: 'کارشناس',
      permissionLabelsFa: ['داشبورد', 'ارجاعات'],
      permissionKeys: [],
    });
    renderWithNav([{ key: 'dashboard', labelFa: 'داشبورد', implemented: true }]);

    expect(await screen.findByTestId('employee-no-access')).toBeInTheDocument();
  });

  it('still shows no-access when only referrals is present (always-on tab)', async () => {
    vi.spyOn(panelsApi, 'fetchEmployeeContext').mockResolvedValue({
      dept: 'commercial',
      deptLabelFa: 'بازرگانی',
      rank: 'کارشناس',
      permissionLabelsFa: ['داشبورد', 'ارجاعات'],
      permissionKeys: [],
    });
    renderWithNav([
      { key: 'dashboard', labelFa: 'داشبورد', implemented: true },
      { key: 'referrals', labelFa: 'ارجاعات', implemented: true },
    ]);

    expect(await screen.findByTestId('employee-no-access')).toBeInTheDocument();
    expect(screen.getByText('ارجاعات')).toBeInTheDocument();
  });

  it('hides the no-access message once a real IT-granted section exists', async () => {
    vi.spyOn(cartableApi, 'fetchCartable').mockResolvedValue({
      tasks: [],
      counts: { ADMIN: 0, AGENCY: 0, MANAGER: 0 },
      totalOpen: 0,
    });
    renderWithNav([
      { key: 'dashboard', labelFa: 'داشبورد', implemented: true },
      { key: 'agencies', labelFa: 'مدیریت آژانس‌ها', implemented: true },
      { key: 'referrals', labelFa: 'ارجاعات', implemented: true },
    ]);

    await screen.findByText('دسترسی‌های شما در این واحد');
    expect(screen.queryByTestId('employee-no-access')).not.toBeInTheDocument();
  });
});
