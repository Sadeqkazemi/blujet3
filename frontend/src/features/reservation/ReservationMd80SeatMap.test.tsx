import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ReservationMd80SeatMap from './ReservationMd80SeatMap';
import type { SeatCell } from '../../types/reservation';
import { MD80_TOTAL_SEATS } from '../public-site/checkout/md80-seat-layout';

function cell(code: string, status: SeatCell['status'] = 'FREE'): SeatCell {
  return { seatCode: code, status, lockId: null, occupant: null };
}

describe('ReservationMd80SeatMap', () => {
  it('renders PDF fuselage chart with sections, aisle row numbers, and MD-80 lettering', () => {
    const seats = new Map<string, SeatCell>([
      ['3A', cell('3A')],
      ['3F', cell('3F')],
      ['7D', cell('7D')],
      ['12A', cell('12A')],
    ]);
    render(
      <ReservationMd80SeatMap
        seatsByCode={seats}
        selectedSeatCode={null}
        canLock
        onSeatClick={vi.fn()}
      />,
    );

    expect(screen.getByTestId('reservation-md80-seat-map')).toHaveAttribute(
      'data-aircraft',
      'MD-80',
    );
    expect(screen.getByTestId('reservation-section-first')).toHaveTextContent(/کلاس یک/);
    expect(screen.getByTestId('reservation-section-business')).toHaveTextContent(
      /کابین اصلی با فضای پا بیشتر/,
    );
    expect(screen.getByTestId('reservation-section-economy')).toHaveTextContent(/کلاس اقتصادی/);
    expect(screen.getByText('جلو هواپیما · MD-80')).toBeInTheDocument();
    expect(screen.getByText('عقب هواپیما · MD-80')).toBeInTheDocument();
    expect(screen.getAllByText('کمد').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('سرویس').length).toBeGreaterThanOrEqual(1);

    // First class: A B | E F — gap after left pair; economy has D not C
    expect(screen.getByTestId('aisle-gap-3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '3A' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '3F' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '3C' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '7D' })).toBeInTheDocument();
  });

  it('fires onSeatClick for a sold seat and keeps capacity layout at 140 slots', async () => {
    const sold: SeatCell = {
      seatCode: '3A',
      status: 'SOLD',
      lockId: null,
      occupant: { pnr: 'BJ1', passengerName: 'علی', bookingStatus: 'TICKETED' },
    };
    const seats = new Map<string, SeatCell>([['3A', sold]]);
    const onSeatClick = vi.fn();
    render(
      <ReservationMd80SeatMap
        seatsByCode={seats}
        selectedSeatCode={null}
        canLock
        onSeatClick={onSeatClick}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: '3A' }));
    expect(onSeatClick).toHaveBeenCalledWith(sold);

    // Full chart is painted from the PDF layout (not only API-returned seats)
    expect(screen.getAllByRole('button').length).toBeGreaterThanOrEqual(MD80_TOTAL_SEATS);
  });

  it('omits rear exit/galley seats 28A/B', () => {
    render(
      <ReservationMd80SeatMap
        seatsByCode={new Map()}
        selectedSeatCode={null}
        canLock
        onSeatClick={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: '28A' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '28B' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '28D' })).toBeInTheDocument();
  });
});
