// Money fields are decimal STRINGs on the wire (BigInt.prototype.toJSON on
// the backend — a JS number can't safely hold IRR amounts above 2^53).
export interface AgencyCredit {
  limitIrr: string;
  usedIrr: string;
  remainingIrr: string;
}

export interface AgencyDashboard {
  credit: AgencyCredit;
  kpis: {
    salesThisMonthIrr: string;
    ticketsIssuedTotal: number;
    seatsSoldThisMonth: number;
  };
  monthlySales: { month: string; salesIrr: string }[];
}

export interface AgencyLedgerEntry {
  id: string;
  type: "SALE" | "REFUND" | "SETTLEMENT" | "COMMISSION" | "COMMITMENT";
  signedAmountIrr: string;
  occurredAt: string;
}

export type AgencyFinancialEventType = AgencyLedgerEntry['type']
  | 'INVOICE_ISSUED'
  | 'INVOICE_PAID'
  | 'CREDIT_REQUESTED'
  | 'CREDIT_APPROVED'
  | 'CREDIT_REJECTED';

export interface AgencyFinancialEvent {
  id: string;
  type: AgencyFinancialEventType;
  amountIrr: string | null;
  direction: 'DEBIT' | 'CREDIT' | 'INFO';
  reference: string | null;
  status: string | null;
  occurredAt: string;
}

export type AgencyInvoiceStatus = "UNPAID" | "PAID" | "OVERDUE";

export interface AgencyInvoice {
  id: string;
  invoiceNo: string;
  issuedAt: string;
  dueAt: string;
  amountIrr: string;
  descriptionFa?: string | null;
  status: AgencyInvoiceStatus;
  paidAt: string | null;
}

export type AgencyCreditRequestStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface AgencyCreditRequest {
  id: string;
  requestedLimitIrr: string;
  note: string | null;
  status: AgencyCreditRequestStatus;
  decidedAt: string | null;
  createdAt: string;
}

export interface AgencySalesTicket {
  passengerId?: string;
  ticketNo?: string | null;
  ticketIssuedAt?: string | null;
  pnr: string;
  status: string;
  cabin?: string;
  fareClassCode?: string | null;
  flightNo: string;
  route: string;
  departureAt: string;
  priceIrr: string;
  passengerCount: number;
}

export interface AgencySalesPerFlight {
  flightNo: string;
  route: string;
  ticketsCount: number;
  salesIrr: string;
}

export interface AgencySalesReport {
  tickets: AgencySalesTicket[];
  perFlight: AgencySalesPerFlight[];
  summary: {
    totalSalesIrr: string;
    ticketsIssued: number;
    avgFareIrr: string;
    refundRatePct: number;
  };
}

export interface AgencyMessage {
  id: string;
  senderId: string;
  senderIsAgency: boolean;
  body: string;
  attachments?: {
    id: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
  }[];
  createdAt: string;
}

export interface AgencyProfile {
  fullName: string;
  // Null for an identity-only account with no submitted business profile
  // (e.g. the UAT sandbox agency) — never a fabricated placeholder value.
  managerName: string | null;
  licenseNo: string | null;
  phone: string;
  email: string | null;
  city: string | null;
  address: string | null;
  tier: "NORMAL" | "SILVER" | "GOLD" | null;
  isActive: boolean;
  suspendedAt: string | null;
  suspendReason: string | null;
  joinedAt: string;
  /** True only for the UAT sandbox temporary agency account — the portal
   * is browsable but every mutating endpoint refuses with 403. */
  isTemporaryReadOnly: boolean;
}

export type AgencyDocumentType = "LICENSE" | "CONTRACT" | "OTHER";
export type AgencyDocumentStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface AgencyAllotmentRow {
  id: string;
  flightInstanceId: string;
  flightNo: string;
  route: string;
  departureAt: string;
  aircraftType: string;
  cabin: "ECONOMY" | "COMFORT" | "BUSINESS" | "FIRST" | null;
  fareClassCode: string | null;
  seatsAllocated: number;
  seatsUsed: number;
  type: "SOFT" | "HARD";
  releaseAt: string | null;
  contractPriceIrr: string | null;
  active: boolean;
}

