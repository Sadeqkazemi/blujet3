import { apiGet, apiPatch, apiPost, apiRequest } from './http';
import type {
  AircraftDefinition,
  AircraftDefinitionListItem,
  AircraftSeatMap,
  UpsertAircraftDefinitionPayload,
} from '../types/aircraft';

/** Canonical aircraft-definition admin API (PR #126 contract). */

export function fetchAircraftDefinitions() {
  return apiGet<AircraftDefinitionListItem[]>('/flights/aircraft-definitions');
}

export function fetchAircraftDefinition(id: string) {
  return apiGet<AircraftDefinition>(`/flights/aircraft-definitions/${id}`);
}

export function fetchAircraftSeatMap(id: string) {
  return apiGet<AircraftSeatMap>(`/flights/aircraft-definitions/${id}/seat-map`);
}

export function createAircraftDefinition(payload: UpsertAircraftDefinitionPayload) {
  return apiPost<AircraftDefinition>('/flights/aircraft-definitions', payload);
}

export function updateAircraftDefinition(
  id: string,
  payload: UpsertAircraftDefinitionPayload,
) {
  return apiRequest<AircraftDefinition>(`/flights/aircraft-definitions/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function patchAircraftDefinition(
  id: string,
  payload: Partial<UpsertAircraftDefinitionPayload>,
) {
  return apiPatch<AircraftDefinition>(`/flights/aircraft-definitions/${id}`, payload);
}
