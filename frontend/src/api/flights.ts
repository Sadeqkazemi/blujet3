import { apiGet, apiPatch, apiPost, apiDelete, apiRequest } from "./http";
import type {
  AircraftTypeOption,
  AirportEntry,
  AllotmentRow,
  CommercialFlightControl,
  CompleteScheduledFlightPayload,
  CreateFareRulePayload,
  CreateFlightDefinitionPayload,
  FareRuleRow,
  FlightDefinitionDetail,
  FlightDetail,
  FlightsOverview,
  PlanResult,
  OperationsFlightRow,
  OperationsOverview,
  FlightWorkflowHistory,
  FareClassPriceSuggestion,
  UpdateFareRulePayload,
  UpdateFlightDefinitionPayload,
} from "../types/flights";

export function fetchFlightsOverview() {
  return apiGet<FlightsOverview>("/flights/overview");
}

export function fetchAirports() {
  return apiGet<AirportEntry[]>("/flights/airports");
}

export function createAirport(payload: {
  cityFa: string;
  code: string;
  airportNameFa?: string;
  tz?: string;
  isInternational: boolean;
}) {
  return apiPost<AirportEntry>("/flights/airports", payload);
}

export function deleteAirport(id: string) {
  return apiDelete<{ id: string }>(`/flights/airports/${id}`);
}

export function fetchAircraftTypes() {
  return apiGet<AircraftTypeOption[]>("/flights/aircraft-types");
}

export interface CreateFlightPayload extends CreateFlightDefinitionPayload {}

export function createFlight(payload: CreateFlightPayload) {
  return apiPost<FlightDefinitionDetail>("/flights", payload);
}

export function submitFlightToOperations(id: string, expectedVersion?: number) {
  return apiPost<FlightDefinitionDetail>(`/flights/${id}/submit-operations`, {
    expectedVersion,
  });
}

export function fetchOperationsQueue(status?: "PENDING_OPERATIONS" | "OPERATIONS_REJECTED") {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiGet<OperationsFlightRow[]>(`/flights/operations-queue${query}`);
}

export function fetchOperationsOverview() {
  return apiGet<OperationsOverview>("/flights/operations-overview");
}

export function decideFlightOperations(
  id: string,
  dto: {
    decision: "APPROVED" | "REJECTED";
    comment: string;
    expectedVersion?: number;
  },
) {
  return apiPost<FlightDefinitionDetail>(`/flights/${id}/operations-decision`, dto);
}

export function fetchFlightHistory(id: string) {
  return apiGet<FlightWorkflowHistory>(`/flights/${id}/history`);
}

/** Expected: GET /flights/:id/definition — full editable flight definition. */
export function fetchFlightDefinition(id: string) {
  return apiGet<FlightDefinitionDetail>(`/flights/${id}/definition`);
}

