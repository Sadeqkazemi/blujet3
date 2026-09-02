import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../api/flight-cancellations';
import * as auth from '../../hooks/useAuth';
import FlightCancellationsPage from './FlightCancellationsPage';

describe('FlightCancellationsPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(auth, 'useAuth').mockReturnValue({
      user: {
        id: 'finance-1',
        fullName: 'مدیر مالی',
        role: 'FINANCE_MANAGER',
        preferredLocale: 'FA',
        mustChangePassword: false,
      },
    } as ReturnType<typeof auth.useAuth>);
    vi.spyOn(api, 'fetchFlightCancellations').mockResolvedValue([{
      id: 'fi-1',
      flightNo: 'XY1234',
      originCode: 'THR',
      destCode: 'MHD',
      departureAt: '2026-08-30T08:00:00.000Z',
      cancelledAt: '2026-08-25T08:00:00.000Z',
      cancellationReason: 'محدودیت عملیاتی',
      cancelledBy: { id: 'commercial-1', fullName: 'مدیر بازرگانی' },
      refundSummary: { total: 1, pending: 1, refunded: 0 },
      bookings: [{
        id: 'booking-1',
        pnr: 'ABC123',
        status: 'TICKETED',
        priceIrr: '38000000',
        contactPhone: '09120000000',
        passengerNames: ['سارا کاظمی'],
      }],
    }]);
  });

  it('shows the cancelled passengers to finance and refunds one booking', async () => {
    const refund = vi.spyOn(api, 'refundCancelledBooking').mockResolvedValue({
      bookingId: 'booking-1',
      pnr: 'ABC123',
      status: 'REFUNDED',
      refundedIrr: '38000000',
    });
    render(<FlightCancellationsPage />);

    expect(await screen.findByText('سارا کاظمی')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'بازگشت وجه' }));
    await waitFor(() => expect(refund).toHaveBeenCalledWith('fi-1', 'booking-1'));
  });
});
