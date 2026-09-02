import { apiGet, apiPatch, apiPost } from './http';
import type {
  AgencyApiAccessRow,
  FlightSearchResult,
  PnrDetail,
  PnrGroup,
  ReservationDashboardStats,
  ReservationFlightRow,
  SeatLockView,
  SeatMap,
} from '../types/reservation';

export function fetchSeatMap(flightInstanceId: string) {
  return apiGet<SeatMap>(`/reservation/seatmap/${flightInstanceId}`);
}

export function fetchSeatLockAgencies() {
  return apiGet<{ id: string; name: string; licenseNo: string }[]>(
    '/reservation/seatmap/agencies/active',
  );
}

export function lockSeat(
  flightInstanceId: string,
  dto: {
    seatCode: string;
    reason: string;
    classification: 'FREE' | 'DISCOUNTED' | 'PAYABLE';
    discountPct?: number;
    agencyId?: string;
    passengerName?: string;
    passengerNationalId?: string;
    passengerMobile?: string;
    companyBlock?: boolean;
  },
) {
  return apiPost<SeatLockView>(`/reservation/seatmap/${flightInstanceId}/lock`, dto);
}

export function releaseLock(lockId: string) {
  return apiPatch<SeatLockView>(`/reservation/seatmap/locks/${lockId}/release`);
}

export function approveSeatLock(lockId: string) {
  return apiPatch<SeatLockView>(`/reservation/seatmap/locks/${lockId}/approve`);
}

export function rejectSeatLock(lockId: string, rejectionReason: string) {
  return apiPatch<SeatLockView>(`/reservation/seatmap/locks/${lockId}/reject`, {
    rejectionReason,
  });
}

export function fetchPnrList(q?: string, status?: string) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (status) params.set('status', status);
  const qs = params.toString();
  return apiGet<PnrGroup[]>(`/reservation/pnr${qs ? `?${qs}` : ''}`);
}

export function fetchPnrDetail(pnr: string) {
  return apiGet<PnrDetail>(`/reservation/pnr/${pnr}`);
}

export function changeSeat(pnr: string, seatCode: string) {
  return apiPatch<PnrDetail>(`/reservation/pnr/${pnr}/seat`, { seatCode });
}

export function cancelBooking(pnr: string) {
  return apiPatch<PnrDetail>(`/reservation/pnr/${pnr}/cancel`);
}

export function markNoShow(pnr: string) {
  return apiPatch<PnrDetail>(`/reservation/pnr/${pnr}/no-show`);
}

export function fetchReservationFlights(q?: string) {
  const qs = q ? `?q=${encodeURIComponent(q)}` : '';
  return apiGet<ReservationFlightRow[]>(`/reservation/flights${qs}`);
}

export function searchFlights(origin: string, dest: string, date: string) {
  const params = new URLSearchParams({ origin, dest, date });
  return apiGet<FlightSearchResult[]>(`/reservation/search?${params.toString()}`);
}

export function issuePnr(dto: {
  flightInstanceId: string;
  seatCode: string;
  passengerName: string;
  passengerNationalId?: string;
  passengerMobile?: string;
}) {
  return apiPost<PnrDetail>('/reservation/pnr', dto);
}

export function fetchReservationDashboardStats() {
  return apiGet<ReservationDashboardStats>('/reservation/dashboard-stats');
}

export function fetchAgencyApiAccess() {
  return apiGet<AgencyApiAccessRow[]>('/reservation/agency-api-access');
}
