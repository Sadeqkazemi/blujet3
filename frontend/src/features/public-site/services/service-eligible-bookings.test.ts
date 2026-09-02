import { describe, expect, it } from 'vitest';
import type { BookingDetail } from '../../../types/public-site';
import {
  filterServiceEligibleBookings,
  isServiceEligibleBooking,
} from './service-eligible-bookings';

function booking(partial: Partial<BookingDetail>): BookingDetail {
  return {
    id: 'b1',
    pnr: 'ABC123',
    status: 'TICKETED',
    cabin: 'ECONOMY',
    priceIrr: '1000000',
    holdExpiresAt: null,
    flightInstanceId: 'fi-1',
    flightNo: 'BJ101',
    originCode: 'THR',
    destCode: 'MHD',
    departureAt: '2099-01-01T10:00:00.000Z',
    arrivalAt: '2099-01-01T12:00:00.000Z',
    isPriceLocked: false,
    passengers: [],
    ...partial,
  };
}

describe('service-eligible-bookings', () => {
  const now = new Date('2026-08-20T12:00:00.000Z');

  it('accepts future ticketed flights', () => {
    expect(isServiceEligibleBooking(booking({}), now)).toBe(true);
  });

  it('rejects past departures and expired holds', () => {
    expect(
      isServiceEligibleBooking(
        booking({ departureAt: '2020-01-01T10:00:00.000Z' }),
        now,
      ),
    ).toBe(false);
    expect(
      isServiceEligibleBooking(
        booking({
          status: 'HELD',
          holdExpiresAt: '2026-08-20T11:00:00.000Z',
        }),
        now,
      ),
    ).toBe(false);
  });

  it('filters and sorts upcoming bookings', () => {
    const list = filterServiceEligibleBookings(
      [
        booking({
          id: 'later',
          departureAt: '2099-06-01T10:00:00.000Z',
        }),
        booking({
          id: 'sooner',
          departureAt: '2099-02-01T10:00:00.000Z',
        }),
        booking({ id: 'past', departureAt: '2020-01-01T10:00:00.000Z' }),
      ],
      now,
    );
    expect(list.map((b) => b.id)).toEqual(['sooner', 'later']);
  });
});
