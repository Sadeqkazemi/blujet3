import { apiGet, apiPatch, apiPost, apiRequest } from "./http";
import type {
  CeoPricingResult,
  CommercialPricingResult,
  PricingProposal,
} from "../types/pricing";

export function fetchCeoPricing() {
  return apiGet<CeoPricingResult>("/pricing/proposals");
}

export function fetchCommercialPricing() {
  return apiGet<CommercialPricingResult>("/pricing/proposals");
}

export function upsertProposal(
  flightInstanceId: string,
  dto: {
    /** IRR decimal string on the wire (never a JS float). */
    proposedPriceIrr: string | number;
    legalRateIrr?: string | number;
    note?: string;
    ceoNote?: string;
    operationsNote?: string;
    commercialNote?: string;
  },
) {
  return apiRequest<PricingProposal>(
    `/pricing/flights/${flightInstanceId}/proposal`,
    {
      method: "PUT",
      body: JSON.stringify(dto),
    },
  );
}

export function updatePublishedPrice(
  flightInstanceId: string,
  dto: {
    salePriceIrr: string | number;
    reason: string;
    expectedVersion?: number;
  },
) {
  return apiPatch<PricingProposal & { version: number }>(
    `/pricing/flights/${flightInstanceId}/price`,
    dto,
  );
}

export function setLegalRate(id: string, legalRateIrr: string | number) {
  return apiPatch<PricingProposal>(`/pricing/proposals/${id}/legal-rate`, {
    legalRateIrr,
  });
}

/** CEO register — no OTP/step-up (contract confirmed). */
export function registerProposal(id: string, source: "PROPOSED" | "AI") {
  return apiPatch<PricingProposal>(`/pricing/proposals/${id}/register`, {
    source,
  });
}

/** Canonical alias for register — identical body/behavior. */
export function approveProposal(id: string, source: "PROPOSED" | "AI") {
  return apiPatch<PricingProposal>(`/pricing/proposals/${id}/approve`, {
    source,
  });
}

/** CEO reject — reason only; no OTP/step-up (contract confirmed). */
export function rejectProposal(
  id: string,
  dto: {
    rejectionReason: string;
  },
) {
  return apiPatch<PricingProposal>(`/pricing/proposals/${id}/reject`, dto);
}

/** Expected: GET /pricing/proposals/pending-count — badge source for CEO nav/page. */
export function fetchPendingApprovalsCount() {
  return apiGet<{ pendingApprovalsCount: number }>(
    "/pricing/proposals/pending-count",
  );
}

export function runAiAnalysis() {
  return apiPost<{ analyzed: number; available: boolean }>(
    "/pricing/proposals/ai-analysis",
  );
}
