import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AccountRefundsTab from './AccountRefundsTab';
import * as publicSiteApi from '../../api/publicSite';
import * as useLocaleModule from '../../hooks/useLocale';
import type {
  CustomerRefundRule,
  EligibleRefundBooking,
  RefundRequestView,
  SavedBankAccount,
} from '../../types/public-site';

const ELIGIBLE: EligibleRefundBooking = {
  bookingId: 'b1',
  pnr: 'BJ4X2K',
  flightNo: 'BJ-100',
  originCode: 'THR',
  destCode: 'MHD',
  departureAt: '2026-08-10T08:00:00.000Z',
  totalPaidIrr: '20000000',
  hoursLeft: 120,
  penaltyPct: 30,
  penaltyAmountIrr: '6000000',
  refundableIrr: '14000000',
  refundable: true,
};

const REQUEST: RefundRequestView = {
  id: 'r1',
  trackingCode: 'RF-A1B2C3D4',
  bookingId: 'b2',
  pnr: 'BJ8Z9Q',
  flightNo: 'BJ-200',
  originCode: 'SYZ',
  destCode: 'KIH',
  departureAt: '2026-08-12T08:00:00.000Z',
  status: 'FINANCE',
  penaltyPct: 50,
  penaltyAmountIrr: '10000000',
  refundableIrr: '10000000',
  totalPaidIrr: '20000000',
  history: [
    { step: 'submitted', labelFa: 'ثبت درخواست', at: '2026-07-20T08:00:00.000Z' },
    { step: 'review', labelFa: 'بررسی ادمین', at: '2026-07-20T09:00:00.000Z' },
    { step: 'finance', labelFa: 'ارجاع مالی', at: '2026-07-20T10:00:00.000Z' },
  ],
  createdAt: '2026-07-20T08:00:00.000Z',
  paidAt: null,
};

const RULES: CustomerRefundRule[] = [
  { minHoursBeforeDeparture: 72, penaltyPct: 30, labelFa: 'بیش از ۷۲ ساعت', isRefundable: true },
  { minHoursBeforeDeparture: 24, penaltyPct: 50, labelFa: '۲۴ تا ۷۲ ساعت', isRefundable: true },
  { minHoursBeforeDeparture: 3, penaltyPct: 70, labelFa: '۳ تا ۲۴ ساعت', isRefundable: true },
  { minHoursBeforeDeparture: 0, penaltyPct: 100, labelFa: 'کمتر از ۳ ساعت', isRefundable: false },
];

const BANK: SavedBankAccount = {
  id: 'ba1',
  bankName: 'بانک ملت',
  bankShort: 'ملت',
  brandColor: '#d6336c',
  cardMasked: '6104 3371 •••• 4521',
  sheba: 'IR820170000000332211009900',
  shebaMasked: '820170•••9900',
  isDefault: true,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
};

function mockLocale(locale: 'fa' | 'en' | 'ar' = 'fa') {
  vi.spyOn(useLocaleModule, 'useLocale').mockReturnValue({
    locale,
    setLocale: vi.fn(),
  });
}

