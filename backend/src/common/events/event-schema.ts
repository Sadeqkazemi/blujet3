import type { CanonicalEvent } from './canonical-events';
import { coreItineraryEventSchema } from './core-itinerary-event-schema';
import { opsAdminEventSchema } from './ops-admin-event-schema';

export interface KnownEventSchema {
  readonly schemaId: string;
}

export function knownEventSchema(
  event: CanonicalEvent,
): KnownEventSchema | undefined {
  return coreItineraryEventSchema(event) ?? opsAdminEventSchema(event);
}
