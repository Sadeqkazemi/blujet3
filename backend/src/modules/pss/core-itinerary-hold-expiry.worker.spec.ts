import { CoreItineraryOrder } from '../../database/entities/core-itinerary-order.entity';
import { CoreItineraryHoldExpiryService } from './core-itinerary-hold-expiry.service';
import { CoreItineraryHoldExpiryWorker } from './core-itinerary-hold-expiry.worker';

describe('CoreItineraryHoldExpiryWorker', () => {
  it('does not start a background timer in tests', () => {
    const interval = jest.spyOn(global, 'setInterval');
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    try {
      const worker = new CoreItineraryHoldExpiryWorker({} as never);
      worker.onApplicationBootstrap();
      expect(interval).not.toHaveBeenCalled();
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
      interval.mockRestore();
    }
  });

  it('materializes a due batch and records one event per order', async () => {
    const due = [
      { id: 'order-1', status: 'HELD', holdExpiresAt: new Date(0) },
      { id: 'order-2', status: 'HELD', holdExpiresAt: new Date(0) },
    ];
    const queryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      setLock: jest.fn().mockReturnThis(),
      setOnLocked: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(due),
    };
    const updates: string[] = [];
    const events: Array<Record<string, unknown>> = [];
    const orderRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      update: jest.fn((criteria: { id: string }) => {
        updates.push(criteria.id);
        return Promise.resolve({ affected: 1 });
      }),
    };
    const eventRepo = {
      create: jest.fn((value: Record<string, unknown>) => value),
      save: jest.fn((value: Record<string, unknown>) => {
        events.push(value);
        return Promise.resolve(value);
      }),
    };
    const dataSource = {
      transaction: jest.fn(
        (
          callback: (manager: {
            getRepository: (entity: { name: string }) => unknown;
          }) => Promise<unknown>,
        ) =>
          callback({
            getRepository: (entity) =>
              entity === CoreItineraryOrder ? orderRepo : eventRepo,
          }),
      ),
    };
    const worker = new CoreItineraryHoldExpiryWorker(
      new CoreItineraryHoldExpiryService(dataSource as never),
    );

    await expect(worker.sweepOnce()).resolves.toBe(2);
    expect(updates).toEqual(['order-1', 'order-2']);
    expect(events).toEqual([
      expect.objectContaining({
        orderId: 'order-1',
        eventType: 'HOLD_EXPIRED',
      }),
      expect.objectContaining({
        orderId: 'order-2',
        eventType: 'HOLD_EXPIRED',
      }),
    ]);
  });
});
