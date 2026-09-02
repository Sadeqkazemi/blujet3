import { render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import RefundsPage from './RefundsPage';
import * as refundsApi from '../../api/refunds';
import * as staffApi from '../../api/cartable';
import * as authApi from '../../api/auth';
import * as useAuthModule from '../../hooks/useAuth';
import { mockAuthUserWithRole } from '../../test/mockAuthUser';
import type { RefundDetail, RefundListRow, RefundsResult } from '../../types/refunds';
import type { StaffDirectoryEntry } from '../../types/cartable';
import type { Role } from '../../types/auth';

function row(overrides: Partial<RefundListRow>): RefundListRow {
  return {
    id: 'r1',
    bookingId: 'b1',
    passengerName: 'رضا کریمی',
    totalPaidIrr: '30000000',
    penaltyPct: 30,
    penaltyAmountIrr: '9000000',
    refundableIrr: '21000000',
    status: 'FINANCE',
    assigneeId: null,
    assignee: null,
    paidAt: null,
    history: [{ step: 'submitted', labelFa: 'ثبت درخواست', at: 'دیروز' }],
    createdAt: '2026-07-15T09:30:00.000Z',
    booking: {
      id: 'b1',
      pnr: 'BLJ4X2',
      flightInstance: {
        departureAt: '2026-07-27T08:30:00.000Z',
        flight: { flightNo: 'EP-821', route: { originCode: 'THR', destCode: 'MHD' } },
      },
    },
    ...overrides,
  };
}

const FINANCE_ROW = row({});
const SUBMITTED_ROW = row({
  id: 'r2',
  bookingId: 'b2',
  passengerName: 'سارا محمدی',
  status: 'SUBMITTED',
  booking: { ...FINANCE_ROW.booking, id: 'b2', pnr: 'BLJ7Y9' },
});
const PAID_ROW = row({
  id: 'r3',
  bookingId: 'b3',
  passengerName: 'نگار رضایی',
  status: 'PAID',
  paidAt: '2026-07-16T10:00:00.000Z',
  booking: { ...FINANCE_ROW.booking, id: 'b3', pnr: 'BLJ2K8' },
});

const LIST: RefundsResult = {
  requests: [FINANCE_ROW, SUBMITTED_ROW, PAID_ROW],
  kpis: { payoutQueue: 1, paid: 1, awaitingAdmin: 1 },
};

const DETAIL: RefundDetail = {
  ...FINANCE_ROW,
  nationalId: '0012345679',
  mobile: '09121234567',
  iban: 'IR820170000000332211009900',
  processedBy: null,
};

const STAFF: StaffDirectoryEntry[] = [
  { id: 's1', fullName: 'حمید توکلی', role: 'EMPLOYEE', roleLabelFa: 'کارمند' },
  { id: 's2', fullName: 'علی احمدی', role: 'COMMERCIAL_MANAGER', roleLabelFa: 'مدیر بازرگانی' },
  { id: 's3', fullName: 'مریم مالی', role: 'FINANCE_MANAGER', roleLabelFa: 'مدیر مالی' },
];

function mockRole(role: Role = 'FINANCE_MANAGER') {
  vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
    status: 'authenticated',
    user: mockAuthUserWithRole(role),
    requestLogin: vi.fn(),
    confirmTwoFactor: vi.fn(),
    agencyLogin: vi.fn(),
    signOut: vi.fn(),
  });
}

function mockList(data: RefundsResult = LIST) {
  vi.spyOn(refundsApi, 'fetchRefunds').mockResolvedValue(data);
  vi.spyOn(staffApi, 'fetchStaffDirectory').mockResolvedValue(STAFF);
}

