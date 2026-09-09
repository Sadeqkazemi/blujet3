import type { EntityManager } from 'typeorm';
import { CommerceSagaService } from './commerce-saga.service';
import type { CommerceSagaExecution } from '../../database/entities/commerce-saga-execution.entity';

function managerFor(repository: {
  findOneBy: jest.Mock;
  findOne: jest.Mock;
  save: jest.Mock;
  create: jest.Mock;
}): EntityManager {
  return {
    queryRunner: { isTransactionActive: true },
    query: jest.fn(),
    getRepository: jest.fn().mockReturnValue(repository),
  } as unknown as EntityManager;
}

function saga(overrides: Partial<CommerceSagaExecution> = {}) {
  return {
    id: 'saga-1',
    sagaType: 'CORE_ITINERARY_FULFILMENT' as const,
    aggregateId: 'order-1',
    correlationId: 'core-itinerary:order-1',
    idempotencyKey: 'fulfilment:order-1',
    status: 'STARTED' as const,
    currentStep: 'HOLD_CREATED',
    failureCode: null,
    ...overrides,
  } as CommerceSagaExecution;
}

describe('CommerceSagaService', () => {
  it('starts one saga and returns the persisted execution on replay', async () => {
    const repository = {
      findOneBy: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(saga()),
      findOne: jest.fn(),
      save: jest
        .fn()
        .mockImplementation((value: CommerceSagaExecution) =>
          Promise.resolve(value),
        ),
      create: jest
        .fn()
        .mockImplementation((value: CommerceSagaExecution) => value),
    };
    const manager = managerFor(repository);
    const service = new CommerceSagaService();
    const input = {
      sagaType: 'CORE_ITINERARY_FULFILMENT' as const,
      aggregateId: 'order-1',
      correlationId: 'core-itinerary:order-1',
      idempotencyKey: 'fulfilment:order-1',
      currentStep: 'HOLD_CREATED',
    };

    const first = await service.start(manager, input);
    const replay = await service.start(manager, input);

    expect(first.status).toBe('STARTED');
    expect(replay.id).toBe('saga-1');
    expect(repository.save).toHaveBeenCalledTimes(1);
  });

  it('rejects a different correlation or idempotency key for the same aggregate', async () => {
    const repository = {
      findOneBy: jest.fn().mockResolvedValue(saga()),
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
    };
    const service = new CommerceSagaService();

    await expect(
      service.start(managerFor(repository), {
        sagaType: 'CORE_ITINERARY_FULFILMENT',
        aggregateId: 'order-1',
        correlationId: 'different',
        idempotencyKey: 'fulfilment:order-1',
        currentStep: 'HOLD_CREATED',
      }),
    ).rejects.toMatchObject({
      response: { code: 'IDEMPOTENCY_PAYLOAD_MISMATCH' },
    });
  });

  it('records completion and fail-closed compensation state', async () => {
    const persisted = saga();
    const repository = {
      findOneBy: jest.fn(),
      findOne: jest.fn().mockResolvedValue(persisted),
      save: jest
        .fn()
        .mockImplementation((value: CommerceSagaExecution) =>
          Promise.resolve(value),
        ),
      create: jest.fn(),
    };
    const service = new CommerceSagaService();
    const manager = managerFor(repository);

    const completed = await service.advance(manager, {
      sagaType: 'CORE_ITINERARY_FULFILMENT',
      aggregateId: 'order-1',
      currentStep: 'PAYMENT_CAPTURED_AND_TICKETED',
      status: 'COMPLETED',
    });
    expect(completed.status).toBe('COMPLETED');
    expect(completed.failureCode).toBeNull();

    persisted.status = 'STARTED';
    persisted.failureCode = null;
    const failed = await service.advance(manager, {
      sagaType: 'CORE_ITINERARY_FULFILMENT',
      aggregateId: 'order-1',
      currentStep: 'MANUAL_RECONCILIATION_REQUIRED',
      status: 'COMPENSATION_REQUIRED',
      failureCode: 'TICKET_STOCK_UNAVAILABLE',
    });
    expect(failed.status).toBe('COMPENSATION_REQUIRED');
    expect(failed.failureCode).toBe('TICKET_STOCK_UNAVAILABLE');
  });
});