export interface AgencySeatRequestOption {
  flightInstanceId: string;
  flightNo: string;
  originCode: string;
  destCode: string;
  departureAt: string;
  aircraftType: string;
  cabin: "ECONOMY" | "COMFORT" | "BUSINESS" | "FIRST";
  fareClassCode: string;
  capacity: number;
  agencySeatsReleased: number;
  agencyAllocated: number;
  ownAllocated: number;
  availableToRequest: number;
  sellableSeats?: number;
  pricePerSeatIrr: string | null;
  specialOffer: boolean;
  definitionStatus: "DRAFT" | "PENDING_REVISION" | "PUBLISHED" | "REJECTED";
}

export type AgencySeatInquiryDemandLevel = "LOW" | "MEDIUM" | "HIGH";

export interface AgencySeatInquiry {
  flightInstanceId: string;
  cabin: "ECONOMY" | "COMFORT" | "BUSINESS" | "FIRST";
  fareClassCode: string;
  requestedSeats: number;
  suggestedSeats: number;
  canFulfillRequested: boolean;
  capacity: number;
  soldSeats: number;
  heldSeats: number;
  agencyAllocated: number;
  agencySoldSeats: number;
  reservedAgencySeats: number;
  availableSeats: number;
  availableToRequest: number;
  totalAgencies: number;
  agenciesWithDemand: number;
  historicalAgencyBookings: number;
  historicalAgencySeatsSold: number;
  season: string;
  occasion: string | null;
  demandLevel: AgencySeatInquiryDemandLevel;
  recommendation: string;
  pricePerSeatIrr: string | null;
  totalPriceIrr: string;
}

export interface AgencySeatRequestResult {
  id: string;
  status: "SUBMITTED";
  recipientCount: number;
  flightInstanceId: string;
  cabin: "ECONOMY" | "COMFORT" | "BUSINESS" | "FIRST";
  fareClassCode: string;
  seats: number;
  selectedFlightInstanceIds?: string[];
  preferredWeekdays?: number[];
  termMonths?: 0 | 1 | 3 | 6 | 12;
  payMethod?: "INVOICE" | "CREDIT";
}

export interface AgencySeatRequestHistoryRow {
  id: string;
  status: "PENDING" | "PENDING_FINANCE" | "APPROVED" | "REJECTED";
  route: string | null;
  aircraftType: string;
  cabin: "ECONOMY" | "COMFORT" | "BUSINESS" | "FIRST" | null;
  fareClassCode: string | null;
  seats: number;
  termMonths: number | null;
  unitPriceIrr: string;
  totalPriceIrr: string;
  payMethod: "INVOICE" | "CREDIT";
  invoice: {
    id: string;
    invoiceNo: string;
    status: AgencyInvoiceStatus;
    amountIrr: string;
    dueAt: string;
  } | null;
  flights: {
    flightInstanceId: string;
    flightNo: string;
    departureAt: string;
  }[];
  decidedAt: string | null;
  createdAt: string;
}

export interface AgencyDocument {
  id: string;
  docType: AgencyDocumentType;
  status: AgencyDocumentStatus;
  createdAt: string;
  file: { fileName: string; sizeBytes: number; mimeType: string };
}

export type AgencyApiScope = "FULL" | "SEARCH_BOOK";
export type AgencyWebserviceRequestStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface AgencyWebserviceRequest {
  id: string;
  scope: AgencyApiScope;
  months: 1 | 3 | 12;
  priceIrr: string;
  note: string | null;
  status: AgencyWebserviceRequestStatus;
  decidedAt: string | null;
  createdAt: string;
}

/** Cross-agency queue row for SITE_ADMIN webservice tab */
export interface AgencyWebserviceQueueRow extends AgencyWebserviceRequest {
  agencyId: string;
  agencyName: string;
  city: string;
  licenseNo: string;
}

export interface AgencyApiKeySummary {
  id: string;
  scope: AgencyApiScope | "SEARCH_ONLY";
  status: "ACTIVE" | "SUSPENDED";
  activatedAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  callCount: number;
}
