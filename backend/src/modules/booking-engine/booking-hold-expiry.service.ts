import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager, LessThanOrEqual } from 'typeorm';
import { Booking } from '../../database/entities/booking.entity';
import { BookingLifecycleEvent } from '../../database/entities/booking-lifecycle-event.entity';

const BATCH_SIZE = 100;

@Injectable()
export class BookingHoldExpiryService {
  constructor(private readonly dataSource: DataSource) {}

  async expireOne(bookingId: string, now = new Date()): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      const booking = await manager.findOne(Booking, {
        where: { id: bookingId },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        !booking ||
        booking.status !== 'HELD' ||
        !booking.holdExpiresAt ||
        booking.holdExpiresAt > now
      ) {
        return false;
      }
      return this.transition(manager, booking, now);
    });
  }

  async expireDueBatch(now = new Date()): Promise<number> {
    return this.dataSource.transaction(async (manager) => {
      const due = await manager
        .getRepository(Booking)
        .createQueryBuilder('booking')
        .where('booking.status = :status', { status: 'HELD' })
        .andWhere('booking.holdExpiresAt IS NOT NULL')
        .andWhere('booking.holdExpiresAt <= :now', { now })
        .orderBy('booking.holdExpiresAt', 'ASC')
        .addOrderBy('booking.id', 'ASC')
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .take(BATCH_SIZE)
        .getMany();

      let expired = 0;
      for (const booking of due) {
        if (await this.transition(manager, booking, now)) expired += 1;
      }
      return expired;
    });
  }

  private async transition(
    manager: EntityManager,
    booking: Booking,
    now: Date,
  ): Promise<boolean> {
    const transitioned = await manager.getRepository(Booking).update(
      {
        id: booking.id,
        status: 'HELD',
        holdExpiresAt: LessThanOrEqual(now),
      },
      { status: 'EXPIRED' },
    );
    if ((transitioned.affected ?? 0) !== 1) return false;
    const eventRepo = manager.getRepository(BookingLifecycleEvent);
    await eventRepo.save(
      eventRepo.create({
        bookingId: booking.id,
        eventType: 'HOLD_EXPIRED',
        fromStatus: 'HELD',
        toStatus: 'EXPIRED',
        occurredAt: now,
      }),
    );
    return true;
  }
}
