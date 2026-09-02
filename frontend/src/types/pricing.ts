import type {
  CabinCapacity,
  CalculatedChargeBreakdown,
  ChargeRule,
  FlightDefinitionSnapshot,
  AllotmentSummary,
  ScheduleGroup,
} from "./flights";
import type { FlightApprovalStatus } from "../lib/flight-definition";

export type PricingStatus = "PENDING" | "REGISTERED" | "REJECTED";

export interface AiSuggestion {
  // Advisory-only ML output, persisted as a plain JSON blob (not a native
  // bigint column, never routed through BigInt.prototype.toJSON) — stays a
  // real JS number, unlike the other Irr fields on this page.
  priceIrr: number;
  reason: string;
  factors: string[];
  season: string;
  occasion: string;
  confidence: number;
  modelVersion: string;
  generatedAt: string;
}

export interface PricingProposal {
  scheduleGroup?: ScheduleGroup;
  id: string;
  flightInstanceId: string;
  // Money fields are decimal STRINGs on the wire (BigInt.prototype.toJSON
  // on the backend — a JS number can't safely hold IRR amounts above 2^53).
  basePriceIrr: string;
  competitorPriceIrr: string;
  proposedPriceIrr: string;
  legalRateIrr: string | null;
  note: string | null;
  ceoNote?: string | null;
  operationsNote?: string | null;
  commercialNote?: string | null;
  status: PricingStatus;
  registeredPriceIrr: string | null;
  approvedAt: string | null;
  rejectionReason?: string | null;
  aiSuggestion: AiSuggestion | null;
  createdAt: string;
  proposedBy: { id: string; fullName: string; role: string };
  approvedBy: { id: string; fullName: string; role: string } | null;
  calculatedChargeBreakdown?: CalculatedChargeBreakdown | null;
  chargeRules?: ChargeRule[];
  cabinCapacities?: CabinCapacity[];
  durationMinutes?: number;
  aircraftType?: string;
  approvalStatus?: FlightApprovalStatus;
  pendingRevision?: boolean;
  approvedSnapshot?: FlightDefinitionSnapshot | null;
  changeSummary?: string[];
  flightInstance: {
    id: string;
    departureAt: string;
    capacity: number;
    charterSeats: number;
    durationMinutes?: number;
    aircraftType?: string;
    cabinCapacities?: CabinCapacity[];
    flight: {
      flightNo: string;
      route: { originCode: string; destCode: string };
    };
  };
}

export interface CeoPricingResult {
  pending: PricingProposal[];
  registered: PricingProposal[];
  pendingApprovalsCount?: number;
}

export interface CommercialFlightRow {
  id: string;
  departureAt: string;
  capacity: number;
  charterSeats: number;
  /** Instance base fare (ریال) — shown even before a proposal exists. */
  basePriceIrr: string | null;
  /** Real competitor fare when present — never invent base+3% client-side. */
  competitorPriceIrr?: string | null;
  definitionStatus?: string;
  version?: number;
  rejectionReason?: string | null;
  aircraftTypeOverride?: string | null;
  flight: {
    flightNo: string;
    aircraftType?: string;
    route: { originCode: string; destCode: string };
  };
  pricing: PricingProposal | null;
  agencySummary?: AllotmentSummary;
}

export interface CommercialPricingResult {
  flights: CommercialFlightRow[];
}
