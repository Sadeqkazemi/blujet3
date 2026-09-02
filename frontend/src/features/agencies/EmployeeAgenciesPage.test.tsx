import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as agenciesApi from '../../api/agencies';
import * as panelsApi from '../../api/panels';
import EmployeeAgenciesPage from './EmployeeAgenciesPage';

vi.mock('../../api/agencies');
vi.mock('../../api/panels');

const agency = {
  id: 'agency-1',
  fullName: 'آژانس نمونه',
  managerName: 'مدیر نمونه',
  licenseNo: '1234',
  city: 'تهران',
  tier: 'NORMAL' as const,
  isActive: true,
  limitIrr: '0',
  usedIrr: '0',
  remainingIrr: '0',
  pendingInvoiceCount: 0,
  monthlyTicketsSold: 0,
  monthlySalesIrr: '0',
};

const request = {
  id: 'request-1',
  applicantName: 'آژانس در انتظار',
  managerName: 'مدیر درخواست',
  licenseNo: '5678',
  city: 'تبریز',
  phone: '09120000000',
  email: 'agency@example.com',
  status: 'PENDING' as const,
  approvalStage: 'AWAITING_COMMERCIAL' as const,
  referredToId: null,
  reviewNote: null,
  commercialApprovedById: null,
  commercialApprovedAt: null,
  financeApprovedById: null,
  financeApprovedAt: null,
  reviewedById: null,
  reviewedAt: null,
  createdAt: '2026-08-14T00:00:00.000Z',
};

function renderPage() {
  return render(
    <MemoryRouter>
      <EmployeeAgenciesPage />
    </MemoryRouter>,
  );
}

describe('EmployeeAgenciesPage permission-aware loading', () => {
  beforeEach(() => {
    vi.mocked(agenciesApi.fetchAgencies).mockResolvedValue({
      agencies: [agency],
      kpis: {
        activeCount: 1,
        totalCreditGrantedIrr: '0',
        totalUsedIrr: '0',
        pendingSettlementCount: 0,
      },
    });
    vi.mocked(agenciesApi.fetchAgencyRequests).mockResolvedValue([request]);
  });

  it('loads only membership requests for an ag_requests employee', async () => {
    vi.mocked(panelsApi.fetchEmployeeContext).mockResolvedValue({
      dept: 'commercial',
      deptLabelFa: 'بازرگانی',
      rank: 'SPECIALIST',
      permissionLabelsFa: ['بررسی درخواست عضویت جدید آژانس'],
      permissionKeys: ['ag_requests'],
    });

    renderPage();

    expect(await screen.findByText('آژانس در انتظار')).toBeInTheDocument();
    expect(agenciesApi.fetchAgencyRequests).toHaveBeenCalled();
    expect(agenciesApi.fetchAgencies).not.toHaveBeenCalled();
  });

  it('loads partner agencies and links details for ag_info access', async () => {
    vi.mocked(panelsApi.fetchEmployeeContext).mockResolvedValue({
      dept: 'commercial',
      deptLabelFa: 'بازرگانی',
      rank: 'SPECIALIST',
      permissionLabelsFa: ['دسترسی به اطلاعات کامل آژانس'],
      permissionKeys: ['ag_info'],
    });

    renderPage();

    const name = await screen.findByText('آژانس نمونه');
    expect(agenciesApi.fetchAgencies).toHaveBeenCalled();
    expect(name.closest('a')).toHaveAttribute('href', '/panel/agencies/agency-1');
  });

  it('does not expose agency-detail links for list-only access', async () => {
    vi.mocked(panelsApi.fetchEmployeeContext).mockResolvedValue({
      dept: 'commercial',
      deptLabelFa: 'بازرگانی',
      rank: 'SPECIALIST',
      permissionLabelsFa: ['مشاهده فهرست آژانس‌ها'],
      permissionKeys: ['ag_list'],
    });

    renderPage();

    const name = await screen.findByText('آژانس نمونه');
    await waitFor(() => expect(agenciesApi.fetchAgencies).toHaveBeenCalled());
    expect(name.closest('a')).toBeNull();
  });
});
