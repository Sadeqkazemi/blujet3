import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import SiteAdminDashboardPage from './SiteAdminDashboardPage';
import * as agenciesApi from '../../api/agencies';
import * as cartableApi from '../../api/cartable';
import * as refundsApi from '../../api/refunds';
import * as reportingApi from '../../api/reporting';
import type { AgencyMembershipRequest } from '../../types/agencies';
import type { CartableListResult } from '../../types/cartable';
import type { RefundsResult } from '../../types/refunds';
import type { SiteAdminOverview } from '../../types/reporting';

const OVERVIEW: SiteAdminOverview = {
  activeAgencies: 12,
  passengersThisMonth: 340,
  ticketsSoldThisMonth: 280,
  pendingActionCount: 5,
  agenciesTrendPct: null,
  passengersTrendPct: 12,
  ticketsTrendPct: 5,
};

const REQUEST: AgencyMembershipRequest = {
  id: 'r1',
  applicantName: 'آژانس تست',
  managerName: 'مدیر تست',
  licenseNo: 'LC123',
  city: 'تهران',
  phone: '09121110000',
  email: 'a@a.com',
  status: 'PENDING',
  referredToId: null,
  reviewNote: null,
  reviewedById: null,
  reviewedAt: null,
  createdAt: '2026-07-01T00:00:00.000Z',
};

const REFUNDS: RefundsResult = {
  requests: [
    {
      id: 'f1',
      bookingId: 'b1',
      passengerName: 'نگار رضایی',
      totalPaidIrr: '10000000',
      penaltyPct: 10,
      penaltyAmountIrr: '1000000',
      refundableIrr: '9000000',
      status: 'SUBMITTED',
      assigneeId: null,
      assignee: null,
      paidAt: null,
      history: [],
      createdAt: '2026-07-02T00:00:00.000Z',
      booking: {
        id: 'b1',
        pnr: 'BJ1X2',
        flightInstance: {
          departureAt: '2026-08-01T00:00:00.000Z',
          flight: { flightNo: 'BJ-1', route: { originCode: 'THR', destCode: 'MHD' } },
        },
      },
    },
  ],
  kpis: { payoutQueue: 0, paid: 0, awaitingAdmin: 1 },
};

const CARTABLE: CartableListResult = {
  tasks: [
    {
      id: 't1',
      category: 'AGENCY',
      title: 'بررسی مجوز آژانس',
      description: '',
      senderLabelFa: 'سیستم',
      sender: null,
      sourceType: 'AGENCY_REQUEST',
      sourceId: 'r1',
      status: 'OPEN',
      resolutionNote: null,
      createdAt: '2026-07-03T00:00:00.000Z',
    },
  ],
  counts: { ADMIN: 0, AGENCY: 1, MANAGER: 0 },
  totalOpen: 1,
};

function renderPage() {
  return render(
    <MemoryRouter>
      <SiteAdminDashboardPage />
    </MemoryRouter>,
  );
}

describe('SiteAdminDashboardPage', () => {
  it('renders KPI row and operational widgets from real endpoints', async () => {
    vi.spyOn(reportingApi, 'fetchSiteAdminOverview').mockResolvedValue(OVERVIEW);
    vi.spyOn(agenciesApi, 'fetchAgencyRequests').mockResolvedValue([REQUEST]);
    vi.spyOn(refundsApi, 'fetchRefunds').mockResolvedValue(REFUNDS);
    vi.spyOn(cartableApi, 'fetchCartable').mockResolvedValue(CARTABLE);

    renderPage();

    expect(await screen.findByText('آژانس فعال')).toBeInTheDocument();
    expect(screen.getByText('مسافر این ماه')).toBeInTheDocument();
    expect(screen.getByText('بلیط فروخته‌شده')).toBeInTheDocument();
    expect(screen.getByText('درخواست در انتظار اقدام')).toBeInTheDocument();
    expect(await screen.findByText('آژانس تست')).toBeInTheDocument();
    expect(await screen.findByText('نگار رضایی')).toBeInTheDocument();
    expect(await screen.findByText('بررسی مجوز آژانس')).toBeInTheDocument();
    expect(screen.getByText('اعلان‌های جدید')).toBeInTheDocument();
    expect(agenciesApi.fetchAgencyRequests).toHaveBeenCalledWith('PENDING');
  });

  it('still renders widgets when overview endpoint fails', async () => {
    vi.spyOn(reportingApi, 'fetchSiteAdminOverview').mockRejectedValue(new Error('404'));
    vi.spyOn(agenciesApi, 'fetchAgencyRequests').mockResolvedValue([REQUEST]);
    vi.spyOn(refundsApi, 'fetchRefunds').mockResolvedValue(REFUNDS);
    vi.spyOn(cartableApi, 'fetchCartable').mockResolvedValue(CARTABLE);

    renderPage();

    expect(await screen.findByText('آژانس تست')).toBeInTheDocument();
    expect(screen.getByText('آژانس فعال')).toBeInTheDocument();
  });

  it('routes pending actions to tickets when the personal cartable and other queues are empty', async () => {
    vi.spyOn(reportingApi, 'fetchSiteAdminOverview').mockResolvedValue({
      ...OVERVIEW,
      pendingActionCount: 1,
    });
    vi.spyOn(agenciesApi, 'fetchAgencyRequests').mockResolvedValue([]);
    vi.spyOn(refundsApi, 'fetchRefunds').mockResolvedValue({
      requests: [],
      kpis: { payoutQueue: 0, paid: 0, awaitingAdmin: 0 },
    });
    vi.spyOn(cartableApi, 'fetchCartable').mockResolvedValue({
      tasks: [],
      counts: { ADMIN: 0, AGENCY: 0, MANAGER: 0 },
      totalOpen: 0,
    });

    renderPage();

    const label = await screen.findByText('درخواست در انتظار اقدام');
    expect(label.closest('a')).toHaveAttribute('href', '/panel/tickets');
  });

  it('shows an error message when all endpoints fail', async () => {
    vi.spyOn(reportingApi, 'fetchSiteAdminOverview').mockRejectedValue(new Error('x'));
    vi.spyOn(agenciesApi, 'fetchAgencyRequests').mockRejectedValue(new Error('x'));
    vi.spyOn(refundsApi, 'fetchRefunds').mockRejectedValue(new Error('x'));
    vi.spyOn(cartableApi, 'fetchCartable').mockRejectedValue(new Error('x'));

    renderPage();

    expect(await screen.findByText('خطا در دریافت اطلاعات داشبورد.')).toBeInTheDocument();
  });
});
