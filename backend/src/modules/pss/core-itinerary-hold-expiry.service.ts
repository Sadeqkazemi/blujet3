import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager, LessThanOrEqual } from 'typeorm';
import { CoreItineraryLifecycleEvent } from '../../database/entities/core-itinerary-lifecycle-event.entity';
import { CoreItineraryOrder } from '../../database/entities/core-itinerary-order.entity';

const BATCH_SIZE = 100;

@Injectable()
export class CoreItineraryHoldExpiryService {
  constructor(private readonly dataSource: DataSource) {}

  async expireOne(orderId: string, now = new Date()): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      const order = await manager.findOne(CoreItineraryOrder, {
        where: { id: orderId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order || order.status !== 'HELD' || order.holdExpiresAt > now) {
        return false;
      }
      return this.expireWithinTransaction(manager, order, now);
    });
  }

  async expireDueBatch(now = new Date()): Promise<number> {
    return this.dataSource.transaction(async (manager) => {
      const due = await manager
        .getRepository(CoreItineraryOrder)
        .createQueryBuilder('order')
        .where('order.status = :status', { status: 'HELD' })
        .andWhere('order.holdExpiresAt <= :now', { now })
        .orderBy('order.holdExpiresAt', 'ASC')
        .addOrderBy('order.id', 'ASC')
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .take(BATCH_SIZE)
        .getMany();

      let expired = 0;
      for (const order of due) {
        if (await this.expireWithinTransaction(manager, order, now)) {
          expired += 1;
        }
      }
      return expired;
    });
  }

  async expireWithinTransaction(
    manager: EntityManager,
    order: CoreItineraryOrder,
    now: Date,
  ): Promise<boolean> {
    const transitioned = await manager.getRepository(CoreItineraryOrder).update(
      {
        id: order.id,
        status: 'HELD',
        holdExpiresAt: LessThanOrEqual(now),
      },
      { status: 'EXPIRED' },
    );
    if ((transitioned.affected ?? 0) !== 1) return false;
    const eventRepo = manager.getRepository(CoreItineraryLifecycleEvent);
    await eventRepo.save(
      eventRepo.create({
        orderId: order.id,
        eventType: 'HOLD_EXPIRED',
        fromStatus: 'HELD',
        toStatus: 'EXPIRED',
        occurredAt: now,
      }),
    );
    return true;
  }
}
