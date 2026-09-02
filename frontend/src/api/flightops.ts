import { apiGet, apiPost } from './http';
import type { FlightopsDetail, FlightopsList } from '../types/flightops';

export function fetchFlightops() {
  return apiGet<FlightopsList>('/flightops');
}

export function fetchFlightopsDetail(id: string) {
  return apiGet<FlightopsDetail>(`/flightops/${id}`);
}

export function submitFlightopsToNira(id: string) {
  return apiPost<{ id: string; niraSubmittedAt: string }>(`/flightops/${id}/nira-submit`);
}
