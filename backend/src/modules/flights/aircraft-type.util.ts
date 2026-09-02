/** Phase 13: FlightInstance.aircraftTypeOverride (set only by
 * FlightsService.changeAircraftType) wins over the shared Flight row's
 * aircraftType — every seat-map/pricing lookup must go through this
 * instead of reading `instance.flight.aircraftType` directly, or an
 * aircraft-type change silently won't apply anywhere except the one call
 * site that was updated. */
export function resolveAircraftType(instance: {
  aircraftTypeOverride?: string | null;
  flight: { aircraftType: string };
}): string {
  return instance.aircraftTypeOverride ?? instance.flight.aircraftType;
}
