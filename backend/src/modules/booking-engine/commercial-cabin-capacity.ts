import type { EntityManager } from 'typeorm';
import { FareRule } from '../../database/entities/fare-rule.entity';
import { Passenger } from '../../database/entities/passenger.entity';
import type { CabinClass } from '../../database/enums';

/**
 * A configured aircraft cabin remains the physical ceiling. Once Commercial
 * Management defines fare classes, however, the sum of those approved fare
 * allocations becomes the smaller sellable ceiling shown to customers and
 * enforced during checkout.
 */
export function commercialCabinCapacity(
  physicalCapacity: number,
  fareAllocations: readonly number[],
): number {
  const safePhysical = Math.max(0, Math.trunc(physicalCapacity));
  if (fareAllocations.length === 0) return safePhysical;
  const approved = fareAllocations.reduce(
    (sum, seats) => sum + Math.max(0, Math.trunc(seats)),
    0,
  );
  return Math.min(safePhysical, approved);
}

export async function resolveCommercialCabinCapacity(
  manager: EntityManager,
  flightInstanceId: string,
  cabin: CabinClass,
  physicalCapacity: number,
): Promise<number> {
  const rules = await manager.find(FareRule, {
    where: { flightInstanceId, cabin },
  });
  return commercialCabinCapacity(
    physicalCapacity,
    rules.map((rule) => rule.seatsAllocated),
  );
}

/** Public inventory is a channel quota, not the whole physical cabin. */
export function releasedChannelSeatsLeft(
  physicalSeatsLeft: number,
  releasedSeats: number,
  usedSeats: number,
): number {
  return Math.max(
    0,
    Math.min(
      Math.max(0, Math.trunc(physicalSeatsLeft)),
      Math.max(0, Math.trunc(releasedSeats)) -
        Math.max(0, Math.trunc(usedSeats)),
    ),
  );
}

export function maximumChannelRelease(
  seatsAllocated: number,
  otherChannelSeats: number,
): number {
  return Math.max(
    0,
    Math.trunc(seatsAllocated) - Math.max(0, Math.trunc(otherChannelSeats)),
  );
}

/** Remaining public-site quota for one cabin, computed from PostgreSQL. */
export async function resolveSiteCabinAvailability(
  manager: EntityManager,
  flightInstanceId: string,
  cabin: CabinClass,
  physicalSeatsLeft: number,
): Promise<{ releasedSeats: number; usedSeats: number; seatsLeft: number }> {
  const rules = await manager.find(FareRule, {
    where: { flightInstanceId, cabin },
  });
  const releasedSeats = rules.reduce(
    (sum, rule) =>
      sum + Math.max(0, Math.trunc(Number(rule.siteSeatsReleased ?? 0))),
    0,
  );
  const hasExplicitSiteRelease = rules.some(
    (rule) =>
      Math.max(0, Math.trunc(Number(rule.siteSeatsReleased ?? 0))) > 0 ||
      rule.sitePriceIrr !== null,
  );
  const now = new Date();
  const row = await manager
    .createQueryBuilder(Passenger, 'passenger')
    .innerJoin('passenger.booking', 'booking')
    .select(
      `COALESCE(SUM(CASE
        WHEN passenger."occupiesSeat" = FALSE THEN 0
        WHEN passenger."extraSeatCode" IS NULL THEN 1
        ELSE 2
      END), 0)`,
      'usedSeats',
    )
    .where('booking.flightInstanceId = :flightInstanceId', {
      flightInstanceId,
    })
    .andWhere('booking.cabin = :cabin', { cabin })
    .andWhere('booking.channel = :channel', { channel: 'SYSTEM' })
    .andWhere('booking.status IN (:...statuses)', {
      statuses: ['DRAFT', 'HELD', 'PAID', 'TICKETED'],
    })
    .andWhere('(booking.status != :held OR booking."holdExpiresAt" > :now)', {
      held: 'HELD',
      now,
    })
    .andWhere('passenger."deletedAt" IS NULL')
    .andWhere('booking."deletedAt" IS NULL')
    .getRawOne<{ usedSeats: string }>();
  const usedSeats = Number(row?.usedSeats ?? 0);
  // A legacy/simple flight may have no fare classes, or fare classes created
  // before explicit channel release metadata existed. In either case retain
  // the historical commercial/physical availability. A manager-set release of
  // zero is still explicit because the sales control also stamps sitePriceIrr.
  if (rules.length === 0 || !hasExplicitSiteRelease) {
    const seatsLeft = Math.max(0, Math.trunc(physicalSeatsLeft));
    return {
      releasedSeats: seatsLeft + Math.max(0, Math.trunc(usedSeats)),
      usedSeats,
      seatsLeft,
    };
  }
  return {
    releasedSeats,
    usedSeats,
    seatsLeft: releasedChannelSeatsLeft(
      physicalSeatsLeft,
      releasedSeats,
      usedSeats,
    ),
  };
}
