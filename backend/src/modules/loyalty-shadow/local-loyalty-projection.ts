import { DataSource, IsNull } from 'typeorm';
import { ClubMember } from '../../database/entities/club-member.entity';
import { ClubPointsEntry } from '../../database/entities/club-points-entry.entity';
import { PriceLock } from '../../database/entities/price-lock.entity';
import { PriceLockStatus } from '../../database/enums';
import type { LockProjection, LoyaltyProjection } from './loyalty-shadow';

/** Independent ORM projection for offline comparison, never a purchase decision. */
export async function readLocalLoyalty(
  db: DataSource,
  userId: string,
  at: Date,
): Promise<LoyaltyProjection> {
  return db.transaction('REPEATABLE READ', async (tx) => {
    await tx.query('SET TRANSACTION READ ONLY');
    const membership = await tx.getRepository(ClubMember).findOne({
      where: { userId, deactivatedAt: IsNull() },
      select: { id: true, userId: true, level: true, cardStatus: true },
    });
    const points = membership
      ? await tx
          .getRepository(ClubPointsEntry)
          .createQueryBuilder('entry')
          .select('COALESCE(SUM(entry.signedPoints), 0)::text', 'points')
          .where('entry.clubMemberId = :id', { id: membership.id })
          .getRawOne<{ points: string }>()
      : undefined;
    const locks = await tx
      .getRepository(PriceLock)
      .createQueryBuilder('lock')
      .select('lock.id', 'id')
      .addSelect('lock.flightInstanceId', 'flightInstanceId')
      .addSelect('lock.cabin', 'cabin')
      .addSelect('"lock"."lockedPriceIrr"::text', 'lockedPriceIrr')
      .addSelect('"lock"."feeIrr"::text', 'feeIrr')
      .addSelect('lock.status', 'status')
      .addSelect(
        `to_char(lock.expiresAt, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`,
        'expiresAt',
      )
      .addSelect(
        `to_char(lock.createdAt, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`,
        'createdAt',
      )
      .addSelect('lock.bookingId', 'bookingId')
      .where('lock.userId = :userId', { userId })
      .andWhere('lock.status = :status', { status: PriceLockStatus.ACTIVE })
      .andWhere('lock.expiresAt > :at', { at: at.toISOString() })
      .orderBy('lock.id', 'ASC')
      .limit(1001)
      .getRawMany<LockProjection>();
    if (locks.length > 1000)
      throw new Error('Loyalty comparison limit exceeded');
    return {
      member: membership
        ? {
            id: membership.id,
            userId,
            level: membership.level,
            cardStatus: membership.cardStatus,
            points: points?.points ?? '0',
          }
        : null,
      locks,
    };
  });
}
