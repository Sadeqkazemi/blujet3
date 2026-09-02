import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AgencyCreditPage from './AgencyCreditPage';
import * as portalApi from '../../api/agency-portal';
import * as useLocaleModule from '../../hooks/useLocale';
import type { AgencyCredit, AgencyInvoice } from '../../types/agency-portal';

function mockLocale(locale: 'fa' | 'en' | 'ar') {
  vi.spyOn(useLocaleModule, 'useLocale').mockReturnValue({ locale, setLocale: vi.fn() });
}

afterEach(() => {
  vi.restoreAllMocks();
});

// Money fields are decimal STRINGs on the wire (BigInt.prototype.toJSON on
// the backend — a JS number can't safely hold IRR amounts above 2^53).
const CREDIT: AgencyCredit = { limitIrr: '1800000000', usedIrr: '500000000', remainingIrr: '1300000000' };
const INVOICES: AgencyInvoice[] = [
  {
    id: 'inv1',
    invoiceNo: 'INV-1002',
    issuedAt: '2026-06-20T00:00:00.000Z',
    dueAt: '2026-07-05T00:00:00.000Z',
    amountIrr: '800000000',
    status: 'UNPAID',
    paidAt: null,
  },
];

function mockLoads() {
  vi.spyOn(portalApi, 'fetchCredit').mockResolvedValue(CREDIT);
  vi.spyOn(portalApi, 'fetchInvoices').mockResolvedValue(INVOICES);
  vi.spyOn(portalApi, 'fetchLedger').mockResolvedValue([]);
  vi.spyOn(portalApi, 'fetchFinancialEvents').mockResolvedValue([]);
  vi.spyOn(portalApi, 'fetchMyCreditRequests').mockResolvedValue([]);
}

describe('AgencyCreditPage', () => {
  it('shows limit/used/remaining and pays an unpaid invoice from credit', async () => {
    mockLoads();
    const paySpy = vi.spyOn(portalApi, 'payInvoice').mockResolvedValue({ ...INVOICES[0], status: 'PAID' });

    render(<AgencyCreditPage />);
    expect(await screen.findByText('INV-1002')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'پرداخت از اعتبار' }));

    await waitFor(() => expect(paySpy).toHaveBeenCalledWith('inv1'));
  });

  it('opens the credit-increase request modal and submits a toman amount converted to rial', async () => {
    mockLoads();
    const requestSpy = vi.spyOn(portalApi, 'requestCreditIncrease').mockResolvedValue({
      id: 'r1',
      requestedLimitIrr: '2000000000',
      note: null,
      status: 'PENDING',
      decidedAt: null,
      createdAt: '2026-07-17T00:00:00.000Z',
    });

    render(<AgencyCreditPage />);
    await screen.findByText('INV-1002');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'افزایش اعتبار' }));
    await user.type(screen.getByLabelText('سقف درخواستی (تومان)'), '200000000');
    await user.click(screen.getByRole('button', { name: 'ارسال درخواست' }));

    await waitFor(() => expect(requestSpy).toHaveBeenCalledWith(2_000_000_000, undefined));
  });

  it('renders translated headings and the pay button in English', async () => {
    mockLocale('en');
    mockLoads();
    render(<AgencyCreditPage />);

    expect(await screen.findByText('Credit Limit')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pay from Credit' })).toBeInTheDocument();
  });

  it('renders translated headings and invoice status in Arabic', async () => {
    mockLocale('ar');
    mockLoads();
    render(<AgencyCreditPage />);

    expect(await screen.findByText('بانتظار الدفع')).toBeInTheDocument();
  });
});
