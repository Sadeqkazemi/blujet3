import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import FinancePage from './FinancePage';
import * as reportingApi from '../../api/reporting';
import * as agenciesApi from '../../api/agencies';
import * as reconciliationApi from '../../api/reconciliation';
import * as panelsApi from '../../api/panels';
import * as useAuthModule from '../../hooks/useAuth';
import { mockAuthUserWithRole } from '../../test/mockAuthUser';
import type { Role } from '../../types/auth';
import type {
  AgencySettlementsResult,
  CompletedFlightsSummary,
  KpiResult,
  RecentTransactionsResult,
  RevenueMixResult,
} from '../../types/reporting';
import type { ReconciliationItem } from '../../types/reconciliation';

function renderFinancePage() {
  return render(
    <MemoryRouter>
      <Routes>
        <Route element={<Outlet context={{ nav: [], lowSalesAlerts: [] }} />}>
          <Route index element={<FinancePage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

// Money fields are decimal STRINGs on the wire (BigInt.prototype.toJSON on
// the backend — a JS number can't safely hold IRR amounts above 2^53).
const KPIS: KpiResult = {
  revenueIrr: '5000000000',
  profitIrr: '1200000000',
  marginPct: 24,
  operatingCostIrr: '3800000000',
  agencyDebtIrr: '900000000',
  agencyDebtCount: 2,
  trends: {
    revenuePct: 12,
    profitPct: 8,
    operatingCostPct: -3,
    agencyDebtPct: 0,
  },
};

const FLIGHTS: CompletedFlightsSummary = {
  flightCount: 12,
  totalSeats: 2160,
  soldSeats: 1800,
  unsoldSeats: 360,
};

const MIX: RevenueMixResult = {
  totalIrr: '5000000000',
  channels: [
    { channel: 'SYSTEM', labelFa: 'فروش سیستمی', amountIrr: '2300000000', pct: 46 },
    { channel: 'CHARTER', labelFa: 'چارتر', amountIrr: '1550000000', pct: 31 },
    { channel: 'AGENCY', labelFa: 'آژانس همکار', amountIrr: '1150000000', pct: 23 },
  ],
};

const TX: RecentTransactionsResult = {
  totalCount: 42,
  rows: [
    {
      id: 't1',
      type: 'SETTLEMENT',
      titleFa: 'تسویه حساب',
      party: 'آژانس blujet',
      occurredAt: '2026-07-10T10:00:00.000Z',
      signedAmountIrr: '-450000000',
      statusFa: 'موفق',
      statusTone: 'success',
    },
  ],
};

const SETTLEMENTS: AgencySettlementsResult = {
  outstandingIrr: '900000000',
  rows: [
    {
      agencyId: 'ag1',
      agencyName: 'آژانس پرواز آسیا',
      totalIrr: '300000000',
      paidIrr: '0',
      paidPct: 0,
      dueAt: '2026-06-05T00:00:00.000Z',
      overdueDays: 42,
      status: 'OVERDUE',
      remindInvoiceId: 'inv3',
    },
  ],
};

const RECONCILIATION_ITEM: ReconciliationItem = {
  id: 'rc1',
  pnr: 'BJ9K2L',
  bookingStatus: 'HELD',
  gatewayRefId: 'GW-88213',
  amountIrr: '420000000',
  createdAt: '2026-07-12T09:00:00.000Z',
};

function mockRole(role: Role) {
  vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
    status: 'authenticated',
    user: mockAuthUserWithRole(role),
    requestLogin: vi.fn(),
    confirmTwoFactor: vi.fn(),
    agencyLogin: vi.fn(),
    refreshMe: vi.fn(),
    signOut: vi.fn(),
  });
}

describe('FinancePage', () => {
  it('EMPLOYEE sees only the finance sections granted by the IT manager', async () => {
    mockRole('EMPLOYEE');
    vi.spyOn(panelsApi, 'fetchEmployeeContext').mockResolvedValue({
      dept: 'finance',
      deptLabelFa: 'مالی',
      rank: 'کارشناس',
      permissionLabelsFa: ['داشبورد', 'مالی'],
      permissionKeys: ['fn_dashboard', 'fn_transactions'],
    });
    vi.spyOn(reportingApi, 'fetchFinanceDashboardStats').mockResolvedValue({
      activeAgencies: 5,
      activeAgenciesTrendPct: 0,
      passengersThisMonth: 12,
      passengersTrendPct: 0,
      ticketsSoldThisMonth: 9,
      ticketsTrendPct: 0,
      revenueThisMonthIrr: '5000000000',
      revenueTrendPct: 0,
    });
    const transactions = vi.spyOn(reportingApi, 'fetchRecentTransactions').mockResolvedValue(TX);
    const settlements = vi.spyOn(reportingApi, 'fetchAgencySettlements');

    renderFinancePage();

    expect(await screen.findByTestId('employee-finance-view')).toHaveTextContent('۵۰۰٬۰۰۰٬۰۰۰ تومان');
    expect(screen.getByText('تراکنش‌های مالی اخیر')).toBeInTheDocument();
    expect(screen.queryByText('تسویه‌حساب آژانس‌های همکار')).not.toBeInTheDocument();
    expect(transactions).toHaveBeenCalledOnce();
    expect(settlements).not.toHaveBeenCalled();
  });

  it('FINANCE_MANAGER gets the finance-ops view: transactions, settlements, remind action', async () => {
    mockRole('FINANCE_MANAGER');
    vi.spyOn(reportingApi, 'fetchKpis').mockResolvedValue(KPIS);
    vi.spyOn(reportingApi, 'fetchCompletedFlightsSummary').mockResolvedValue(FLIGHTS);
    vi.spyOn(reportingApi, 'fetchRecentTransactions').mockResolvedValue(TX);
    vi.spyOn(reportingApi, 'fetchRevenueMix').mockResolvedValue(MIX);
    vi.spyOn(reportingApi, 'fetchAgencySettlements').mockResolvedValue(SETTLEMENTS);
    vi.spyOn(reconciliationApi, 'fetchReconciliationQueue').mockResolvedValue([]);
    const remindSpy = vi.spyOn(agenciesApi, 'remindAgencyInvoice').mockResolvedValue({ queued: true });

    renderFinancePage();
    expect(await screen.findByText('مانیتورینگ فروش، تراکنش‌ها و تسویه آژانس‌ها')).toBeInTheDocument();
    expect(await screen.findByText('تراکنش‌های مالی اخیر')).toBeInTheDocument();
    expect(screen.getByTestId('finance-ops-view')).toBeInTheDocument();
    expect(screen.getByTestId('finance-kpi-revenue')).toHaveTextContent('۵۰۰ میلیون');
    expect(screen.getByTestId('finance-kpi-debt')).toHaveTextContent('۲ آژانس');
    expect(screen.getByTestId('finance-revenue-mix')).toHaveTextContent('بر اساس کانال فروش');
    expect(screen.getByText('تسویه حساب')).toBeInTheDocument();
    expect(screen.getByText('تسویه‌حساب آژانس‌های همکار')).toBeInTheDocument();
    expect(screen.getByText(/معوق — ۴۲ روز/)).toBeInTheDocument();
    expect(screen.getByText('موردی برای بررسی وجود ندارد.')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'ارسال یادآوری' }));
    await waitFor(() => expect(remindSpy).toHaveBeenCalledWith('ag1', 'inv3'));
    expect(await screen.findByText(/یادآوری تسویه.*ارسال شد/)).toBeInTheDocument();
  });

  it('shows the payment-reconciliation queue and resolves an item with a required note', async () => {
    mockRole('FINANCE_MANAGER');
    vi.spyOn(reportingApi, 'fetchKpis').mockResolvedValue(KPIS);
    vi.spyOn(reportingApi, 'fetchCompletedFlightsSummary').mockResolvedValue(FLIGHTS);
    vi.spyOn(reportingApi, 'fetchRecentTransactions').mockResolvedValue(TX);
    vi.spyOn(reportingApi, 'fetchRevenueMix').mockResolvedValue(MIX);
    vi.spyOn(reportingApi, 'fetchAgencySettlements').mockResolvedValue(SETTLEMENTS);
    vi.spyOn(reconciliationApi, 'fetchReconciliationQueue').mockResolvedValue([RECONCILIATION_ITEM]);
    const resolveSpy = vi
      .spyOn(reconciliationApi, 'resolveReconciliation')
      .mockResolvedValue({ ...RECONCILIATION_ITEM, bookingStatus: 'TICKETED' });

    renderFinancePage();
    expect(await screen.findByTestId('reconciliation-item')).toHaveTextContent('BJ9K2L');
    expect(screen.getByTestId('reconciliation-item')).toHaveTextContent('GW-88213');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'رفع مغایرت' }));

    // an empty/too-short note is rejected client-side, without calling the API
    await user.click(screen.getByRole('button', { name: 'ثبت رفع مغایرت' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('حداقل ۳ نویسه');
    expect(resolveSpy).not.toHaveBeenCalled();

    await user.type(screen.getByTestId('reconciliation-note'), 'بلیط دستی صادر شد.');
    await user.click(screen.getByRole('button', { name: 'ثبت رفع مغایرت' }));

    await waitFor(() => expect(resolveSpy).toHaveBeenCalledWith('rc1', 'بلیط دستی صادر شد.'));
    await waitFor(() => expect(screen.queryByTestId('reconciliation-item')).not.toBeInTheDocument());
  });

  it('FINANCE_MANAGER finance-ops view follows the approved fixed annual layout', async () => {
    mockRole('FINANCE_MANAGER');
    const kpiSpy = vi.spyOn(reportingApi, 'fetchKpis').mockResolvedValue(KPIS);
    vi.spyOn(reportingApi, 'fetchCompletedFlightsSummary').mockResolvedValue(FLIGHTS);
    vi.spyOn(reportingApi, 'fetchRecentTransactions').mockResolvedValue(TX);
    vi.spyOn(reportingApi, 'fetchRevenueMix').mockResolvedValue(MIX);
    vi.spyOn(reportingApi, 'fetchAgencySettlements').mockResolvedValue(SETTLEMENTS);
    vi.spyOn(reconciliationApi, 'fetchReconciliationQueue').mockResolvedValue([]);

    renderFinancePage();
    await screen.findByText('تراکنش‌های مالی اخیر');

    await waitFor(() =>
      expect(kpiSpy).toHaveBeenCalledWith({ granularity: 'year' }),
    );
    expect(screen.queryByText('بازه گزارش مالی')).not.toBeInTheDocument();
    expect(screen.getByText(/کل درآمد · سال/)).toBeInTheDocument();
  });

  it('CEO gets the analytic view: sales chart + revenue mix, no transactions/settlements', async () => {
    mockRole('CEO');
    vi.spyOn(reportingApi, 'fetchSalesChart').mockResolvedValue([
      {
        periodKey: '2026-07-01',
        startDate: '2026-07-01T00:00:00.000Z',
        endDate: '2026-08-01T00:00:00.000Z',
        systemIrr: '2300000000000',
        charterIrr: '1550000000000',
        agencyIrr: '1150000000000',
      },
    ]);
    vi.spyOn(reportingApi, 'fetchKpis').mockResolvedValue(KPIS);
    vi.spyOn(reportingApi, 'fetchCompletedFlightsSummary').mockResolvedValue(FLIGHTS);
    vi.spyOn(reportingApi, 'fetchRevenueMix').mockResolvedValue(MIX);

    renderFinancePage();
    expect(
      await screen.findByText('فروش هر پرواز بر اساس کانال و پیشنهاد قیمت هوش مصنوعی'),
    ).toBeInTheDocument();
    expect(await screen.findByText('نمودار فروش')).toBeInTheDocument();
    expect(screen.getByText('ترکیب درآمد')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '۶ ماهه' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'شماره پرواز' })).toBeInTheDocument();
    expect(screen.getByText('مطالبات معوق آژانس‌ها')).toBeInTheDocument();
    expect(screen.queryByText('تراکنش‌های مالی اخیر')).not.toBeInTheDocument();
    expect(screen.queryByText('تسویه‌حساب آژانس‌های همکار')).not.toBeInTheDocument();
  });

  it('BOARD_CHAIR gets the connected executive finance view', async () => {
    mockRole('BOARD_CHAIR');
    const salesSpy = vi.spyOn(reportingApi, 'fetchSalesChart').mockResolvedValue([]);
    const kpiSpy = vi.spyOn(reportingApi, 'fetchKpis').mockResolvedValue(KPIS);
    vi.spyOn(reportingApi, 'fetchCompletedFlightsSummary').mockResolvedValue(FLIGHTS);
    const mixSpy = vi.spyOn(reportingApi, 'fetchRevenueMix').mockResolvedValue(MIX);

    renderFinancePage();

    expect(await screen.findByText('نمودار فروش')).toBeInTheDocument();
    expect(screen.getByText('ترکیب درآمد')).toBeInTheDocument();
    expect(salesSpy).toHaveBeenCalled();
    expect(kpiSpy).toHaveBeenCalled();
    expect(mixSpy).toHaveBeenCalled();
    expect(screen.queryByText('تراکنش‌های مالی اخیر')).not.toBeInTheDocument();
  });

  it('keeps the analytic finance page visible when one report endpoint fails', async () => {
    mockRole('COMMERCIAL_MANAGER');
    vi.spyOn(reportingApi, 'fetchSalesChart').mockResolvedValue([]);
    vi.spyOn(reportingApi, 'fetchKpis').mockResolvedValue(KPIS);
    vi.spyOn(reportingApi, 'fetchCompletedFlightsSummary').mockResolvedValue(FLIGHTS);
    vi.spyOn(reportingApi, 'fetchRevenueMix').mockRejectedValue(new Error('temporary failure'));

    renderFinancePage();

    expect(await screen.findByText('نمودار فروش')).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent('بخشی از اطلاعات مالی در دسترس نیست');
    expect(screen.getByText('مطالبات معوق آژانس‌ها')).toBeInTheDocument();
    expect(screen.getByText('تفکیک کانال‌های درآمد در حال حاضر در دسترس نیست.')).toBeInTheDocument();
  });

  it('CEO شماره پرواز mode shows searchable flight cards and selected-flight summary', async () => {
    mockRole('CEO');
    vi.spyOn(reportingApi, 'fetchSalesChart').mockResolvedValue([]);
    vi.spyOn(reportingApi, 'fetchKpis').mockResolvedValue(KPIS);
    vi.spyOn(reportingApi, 'fetchCompletedFlightsSummary').mockResolvedValue(FLIGHTS);
    vi.spyOn(reportingApi, 'fetchRevenueMix').mockResolvedValue(MIX);
    // Multiple departed instances of the same flightNo must collapse to ONE card.
    vi.spyOn(reportingApi, 'fetchFlightSales').mockResolvedValue({
      rows: [
        {
          flightInstanceId: 'fi-1a',
          flightNo: 'EP-805',
          originCode: 'THR',
          destCode: 'DXB',
          originCityFa: 'تهران',
          destCityFa: 'دبی',
          departureAt: '2026-08-23T06:00:00.000Z',
          systemIrr: '2000000000',
          charterIrr: '1000000000',
          agencyIrr: '1000000000',
          totalIrr: '4000000000',
          capacity: 168,
          soldSeats: 120,
        },
        {
          flightInstanceId: 'fi-1b',
          flightNo: 'EP-805',
          originCode: 'THR',
          destCode: 'DXB',
          originCityFa: 'تهران',
          destCityFa: 'دبی',
          departureAt: '2026-08-16T06:00:00.000Z',
          systemIrr: '2120000000',
          charterIrr: '980000000',
          agencyIrr: '1430000000',
          totalIrr: '4530000000',
          capacity: 168,
          soldSeats: 110,
        },
        {
          flightInstanceId: 'fi-1c',
          flightNo: 'EP-805',
          originCode: 'THR',
          destCode: 'DXB',
          originCityFa: 'تهران',
          destCityFa: 'دبی',
          departureAt: '2026-08-09T06:00:00.000Z',
          systemIrr: '1000000000',
          charterIrr: '500000000',
          agencyIrr: '500000000',
          totalIrr: '2000000000',
          capacity: 168,
          soldSeats: 90,
        },
        {
          flightInstanceId: 'fi-2',
          flightNo: 'W5-098',
          originCode: 'MHD',
          destCode: 'THR',
          originCityFa: 'مشهد',
          destCityFa: 'تهران',
          departureAt: '2026-06-29T09:00:00.000Z',
          systemIrr: '1880000000',
          charterIrr: '1420000000',
          agencyIrr: '1040000000',
          totalIrr: '4340000000',
          capacity: 150,
          soldSeats: 100,
        },
      ],
    });

    renderFinancePage();
    await screen.findByText('نمودار فروش');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'شماره پرواز' }));

    // No flight cards by default — only the search box + prompt.
    expect(await screen.findByLabelText('جستجوی شماره پرواز یا مسیر')).toBeInTheDocument();
    expect(screen.getByText('شماره پرواز یا مسیر را جستجو کنید.')).toBeInTheDocument();
    expect(screen.queryByTestId('flight-sales-list')).not.toBeInTheDocument();
    expect(screen.queryByText('تهران ← دبی')).not.toBeInTheDocument();
    expect(screen.queryByText('مشهد ← تهران')).not.toBeInTheDocument();

    // Search reveals matching flights (one card per flightNo).
    await user.type(screen.getByLabelText('جستجوی شماره پرواز یا مسیر'), 'EP-805');
    expect(screen.queryByText('شماره پرواز یا مسیر را جستجو کنید.')).not.toBeInTheDocument();
    expect(screen.getByTestId('flight-sales-list').className).toContain('flex-col');
    expect(screen.getAllByRole('button', { name: /تهران ← دبی/ })).toHaveLength(1);
    expect(screen.queryByText('مشهد ← تهران')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /تهران ← دبی/ })).toHaveTextContent('۳ پرواز');
    // Aggregated sales: 4.0B + 4.53B + 2.0B rial = 10.53B → 1.053B toman → «۱٫۱ میلیارد»
    expect(screen.getByRole('button', { name: /تهران ← دبی/ })).toHaveTextContent('۱٫۱ میلیارد');
    expect(screen.getByText('پرواز EP-805')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /تهران ← دبی/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // Broader search can show multiple cards; clicking updates the summary.
    await user.clear(screen.getByLabelText('جستجوی شماره پرواز یا مسیر'));
    await user.type(screen.getByLabelText('جستجوی شماره پرواز یا مسیر'), 'تهران');
    expect(screen.getByText('تهران ← دبی')).toBeInTheDocument();
    expect(screen.getByText('مشهد ← تهران')).toBeInTheDocument();
    const w5Card = screen.getByRole('button', { name: /مشهد ← تهران/ });
    await user.click(w5Card);
    expect(w5Card).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('پرواز W5-098')).toBeInTheDocument();
    expect(screen.getAllByText('۴۳۴ میلیون').length).toBeGreaterThanOrEqual(1);

    // Clearing search hides cards again (no default box).
    await user.clear(screen.getByLabelText('جستجوی شماره پرواز یا مسیر'));
    expect(screen.getByText('شماره پرواز یا مسیر را جستجو کنید.')).toBeInTheDocument();
    expect(screen.queryByTestId('flight-sales-list')).not.toBeInTheDocument();
  });
});
