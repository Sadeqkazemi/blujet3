import type { EntityManager } from 'typeorm';
import { AgencySeatCommitment } from '../../database/entities/agency-seat-commitment.entity';
import { AgencyAllotment } from '../../database/entities/agency-allotment.entity';
import { Booking } from '../../database/entities/booking.entity';
import { Passenger } from '../../database/entities/passenger.entity';
import { CharterCommitment } from '../../database/entities/charter-commitment.entity';
import { CommitmentStatus } from '../../database/enums';
import type { CabinClass } from '../../database/enums';

/** Sum of ACTIVE charter + agency seat commitments for one cabin on one
 * flight instance — the amount online search/booking must subtract from
 * physical seatsLeft so online sale never dips into committed capacity
 * (CLAUDE.md goal #12: "کاهش موجودی رزرو آنلاین همان کلاس"). A pure
 * function over an EntityManager (not an injectable service) so it has no
 * module/DI dependency and can be called from CommitmentsService (flights
 * module) as well as SearchService/BookingService (booking-engine module)
 * without a cross-module provider import. */
export async function sumActiveCommittedSeats(
  manager: EntityManager,
  flightInstanceId: string,
  cabin: CabinClass,
): Promise<number> {
  const [charterSum, agencySum, allotmentSum, allotmentUsed] =
    await Promise.all([
      manager
        .createQueryBuilder(CharterCommitment, 'c')
        .select('COALESCE(SUM(c.seats), 0)', 'sum')
        .where('c."flightInstanceId" = :id', { id: flightInstanceId })
        .andWhere('c.cabin = :cabin', { cabin })
        .andWhere('c.status = :status', { status: CommitmentStatus.ACTIVE })
        .getRawOne<{ sum: string }>(),
      manager
        .createQueryBuilder(AgencySeatCommitment, 'a')
        .select('COALESCE(SUM(a.seats), 0)', 'sum')
        .where('a."flightInstanceId" = :id', { id: flightInstanceId })
        .andWhere('a.cabin = :cabin', { cabin })
        .andWhere('a.status = :status', { status: CommitmentStatus.ACTIVE })
        .getRawOne<{ sum: string }>(),
      manager
        .createQueryBuilder(AgencyAllotment, 'allotment')
        .select('COALESCE(SUM(allotment.seatsAllocated), 0)', 'sum')
        .where('allotment.flightInstanceId = :id', { id: flightInstanceId })
        .andWhere('allotment.cabin = :cabin', { cabin })
        .andWhere(
          '(allotment.type = :hard OR allotment.releaseAt IS NULL OR allotment.releaseAt > :now)',
          { hard: 'HARD', now: new Date() },
        )
        .getRawOne<{ sum: string }>(),
      manager
        .createQueryBuilder(Passenger, 'passenger')
        .innerJoin(Booking, 'booking', 'booking.id = passenger.bookingId')
        .innerJoin(
          AgencyAllotment,
          'allotment',
          'allotment.id = booking.allotmentId',
        )
        .select(
          `COALESCE(SUM(CASE
          WHEN passenger."occupiesSeat" = FALSE THEN 0
          WHEN passenger."extraSeatCode" IS NULL THEN 1
          ELSE 2
        END), 0)`,
          'sum',
        )
        .where('booking.flightInstanceId = :id', { id: flightInstanceId })
        .andWhere('booking.cabin = :cabin', { cabin })
        .andWhere('booking.status IN (:...statuses)', {
          statuses: ['DRAFT', 'HELD', 'PAID', 'TICKETED'],
        })
        .andWhere('(booking.status != :held OR booking.holdExpiresAt > :now)', {
          held: 'HELD',
          now: new Date(),
        })
        .andWhere(
          '(allotment.type = :hard OR allotment.releaseAt IS NULL OR allotment.releaseAt > :now)',
          { hard: 'HARD', now: new Date() },
        )
        .andWhere('passenger.deletedAt IS NULL')
        .andWhere('booking.deletedAt IS NULL')
        .getRawOne<{ sum: string }>(),
    ]);
  const unconsumedAllotment = Math.max(
    0,
    Number(allotmentSum?.sum ?? 0) - Number(allotmentUsed?.sum ?? 0),
  );
  return (
    Number(charterSum?.sum ?? 0) +
    Number(agencySum?.sum ?? 0) +
    unconsumedAllotment
  );
}
