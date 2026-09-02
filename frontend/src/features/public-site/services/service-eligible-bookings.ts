import type { BookingDetail } from '../../../types/public-site';

const ELIGIBLE_STATUSES = new Set(['HELD', 'PAID', 'TICKETED']);

/** Upcoming bookings that can receive seat/baggage service requests. */
export function isServiceEligibleBooking(
  booking: BookingDetail,
  now = new Date(),
): boolean {
  if (!ELIGIBLE_STATUSES.has(booking.status)) return false;
  if (
    booking.status === 'HELD' &&
    booking.holdExpiresAt &&
    new Date(booking.holdExpiresAt) <= now
  ) {
    return false;
  }
  return new Date(booking.departureAt) > now;
}

export function filterServiceEligibleBookings(
  bookings: BookingDetail[],
  now = new Date(),
): BookingDetail[] {
  return bookings
    .filter((b) => isServiceEligibleBooking(b, now))
    .sort(
      (a, b) =>
        new Date(a.departureAt).getTime() - new Date(b.departureAt).getTime(),
    );
}
