import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AgencySalesPage from './AgencySalesPage';
import * as portalApi from '../../api/agency-portal';
import * as useLocaleModule from '../../hooks/useLocale';
import type { AgencySalesReport } from '../../types/agency-portal';

function mockLocale(locale: 'fa' | 'en' | 'ar') {
  vi.spyOn(useLocaleModule, 'useLocale').mockReturnValue({ locale, setLocale: vi.fn() });
}

const REPORT: AgencySalesReport = {
  tickets: [
    {
      passengerId: 'passenger-1', ticketNo: '7800000000001', ticketIssuedAt: '2026-08-01T05:01:00.000Z',
      pnr: 'BJAG001', status: 'TICKETED', cabin: 'ECONOMY', fareClassCode: 'Y',
      flightNo: 'EP-821', route: 'THR → DXB', departureAt: '2026-08-01T05:00:00.000Z',
      priceIrr: '190000000', passengerCount: 1,
    },
    {
      pnr: 'BJAG002', status: 'REFUNDED', cabin: 'BUSINESS', fareClassCode: 'C',
      flightNo: 'EP-822', route: 'THR → MHD', departureAt: '2026-08-02T05:00:00.000Z',
      priceIrr: '250000000', passengerCount: 1,
    },
  ],
  perFlight: [{ flightNo: 'EP-821', route: 'THR → DXB', ticketsCount: 4, salesIrr: '700000000' }],
  summary: { totalSalesIrr: '760000000', ticketsIssued: 4, avgFareIrr: '190000000', refundRatePct: 20 },
};

beforeEach(() => {
  vi.spyOn(portalApi, 'fetchSales').mockResolvedValue(REPORT);
  vi.spyOn(portalApi, 'fetchProfile').mockResolvedValue({
    fullName: 'آژانس مسیر آسمان', managerName: 'مدیر آژانس', licenseNo: 'THR1537',
    phone: '+989120000000', email: 'sales@skyroute.example', city: 'تهران', address: 'خیابان آزادی، پلاک ۱۲', tier: null,
    isActive: true, suspendedAt: null, suspendReason: null,
    joinedAt: '2026-01-01T00:00:00.000Z', isTemporaryReadOnly: false,
  });
  vi.spyOn(portalApi, 'fetchCredit').mockResolvedValue({
    limitIrr: '6400000000', usedIrr: '1200000000', remainingIrr: '5200000000',
  });
  vi.spyOn(portalApi, 'fetchInvoices').mockResolvedValue([
    { id: 'i1', invoiceNo: 'INV-1', issuedAt: '2026-08-01T00:00:00Z', dueAt: '2026-08-10T00:00:00Z', amountIrr: '300000000', status: 'PAID', paidAt: '2026-08-05T00:00:00Z' },
    { id: 'i2', invoiceNo: 'INV-2', issuedAt: '2026-08-02T00:00:00Z', dueAt: '2026-08-12T00:00:00Z', amountIrr: '150000000', status: 'UNPAID', paidAt: null },
  ]);
});

afterEach(() => vi.restoreAllMocks());

describe('AgencySalesPage RTRD redesign', () => {
  it('renders the real agency reconciliation header and three report tabs', async () => {
    render(<AgencySalesPage />);

    expect(await screen.findByText('جزئیات گزارش فروش')).toBeInTheDocument();
    expect(screen.getByText('آژانس مسیر آسمان')).toBeInTheDocument();
    expect(screen.getByText('THR1537')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'RTRD' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'PSR' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'PRR' })).toBeInTheDocument();
    expect(screen.getByText('۷۶٬۰۰۰٬۰۰۰ تومان')).toBeInTheDocument();
    expect(screen.getByText('۱۵٬۰۰۰٬۰۰۰ تومان')).toBeInTheDocument();
  });

  it('shows immutable registration identity and contact fields from the authenticated agency profile', async () => {
    render(<AgencySalesPage />);

    const profile = await screen.findByTestId('agency-sales-registration-profile');
    expect(profile).toHaveTextContent('آژانس مسیر آسمان');
    expect(profile).toHaveTextContent('مدیر آژانس');
    expect(profile).toHaveTextContent('THR1537');
    expect(profile).toHaveTextContent('+989120000000');
    expect(profile).toHaveTextContent('sales@skyroute.example');
    expect(profile).toHaveTextContent('تهران');
    expect(profile).toHaveTextContent('خیابان آزادی، پلاک ۱۲');
    expect(within(profile).queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('shows sales rows in PSR and searches by PNR', async () => {
    render(<AgencySalesPage />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: 'PSR' }));

    expect(screen.getByText('BJAG001')).toBeInTheDocument();
    expect(screen.getByText('7800000000001')).toBeInTheDocument();
    expect(screen.getByText('BJAG002')).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText('جستجو در گزارش…'), 'BJAG002');
    expect(screen.queryByText('BJAG001')).not.toBeInTheDocument();
    expect(screen.getByText('BJAG002')).toBeInTheDocument();
  });

  it('limits PRR to real refunded tickets and exposes honest unavailable fields', async () => {
    render(<AgencySalesPage />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: 'PRR' }));

    const table = screen.getByRole('table');
    expect(within(table).getByText('BJAG002')).toBeInTheDocument();
    expect(within(table).queryByText('BJAG001')).not.toBeInTheDocument();
    expect(screen.getByText(/اجزای مالی تفکیک‌نشده/)).toBeInTheDocument();
  });

  it('renders translated report headings in English', async () => {
    mockLocale('en');
    render(<AgencySalesPage />);
    expect(await screen.findByText('Sales Report Details')).toBeInTheDocument();
  });

  it('downloads the real sales CSV from the existing export endpoint', async () => {
    const exportSpy = vi.spyOn(portalApi, 'downloadSalesExport').mockResolvedValue(
      new Blob(['PNR,Flight'], { type: 'text/csv' }),
    );
    render(<AgencySalesPage />);
    await screen.findByText('جزئیات گزارش فروش');

    await userEvent.click(screen.getByTestId('sales-export'));
    expect(exportSpy).toHaveBeenCalledOnce();
  });
});
