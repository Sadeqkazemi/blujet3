import type { AgencyApiCapability, AgencyApiScope } from '../database/enums';
import { AgencyApiCapability as Cap } from '../database/enums';

export const ALL_AGENCY_API_CAPABILITIES: readonly AgencyApiCapability[] = [
  Cap.RESERVATION,
  Cap.TICKETING,
  Cap.PRICING,
  Cap.FLIGHT_INFO,
  Cap.REFUND,
  Cap.CHECK_IN,
  Cap.AVAILABILITY,
] as const;

export function capabilitiesFromScope(
  scope: AgencyApiScope,
): AgencyApiCapability[] {
  switch (scope) {
    case 'FULL':
      return [...ALL_AGENCY_API_CAPABILITIES];
    case 'SEARCH_BOOK':
      return [
        Cap.RESERVATION,
        Cap.TICKETING,
        Cap.FLIGHT_INFO,
        Cap.AVAILABILITY,
      ];
    case 'SEARCH_ONLY':
    default:
      return [Cap.FLIGHT_INFO, Cap.AVAILABILITY];
  }
}

export function scopeFromCapabilities(
  capabilities: readonly AgencyApiCapability[],
): AgencyApiScope {
  const set = new Set(capabilities);
  const hasAll = ALL_AGENCY_API_CAPABILITIES.every((c) => set.has(c));
  if (hasAll) return 'FULL';
  if (set.has(Cap.RESERVATION) || set.has(Cap.TICKETING)) return 'SEARCH_BOOK';
  return 'SEARCH_ONLY';
}

export function normalizeCapabilities(
  capabilities: readonly AgencyApiCapability[] | null | undefined,
  scope: AgencyApiScope,
): AgencyApiCapability[] {
  if (capabilities && capabilities.length > 0) {
    return ALL_AGENCY_API_CAPABILITIES.filter((c) => capabilities.includes(c));
  }
  return capabilitiesFromScope(scope);
}
