import type { CabinCapacity } from './flights';

export interface ScheduleTemplatePayload {
  originAirportId: string;
  destinationAirportId: string;
  flightNoBase: string;
  aircraftDefinitionId: string;
  cabinCapacities: CabinCapacity[];
  departureTime: string;
  durationMinutes: number;
  distanceKm?: number;
  distanceSource?: 'AI' | 'MANUAL';
  startDate: string;
  endDate: string;
  weekdays: number[];
  agencyPriceIrr: string;
  legalCeilingIrr: string;
}

export interface ScheduleTemplatePreview {
  occurrenceCount: number;
  capacity: number;
  cabinCapacities: CabinCapacity[];
  distanceKm?: number | null;
  distanceSource?: 'AI' | 'MANUAL' | null;
  dates: { localDate: string; departureAt: string; arrivalAt: string }[];
}

export interface ScheduleTemplateRow extends ScheduleTemplatePayload {
  id: string;
  originCode?: string;
  destCode?: string;
  aircraftCode?: string;
  cabinCapacities: CabinCapacity[];
  capacity: number;
  status: 'ACTIVE' | 'DEACTIVATED';
  instanceCount?: number;
  createdAt: string;
  updatedAt: string;
  deactivatedAt: string | null;
}

export interface RouteDistanceSuggestion {
  distanceKm: number;
  confidence: number;
  source: 'ANTHROPIC';
  generatedAt: string;
}

export interface ResolvedScheduleTemplate extends ScheduleTemplateRow {
  nextFlightInstanceId: string | null;
  nextDepartureAt: string | null;
  occurrences: ScheduleOccurrence[];
}

export interface ScheduleOccurrence {
  id: string;
  departureAt: string;
  arrivalAt: string;
  definitionStatus: string;
  publicSaleEnabled: boolean;
  version: number;
}

export interface ScheduleTemplateList {
  items: ScheduleTemplateRow[];
  page: number;
  pageSize: number;
  total: number;
}
