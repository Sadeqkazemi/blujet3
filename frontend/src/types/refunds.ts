export type RefundStatus = 'SUBMITTED' | 'REVIEW' | 'FINANCE' | 'PAID';

export interface RefundListRow {
  id: string;
  bookingId: string;
  passengerName: string;
  // Money fields are decimal STRINGs on the wire (BigInt.prototype.toJSON
  // on the backend — a JS number can't safely hold IRR amounts above 2^53).
  totalPaidIrr: string;
  penaltyPct: number;
  penaltyAmountIrr: string;
  refundableIrr: string;
  status: RefundStatus;
  assigneeId: string | null;
  assignee: { id: string; fullName: string; role: string } | null;
  paidAt: string | null;
  history: { step: string; labelFa: string; at: string }[];
  createdAt: string;
  booking: {
    id: string;
    pnr: string;
    flightInstance: {
      departureAt: string;
      flight: { flightNo: string; route: { originCode: string; destCode: string } };
    };
  };
}

export interface RefundsResult {
  requests: RefundListRow[];
  kpis: { payoutQueue: number; paid: number; awaitingAdmin: number };
}

export interface RefundDetail extends RefundListRow {
  nationalId: string | null;
  mobile: string | null;
  iban: string;
  processedBy: { id: string; fullName: string; role: string } | null;
}
