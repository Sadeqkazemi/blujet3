import type {
  CabinKind,
  ChargeKind,
  ChargeMethod,
  FlightApprovalStatus,
} from "../lib/flight-definition";

export type DerivedFlightStatus = "ACTIVE" | "SELLING" | "FULL" | "CANCELLED";

export type { CabinKind, ChargeKind, ChargeMethod, FlightApprovalStatus };

export interface ScheduleGroup {
  occurrenceCount: number;
  startAt: string | null;
  endAt: string | null;
  departures: string[];
}

export interface CabinCapacity {
  cabin: CabinKind;
  seats: number;
  basePriceIrr?: string;
  defaultClassCode?: string;
}

export interface ChargeRule {
  id?: string;
  title: string;
  kind: ChargeKind;
  /** Backend contract — not the form method name. */
  calculationMode: 'FIXED' | 'PERCENTAGE';
  fixedAmountIrr?: string | number | null;
  percentageBasisPoints?: number | null;
  /** null = all cabins. */
  cabin: CabinKind | null;
  validFrom: string | null;
  validUntil: string | null;
  active: boolean;
}

export interface ChargeBreakdownLine {
  title: string;
  kind: ChargeKind;
  amountIrr: string;
}

export interface CalculatedChargeBreakdown {
  basePriceIrr: string;
  lines: ChargeBreakdownLine[];
  totalSellableIrr: string;
}

export interface FlightDefinitionSnapshot {
  flightNo: string;
  originCode: string;
  destCode: string;
  departureAt: string;
  durationMinutes: number;
  aircraftType: string;
  capacity: number;
  cabinCapacities: CabinCapacity[];
  basePriceIrr: string | null;
  chargeRules: ChargeRule[];
}

export interface CommercialClassBreakdownRow {
  label: string;
  cabin: CabinKind;
  classCode?: string;
  capacity: number;
  sold: number;
}

export interface AgencyReleaseClassSettings {
  seats: number;
  priceIrr: string;
  special?: boolean;
}

export interface FlightPriceHistoryRow {
  id: string;
  previousPriceIrr: string;
  salePriceIrr: string;
  reason: string;
  actorName: string;
  createdAt: string;
}

export interface FlightCommercialFields {
  siteVisible: boolean;
  classBreakdown: CommercialClassBreakdownRow[];
  agencyReleaseSeats: number;
  lockedSeats: number;
  routeAgencyPriceIrr: string | null;
  classSitePrices: Record<string, string>;
  agencyRelease: Record<string, AgencyReleaseClassSettings>;
}

export interface FareClassPriceHistory {
  channel: "SYSTEM" | "AGENCY";
  previousPriceIrr: string;
  newPriceIrr: string;
  reason: string;
  changedAt: string;
}

export interface CommercialFareClassControl {
  ruleId: string;
  cabin: CabinKind;
  classCode: string;
  seatsAllocated: number;
  soldSeats: number;
  siteSoldSeats: number;
  agencySoldSeats: number;
  remainingSeats: number;
  sharedSeatsRemaining: number;
  siteSeatsAvailable: number;
  agencySeatsAvailable: number;
  agencySeatsCommitted: number;
  revenueIrr: string;
  basePriceIrr: string;
  sitePriceIrr: string | null;
  siteSeatsReleased: number;
  agencySeatsReleased: number;
  agencyReleasePriceIrr: string | null;
  agencySpecialOffer: boolean;
  salesByRate?: {
    channel: "SYSTEM" | "AGENCY" | "CHARTER" | "MANAGERIAL";
    priceIrr: string;
    seats: number;
    revenueIrr: string;
    lastSoldAt: string;
  }[];
  priceHistory: FareClassPriceHistory[];
}

export interface CommercialFlightControl {
  flightInstanceId: string;
  departureAt: string;
  competitorPriceIrr: string | null;
  publicSaleEnabled: boolean;
  agencySaleEnabled: boolean;
  fareClasses: CommercialFareClassControl[];
}

export interface FareClassPriceSuggestion {
  ruleId: string;
  cabin: CabinKind;
  classCode: string;
  channel: "SYSTEM" | "AGENCY";
  capacity: number;
  releasedSeats: number;
  soldSeats: number;
  totalSoldSeats: number;
  availableSeats: number;
  sharedSeatsRemaining: number;
  occupancyPct: number;
  hoursToDeparture: number;
  basePriceIrr: string;
  currentPriceIrr: string;
  competitorPriceIrr: string;
  suggestedPriceIrr: string;
  source: "ML" | "HEURISTIC";
  modelVersion: string | null;
  confidence: number | null;
  reasonFa: string;
  factorsFa: string[];
  advisoryOnly: true;
}