beforeEach(() => {
  mockLocale();
  vi.spyOn(publicSiteApi, 'fetchEligibleRefundBookings').mockResolvedValue([ELIGIBLE]);
  vi.spyOn(publicSiteApi, 'fetchMyRefunds').mockResolvedValue([REQUEST]);
  vi.spyOn(publicSiteApi, 'fetchCustomerRefundRules').mockResolvedValue(RULES);
  vi.spyOn(publicSiteApi, 'fetchBankAccounts').mockResolvedValue([BANK]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AccountRefundsTab', () => {
  it('shows the loading state while refund data is pending', () => {
    vi.mocked(publicSiteApi.fetchEligibleRefundBookings).mockReturnValue(
      new Promise(() => undefined),
    );
    render(<AccountRefundsTab />);
    expect(screen.getByText('در حال بارگذاری…')).toBeInTheDocument();
  });

  it('renders design sections, live rule cards, eligible flight and tracking timeline', async () => {
    render(<AccountRefundsTab />);

    expect(await screen.findByText('پروازهای قابل استرداد')).toBeInTheDocument();
    expect(screen.getByTestId('refund-eligible')).toHaveTextContent('THR → MHD');
    expect(screen.getAllByTestId('refund-rule')).toHaveLength(4);
    expect(screen.getByText('غیرمجاز')).toBeInTheDocument();

    const tracking = screen.getByTestId('refund-tracking');
    expect(tracking).toHaveTextContent('RF-A1B2C3D4');
    expect(tracking).toHaveTextContent('در واحد مالی');
    expect(tracking).toHaveTextContent('واریز وجه');
  });

  it('refreshes preview and submits using the selected saved bank account', async () => {
    vi.mocked(publicSiteApi.fetchEligibleRefundBookings)
      .mockResolvedValueOnce([ELIGIBLE])
      .mockResolvedValueOnce([]);
    vi.mocked(publicSiteApi.fetchMyRefunds)
      .mockResolvedValueOnce([REQUEST])
      .mockResolvedValueOnce([
        {
          ...REQUEST,
          id: 'r2',
          bookingId: 'b1',
          pnr: 'BJ4X2K',
          trackingCode: 'RF-11223344',
          status: 'SUBMITTED',
        },
        REQUEST,
      ]);
    const preview = vi.spyOn(publicSiteApi, 'previewRefund').mockResolvedValue({
      bookingId: 'b1',
      totalPaidIrr: '20000000',
      hoursLeft: 119,
      penaltyPct: 30,
      penaltyAmountIrr: '6000000',
      refundableIrr: '14000000',
      refundable: true,
    });
    const submit = vi.spyOn(publicSiteApi, 'submitRefund').mockResolvedValue({
      ...REQUEST,
      id: 'r2',
      bookingId: 'b1',
      pnr: 'BJ4X2K',
      trackingCode: 'RF-11223344',
      status: 'SUBMITTED',
      history: [{ step: 'submitted', labelFa: 'ثبت درخواست', at: new Date().toISOString() }],
    });
    render(<AccountRefundsTab />);

    await userEvent.click(await screen.findByRole('button', { name: 'درخواست استرداد' }));
    expect(preview).toHaveBeenCalledWith('b1');

    const dialog = await screen.findByRole('dialog', { name: 'ثبت درخواست استرداد' });
    expect(within(dialog).getByText('بانک ملت · 820170•••9900')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByTestId('refund-confirm'));

    expect(submit).toHaveBeenCalledWith('b1', 'IR820170000000332211009900');
    expect(await screen.findByText('RF-11223344')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'ثبت درخواست استرداد' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('refund-eligible')).not.toBeInTheDocument();
  });

  it('validates a manually entered IBAN before submission', async () => {
    vi.spyOn(publicSiteApi, 'previewRefund').mockResolvedValue({
      ...ELIGIBLE,
      refundable: true,
    });
    const submit = vi.spyOn(publicSiteApi, 'submitRefund');
    render(<AccountRefundsTab />);

    await userEvent.click(await screen.findByRole('button', { name: 'درخواست استرداد' }));
    const dialog = await screen.findByRole('dialog', { name: 'ثبت درخواست استرداد' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'ورود شماره شبای دیگر' }));
    await userEvent.type(within(dialog).getByTestId('refund-iban'), 'IR123');
    await userEvent.click(within(dialog).getByTestId('refund-confirm'));

    expect(within(dialog).getByRole('alert')).toHaveTextContent('شماره شبا باید');
    expect(submit).not.toHaveBeenCalled();
  });

  it('renders English copy and Latin digits in English mode', async () => {
    vi.restoreAllMocks();
    mockLocale('en');
    vi.spyOn(publicSiteApi, 'fetchEligibleRefundBookings').mockResolvedValue([ELIGIBLE]);
    vi.spyOn(publicSiteApi, 'fetchMyRefunds').mockResolvedValue([REQUEST]);
    vi.spyOn(publicSiteApi, 'fetchCustomerRefundRules').mockResolvedValue(RULES);
    vi.spyOn(publicSiteApi, 'fetchBankAccounts').mockResolvedValue([]);
    render(<AccountRefundsTab />);

    expect(await screen.findByText('Refundable Flights')).toBeInTheDocument();
    expect(screen.getByTestId('refund-eligible')).toHaveTextContent('120 hours left');
    expect(screen.getByTestId('refund-eligible')).toHaveTextContent('30%');
  });

  it('renders empty states and a localized load error', async () => {
    vi.mocked(publicSiteApi.fetchEligibleRefundBookings).mockRejectedValue(
      new Error('offline'),
    );
    render(<AccountRefundsTab />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'دریافت اطلاعات استرداد انجام نشد',
    );
    expect(screen.getByText('پرواز قابل استردادی ندارید')).toBeInTheDocument();
    expect(screen.getByText('هنوز درخواست استردادی ثبت نکرده‌اید.')).toBeInTheDocument();
  });

  it('renders Arabic RTL copy/digits and responsive rule grid classes', async () => {
    vi.restoreAllMocks();
    mockLocale('ar');
    vi.spyOn(publicSiteApi, 'fetchEligibleRefundBookings').mockResolvedValue([ELIGIBLE]);
    vi.spyOn(publicSiteApi, 'fetchMyRefunds').mockResolvedValue([]);
    vi.spyOn(publicSiteApi, 'fetchCustomerRefundRules').mockResolvedValue(RULES);
    vi.spyOn(publicSiteApi, 'fetchBankAccounts').mockResolvedValue([]);
    render(<AccountRefundsTab />);

    expect(await screen.findByText('الرحلات القابلة للاسترداد')).toBeInTheDocument();
    expect(screen.getByTestId('refund-eligible')).toHaveTextContent('١٢٠ ساعة متبقية');
    const firstRule = screen.getAllByTestId('refund-rule')[0];
    expect(firstRule.parentElement).toHaveClass('grid-cols-2', 'md:grid-cols-4');
  });
});
