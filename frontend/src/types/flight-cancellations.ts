export interface CancelledFlightBooking {
  id: string;
  pnr: string;
  status: 'PAID' | 'TICKETED' | 'REFUNDED';
  priceIrr: string;
  contactPhone: string | null;
  passengerNames: string[];
}

export interface CancelledFlightRow {
  id: string;
  flightNo: string;
  originCode: string;
  destCode: string;
  departureAt: string;
  cancelledAt: string | null;
  cancellationReason: string | null;
  cancelledBy: { id: string; fullName: string } | null;
  refundSummary: { total: number; pending: number; refunded: number };
  bookings: CancelledFlightBooking[];
}
