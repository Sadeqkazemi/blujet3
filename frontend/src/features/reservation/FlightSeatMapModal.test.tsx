import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import FlightSeatMapModal from './FlightSeatMapModal';
import * as reservationApi from '../../api/reservation';
import type { SeatMap } from '../../types/reservation';

const MAP: SeatMap = {
  flightInstanceId: 'fi1',
  aircraftType: 'MD-80',
  flightNo: 'EP-821',
  originCode: 'THR',
  destCode: 'DXB',
  originCityFa: 'تهران',
  destCityFa: 'دبی',
  departureAt: '2026-08-01T05:00:00.000Z',
  capacity: 4,
  soldCount: 1,
  lockedCount: 0,
  freeCount: 3,
  occupancyPct: 25,
  cabinLayout: { BUSINESS: { aisleAfterIndex: 2 }, ECONOMY: { aisleAfterIndex: 2 } },
  rows: [
    {
      row: 3,
      cabin: 'BUSINESS',
      seats: [
        {
          seatCode: '3A',
          status: 'SOLD',
          lockId: null,
          lockExpiresAt: null,
          passenger: {
            fullName: 'لیلا صادقی',
            pnr: 'BJTEST1',
            bookingStatus: 'TICKETED',
            nationalId: '1000000749',
            priceIrr: '380000000',
          },
        },
        {
          seatCode: '3B',
          status: 'FREE',
          lockId: null,
          lockExpiresAt: null,
          passenger: null,
        },
      ],
    },
  ],
};

describe('FlightSeatMapModal', () => {
  it('loads the seat map and shows passenger details when a sold seat is clicked', async () => {
    vi.spyOn(reservationApi, 'fetchSeatMap').mockResolvedValue(MAP);
    const onClose = vi.fn();
    render(
      <FlightSeatMapModal
        flightInstanceId="fi1"
        onClose={onClose}
        lockDisabledNote="مدیر فناوری اطلاعات امکان قفل دستی صندلی را ندارد."
      />,
    );

    expect(await screen.findByText(/نقشه صندلی‌ها/)).toBeInTheDocument();
    expect(await screen.findByTestId('reservation-md80-seat-map')).toBeInTheDocument();
    expect(screen.getByText(/تهران/)).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '3A' }));

    expect(await screen.findByText('لیلا صادقی')).toBeInTheDocument();
    expect(screen.getByText('BJTEST1')).toBeInTheDocument();
    expect(screen.getByText('1000000749')).toBeInTheDocument();
    expect(screen.getAllByText(/امکان قفل دستی صندلی را ندارد/).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /لاک/ })).not.toBeInTheDocument();
  });

  it('does not offer a lock action on a free seat for IT view-only mode', async () => {
    vi.spyOn(reservationApi, 'fetchSeatMap').mockResolvedValue(MAP);
    render(
      <FlightSeatMapModal
        flightInstanceId="fi1"
        onClose={vi.fn()}
        lockDisabledNote="مدیر فناوری اطلاعات امکان قفل دستی صندلی را ندارد."
      />,
    );

    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '3B' }));

    expect(await screen.findByText(/این صندلی هنوز فروخته نشده است/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /لاک صندلی/ })).not.toBeInTheDocument();
  });

  it('highlights seats matching the passenger/seat search', async () => {
    vi.spyOn(reservationApi, 'fetchSeatMap').mockResolvedValue(MAP);
    render(<FlightSeatMapModal flightInstanceId="fi1" onClose={vi.fn()} />);

    const user = userEvent.setup();
    await screen.findByRole('button', { name: '3A' });
    await user.type(
      screen.getByPlaceholderText('مثلاً «رضایی» یا «12A»'),
      'لیلا',
    );
    await user.click(screen.getByRole('button', { name: 'جستجوی صندلی' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '3A' })).toHaveClass('ring-2');
    });
  });
});