export interface FlightRow {
  id: string;
  flightNo: string;
  originCode: string;
  destCode: string;
  departureAt: string;
  capacity: number;
  charterSeats: number;
  sold: number;
  // Money fields are decimal STRINGs on the wire (BigInt.prototype.toJSON
  // on the backend — a JS number can't safely hold IRR amounts above 2^53).
  basePriceIrr: string | null;
  derivedStatus: DerivedFlightStatus;
  durationMinutes?: number;
  cabinCapacities?: CabinCapacity[];
  chargeRules?: ChargeRule[];
  calculatedChargeBreakdown?: CalculatedChargeBreakdown | null;
  approvalStatus?: FlightApprovalStatus;
  rejectionReason?: string | null;
  canEdit?: boolean;
  editBlockedReason?: string | null;
  pendingRevision?: boolean;
  approvedSnapshot?: FlightDefinitionSnapshot | null;
  aiSuggestion?: FlightAiSuggestion | null;
  competitorPriceIrr?: string | null;
  salesHealth?: {
    isWeak: boolean;
    occupancyPct: number;
    hoursToDeparture: number;
    thresholdPct: number;
    windowHours: number;
    reasonFa: string;
  };
  siteVisible?: boolean;
  publicSaleEnabled?: boolean;
  cancelledAt?: string | null;
  cancellationReason?: string | null;
  classBreakdown?: CommercialClassBreakdownRow[];
  agencyReleaseSeats?: number;
  lockedSeats?: number;
  routeAgencyPriceIrr?: string | null;
  classSitePrices?: Record<string, string>;
  agencyRelease?: Record<string, AgencyReleaseClassSettings>;
}

export interface FlightAiSuggestion {
  // Advisory-only ML output, persisted as a plain JSON blob (not a native
  // bigint column, never routed through BigInt.prototype.toJSON) — stays a
  // real JS number, unlike the other Irr fields on this page.
  priceIrr: string | number;
  reason: string;
  factors: string[];
  season: string;
  occasion: string;
  confidence: number;
  modelVersion: string;
  generatedAt: string;
}

export interface FutureFlightRow extends Omit<FlightRow, "derivedStatus"> {
  agencySeatsAllocated: number | null;
  aiSuggestion: FlightAiSuggestion | null;
  aircraftType?: string;
  pricingRegistered?: boolean;
}

export interface CompletedFlightRow {
  id: string;
  flightNo: string;
  originCode: string;
  destCode: string;
  departureAt: string;
  tickets: number;
  basePriceIrr: string;
  avgPriceIrr: string;
  revenueIrr: string;
  channelRevenueIrr: { SYSTEM: string; CHARTER: string; AGENCY: string };
  profitIrr: string;
  lossIrr: string;
}

export interface FlightsOverview {
  kpis: { activeCount: number; soldSeats: number; meanOccupancyPct: number };
  active: FlightRow[];
  completed: {
    rows: CompletedFlightRow[];
    kpis: {
      totalSalesIrr: string;
      totalProfitIrr: string;
      totalTickets: number;
      flightCount: number;
    };
  };
  future: FutureFlightRow[];
}

export interface AirportEntry {
  id: string;
  code: string;
  cityFa: string;
  airportNameFa?: string | null;
  tz: string;
  /** True means the airport is outside Iran. */
  isInternational: boolean;
}

export interface FlightDetail extends FlightRow {
  channels: {
    channel: "SYSTEM" | "CHARTER" | "AGENCY";
    seats: number;
    revenueIrr: string;
  }[];
  totalRevenueIrr: string;
  occupancyPct: number;
  aircraftType: string;
  priceHistory?: FlightPriceHistoryRow[];
}

export interface AircraftTypeOption {
  aircraftType: string;
  capacity: number;
}

export interface PlanResult {
  id: string;
  basePriceIrr: string;
  agencySeatsAllocated: number;
  directSeats: number;
  proposalPending: boolean;
}

export interface AllotmentRow {
  id: string;
  agencyId: string;
  agencyName: string;
  seatsAllocated: number;
  type: "SOFT" | "HARD";
  releaseAt: string | null;
  contractPriceIrr: string | null;
  createdAt: string;
  active: boolean;
}

export interface AllotmentSummary {
  flightInstanceId: string;
  totalCapacity: number;
  charterSeats: number;
  directReserved: number;
  agencySeats: number;
  freeSeats: number;
  agencyRevenueIrr: string;
  agencies: (AllotmentRow & { revenueIrr: string })[];
}

export interface FareRuleRow {
  id: string;
  flightInstanceId: string;
  cabin: CabinKind;
  classCode: string;
  priceIrr: number;
  seatsAllocated: number;
  taxIrr: number;
  refundable: boolean;
  changeable: boolean;
  baggageAllowanceKg: number | null;
  validFrom: string | null;
  validUntil: string | null;
  allowedChannels: ("SYSTEM" | "CHARTER" | "AGENCY")[];
}

