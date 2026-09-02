import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import AgencyDetailPage from './AgencyDetailPage';
import * as agenciesApi from '../../api/agencies';
import * as useAuthModule from '../../hooks/useAuth';
import { mockAuthUserWithRole } from '../../test/mockAuthUser';
import type { AgencyDetail, AgencyDocument } from '../../types/agencies';
import type { Role } from '../../types/auth';

const DETAIL: AgencyDetail = {
  id: 'a1',
  fullName: 'آژانس blujet',
  managerName: 'کامران یوسفی',
  licenseNo: 'AG-10234',
  phone: '+989120000002',
  email: 'info@blujet-agency.example',
  city: 'تهران',
  address: 'تهران، خیابان ولیعصر، پلاک ۱۲۰',
  tier: 'GOLD',
  isActive: true,
  suspendedAt: null,
  suspendReason: null,
  joinedAt: '2023-04-10T00:00:00.000Z',
  // Money fields are decimal STRINGs on the wire (BigInt.prototype.toJSON
  // on the backend — a JS number can't safely hold IRR amounts above 2^53).
  credit: { limitIrr: '1800000000', usedIrr: '310000000', remainingIrr: '1490000000' },
  stats: { totalSalesIrr: '1330000000', ticketsIssued: 7, passengers: 0 },
  recentActivity: [],
};

const DETAIL_WITH_SCORE: AgencyDetail = {
  ...DETAIL,
  activityScore: { score: 210, badge: 'BRONZE' },
};