describe('RefundsPage', () => {
  beforeEach(() => {
    mockRole('FINANCE_MANAGER');
  });

  it('renders KPI cards, Persian-digit amounts and a status pill + action per row state', async () => {
    mockList();
    render(<RefundsPage />);

    expect(await screen.findByText('استرداد بلیط')).toBeInTheDocument();
    // Header pill + KPI card both show the payout queue count.
    expect(screen.getByText('۱ در صف پرداخت')).toBeInTheDocument();
    expect(screen.getByText('در انتظار بررسی ادمین')).toBeInTheDocument();
    expect(screen.getByText('پرداخت‌شده')).toBeInTheDocument();
    expect(screen.getByText('۳ درخواست')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/جستجو بر اساس نام مسافر/)).toBeInTheDocument();

    // 21,000,000 rial -> ۲٬۱۰۰٬۰۰۰ toman on every card.
    expect(screen.getAllByText('۲٬۱۰۰٬۰۰۰ تومان')).toHaveLength(3);

    // Row states: FINANCE gets the pay button, SUBMITTED waits on admin, PAID is closed.
    expect(screen.getByRole('button', { name: 'تأیید و پرداخت' })).toBeInTheDocument();
    expect(screen.getByText('ثبت مشتری')).toBeInTheDocument();
    expect(screen.getByText('آمادهٔ پرداخت')).toBeInTheDocument();
    expect(screen.getAllByText('پرداخت شد').length).toBeGreaterThanOrEqual(2); // pill + inline label
    expect(screen.getByText('در انتظار ادمین')).toBeInTheDocument();
  });

  it('shows the empty state when no requests exist', async () => {
    mockList({ requests: [], kpis: { payoutQueue: 0, paid: 0, awaitingAdmin: 0 } });
    render(<RefundsPage />);

    expect(await screen.findByText('درخواست استردادی ثبت نشده است.')).toBeInTheDocument();
  });

  it('filters the list via the search box and shows a no-match state', async () => {
    mockList();
    const { default: userEvent } = await import('@testing-library/user-event');
    render(<RefundsPage />);

    await screen.findByText('رضا کریمی');
    const search = screen.getByPlaceholderText(/جستجو بر اساس نام مسافر/);
    await userEvent.type(search, 'سارا');

    expect(screen.getByText('۱ درخواست')).toBeInTheDocument();
    expect(screen.getByText('سارا محمدی')).toBeInTheDocument();
    expect(screen.queryByText('رضا کریمی')).not.toBeInTheDocument();

    await userEvent.clear(search);
    await userEvent.type(search, 'ناموجود');
    expect(await screen.findByText('درخواستی با این عبارت یافت نشد.')).toBeInTheDocument();
  });

  it('paginates at 10 requests per page', async () => {
    const many: RefundListRow[] = Array.from({ length: 12 }, (_, i) =>
      row({
        id: `r${i + 1}`,
        bookingId: `b${i + 1}`,
        passengerName: `مسافر ${i + 1}`,
        status: i % 2 === 0 ? 'FINANCE' : 'SUBMITTED',
        booking: {
          id: `b${i + 1}`,
          pnr: `PNR${i + 1}`,
          flightInstance: {
            departureAt: '2026-07-27T08:30:00.000Z',
            flight: { flightNo: 'EP-821', route: { originCode: 'THR', destCode: 'MHD' } },
          },
        },
      }),
    );
    mockList({
      requests: many,
      kpis: { payoutQueue: 6, paid: 0, awaitingAdmin: 6 },
    });

    const { default: userEvent } = await import('@testing-library/user-event');
    render(<RefundsPage />);

    expect(await screen.findByText('۱۲ درخواست')).toBeInTheDocument();
    expect(screen.getByText('مسافر 1')).toBeInTheDocument();
    expect(screen.getByText('مسافر 10')).toBeInTheDocument();
    expect(screen.queryByText('مسافر 11')).not.toBeInTheDocument();

    const pager = screen.getByTestId('pagination');
    await userEvent.click(within(pager).getByRole('button', { name: 'بعدی' }));
    expect(await screen.findByText('مسافر 11')).toBeInTheDocument();
    expect(screen.queryByText('مسافر 1')).not.toBeInTheDocument();
  });

  it('opening a card shows passenger/account info (شبا), flight info and the penalty breakdown', async () => {
    mockList();
    vi.spyOn(refundsApi, 'fetchRefundDetail').mockResolvedValue(DETAIL);

    const { default: userEvent } = await import('@testing-library/user-event');
    render(<RefundsPage />);

    await userEvent.click(await screen.findByRole('button', { name: /رضا کریمی/ }));
    const dialog = await screen.findByRole('dialog', { name: 'درخواست استرداد · بلیط BLJ4X2' });

    expect(within(dialog).getByText('اطلاعات مسافر و حساب')).toBeInTheDocument();
    expect(within(dialog).getByText('IR820170000000332211009900')).toBeInTheDocument();
    expect(within(dialog).getByText('0012345679')).toBeInTheDocument();
    expect(within(dialog).getByText('اطلاعات پرواز')).toBeInTheDocument();
    expect(within(dialog).getByText('EP-821')).toBeInTheDocument();
    // Amounts: paid ۳٬۰۰۰٬۰۰۰ / penalty −۹۰۰٬۰۰۰ (30٪) / refundable ۲٬۱۰۰٬۰۰۰ toman.
    expect(within(dialog).getByText('۳٬۰۰۰٬۰۰۰ تومان')).toBeInTheDocument();
    expect(within(dialog).getByText('−۹۰۰٬۰۰۰ تومان')).toBeInTheDocument();
    expect(within(dialog).getByText('درصد جریمهٔ کنسلی (٪۳۰)')).toBeInTheDocument();
    expect(within(dialog).getByText('مبلغ نهایی قابل پرداخت')).toBeInTheDocument();
    expect(within(dialog).getByText('۲٬۱۰۰٬۰۰۰ تومان')).toBeInTheDocument();
  });

  it('refer requires picking a staffer, then calls the API and shows the notice', async () => {
    mockList();
    vi.spyOn(refundsApi, 'fetchRefundDetail').mockResolvedValue(DETAIL);
    const refer = vi.spyOn(refundsApi, 'referRefund').mockResolvedValue(FINANCE_ROW);

    const { default: userEvent } = await import('@testing-library/user-event');
    render(<RefundsPage />);

    await userEvent.click(await screen.findByRole('button', { name: /رضا کریمی/ }));
    const dialog = await screen.findByRole('dialog', { name: /BLJ4X2/ });

    const submit = within(dialog).getByRole('button', { name: 'ثبت و انتقال فرآیند ارجاع' });
    expect(submit).toBeDisabled();

    await userEvent.selectOptions(within(dialog).getByLabelText('گیرنده ارجاع'), 's1');
    await userEvent.click(submit);

    await waitFor(() => expect(refer).toHaveBeenCalledWith('r1', 's1'));
    expect(await screen.findByText('فرآیند به حمید توکلی ارجاع شد ✓')).toBeInTheDocument();
  });

  it('paying from the modal calls the API, closes the modal and shows the paid notice', async () => {
    mockList();
    vi.spyOn(refundsApi, 'fetchRefundDetail').mockResolvedValue(DETAIL);
    vi.spyOn(authApi, 'requestStepUp').mockResolvedValue({ challengeId: 'ch1' });
    const pay = vi.spyOn(refundsApi, 'payRefund').mockResolvedValue({ ...FINANCE_ROW, status: 'PAID' });

    const { default: userEvent } = await import('@testing-library/user-event');
    render(<RefundsPage />);

    await userEvent.click(await screen.findByRole('button', { name: /رضا کریمی/ }));
    const dialog = await screen.findByRole('dialog', { name: /BLJ4X2/ });

    await userEvent.click(within(dialog).getByRole('button', { name: 'تأیید، واریز به شبا و بستن پرونده' }));

    const stepUpDialog = await screen.findByRole('dialog', { name: 'تأیید مجدد هویت' });
    await userEvent.type(within(stepUpDialog).getByRole('textbox'), '482913');
    await userEvent.click(within(stepUpDialog).getByRole('button', { name: 'تأیید' }));

    await waitFor(() =>
      expect(pay).toHaveBeenCalledWith('r1', { stepUpChallengeId: 'ch1', stepUpCode: '482913' }),
    );
    expect(await screen.findByText('تأیید، واریز وجه و بستن پرونده انجام شد ✓')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('a PAID detail shows the closed-case banner instead of refer/pay actions', async () => {
    mockList();
    vi.spyOn(refundsApi, 'fetchRefundDetail').mockResolvedValue({
      ...DETAIL,
      id: 'r3',
      status: 'PAID',
      paidAt: '2026-07-16T10:00:00.000Z',
      booking: { ...DETAIL.booking, pnr: 'BLJ2K8' },
    });

    const { default: userEvent } = await import('@testing-library/user-event');
    render(<RefundsPage />);

    await userEvent.click(await screen.findByRole('button', { name: /نگار رضایی/ }));
    const dialog = await screen.findByRole('dialog', { name: /BLJ2K8/ });

    expect(within(dialog).getByText('پرداخت شد و پرونده بسته است ✓')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'ثبت و انتقال فرآیند ارجاع' })).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole('button', { name: 'تأیید، واریز به شبا و بستن پرونده' }),
    ).not.toBeInTheDocument();
  });

  it('SITE_ADMIN sees admin KPIs, search, view-and-refer rows (no pay button)', async () => {
    mockRole('SITE_ADMIN');
    mockList();
    render(<RefundsPage />);

    expect(await screen.findByText('۱ در انتظار بررسی')).toBeInTheDocument();
    expect(screen.getByText('ارجاع‌شده به مالی')).toBeInTheDocument();
    expect(screen.getByText('درخواست‌های استرداد بلیط')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/جستجو بر اساس نام مسافر/)).toBeInTheDocument();
    expect(screen.getAllByText('مشاهده و ارجاع ←').length).toBe(3);
    expect(screen.queryByRole('button', { name: 'تأیید و پرداخت' })).not.toBeInTheDocument();
    expect(screen.getAllByText('تهران ← مشهد').length).toBeGreaterThan(0);
    expect(screen.getAllByText('در انتظار بررسی').length).toBeGreaterThan(0);
    expect(screen.getByText('ارجاع به مالی')).toBeInTheDocument();
  });

  it('SITE_ADMIN search filters the refund list', async () => {
    mockRole('SITE_ADMIN');
    mockList();
    const { default: userEvent } = await import('@testing-library/user-event');
    render(<RefundsPage />);

    await screen.findByText('رضا کریمی');
    const search = screen.getByPlaceholderText(/جستجو بر اساس نام مسافر/);
    await userEvent.type(search, 'سارا');
    expect(screen.getByText('۱ درخواست')).toBeInTheDocument();
    expect(screen.getByText('سارا محمدی')).toBeInTheDocument();
    expect(screen.queryByText('رضا کریمی')).not.toBeInTheDocument();
  });
});