export interface CreateFareRulePayload {
  cabin: CabinKind;
  classCode: string;
  priceIrr: string | number;
  seatsAllocated: number;
  siteSeats?: number;
  sitePriceIrr?: string;
  agencySeats?: number;
  agencyPriceIrr?: string;
  agencySpecialOffer?: boolean;
  taxIrr?: number;
  refundable?: boolean;
  changeable?: boolean;
  baggageAllowanceKg?: number;
  validFrom?: string;
  validUntil?: string;
  allowedChannels?: ("SYSTEM" | "CHARTER" | "AGENCY")[];
}
export interface CreateFlightDefinitionPayload {
  originCode: string;
  destCode: string;
  flightNo: string;
  departureAt: string;
  durationMinutes: number;
  capacity: number;
  cabinCapacities: CabinCapacity[];
  /** IRR decimal string (or legacy number) — prefer string on the wire. */
  basePriceIrr: string | number;
  aircraftType?: string;
  charterSeats?: number;
  chargeRules?: Omit<ChargeRule, "id">[];
  competitorPriceIrr?: string | number;
}

export interface UpdateFlightDefinitionPayload extends CreateFlightDefinitionPayload {}

export interface CompleteScheduledFlightPayload {
  expectedVersion?: number;
  basePriceIrr: string;
  competitorPriceIrr?: string;
  charterSeats?: number;
  chargeRules?: Omit<ChargeRule, "id">[];
  fareRules: Array<
    Omit<CreateFareRulePayload, "priceIrr" | "taxIrr"> & {
      priceIrr: string;
      taxIrr?: string;
    }
  >;
  pricingProposal: {
    proposedPriceIrr: string;
    legalRateIrr?: string;
    ceoNote?: string;
    operationsNote?: string;
    commercialNote?: string;
  };
}

export interface FlightDefinitionDetail extends FlightRow {
  scheduleGroup?: ScheduleGroup;
  aircraftType: string;
  durationMinutes: number;
  cabinCapacities: CabinCapacity[];
  chargeRules: ChargeRule[];
  calculatedChargeBreakdown: CalculatedChargeBreakdown | null;
  approvalStatus: FlightApprovalStatus;
  rejectionReason: string | null;
  canEdit: boolean;
  editBlockedReason: string | null;
  pendingRevision: boolean;
  approvedSnapshot: FlightDefinitionSnapshot | null;
  pendingRevisionSnapshot?: FlightDefinitionSnapshot | null;
  definitionStatus?: OperationsFlightStatus;
  publishStatus?: string;
  uiStatus?: string;
  version: number;
  publishedAt?: string | null;
  pricingProposal?: {
    proposedPriceIrr: string;
    legalRateIrr: string | null;
    ceoNote: string | null;
    operationsNote: string | null;
    commercialNote: string | null;
  } | null;
}

export type OperationsFlightStatus =
  | "PENDING_OPERATIONS"
  | "OPERATIONS_REJECTED"
  | "REJECTED"
  | "PENDING_CEO"
  | "PUBLISHED";

export interface OperationsFlightRow {
  scheduleGroup?: ScheduleGroup;
  id: string;
  flightNo: string;
  originCode: string;
  destCode: string;
  departureAt: string;
  capacity: number;
  charterSeats: number;
  aircraftType: string;
  basePriceIrr: string | null;
  competitorPriceIrr: string | null;
  proposal: {
    id: string;
    proposedPriceIrr: string;
    legalRateIrr: string | null;
    note: string | null;
    ceoNote?: string | null;
    operationsNote?: string | null;
    commercialNote?: string | null;
    status: string;
    proposedBy: { id: string; fullName: string } | null;
  } | null;
  definitionStatus: OperationsFlightStatus;
  publishStatus: string;
  uiStatus: string;
  version: number;
  rejectionReason: string | null;
}

export interface OperationsOverview {
  counts: {
    pendingOperations: number;
    pendingCeo: number;
    operationsRejected: number;
    published: number;
  };
  pending: OperationsFlightRow[];
  rows: OperationsFlightRow[];
}

export interface FlightWorkflowHistory {
  id: string;
  definitionStatus: string;
  publishStatus: string;
  uiStatus: string;
  version: number;
  reviews: {
    id: string;
    stage: "OPERATIONS" | "CEO";
    decision: "APPROVED" | "REJECTED";
    comment: string;
    reviewedByUserId: string;
    reviewedAt: string;
  }[];
  audit: {
    id: string;
    category: string;
    action: string;
    detail: string;
    actorRole: string;
    createdAt: string;
    metadata?: Record<string, unknown> | null;
  }[];
}

export interface UpdateFareRulePayload {
  priceIrr?: string | number;
  seatsAllocated?: number;
  taxIrr?: number;
  refundable?: boolean;
  changeable?: boolean;
  baggageAllowanceKg?: number;
  validFrom?: string;
  validUntil?: string;
  allowedChannels?: ("SYSTEM" | "CHARTER" | "AGENCY")[];
}
