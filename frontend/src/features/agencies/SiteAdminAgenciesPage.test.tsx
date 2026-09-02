import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import SiteAdminAgenciesPage from './SiteAdminAgenciesPage';
import * as agenciesApi from '../../api/agencies';
import type { AgencyListResult, AgencyMembershipRequest } from '../../types/agencies';
import type { AgencyWebserviceQueueRow } from '../../types/agency-portal';

const LIST: AgencyListResult = {
  agencies: [
    {
      id: 'a1',
      fullName: 'آژانس پارسیان گشت',
      managerName: 'کامران یوسفی',
      licenseNo: 'AG-10234',
      city: 'تهران',
      tier: 'GOLD',
      isActive: true,
      limitIrr: '1800000000',
      usedIrr: '310000000',
      remainingIrr: '1490000000',
      pendingInvoiceCount: 0,
      monthlyTicketsSold: 0,
      monthlySalesIrr: '0',
    },
    {
      id: 'a2',
      fullName: 'سفرهای blujetآبی',
      managerName: 'سارا نجفی',
      licenseNo: 'AG-10891',
      city: 'تهران',
      tier: 'SILVER',
      isActive: true,
      limitIrr: '900000000',
      usedIrr: '100000000',
      remainingIrr: '800000000',
      pendingInvoiceCount: 0,
      monthlyTicketsSold: 0,
      monthlySalesIrr: '0',
    },
  ],
  kpis: {
    activeCount: 2,
    totalCreditGrantedIrr: '2700000000',
    totalUsedIrr: '410000000',
    pendingSettlementCount: 0,
  },
};

const REQUESTS: AgencyMembershipRequest[] = [
  {
    id: 'r1',
    applicantName: 'مهرپرواز ایرانیان',
    managerName: 'حسین مهری',
    licenseNo: '3315-7782',
    city: 'اصفهان',
    phone: '+989130000001',
    email: 'info@mehr.example',
    status: 'PENDING',
    referredToId: null,
    reviewNote: null,
    reviewedById: null,
    reviewedAt: null,
    createdAt: '2026-07-01T00:00:00.000Z',
  },
  {
    id: 'r2',
    applicantName: 'سپهر سیر کویر',
    managerName: 'الهام کویر',
    licenseNo: '2093-6641',
    city: 'یزد',
    phone: '+989130000002',
    email: 'info@sepehr.example',
    status: 'PENDING',
    referredToId: null,
    reviewNote: null,
    reviewedById: null,
    reviewedAt: null,
    createdAt: '2026-07-02T00:00:00.000Z',
  },
];

const WS: AgencyWebserviceQueueRow[] = [
  {
    id: 'ws1',
    agencyId: 'a1',
    agencyName: 'آژانس پارسیان گشت',
    city: 'تهران',
    licenseNo: 'AG-10234',
    scope: 'FULL',
    months: 3,
    priceIrr: '150000000',
    note: null,
    status: 'PENDING',
    decidedAt: null,
    createdAt: '2026-07-03T00:00:00.000Z',
  },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <SiteAdminAgenciesPage />
    </MemoryRouter>,
  );
}

describe('SiteAdminAgenciesPage', () => {
  it('renders membership requests, KPIs, partner list and webservice tab', async () => {
    vi.spyOn(agenciesApi, 'fetchAgencies').mockResolvedValue(LIST);
    vi.spyOn(agenciesApi, 'fetchAgencyRequests').mockResolvedValue(REQUESTS);
    vi.spyOn(agenciesApi, 'fetchAllWebserviceRequests').mockResolvedValue(WS);

    renderPage();

    expect(await screen.findByText('مهرپرواز ایرانیان')).toBeInTheDocument();
    expect(screen.getByText('مدیریت آژانس‌ها')).toBeInTheDocument();
    expect(screen.getByText('درخواست‌های جدید عضویت')).toBeInTheDocument();
    expect(screen.getByText('سپهر سیر کویر')).toBeInTheDocument();
    expect(screen.getAllByText('بررسی درخواست')).toHaveLength(2);
    expect(screen.getByText('آژانس‌های فعال')).toBeInTheDocument();
    expect(await screen.findByText('آژانس پارسیان گشت')).toBeInTheDocument();
    expect(screen.getByText('سفرهای blujetآبی')).toBeInTheDocument();
    expect(screen.getAllByText('فعال')).toHaveLength(2);

    await userEvent.click(screen.getByRole('button', { name: /درخواست وب‌سرویس/ }));
    expect(await screen.findByText('درخواست‌های خرید وب‌سرویس')).toBeInTheDocument();
    expect(screen.getByText(/دسترسی کامل/)).toBeInTheDocument();
  });

  it('paginates partner agencies at 10 per page', async () => {
    const many: AgencyListResult = {
      agencies: Array.from({ length: 12 }, (_, i) => ({
        id: `a${i + 1}`,
        fullName: `آژانس ${i + 1}`,
        managerName: 'مدیر',
        licenseNo: `AG-${1000 + i}`,
        city: 'تهران',
        tier: 'NORMAL' as const,
        isActive: true,
        limitIrr: '1000000',
        usedIrr: '0',
        remainingIrr: '1000000',
        pendingInvoiceCount: 0,
        monthlyTicketsSold: 0,
        monthlySalesIrr: '0',
      })),
      kpis: {
        activeCount: 12,
        totalCreditGrantedIrr: '0',
        totalUsedIrr: '0',
        pendingSettlementCount: 0,
      },
    };
    vi.spyOn(agenciesApi, 'fetchAgencies').mockResolvedValue(many);
    vi.spyOn(agenciesApi, 'fetchAgencyRequests').mockResolvedValue([]);
    vi.spyOn(agenciesApi, 'fetchAllWebserviceRequests').mockResolvedValue([]);

    renderPage();

    expect(await screen.findByText('آژانس 1')).toBeInTheDocument();
    expect(screen.getByText('آژانس 10')).toBeInTheDocument();
    expect(screen.queryByText('آژانس 11')).not.toBeInTheDocument();
    expect(screen.getByTestId('pagination')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'بعدی' }));
    expect(await screen.findByText('آژانس 11')).toBeInTheDocument();
    expect(screen.queryByText('آژانس 1')).not.toBeInTheDocument();
  });
});
