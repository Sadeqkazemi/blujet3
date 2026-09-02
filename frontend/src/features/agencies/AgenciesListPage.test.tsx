import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import AgenciesListPage from './AgenciesListPage';
import * as agenciesApi from '../../api/agencies';
import * as useAuthModule from '../../hooks/useAuth';
import { mockAuthUserWithRole } from '../../test/mockAuthUser';
import type { AgencyListResult, AgencyMembershipRequest } from '../../types/agencies';
import type { AgencyWebserviceQueueRow } from '../../types/agency-portal';
import type { Role } from '../../types/auth';

/** Commercial Manager's `load()` also fetches these three — stub them for
 * every commercial-role test so Promise.all doesn't reject on an unmocked
 * network call and mask the real assertions. */
function mockCommercialExtras() {
  vi.spyOn(agenciesApi, 'fetchAllWebserviceRequests').mockResolvedValue([]);
  vi.spyOn(agenciesApi, 'fetchAggregateSeatRequests').mockResolvedValue([]);
  vi.spyOn(agenciesApi, 'fetchAggregateInvoices').mockResolvedValue([]);
}

// Money fields are decimal STRINGs on the wire (BigInt.prototype.toJSON on
// the backend — a JS number can't safely hold IRR amounts above 2^53).
const LIST: AgencyListResult = {
  agencies: [
    {
      id: 'a1',
      fullName: 'آژانس blujet',
      managerName: 'کامران یوسفی',
      licenseNo: 'AG-10234',
      city: 'تهران',
      tier: 'GOLD',
      isActive: true,
      limitIrr: '1800000000',
      usedIrr: '310000000',
      remainingIrr: '1490000000',
      pendingInvoiceCount: 1,
      monthlyTicketsSold: 3840,
      monthlySalesIrr: '482000000000',
    },
    {
      id: 'a2',
      fullName: 'آژانس پرواز آسیا',
      managerName: 'سارا نجفی',
      licenseNo: 'AG-10891',
      city: 'مشهد',
      tier: 'SILVER',
      isActive: false,
      limitIrr: '900000000',
      usedIrr: '1330000000',
      remainingIrr: '-430000000',
      pendingInvoiceCount: 1,
      monthlyTicketsSold: 2150,
      monthlySalesIrr: '196000000000',
    },
  ],
  kpis: {
    activeCount: 1,
    totalCreditGrantedIrr: '2700000000',
    totalUsedIrr: '1640000000',
    pendingSettlementCount: 2,
  },
};

