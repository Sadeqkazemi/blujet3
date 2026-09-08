import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, MoreThan, Repository } from 'typeorm';
import { AircraftSeatMap } from '../../database/entities/aircraft-seat-map.entity';
import { FlightInstance } from '../../database/entities/flight-instance.entity';
import { Passenger } from '../../database/entities/passenger.entity';
import { SeatLock } from '../../database/entities/seat-lock.entity';
import type { CabinClass } from '../../database/enums';
import { enumerateSeats } from '../reservation/seat-layout';
import { resolveCommercialCabinCapacity } from '../booking-engine/commercial-cabin-capacity';
import { resolveAircraftType } from '../flights/aircraft-type.util';
import { serializeCabinCapacities } from '../flights/flight-definition.util';
import { sumActiveCommittedSeats } from '../flights/commitment-capacity.util';
import type { CabinAvailabilityReader } from '../pss/cabin-availability-reader.interface';

const ACTIVE_BOOKING_STATUSES = ['DRAFT', 'HELD', 'PAID', 'TICKETED'] as const;

@Injectable()
export class OfferCabinAvailabilityService implements CabinAvailabilityReader {
  constructor(
    @InjectRepository(FlightInstance)
    private readonly flightInstanceRepo: Repository<FlightInstance>,
    @InjectRepository(AircraftSeatMap)
    private readonly seatMapRepo: Repository<AircraftSeatMap>,
    @InjectRepository(Passenger)
    private readonly passengerRepo: Repository<Passenger>,
    @InjectRepository(SeatLock)
    private readonly seatLockRepo: Repository<SeatLock>,
  ) {}

  async cabinAvailability(
    instance: FlightInstance,
    cabin: CabinClass,
    manager?: EntityManager,
    excludeItineraryOrderId?: string,
  ): Promise<{ capacity: number; seatsLeft: number } | null> {
    const map = await (
      manager ? manager.getRepository(AircraftSeatMap) : this.seatMapRepo
    ).findOneBy({ aircraftType: resolveAircraftType(instance) });
    if (!map) return null;

    const seats = enumerateSeats(map);
    const configured = serializeCabinCapacities(instance.cabinCapacities).find(
      (row) => row.cabin === cabin,
    )?.seats;
    const cabinSeats = seats.filter((seat) => seat.cabin === cabin);
    if (cabinSeats.length === 0) return null;
    const physicalCapacity = Math.min(
      configured ?? cabinSeats.length,
      cabinSeats.length,
    );
    if (physicalCapacity <= 0) return null;

    const db = manager ?? this.flightInstanceRepo.manager;
    const capacity = await resolveCommercialCabinCapacity(
      db,
      instance.id,
      cabin,
      physicalCapacity,
    );
    if (capacity <= 0) return null;

    const [taken, committed] = manager
      ? [
          await this.takenSeatCodes(instance.id, manager),
          await sumActiveCommittedSeats(
            db,
            instance.id,
            cabin,
            excludeItineraryOrderId,
          ),
        ]
      : await Promise.all([
          this.takenSeatCodes(instance.id),
          sumActiveCommittedSeats(
            db,
            instance.id,
            cabin,
            excludeItineraryOrderId,
          ),
        ]);
    const cabinCodes = new Set(cabinSeats.map((seat) => seat.seatCode));
    const occupied = [...taken].filter((code) => cabinCodes.has(code)).length;
    return {
      capacity,
      seatsLeft: Math.max(0, capacity - occupied - committed),
    };
  }

  private async takenSeatCodes(
    flightInstanceId: string,
    manager?: EntityManager,
  ): Promise<Set<string>> {
    const now = new Date();
    const [passengers, locks] = await Promise.all([
      (manager ? manager.getRepository(Passenger) : this.passengerRepo)
        .createQueryBuilder('passenger')
        .innerJoin('passenger.booking', 'booking')
        .select(['passenger.seatCode', 'passenger.extraSeatCode'])
        .where(
          '(passenger.seatCode IS NOT NULL OR passenger.extraSeatCode IS NOT NULL)',
        )
        .andWhere('booking.flightInstanceId = :flightInstanceId', {
          flightInstanceId,
        })
        .andWhere('booking.status IN (:...statuses)', {
          statuses: [...ACTIVE_BOOKING_STATUSES],
        })
        .andWhere('(booking.status != :held OR booking.holdExpiresAt > :now)', {
          held: 'HELD',
          now,
        })
        .andWhere('booking.deletedAt IS NULL')
        .andWhere('passenger.deletedAt IS NULL')
        .getMany(),
      (manager ? manager.getRepository(SeatLock) : this.seatLockRepo).find({
        where: {
          flightInstanceId,
          releasedAt: IsNull(),
          expiresAt: MoreThan(now),
        },
        select: { seatCode: true },
      }),
    ]);
    return new Set([
      ...passengers.flatMap((passenger) =>
        [passenger.seatCode, passenger.extraSeatCode].filter(
          (code): code is string => Boolean(code),
        ),
      ),
      ...locks.map((lock) => lock.seatCode),
    ]);
  }
}
