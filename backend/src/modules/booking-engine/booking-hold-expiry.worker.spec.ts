import {
  BookingHoldExpiryWorker,
  resolveBookingExpiryPollMs,
} from './booking-hold-expiry.worker';
import { BookingHoldExpiryService } from './booking-hold-expiry.service';

describe('BookingHoldExpiryWorker', () => {
  it('uses a bounded safe poll interval', () => {
    expect(resolveBookingExpiryPollMs(undefined)).toBe(30_000);
    expect(resolveBookingExpiryPollMs('750')).toBe(30_000);
    expect(resolveBookingExpiryPollMs('invalid')).toBe(30_000);
    expect(resolveBookingExpiryPollMs('1250.9')).toBe(1250);
  });

  it('does not start a background timer in tests', () => {
    const interval = jest.spyOn(global, 'setInterval');
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    try {
      const worker = new BookingHoldExpiryWorker({} as never);
      worker.onApplicationBootstrap();
      expect(interval).not.toHaveBeenCalled();
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
      interval.mockRestore();
    }
  });

  it('expires a locked due batch and records each transition', async () => {
    const due = [
      { id: 'booking-1', status: 'HELD', holdExpiresAt: new Date(0) },
      { id: 'booking-2', status: 'HELD', holdExpiresAt: new Date(0) },
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
    const savedEvents: Array<Record<string, unknown>> = [];
    const bookingRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      update: jest.fn((criteria: { id: string }) => {
        updates.push(criteria.id);
        return Promise.resolve({ affected: 1 });
      }),
    };
    const eventRepo = {
      create: jest.fn((value: Record<string, unknown>) => value),
      save: jest.fn((value: Record<string, unknown>) => {
        savedEvents.push(value);
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
              entity.name === 'Booking' ? bookingRepo : eventRepo,
          }),
      ),
    };
    const worker = new BookingHoldExpiryWorker(
      new BookingHoldExpiryService(dataSource as never),
    );

    await expect(worker.sweepOnce()).resolves.toBe(2);
    expect(updates).toEqual(['booking-1', 'booking-2']);
    expect(savedEvents).toEqual([
      expect.objectContaining({
        bookingId: 'booking-1',
        eventType: 'HOLD_EXPIRED',
        fromStatus: 'HELD',
        toStatus: 'EXPIRED',
      }),
      expect.objectContaining({
        bookingId: 'booking-2',
        eventType: 'HOLD_EXPIRED',
        fromStatus: 'HELD',
        toStatus: 'EXPIRED',
      }),
    ]);
  });

  it('does not write an event when the conditional transition loses', async () => {
    const queryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      setLock: jest.fn().mockReturnThis(),
      setOnLocked: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest
        .fn()
        .mockResolvedValue([
          { id: 'booking-1', status: 'HELD', holdExpiresAt: new Date(0) },
        ]),
    };
    const eventRepo = { create: jest.fn(), save: jest.fn() };
    const dataSource = {
      transaction: jest.fn((callback: (manager: unknown) => Promise<unknown>) =>
        callback({
          getRepository: (entity: { name: string }) =>
            entity.name === 'Booking'
              ? {
                  createQueryBuilder: () => queryBuilder,
                  update: () => Promise.resolve({ affected: 0 }),
                }
              : eventRepo,
        }),
      ),
    };

    await expect(
      new BookingHoldExpiryWorker(
        new BookingHoldExpiryService(dataSource as never),
      ).sweepOnce(),
    ).resolves.toBe(0);
    expect(eventRepo.save).not.toHaveBeenCalled();
  });
});
