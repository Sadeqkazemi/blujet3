import { ServiceUnavailableException } from '@nestjs/common';
import type { DataSource, EntityManager } from 'typeorm';
import { LoyaltyWorkerHealthController } from './loyalty-worker-health.controller';
import type { LoyaltyKafkaRuntime } from './projection/loyalty-kafka.runtime';

describe('LoyaltyWorkerHealthController', () => {
  const runtime = {
    isReady: jest.fn().mockReturnValue(true),
    getStatus: jest.fn().mockReturnValue({ state: 'running' }),
  };

  function dataSource(query: jest.Mock): DataSource {
    return {
      transaction: jest.fn(
        async (work: (manager: EntityManager) => Promise<void>) =>
          work({ query } as unknown as EntityManager),
      ),
    } as unknown as DataSource;
  }

  beforeEach(() => jest.clearAllMocks());

  it('exposes only build identity from liveness', () => {
    const query = jest.fn();
    const controller = new LoyaltyWorkerHealthController(
      dataSource(query),
      runtime as unknown as LoyaltyKafkaRuntime,
    );

    expect(controller.health()).toMatchObject({
      status: 'ok',
      service: 'blujet-loyalty-projection-worker',
    });
    expect(query).not.toHaveBeenCalled();
    expect(runtime.isReady).not.toHaveBeenCalled();
  });

  it('is ready only when the complete schema and consumer are ready', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const controller = new LoyaltyWorkerHealthController(
      dataSource(query),
      runtime as unknown as LoyaltyKafkaRuntime,
    );

    await expect(controller.ready()).resolves.toEqual({
      status: 'ok',
      service: 'blujet-loyalty-projection-worker',
      info: {
        database: { status: 'up' },
        consumer: { status: 'up', state: 'running' },
      },
    });
    expect(query).toHaveBeenCalledTimes(8);
  });

  it('returns safe 503 semantics when PostgreSQL is unavailable', async () => {
    const query = jest
      .fn()
      .mockRejectedValue(new Error('secret database detail'));
    const controller = new LoyaltyWorkerHealthController(
      dataSource(query),
      runtime as unknown as LoyaltyKafkaRuntime,
    );

    await expect(controller.ready()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(controller.ready()).rejects.toMatchObject({
      response: {
        status: 'error',
        service: 'blujet-loyalty-projection-worker',
        error: { database: { status: 'down' } },
      },
    });
    expect(runtime.getStatus).not.toHaveBeenCalled();
  });

  it('returns only the lifecycle state when the consumer is unavailable', async () => {
    runtime.isReady.mockReturnValueOnce(false);
    runtime.getStatus.mockReturnValueOnce({ state: 'failed' });
    const controller = new LoyaltyWorkerHealthController(
      dataSource(jest.fn().mockResolvedValue([])),
      runtime as unknown as LoyaltyKafkaRuntime,
    );

    await expect(controller.ready()).rejects.toMatchObject({
      response: {
        status: 'error',
        service: 'blujet-loyalty-projection-worker',
        error: {
          database: { status: 'up' },
          consumer: { status: 'down', state: 'failed' },
        },
      },
    });
  });
});
