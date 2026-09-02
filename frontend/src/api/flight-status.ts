import { apiGet } from './http';
import type { FlightStatusResult } from '../types/flight-status';

export function lookupFlightStatus(params: { flightNo?: string; origin?: string; dest?: string; date: string }) {
  const q = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => !!v)) as Record<string, string>,
  );
  return apiGet<FlightStatusResult>(`/flight-status?${q.toString()}`);
}
