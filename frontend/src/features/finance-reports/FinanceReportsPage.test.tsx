import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import FinanceReportsPage from './FinanceReportsPage';
import * as api from '../../api/finance-manager';
import type { FinanceReportFilters } from '../../api/finance-manager';
import type { FinanceFlightDetail } from '../../types/finance-manager';

describe('FinanceReportsPage', () => {
  it('renders real partner rows and refetches when switching to charters', async () => {
    const report = vi.spyOn(api, 'fetchFinanceReport').mockResolvedValue({
      kind: 'partners',
      scope: 'AGENCIES',
      period: 'month',
      rows: [
        {
          id: 'a1',
          name: 'آژانس سپهر',
          totalIrr: '3100000000',
          paidIrr: '2800000000',
          outstandingIrr: '300000000',
          soldSeats: 12,
        },
      ],
      summary: { totalIrr: '3100000000', paidIrr: '2800000000' },
    });

    render(<FinanceReportsPage />);
    expect(await screen.findByText('آژانس سپهر')).toBeInTheDocument();
    expect(screen.getByText('۳۰٬۰۰۰٬۰۰۰ تومان')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'چارترها' }));
    await waitFor(() =>
      expect(report).toHaveBeenLastCalledWith(
        expect.objectContaining({ scope: 'CHARTERS' }),
      ),
    );
  });

  it('does not eagerly load flights and shows the empty state after a bounded search', async () => {
    vi.spyOn(api, 'fetchFinanceReport').mockResolvedValue({
      kind: 'partners',
      scope: 'AGENCIES',
      period: 'month',
      rows: [],
      summary: { totalIrr: '0', paidIrr: '0' },
    });
    const search = vi.spyOn(api, 'searchFinanceFlights').mockResolvedValue({ rows: [] });
    render(<FinanceReportsPage />);
    await userEvent.click(screen.getByRole('button', { name: 'جستجوی پرواز' }));
    expect(search).not.toHaveBeenCalled();
    await userEvent.type(screen.getByPlaceholderText('حداقل ۲ حرف از شماره پرواز یا مسیر…'), 'KL');
    await userEvent.click(screen.getByRole('button', { name: 'جستجو' }));
    expect(await screen.findByText('پرواز منطبق پیدا نشد.')).toBeInTheDocument();
    expect(search).toHaveBeenCalledWith(expect.objectContaining({ q: 'KL', limit: 18 }));
  });

  it('shows customer report seat split columns from real flight rows', async () => {
    vi.spyOn(api, 'fetchFinanceReport').mockImplementation(
      async (filters: FinanceReportFilters) => {
        if (filters.scope === 'CUSTOMERS') {
          return {
            kind: 'customers' as const,
            scope: 'CUSTOMERS' as const,
            period: filters.period ?? 'month',
            rows: [
              {
                flightInstanceId: 'fi1',
                flightNo: 'BJ-100',
                departureAt: '2026-07-01T05:00:00.000Z',
                originCode: 'THR',
                destCode: 'MHD',
                originCityFa: 'تهران',
                destCityFa: 'مشهد',
                capacity: 180,
                soldSeats: 100,
                unsoldSeats: 80,
                totalIrr: '5000000000',
                agencyCount: 2,
                agencySeats: 40,
              },
            ],
            summary: { totalIrr: '5000000000', soldSeats: 100 },
          };
        }
        return {
          kind: 'partners' as const,
          scope: filters.scope,
          period: 'month' as const,
          rows: [],
          summary: { totalIrr: '0', paidIrr: '0' },
        };
      },
    );

    render(<FinanceReportsPage />);
    await userEvent.click(screen.getByRole('button', { name: 'مشتریان' }));
    expect(await screen.findByText('BJ-100')).toBeInTheDocument();
    expect(screen.getByText('عادی')).toBeInTheDocument();
    expect(screen.getByText('آژانس')).toBeInTheDocument();
    expect(screen.getByText('فروخته‌نشده')).toBeInTheDocument();
  });

  it('offers server-generated PDF alongside Excel and CSV', async () => {
    vi.spyOn(api, 'fetchFinanceReport').mockResolvedValue({
      kind: 'partners',
      scope: 'AGENCIES',
      period: 'month',
      rows: [],
      summary: { totalIrr: '0', paidIrr: '0' },
    });
    vi.spyOn(api, 'downloadFinanceReport').mockResolvedValue(new Blob(['pdf']));

    render(<FinanceReportsPage />);
    expect(await screen.findByRole('button', { name: 'خروجی PDF' })).toBeInTheDocument();
  });

  it('renders server-side detailed sales rows with cabin and fare class', async () => {
    vi.spyOn(api, 'fetchFinanceReport').mockResolvedValue({
      kind: 'partners', scope: 'AGENCIES', period: 'month', rows: [],
      summary: { totalIrr: '0', paidIrr: '0' },
    });
    vi.spyOn(api, 'fetchFinanceSales').mockResolvedValue({
      rows: [{
        bookingId: 'b1', pnr: 'BJTEST', bookedAt: '2026-08-01T00:00:00.000Z',
        bookingStatus: 'TICKETED', paymentStatus: 'PAID', channel: 'SYSTEM',
        flightInstanceId: 'fi1', flightNo: 'XY123', originCode: 'THR', destCode: 'MHD',
        departureAt: '2026-08-02T08:00:00.000Z', arrivalAt: '2026-08-02T09:00:00.000Z',
        cabin: 'ECONOMY', fareClassCode: 'Y', passengerCount: 1,
        baseFareIrr: '1000000', taxIrr: '100000', extrasIrr: '0', totalIrr: '1100000',
        agencyId: null, agencyName: null,
      }],
      summary: { orderCount: 1, passengerCount: 1, grossIrr: '1100000', netRevenueIrr: '1100000', averageOrderIrr: '1100000' },
    });

    render(<FinanceReportsPage />);
    await userEvent.click(screen.getByRole('button', { name: 'گزارش تفصیلی' }));
    expect(await screen.findByText('BJTEST')).toBeInTheDocument();
    expect(screen.getByText('ECONOMY/Y')).toBeInTheDocument();
  });

  it('shows exactly ten report rows per page and navigates to the remainder', async () => {
    vi.spyOn(api, 'fetchFinanceReport').mockResolvedValue({
      kind: 'partners',
      scope: 'AGENCIES',
      period: 'month',
      rows: Array.from({ length: 12 }, (_, index) => ({
        id: `agency-${index + 1}`,
        name: `آژانس صفحه ${index + 1}`,
        totalIrr: '1000',
        paidIrr: '1000',
        outstandingIrr: '0',
        soldSeats: 1,
      })),
      summary: { totalIrr: '12000', paidIrr: '12000' },
    });

    render(<FinanceReportsPage />);
    expect(await screen.findByText('آژانس صفحه 10')).toBeInTheDocument();
    expect(screen.queryByText('آژانس صفحه 11')).not.toBeInTheDocument();
    expect(screen.getByText('نمایش ۱ تا ۱۰ از ۱۲ رکورد')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'صفحه بعد' }));
    expect(await screen.findByText('آژانس صفحه 11')).toBeInTheDocument();
    expect(screen.queryByText('آژانس صفحه 1')).not.toBeInTheDocument();
  });

  it('opens real selected-flight customer bookings from the details button', async () => {
    vi.spyOn(api, 'fetchFinanceReport').mockImplementation(async (filters) => ({
      kind: 'customers',
      scope: 'CUSTOMERS',
      period: filters.period,
      rows: [{
        flightInstanceId: 'fi-detail', flightNo: 'XY951',
        departureAt: '2026-08-27T08:00:00.000Z', originCode: 'TBZ', destCode: 'FRA',
        originCityFa: 'تبریز', destCityFa: 'فرانکفورت', capacity: 196,
        soldSeats: 2, unsoldSeats: 194, totalIrr: '25000000', agencyCount: 0, agencySeats: 0,
      }],
      summary: { totalIrr: '25000000', soldSeats: 2 },
    }));
    vi.spyOn(api, 'fetchFinanceFlightDetail').mockResolvedValue({
      summary: {
        flightInstanceId: 'fi-detail', flightNo: 'XY951',
        departureAt: '2026-08-27T08:00:00.000Z', originCode: 'TBZ', destCode: 'FRA',
        originCityFa: 'تبریز', destCityFa: 'فرانکفورت', capacity: 196,
        soldSeats: 2, unsoldSeats: 194, totalIrr: '25000000', agencyCount: 0, agencySeats: 0,
      },
      agencies: [],
      bookings: [{
        bookingId: 'booking-1', pnr: 'PNR951', bookedAt: '2026-08-20T10:00:00.000Z',
        bookingStatus: 'TICKETED', paymentStatus: 'PAID', channel: 'SYSTEM',
        flightInstanceId: 'fi-detail', flightNo: 'XY951', originCode: 'TBZ', destCode: 'FRA',
        departureAt: '2026-08-27T08:00:00.000Z', arrivalAt: '2026-08-27T13:00:00.000Z',
        cabin: 'BUSINESS', fareClassCode: 'C', passengerCount: 2,
        baseFareIrr: '22000000', taxIrr: '3000000', extrasIrr: '0', totalIrr: '25000000',
        agencyId: null, agencyName: null,
      }],
    } as unknown as FinanceFlightDetail);

    render(<FinanceReportsPage />);
    await userEvent.click(screen.getByRole('button', { name: 'مشتریان' }));
    await userEvent.click(await screen.findByRole('button', { name: 'جزئیات' }));

    expect(await screen.findByRole('dialog', { name: /جزئیات فروش پرواز XY951/ })).toBeInTheDocument();
    expect(screen.getByText('PNR951')).toBeInTheDocument();
    expect(screen.getByText('BUSINESS/C')).toBeInTheDocument();
    expect(api.fetchFinanceFlightDetail).toHaveBeenCalledWith('fi-detail');
  });
});