const DETAIL_WITH_EXTRAS: AgencyDetail = {
  ...DETAIL_WITH_SCORE,
  commercialExtras: {
    flightsSold: [],
    purchasedServices: [],
    financeSummary: { paidTotalIrr: 800000000, unpaidTotalIrr: 0 },
    transactions: [
      { id: 't1', titleFa: 'فروش بلیط پرواز W5-101', occurredAt: '2026-07-10T09:00:00.000Z', signedAmountIrr: 320000000, ref: 'BJ1234' },
    ],
  },
};

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
    <MemoryRouter initialEntries={['/panel/agencies/a1']}>
      <Routes>
        <Route path="/panel/agencies/:agencyId" element={<AgencyDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function stubStaffReviewFetches(documents: AgencyDocument[] = []) {
  vi.spyOn(agenciesApi, 'fetchAgencyDocuments').mockResolvedValue(documents);
  vi.spyOn(agenciesApi, 'fetchAgencyCreditRequests').mockResolvedValue([]);
  vi.spyOn(agenciesApi, 'fetchAgencyWebserviceRequests').mockResolvedValue([]);
}

describe('AgencyDetailPage', () => {
  it("Senior Manager sees credit + API-key sections and no invoices/messages tabs or activity score", async () => {
    mockRole('SENIOR_MANAGER');
    vi.spyOn(agenciesApi, 'fetchAgencyDetail').mockResolvedValue(DETAIL);
    vi.spyOn(agenciesApi, 'fetchAgencyApiKeys').mockResolvedValue([]);
    stubStaffReviewFetches();

    renderPage();

    expect(await screen.findByText('اعتبار آژانس')).toBeInTheDocument();
    expect(screen.getByText('دسترسی API رزرواسیون')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'تولید API' })).toBeInTheDocument();
    expect(screen.getByText('کامل (جستجو + رزرو + صدور)')).toBeInTheDocument();

    expect(screen.queryByText('فاکتورهای صادرشده')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'مکاتبه‌ها' })).not.toBeInTheDocument();
    expect(screen.queryByText('امتیاز فعالیت آژانس')).not.toBeInTheDocument();
  });

  it('Finance Manager sees credit + settle, issued invoices (no issue button), and no API-key/messages', async () => {
    mockRole('FINANCE_MANAGER');
    vi.spyOn(agenciesApi, 'fetchAgencyDetail').mockResolvedValue(DETAIL_WITH_EXTRAS);
    stubStaffReviewFetches();
    vi.spyOn(agenciesApi, 'fetchAggregateSeatRequests').mockResolvedValue([
      {
        id: 'sr1',
        agencyId: 'a1',
        agencyName: 'آژانس blujet',
        managerName: 'کامران یوسفی',
        phone: '09120000000',
        city: 'تهران',
        licenseNo: 'AG-10234',
        routeFa: 'تهران → دبی',
        seats: 20,
        months: 3,
        aircraftType: 'ATR 72',
        unitPriceIrr: '25000000',
        totalIrr: '500000000',
        payMethod: 'CREDIT',
        status: 'APPROVED',
        invoiceNo: 'INV-1002',
        dueAt: null,
        flights: [],
        createdAt: '2026-07-01T10:00:00.000Z',
      },
    ]);
    vi.spyOn(agenciesApi, 'fetchAgencyInvoices').mockResolvedValue([
      {
        id: 'inv1',
        agencyId: 'a1',
        invoiceNo: 'INV-1002',
        issuedById: 'u9',
        issuedAt: '2026-06-20T00:00:00.000Z',
        dueAt: '2026-07-05T00:00:00.000Z',
        amountIrr: '800000000',
        status: 'UNPAID',
        paidAt: null,
      },
    ]);

    renderPage();

    expect(await screen.findByRole('button', { name: 'نمای کلی' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'مالی' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'سابقه' })).toBeInTheDocument();
    expect(screen.getByText('اعتبار آژانس')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ثبت تسویه' })).toBeInTheDocument();
    expect(screen.getByText('امتیاز فعالیت آژانس')).toBeInTheDocument();

    const { default: userEvent } = await import('@testing-library/user-event');
    await userEvent.click(screen.getByRole('button', { name: 'مالی' }));
    expect(await screen.findByText('فاکتورهای صادرشده')).toBeInTheDocument();
    expect(screen.getAllByText('INV-1002').length).toBeGreaterThan(0);
    expect(screen.getByText('فاکتورهای پرداخت‌نشده')).toBeInTheDocument();
    expect(screen.getByText('درآمد کل فروش')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'یادآوری' }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('button', { name: 'ثبت پرداخت این فاکتور' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'سابقه' }));
    expect(await screen.findByText('تاریخچهٔ پرداخت')).toBeInTheDocument();
    expect(screen.getByText('فروش بلیط پرواز W5-101')).toBeInTheDocument();
    expect(screen.getByText('تهران → دبی')).toBeInTheDocument();

    expect(screen.queryByText('دسترسی API رزرواسیون')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'صدور فاکتور' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'مکاتبه‌ها' })).not.toBeInTheDocument();
  });

  it('Commercial Manager sees the نمای کلی/مالی/مکاتبه‌ها sub-tabs with invoice issuance and chat', async () => {
    mockRole('COMMERCIAL_MANAGER');
    vi.spyOn(agenciesApi, 'fetchAgencyDetail').mockResolvedValue(DETAIL_WITH_SCORE);
    stubStaffReviewFetches();
    vi.spyOn(agenciesApi, 'fetchAgencyInvoices').mockResolvedValue([
      {
        id: 'inv1',
        agencyId: 'a1',
        invoiceNo: 'INV-1002',
        issuedById: 'u9',
        issuedAt: '2026-06-20T00:00:00.000Z',
        dueAt: '2026-07-05T00:00:00.000Z',
        amountIrr: '800000000',
        status: 'UNPAID',
        paidAt: null,
      },
    ]);
    vi.spyOn(agenciesApi, 'fetchAgencyMessages').mockResolvedValue([
      {
        id: 'm1',
        agencyId: 'a1',
        senderId: 'u9',
        senderIsAgency: false,
        body: 'لطفاً فاکتور را تسویه بفرمایید.',
        createdAt: '2026-07-01T10:00:00.000Z',
      },
    ]);

    const { default: userEvent } = await import('@testing-library/user-event');
    renderPage();

    expect(await screen.findByRole('button', { name: 'نمای کلی' })).toBeInTheDocument();
    expect(screen.getByText('امتیاز فعالیت آژانس')).toBeInTheDocument();
    expect(screen.getByText('اعتبار آژانس')).toBeInTheDocument();
    expect(screen.queryByText('دسترسی API رزرواسیون')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'مالی' }));
    expect(await screen.findByText('فاکتورهای صادرشده')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'صدور فاکتور' })).toBeInTheDocument();
    expect(screen.getAllByText('INV-1002').length).toBeGreaterThan(0);
    expect(screen.getAllByText('در انتظار پرداخت').length).toBeGreaterThan(0);
    // Jalali due date rendered with Persian digits, not the raw ISO string
    expect(screen.queryByText('2026-07-05T00:00:00.000Z')).not.toBeInTheDocument();
    // Commercial settles via invoices — no manual settle button
    expect(screen.queryByRole('button', { name: 'ثبت تسویه' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'مکاتبه‌ها' }));
    expect(await screen.findByText('لطفاً فاکتور را تسویه بفرمایید.')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('پیام خود را به این آژانس بنویسید…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ارسال' })).toBeInTheDocument();
  });

  it('Commercial Manager: تاریخچه (History) tab shows real payment history and seat-request history', async () => {
    mockRole('COMMERCIAL_MANAGER');
    vi.spyOn(agenciesApi, 'fetchAgencyDetail').mockResolvedValue(DETAIL_WITH_EXTRAS);
    stubStaffReviewFetches();
    vi.spyOn(agenciesApi, 'fetchAgencyInvoices').mockResolvedValue([]);
    vi.spyOn(agenciesApi, 'fetchAgencyMessages').mockResolvedValue([]);
    vi.spyOn(agenciesApi, 'fetchAggregateSeatRequests').mockResolvedValue([
      {
        id: 'sr1',
        agencyId: 'a1',
        agencyName: 'آژانس blujet',
        managerName: 'کامران یوسفی',
        phone: '09120000000',
        city: 'تهران',
        licenseNo: 'AG-10234',
        routeFa: 'تهران - کیش',
        seats: 6,
        months: 3,
        aircraftType: 'ATR 72',
        unitPriceIrr: '4200000',
        totalIrr: '25200000',
        payMethod: 'CREDIT',
        status: 'APPROVED',
        invoiceNo: 'INV-1400100',
        dueAt: null,
        flights: [],
        createdAt: '2026-07-01T00:00:00.000Z',
      },
    ]);

    const { default: userEvent } = await import('@testing-library/user-event');
    renderPage();
    await screen.findByRole('button', { name: 'سابقه' });

    await userEvent.click(screen.getByRole('button', { name: 'سابقه' }));
    expect(await screen.findByText('تاریخچهٔ پرداخت')).toBeInTheDocument();
    expect(screen.getByText('فروش بلیط پرواز W5-101')).toBeInTheDocument();
    expect(screen.getByText('سابقهٔ درخواست‌های خرید صندلی')).toBeInTheDocument();
    expect(screen.getByText('تهران - کیش')).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText('جستجو در سابقه بر اساس مسیر یا شماره…'), 'کیش');
    expect(screen.getByText('تهران - کیش')).toBeInTheDocument();
    expect(screen.queryByText('فروش بلیط پرواز W5-101')).not.toBeInTheDocument();
  });

  it('EMPLOYEE with fn_invoices sees credit/settle + the invoices table (no صدور فاکتور button, no API-key/messages)', async () => {
    mockRole('EMPLOYEE');
    vi.spyOn(agenciesApi, 'fetchAgencyDetail').mockResolvedValue(DETAIL);
    vi.spyOn(agenciesApi, 'fetchAgencyInvoices').mockResolvedValue([
      {
        id: 'inv1',
        agencyId: 'a1',
        invoiceNo: 'INV-1002',
        issuedById: 'u9',
        issuedAt: '2026-06-20T00:00:00.000Z',
        dueAt: '2026-07-05T00:00:00.000Z',
        amountIrr: '800000000',
        status: 'UNPAID',
        paidAt: null,
      },
    ]);

    renderPage();

    expect(await screen.findByText('اعتبار آژانس')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ثبت تسویه' })).toBeInTheDocument();
    expect(await screen.findByText('فاکتورهای صادرشده')).toBeInTheDocument();
    expect(screen.getByText('INV-1002')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'یادآوری' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ثبت پرداخت این فاکتور' })).toBeInTheDocument();

    expect(screen.queryByRole('button', { name: 'صدور فاکتور' })).not.toBeInTheDocument();
    expect(screen.queryByText('دسترسی API رزرواسیون')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'مکاتبه‌ها' })).not.toBeInTheDocument();
  });

  it('EMPLOYEE without fn_invoices (403 on the invoices fetch) still sees the rest of the page, with an empty invoices table', async () => {
    mockRole('EMPLOYEE');
    vi.spyOn(agenciesApi, 'fetchAgencyDetail').mockResolvedValue(DETAIL);
    vi.spyOn(agenciesApi, 'fetchAgencyInvoices').mockRejectedValue(new Error('دسترسی غیرمجاز'));

    renderPage();

    expect(await screen.findByText('اعتبار آژانس')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ثبت تسویه' })).toBeInTheDocument();
    expect(await screen.findByText('فاکتورهای صادرشده')).toBeInTheDocument();
    expect(screen.getByText('فاکتوری صادر نشده است.')).toBeInTheDocument();
  });

  it('suspending requires a reason and submits it', async () => {
    mockRole('SENIOR_MANAGER');
    vi.spyOn(agenciesApi, 'fetchAgencyDetail').mockResolvedValue(DETAIL);
    vi.spyOn(agenciesApi, 'fetchAgencyApiKeys').mockResolvedValue([]);
    stubStaffReviewFetches();
    const suspend = vi.spyOn(agenciesApi, 'suspendAgency').mockResolvedValue(DETAIL);

    const { default: userEvent } = await import('@testing-library/user-event');
    renderPage();
    await screen.findByRole('button', { name: 'تعلیق حساب' });

    await userEvent.click(screen.getByRole('button', { name: 'تعلیق حساب' }));
    await userEvent.click(screen.getByRole('button', { name: 'تعلیق و ثبت دلیل' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('برای تعلیق حساب، درج دلیل الزامی است.');
    expect(suspend).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText('دلیل تعلیق *'), 'بدهی معوق');
    await userEvent.click(screen.getByRole('button', { name: 'تعلیق و ثبت دلیل' }));
    await waitFor(() => expect(suspend).toHaveBeenCalledWith('a1', 'بدهی معوق'));
  });

  it('the credit modal parses a toman amount (Persian digits allowed) into rial', async () => {
    mockRole('FINANCE_MANAGER');
    vi.spyOn(agenciesApi, 'fetchAgencyDetail').mockResolvedValue(DETAIL);
    stubStaffReviewFetches();
    vi.spyOn(agenciesApi, 'fetchAgencyInvoices').mockResolvedValue([]);
    const update = vi
      .spyOn(agenciesApi, 'updateAgencyCredit')
      .mockResolvedValue({ limitIrr: '2000000000', usedIrr: '310000000', remainingIrr: '1690000000' });

    const { default: userEvent } = await import('@testing-library/user-event');
    renderPage();
    await screen.findByRole('button', { name: 'تعیین اعتبار' });

    await userEvent.click(screen.getByRole('button', { name: 'تعیین اعتبار' }));
    await userEvent.type(screen.getByLabelText('سقف اعتبار جدید (تومان)'), '۲۰۰٬۰۰۰٬۰۰۰');
    await userEvent.click(screen.getByRole('button', { name: 'ثبت اعتبار' }));

    // 200,000,000 toman -> 2,000,000,000 rial
    await waitFor(() => expect(update).toHaveBeenCalledWith('a1', 2_000_000_000));
  });

  it('Finance Manager can review an uploaded document and approve it', async () => {
    mockRole('FINANCE_MANAGER');
    vi.spyOn(agenciesApi, 'fetchAgencyDetail').mockResolvedValue(DETAIL);
    vi.spyOn(agenciesApi, 'fetchAgencyInvoices').mockResolvedValue([]);
    stubStaffReviewFetches([
      {
        id: 'doc1',
        agencyId: 'a1',
        docType: 'LICENSE',
        status: 'PENDING',
        createdAt: '2026-07-01T10:00:00.000Z',
        file: { fileName: 'مجوز.pdf', sizeBytes: 1024, mimeType: 'application/pdf' },
      },
    ]);
    const decide = vi.spyOn(agenciesApi, 'decideAgencyDocument').mockResolvedValue({
      id: 'doc1',
      agencyId: 'a1',
      docType: 'LICENSE',
      status: 'APPROVED',
      createdAt: '2026-07-01T10:00:00.000Z',
      file: { fileName: 'مجوز.pdf', sizeBytes: 1024, mimeType: 'application/pdf' },
    });

    const { default: userEvent } = await import('@testing-library/user-event');
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'مالی' }));
    expect(await screen.findByText('مدارک آپلودشده')).toBeInTheDocument();
    expect(screen.getByText('مجوز فعالیت')).toBeInTheDocument();
    expect(screen.getByText('مجوز.pdf')).toBeInTheDocument();
    expect(screen.getByText('در انتظار بررسی')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'تأیید' }));
    await waitFor(() => expect(decide).toHaveBeenCalledWith('a1', 'doc1', true));
    expect(await screen.findByText('مدرک تأیید شد ✓')).toBeInTheDocument();
  });

  it('FINANCE_MANAGER can approve a pending credit increase request', async () => {
    mockRole('FINANCE_MANAGER');
    vi.spyOn(agenciesApi, 'fetchAgencyDetail').mockResolvedValue(DETAIL);
    vi.spyOn(agenciesApi, 'fetchAgencyInvoices').mockResolvedValue([]);
    stubStaffReviewFetches();
    vi.spyOn(agenciesApi, 'fetchAgencyWebserviceRequests').mockResolvedValue([]);
    vi.spyOn(agenciesApi, 'fetchAgencyCreditRequests').mockResolvedValue([
      {
        id: 'cr1',
        requestedLimitIrr: '2000000000',
        note: 'افزایش برای فصل پیک',
        status: 'PENDING',
        decidedAt: null,
        createdAt: '2026-07-01T10:00:00.000Z',
      },
    ]);
    const decide = vi.spyOn(agenciesApi, 'decideAgencyCreditRequest').mockResolvedValue({
      id: 'cr1',
      requestedLimitIrr: '2000000000',
      note: 'افزایش برای فصل پیک',
      status: 'APPROVED',
      decidedAt: '2026-07-02T10:00:00.000Z',
      createdAt: '2026-07-01T10:00:00.000Z',
    });

    const { default: userEvent } = await import('@testing-library/user-event');
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'مالی' }));
    expect(await screen.findByText('درخواست‌های افزایش اعتبار')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'تأیید' }));
    await waitFor(() => expect(decide).toHaveBeenCalledWith('a1', 'cr1', true));
  });

  it('EMPLOYEE never sees the documents card (not fetched for that role)', async () => {
    mockRole('EMPLOYEE');
    vi.spyOn(agenciesApi, 'fetchAgencyDetail').mockResolvedValue(DETAIL);
    vi.spyOn(agenciesApi, 'fetchAgencyInvoices').mockResolvedValue([]);

    renderPage();

    expect(await screen.findByText('اعتبار آژانس')).toBeInTheDocument();
    expect(screen.queryByText('مدارک آپلودشده')).not.toBeInTheDocument();
  });
});
