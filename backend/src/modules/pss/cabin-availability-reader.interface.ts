import type { EntityManager } from 'typeorm';
import type { FlightInstance } from '../../database/entities/flight-instance.entity';
import type { CabinClass } from '../../database/enums';

export const CABIN_AVAILABILITY_READER = Symbol('CABIN_AVAILABILITY_READER');

export interface CabinAvailabilityReader {
  cabinAvailability(
    instance: FlightInstance,
    cabin: CabinClass,
    manager?: EntityManager,
    excludeItineraryOrderId?: string,
  ): Promise<{ capacity: number; seatsLeft: number } | null>;
}
