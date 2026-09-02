import type { DataSource } from 'typeorm';
import { LessThanOrEqual } from 'typeorm';
import { FlightInstance } from '../../database/entities/flight-instance.entity';
import { Booking } from '../../database/entities/booking.entity';
import { FlightInstanceStatus, BookingStatus } from '../../database/enums';

/** Lazily flips SCHEDULED instances past their departureAt to DEPARTED —
 * no cron job. Nothing previously wrote this transition (only
 * src/database/seed.ts backdated demo rows by hand); every real reader of
 * "DEPARTED" now calls this first. See docs/DB_SCHEMA.md Phase 13 Part E. */
export async function materializeDepartedInstances(
  dataSource: DataSource,
): Promise<void> {
  await dataSource.getRepository(FlightInstance).update(
    {
      status: FlightInstanceStatus.SCHEDULED,
      departureAt: LessThanOrEqual(new Date()),
    },
    { status: FlightInstanceStatus.DEPARTED },
  );
}

/** Lazily flips TICKETED bookings to FLOWN once their flight instance has
 * departed — the default assumption absent any boarding/check-in signal
 * (none exists anywhere in this codebase or design). NO_SHOW is always a
 * manual staff override on top of this, never inferred here. */
export async function materializeFlownBookings(
  dataSource: DataSource,
): Promise<void> {
  await materializeDepartedInstances(dataSource);
  const bookingRepo = dataSource.getRepository(Booking);
  const eligible = await bookingRepo
    .createQueryBuilder('b')
    .innerJoin('b.flightInstance', 'fi')
    .where('b.status = :status', { status: BookingStatus.TICKETED })
    .andWhere('fi.status = :fiStatus', {
      fiStatus: FlightInstanceStatus.DEPARTED,
    })
    .select('b.id', 'id')
    .getRawMany<{ id: string }>();
  if (eligible.length === 0) return;
  await bookingRepo
    .createQueryBuilder()
    .update(Booking)
    .set({ status: BookingStatus.FLOWN })
    .where('id IN (:...ids)', { ids: eligible.map((b) => b.id) })
    .andWhere('status = :status', { status: BookingStatus.TICKETED })
    .execute();
}
