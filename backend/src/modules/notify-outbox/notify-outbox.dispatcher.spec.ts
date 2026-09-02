import { NotifyOutboxDispatcher } from './notify-outbox.dispatcher';

describe('NotifyOutboxDispatcher', () => {
  function setup(dispatchError?: Error) {
    const updates: Array<[Record<string, unknown>, Record<string, unknown>]> =
      [];
    const event = {
      id: '11111111-1111-4111-8111-111111111111',
      eventType: 'NOTIFICATION_CREATED',
      payloadEncrypted: 'encrypted',
      dedupeKey: 'booking:1:ticketed',
      attempts: 0,
      nextAttemptAt: new Date(),
      claimedAt: null,
      claimToken: null,
      deliveredAt: null,
      lastError: null,
      createdAt: new Date(),
    };
    const queryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      setLock: jest.fn().mockReturnThis(),
      setOnLocked: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([event]),
    };
    const transactionalRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      save: jest.fn((events: (typeof event)[]) => Promise.resolve(events)),
    };
    const deliveryRepo = {
      update: jest.fn(
        (criteria: Record<string, unknown>, patch: Record<string, unknown>) => {
          updates.push([criteria, patch]);
          return Promise.resolve({ affected: 1 });
        },
      ),
    };
    const dataSource = {
      transaction: jest.fn(
        (
          callback: (manager: {
            getRepository: () => typeof transactionalRepo;
          }) => Promise<unknown>,
        ) => callback({ getRepository: () => transactionalRepo }),
      ),
      getRepository: jest.fn().mockReturnValue(deliveryRepo),
    };
    const client = {
      enabled: jest.fn().mockReturnValue(true),
      dispatch: dispatchError
        ? jest.fn().mockRejectedValue(dispatchError)
        : jest.fn().mockResolvedValue(undefined),
    };
    return {
      client,
      deliveryRepo,
      updates,
      dispatcher: new NotifyOutboxDispatcher(
        dataSource as never,
        client as never,
      ),
    };
  }

  it('marks a successfully consumed event delivered', async () => {
    const { client, deliveryRepo, dispatcher, updates } = setup();
    await dispatcher.drainOnce();
    expect(client.dispatch).toHaveBeenCalledTimes(1);
    expect(deliveryRepo.update).toHaveBeenCalledTimes(1);
    const [criteria, patch] = updates[0] ?? [{}, {}];
    expect(criteria.id).toBe('11111111-1111-4111-8111-111111111111');
    expect(typeof criteria.claimToken).toBe('string');
    expect(patch.deliveredAt).toBeInstanceOf(Date);
    expect(patch.claimedAt).toBeNull();
    expect(patch.claimToken).toBeNull();
  });

  it('releases a failed claim and schedules a bounded retry', async () => {
    const { deliveryRepo, dispatcher, updates } = setup(new Error('offline'));
    await dispatcher.drainOnce();
    expect(deliveryRepo.update).toHaveBeenCalledTimes(1);
    const [criteria, patch] = updates[0] ?? [{}, {}];
    expect(typeof criteria.claimToken).toBe('string');
    expect(patch.attempts).toBe(1);
    expect(patch.nextAttemptAt).toBeInstanceOf(Date);
    expect(patch.claimedAt).toBeNull();
    expect(patch.claimToken).toBeNull();
    expect(patch.lastError).toBe('Error');
  });
});
