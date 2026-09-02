import { apiDelete, apiGet, apiPatch, apiPost } from './http';
import type { PublicTravelCost, TravelCost, TravelCostPayload } from '../types/travel-costs';

export function fetchTravelCosts() {
  return apiGet<TravelCost[]>('/travel-costs');
}

export function fetchPublicTravelCosts() {
  return apiGet<PublicTravelCost[]>('/public/travel-costs');
}

export function createTravelCost(payload: TravelCostPayload) {
  return apiPost<TravelCost>('/travel-costs', payload);
}

export function updateTravelCost(id: string, payload: Partial<TravelCostPayload>) {
  return apiPatch<TravelCost>(`/travel-costs/${id}`, payload);
}

export function deleteTravelCost(id: string) {
  return apiDelete<{ id: string }>(`/travel-costs/${id}`);
}
