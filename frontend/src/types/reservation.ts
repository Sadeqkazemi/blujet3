export type SeatStatus = 'FREE' | 'HELD' | 'SOLD' | 'LOCKED' | 'BLOCKED';

/** Rich sold-seat passenger info surfaced in the IT reservation seat map. */
export interface SeatPassengerInfo {
  fullName: string;
  pnr: string;
  bookingStatus: BookingStatus;
  nationalId: string | null;
  priceIrr: string;
}

/** Lighter sold-seat occupant shape used by the CEO/Board «هواپیما» modal. */
export interface SeatOccupant {
  pnr: string;
  passengerName: string;
  bookingStatus: BookingStatus;
}

export interface SeatCell {
  seatCode: string;
  status: SeatStatus;
  lockId: string | null;
  passenger?: SeatPassengerInfo | null;
  occupant?: SeatOccupant | null;
  lockExpiresAt?: string | null;
  holdExpiresAt?: string | null;
  lockClassification?: 'PAYABLE' | 'FREE' | 'DISCOUNTED' | null;
  lockApprovalStatus?: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | null;
  lockPassengerName?: string | null;
  lockAgencyId?: string | null;
  lockAgencyName?: string | null;
}

export interface SeatRow {
  row: number;
  cabin: 'BUSINESS' | 'COMFORT' | 'ECONOMY';
  seats: SeatCell[];
}

export interface SeatMap {
  flightInstanceId: string;
  aircraftType: string;
  flightNo: string;
  originCode?: string;
  destCode?: string;
  originCityFa?: string;
  destCityFa?: string;
  departureAt: string;
  rows: SeatRow[];
  cabinLayout: Partial<Record<'BUSINESS' | 'COMFORT' | 'ECONOMY', { aisleAfterIndex: number }>>;
  capacity: number;
  soldCount: number;
  heldCount?: number;
  managerLockedCount?: number;
  blockedCount?: number;
  lockedCount: number;
  freeCount: number;
  occupancyPct: number;
}

export interface SeatLockView {
  id: string;
  flightInstanceId: string;
  seatCode: string;
  lockedById: string;
  passengerName: string | null;
  releasedById: string | null;
  releasedAt: string | null;
  createdAt: string;
  approvalStatus?: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';
  approvedById?: string | null;
  approvedAt?: string | null;
  expiresAt?: string;
  classification?: 'PAYABLE' | 'FREE' | 'DISCOUNTED';
}

export type BookingStatus =
  | 'DRAFT'
  | 'HELD'
  | 'PAID'
  | 'TICKETED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'REFUNDED'
  | 'FLOWN'
  | 'NO_SHOW';

export interface PnrGroup {
  flightInstanceId: string;
  flightNo: string;
  route: string;
  departureAt: string;
  rows: { pnr: string; passenger: string; channel: string; status: BookingStatus }[];
}

export interface PnrDetail {
  pnr: string;
  status: BookingStatus;
  channel: string;
  // Decimal STRING on the wire (BigInt.prototype.toJSON on the backend).
  priceIrr: string;
  flightNo: string;
  originCode: string;
  destCode: string;
  departureAt: string;
  arrivalAt: string;
  flightInstanceId: string;
  passenger: { fullName: string; seatCode: string | null } | null;
}

export interface FlightSearchResult {
  flightInstanceId: string;
  flightNo: string;
  aircraftType: string;
  originCode: string;
  destCode: string;
  departureAt: string;
  arrivalAt: string;
  priceIrr: string;
  seatsLeft: number;
}

export interface ReservationChannelShare {
  key: string;
  label: string;
  color: string;
  count: number;
  pct: number;
}

export interface ReservationServiceHealth {
  name: string;
  fa: string;
  ok: boolean;
  latencyMs: number | null;
  statusLabel: string;
}

export interface ReservationDashboardStats {
  todayBookings: number;
  activePnrs: number;
  seatsSold: number;
  revenueIrr: string;
  channels: ReservationChannelShare[];
  services: ReservationServiceHealth[];
  servicesStable: boolean;
}

export interface AgencyApiAccessRow {
  id: string;
  agencyId: string;
  name: string;
  initials: string;
  keyHint: string;
  callCount: number;
  lastUsedAt: string | null;
  status: 'ACTIVE' | 'SUSPENDED' | 'REVOKED';
}

export type ReservationFlightStatusKey = 'SELLING' | 'NEAR_FULL' | 'FULL';

/**
 * Superset of the two reservation flight-row shapes the panels consume:
 *  - IT «پروازها» table: route / sold / occupancyPct / statusKey.
 *  - CEO «هواپیما» flights tab: origin/dest city + soldCount/lockedCount/freeCount.
 * A given API response only fills one set, so the other is optional.
 */
export interface ReservationFlightRow {
  flightInstanceId: string;
  flightNo: string;
  aircraftType: string;
  departureAt: string;
  capacity: number;
  // IT reservation flights table
  route?: string;
  sold?: number;
  occupancyPct?: number;
  statusKey?: ReservationFlightStatusKey;
  // CEO/Board «هواپیما» flights tab
  originCode?: string;
  destCode?: string;
  originCityFa?: string;
  destCityFa?: string;
  soldCount?: number;
  lockedCount?: number;
  freeCount?: number;
  basePriceIrr?: string | null;
}
