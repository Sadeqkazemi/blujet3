import { apiGet, apiPost } from './http';
import type { CancelledFlightRow } from '../types/flight-cancellations';

export function fetchFlightCancellations() {
  return apiGet<CancelledFlightRow[]>('/flights/cancellations');
}

export function cancelFlight(instanceId: string, reason: string) {
  return apiPost<{
    flightInstanceId: string;
    status: 'CANCELLED';
    affectedBookings: number;
  }>(`/flights/${instanceId}/cancel`, { reason });
}

export function refundCancelledBooking(instanceId: string, bookingId: string) {
  return apiPost<{
    bookingId: string;
    pnr: string;
    status: 'REFUNDED';
    refundedIrr: string;
  }>(`/flights/${instanceId}/cancellations/${bookingId}/refund`, {});
}