/** Expected: PUT /flights/:id/definition — create/update specs (may open CEO revision). */
export function updateFlightDefinition(
  id: string,
  payload: UpdateFlightDefinitionPayload,
) {
  return apiRequest<FlightDefinitionDetail>(`/flights/${id}/definition`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function fetchFlightDetail(id: string) {
  return apiGet<FlightDetail>(`/flights/${id}`);
}

export function patchCommercialPanelSettings(
  instanceId: string,
  payload: {
    siteVisible?: boolean;
    classSitePrices?: Record<string, string>;
    agencyRelease?: Record<
      string,
      { seats?: number; priceIrr?: string; special?: boolean }
    >;
  },
) {
  return apiPatch<import("../types/flights").FlightCommercialFields>(
    `/flights/${instanceId}/commercial-settings`,
    payload,
  );
}

export function completeScheduledFlight(
  id: string,
  payload: CompleteScheduledFlightPayload,
) {
  return apiRequest<FlightDefinitionDetail>(
    `/flights/${id}/complete-and-submit`,
    {
      method: "PUT",
      body: JSON.stringify(payload),
    },
  );
}

export function fetchCommercialFlightControl(instanceId: string) {
  return apiGet<CommercialFlightControl>(`/flights/${instanceId}/commercial-control`);
}

export function updateFlightSalesVisibility(instanceId: string, enabled: boolean) {
  return apiPatch<{ flightInstanceId: string; publicSaleEnabled: boolean; version: number }>(
    `/flights/${instanceId}/sales-visibility`,
    { enabled },
  );
}

export function updateAgencySalesVisibility(instanceId: string, enabled: boolean) {
  return apiPatch<{ flightInstanceId: string; agencySaleEnabled: boolean; version: number }>(
    `/flights/${instanceId}/agency-sales-visibility`,
    { enabled },
  );
}

export function updateFareClassSitePrice(
  instanceId: string,
  ruleId: string,
  payload: { priceIrr: string; reason: string; seats?: number },
) {
  return apiPatch<FareRuleRow>(`/flights/${instanceId}/fare-rules/${ruleId}/site-price`, payload);
}

export function upsertAgencyFareRelease(
  instanceId: string,
  ruleId: string,
  payload: { seats: number; priceIrr: string; specialOffer?: boolean },
) {
  return apiRequest<FareRuleRow>(`/flights/${instanceId}/fare-rules/${ruleId}/agency-release`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function suggestFareClassPrice(
  instanceId: string,
  ruleId: string,
  payload: {
    channel: "SYSTEM" | "AGENCY";
    competitorPriceIrr?: string;
  },
) {
  return apiPost<FareClassPriceSuggestion>(
    `/flights/${instanceId}/fare-rules/${ruleId}/price-suggestion`,
    payload,
  );
}

export function updateFareClassChannelRelease(
  instanceId: string,
  ruleId: string,
  payload: {
    siteSeats: number;
    sitePriceIrr: string;
    agencySeats: number;
    agencyPriceIrr: string;
    specialOffer?: boolean;
    reason?: string;
  },
) {
  return apiRequest<FareRuleRow>(
    `/flights/${instanceId}/fare-rules/${ruleId}/channel-release`,
    { method: "PUT", body: JSON.stringify(payload) },
  );
}

export function planFlight(
  id: string,
  payload: {
    priceIrr: string | number;
    agencySeats: number;
    saleStartsAt?: string;
    saleEndsAt?: string;
  },
) {
  return apiPatch<PlanResult>(`/flights/${id}/plan`, payload);
}

export function changeFlightAircraft(
  id: string,
  aircraftType: string,
  stepUp: { stepUpChallengeId: string; stepUpCode: string },
) {
  return apiPatch<{ id: string; aircraftType: string; capacity: number }>(`/flights/${id}/aircraft`, {
    aircraftType,
    ...stepUp,
  });
}

export function runFlightsAiAnalysis() {
  return apiPost<{ analyzed: number; available: boolean }>(
    "/flights/ai-analysis",
  );
}

export function fetchAllotments(instanceId: string) {
  return apiGet<AllotmentRow[]>(`/flights/${instanceId}/allotments`);
}

export function fetchAllotmentsSummary(instanceId: string) {
  return apiGet<import('../types/flights').AllotmentSummary>(
    `/flights/${instanceId}/allotments/summary`,
  );
}

export function createAllotment(
  instanceId: string,
  dto: {
    agencyId: string;
    seatsAllocated: number;
    type?: "SOFT" | "HARD";
    releaseAt?: string;
    contractPriceIrr?: string | number;
  },
) {
  return apiPost<AllotmentRow>(`/flights/${instanceId}/allotments`, dto);
}

export function deleteAllotment(instanceId: string, allotmentId: string) {
  return apiDelete<{ id: string }>(
    `/flights/${instanceId}/allotments/${allotmentId}`,
  );
}

/** Unified charter + agency commitments (PR #126 contract). */
export function fetchCommitments(instanceId: string) {
  return apiGet<import("../types/commitments").CommitmentRow[]>(
    `/flights/${instanceId}/commitments`,
  );
}

export function fetchCommitmentsSummary(instanceId: string) {
  return apiGet<import("../types/commitments").CommitmentsSummary>(
    `/flights/${instanceId}/commitments/summary`,
  );
}

export function createCommitment(
  instanceId: string,
  dto: import("../types/commitments").CreateCommitmentPayload,
) {
  return apiPost<import("../types/commitments").CommitmentRow>(
    `/flights/${instanceId}/commitments`,
    dto,
  );
}

export function deleteCommitment(instanceId: string, commitmentId: string) {
  return apiDelete<import("../types/commitments").CommitmentRow>(
    `/flights/${instanceId}/commitments/${commitmentId}`,
  );
}

export function fetchFareRules(instanceId: string) {
  return apiGet<FareRuleRow[]>(`/flights/${instanceId}/fare-rules`);
}

export function createFareRule(instanceId: string, dto: CreateFareRulePayload) {
  return apiPost<FareRuleRow>(`/flights/${instanceId}/fare-rules`, dto);
}

export function updateFareRule(
  instanceId: string,
  ruleId: string,
  dto: UpdateFareRulePayload,
) {
  return apiPatch<FareRuleRow>(
    `/flights/${instanceId}/fare-rules/${ruleId}`,
    dto,
  );
}

export function deleteFareRule(instanceId: string, ruleId: string) {
  return apiDelete<{ success: boolean }>(
    `/flights/${instanceId}/fare-rules/${ruleId}`,
  );
}

export function previewScheduleTemplate(
  payload: import('../types/schedule-templates').ScheduleTemplatePayload,
) {
  return apiPost<import('../types/schedule-templates').ScheduleTemplatePreview>(
    '/flights/schedule-templates/preview',
    payload,
  );
}

export function suggestRouteDistance(originAirportId: string, destinationAirportId: string) {
  return apiPost<import('../types/schedule-templates').RouteDistanceSuggestion | null>(
    '/flights/routes/distance-suggestion',
    { originAirportId, destinationAirportId },
  );
}

export function createScheduleTemplate(
  payload: import('../types/schedule-templates').ScheduleTemplatePayload & { idempotencyKey: string },
) {
  return apiPost<import('../types/schedule-templates').ScheduleTemplateRow>(
    '/flights/schedule-templates',
    payload,
  );
}

export function fetchScheduleTemplates(page = 1, pageSize = 20) {
  return apiGet<import('../types/schedule-templates').ScheduleTemplateList>(
    `/flights/schedule-templates?page=${page}&pageSize=${pageSize}`,
  );
}

export function resolveScheduleTemplate(flightNo: string) {
  return apiGet<import('../types/schedule-templates').ResolvedScheduleTemplate>(
    `/flights/schedule-templates/resolve?flightNo=${encodeURIComponent(flightNo)}`,
  );
}

export function deactivateScheduleTemplate(id: string) {
  return apiPost<import('../types/schedule-templates').ScheduleTemplateRow>(
    `/flights/schedule-templates/${id}/deactivate`,
  );
}