const REQUESTS: AgencyMembershipRequest[] = [
  {
    id: 'r1',
    applicantName: 'آژانس ستاره شرق',
    managerName: 'بهرام قاسمی',
    licenseNo: 'AG-20011',
    city: 'اصفهان',
    phone: '+989130000001',
    email: 'info@setareh.example',
    status: 'PENDING',
    referredToId: null,
    reviewNote: null,
    reviewedById: null,
    reviewedAt: null,
    createdAt: '2026-07-01T00:00:00.000Z',
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

function renderPage() {
  return render(
    <MemoryRouter>
      <AgenciesListPage />
    </MemoryRouter>,
  );
}

describe('AgenciesListPage', () => {
  it('renders the 4 KPI cards, requests panel and agency rows with Persian-formatted money for Senior Manager', async () => {
    mockRole('SENIOR_MANAGER');
    vi.spyOn(agenciesApi, 'fetchAgencies').mockResolvedValue(LIST);
    vi.spyOn(agenciesApi, 'fetchAgencyRequests').mockResolvedValue(REQUESTS);

    renderPage();

    expect(await screen.findByText('آژانس‌های فعال')).toBeInTheDocument();
    expect(screen.getByText('مجموع اعتبار اعطاشده')).toBeInTheDocument();
    expect(screen.getByText('اعتبار مصرف‌شده (بدهی)')).toBeInTheDocument();
    expect(screen.getByText('در انتظار تسویه')).toBeInTheDocument();
    // 2,700,000,000 rial -> ۲۷۰٬۰۰۰٬۰۰۰ toman with ٬ separators + Persian digits
    expect(screen.getByText('۲۷۰٬۰۰۰٬۰۰۰ تومان')).toBeInTheDocument();

    expect(screen.getByText('درخواست‌های جدید عضویت')).toBeInTheDocument();
    expect(screen.getByText('آژانس ستاره شرق')).toBeInTheDocument();
    expect(screen.getByText('بررسی درخواست')).toBeInTheDocument();

    expect(screen.getByText('آژانس blujet')).toBeInTheDocument();
    expect(screen.getByText('فعال')).toBeInTheDocument();
    expect(screen.getByText('تعلیق‌شده')).toBeInTheDocument();

    // Sub-tabs present for Senior
    expect(screen.getByRole('button', { name: 'آژانس‌های همکار' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'اعتبار و تسویه' })).toBeInTheDocument();
  });

  it('Commercial Manager sees the 3-tab bar and the agency list by default, no KPI cards', async () => {
    mockRole('COMMERCIAL_MANAGER');
    mockCommercialExtras();
    vi.spyOn(agenciesApi, 'fetchAgencies').mockResolvedValue(LIST);
    vi.spyOn(agenciesApi, 'fetchAgencyRequests').mockResolvedValue(REQUESTS);

    renderPage();

    expect(await screen.findByText('آژانس blujet')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'مدیریت آژانس‌ها' })).toBeInTheDocument();
    expect(screen.queryByLabelText('جستجو در صفحات این پنل')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'اعلان‌ها' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'آژانس‌های همکار' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'درخواست همکاری' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'آژانس‌های دارای بدهی' })).toBeInTheDocument();

    expect(screen.queryByText('درخواست‌های همکاری آژانس‌ها')).not.toBeInTheDocument();
    expect(screen.queryByText('آژانس‌های دارای بدهی یا فاکتور پرداخت‌نشده')).not.toBeInTheDocument();
    expect(screen.queryByText('مجموع اعتبار اعطاشده')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'اعتبار و تسویه' })).not.toBeInTheDocument();
    expect(screen.getByText('۳٬۸۴۰ بلیط')).toBeInTheDocument();
    expect(screen.getByText('۴۸٬۲۰۰٬۰۰۰٬۰۰۰ تومان')).toBeInTheDocument();
  });

  it('Commercial Manager: coop-requests tab shows pending requests', async () => {
    mockRole('COMMERCIAL_MANAGER');
    mockCommercialExtras();
    vi.spyOn(agenciesApi, 'fetchAgencies').mockResolvedValue(LIST);
    vi.spyOn(agenciesApi, 'fetchAgencyRequests').mockResolvedValue(REQUESTS);

    const { default: userEvent } = await import('@testing-library/user-event');
    renderPage();
    await screen.findByText('آژانس blujet');

    await userEvent.click(screen.getByRole('button', { name: 'درخواست همکاری' }));
    expect(await screen.findByText('درخواست‌های همکاری آژانس‌ها')).toBeInTheDocument();
    expect(screen.getByText('آژانس ستاره شرق')).toBeInTheDocument();
    expect(screen.getByText('بررسی و اقدام')).toBeInTheDocument();
  });

  it('Commercial Manager: debtors tab shows the notify-all + all-invoices entry points', async () => {
    mockRole('COMMERCIAL_MANAGER');
    mockCommercialExtras();
    vi.spyOn(agenciesApi, 'fetchAgencies').mockResolvedValue(LIST);
    vi.spyOn(agenciesApi, 'fetchAgencyRequests').mockResolvedValue(REQUESTS);

    const { default: userEvent } = await import('@testing-library/user-event');
    renderPage();
    await screen.findByText('آژانس blujet');

    await userEvent.click(screen.getByRole('button', { name: 'آژانس‌های دارای بدهی' }));
    expect(await screen.findByText('آژانس‌های دارای بدهی یا فاکتور پرداخت‌نشده')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ارسال اعلان به همه' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'فاکتورهای همه آژانس‌ها' })).toBeInTheDocument();
  });

  it('Commercial Manager: seat-request preview box opens the detail modal', async () => {
    mockRole('COMMERCIAL_MANAGER');
    vi.spyOn(agenciesApi, 'fetchAgencies').mockResolvedValue(LIST);
    vi.spyOn(agenciesApi, 'fetchAgencyRequests').mockResolvedValue(REQUESTS);
    vi.spyOn(agenciesApi, 'fetchAllWebserviceRequests').mockResolvedValue([]);
    vi.spyOn(agenciesApi, 'fetchAggregateInvoices').mockResolvedValue([]);
    vi.spyOn(agenciesApi, 'fetchAggregateSeatRequests').mockResolvedValue([
      {
        id: 'sr1',
        agencyId: 'a1',
        agencyName: 'آژانس blujet',
        managerName: 'کامران یوسفی',
        phone: '09120000000',
        city: 'تهران',
        licenseNo: 'AG-10234',
        routeFa: 'تهران - مشهد',
        seats: 10,
        months: 1,
        aircraftType: 'Airbus A320',
        unitPriceIrr: '4200000',
        totalIrr: '42000000',
        payMethod: 'INVOICE',
        status: 'PENDING',
        invoiceNo: null,
        dueAt: null,
        flights: [{ flightNo: 'W5-101', date: '2026-09-01', time: '08:30' }],
        createdAt: '2026-08-01T00:00:00.000Z',
      },
    ]);

    const { default: userEvent } = await import('@testing-library/user-event');
    renderPage();
    const row = await screen.findByText('آژانس blujet · تهران - مشهد');
    await userEvent.click(row);

    expect(await screen.findByText('جزئیات درخواست خرید صندلی')).toBeInTheDocument();
    expect(screen.getByText('تأیید و صدور فاکتور')).toBeInTheDocument();
  });

  it('credit sub-tab shows settle buttons and settles an agency', async () => {
    mockRole('FINANCE_MANAGER');
    vi.spyOn(agenciesApi, 'fetchAgencies').mockResolvedValue(LIST);
    vi.spyOn(agenciesApi, 'fetchAgencyRequests').mockResolvedValue(REQUESTS);
    const settle = vi
      .spyOn(agenciesApi, 'settleAgency')
      .mockResolvedValue({ settledIrr: '1330000000', ledgerEntryId: 'l1' });

    const { default: userEvent } = await import('@testing-library/user-event');
    renderPage();
    await screen.findByText('آژانس blujet');

    await userEvent.click(screen.getByRole('button', { name: 'اعتبار و تسویه' }));
    const settleButtons = await screen.findAllByRole('button', { name: 'ثبت تسویه' });
    expect(settleButtons.length).toBeGreaterThan(0);

    await userEvent.click(settleButtons[0]);
    await waitFor(() => expect(settle).toHaveBeenCalled());
    expect(await screen.findByText(/تسویه حساب .* ثبت شد/)).toBeInTheDocument();
  });

  it('Commercial Manager: web service request preview opens the real-data detail modal', async () => {
    mockRole('COMMERCIAL_MANAGER');
    vi.spyOn(agenciesApi, 'fetchAgencies').mockResolvedValue(LIST);
    vi.spyOn(agenciesApi, 'fetchAgencyRequests').mockResolvedValue(REQUESTS);
    vi.spyOn(agenciesApi, 'fetchAggregateSeatRequests').mockResolvedValue([]);
    vi.spyOn(agenciesApi, 'fetchAggregateInvoices').mockResolvedValue([]);
    const wsRow: AgencyWebserviceQueueRow = {
      id: 'ws1',
      agencyId: 'a1',
      agencyName: 'آژانس blujet',
      city: 'تهران',
      licenseNo: 'AG-10234',
      scope: 'FULL',
      months: 3,
      priceIrr: '30000000',
      note: null,
      status: 'PENDING',
      decidedAt: null,
      createdAt: '2026-08-01T00:00:00.000Z',
    };
    vi.spyOn(agenciesApi, 'fetchAllWebserviceRequests').mockResolvedValue([wsRow]);

    const { default: userEvent } = await import('@testing-library/user-event');
    renderPage();
    expect(await screen.findByText('درخواست‌های خرید وب‌سرویس آژانس‌ها')).toBeInTheDocument();
    // "آژانس blujet" also appears in the plain agency list below — click the
    // unique price line instead and walk up to the row's clickable wrapper.
    const priceLine = await screen.findByText('۳ ماهه · ۳٬۰۰۰٬۰۰۰ تومان');
    await userEvent.click(priceLine.closest('[class*="cursor-pointer"]')!);

    expect(await screen.findByText('جزئیات درخواست خرید وب‌سرویس')).toBeInTheDocument();
    expect(screen.getByText('تأیید و فعال‌سازی')).toBeInTheDocument();
  });

  it('shows the empty-search message when no agency matches', async () => {
    mockRole('SENIOR_MANAGER');
    vi.spyOn(agenciesApi, 'fetchAgencies').mockResolvedValue({ agencies: [], kpis: LIST.kpis });
    vi.spyOn(agenciesApi, 'fetchAgencyRequests').mockResolvedValue([]);

    renderPage();

    expect(await screen.findByText('آژانسی با این عبارت یافت نشد.')).toBeInTheDocument();
    expect(screen.getByText('درخواست جدیدی در انتظار تأیید نیست.')).toBeInTheDocument();
  });

  it('shows an error message when the API fails', async () => {
    mockRole('SENIOR_MANAGER');
    vi.spyOn(agenciesApi, 'fetchAgencies').mockRejectedValue(new Error('network'));
    vi.spyOn(agenciesApi, 'fetchAgencyRequests').mockRejectedValue(new Error('network'));

    renderPage();

    expect(await screen.findByText('خطا در دریافت فهرست آژانس‌ها.')).toBeInTheDocument();
  });
});
