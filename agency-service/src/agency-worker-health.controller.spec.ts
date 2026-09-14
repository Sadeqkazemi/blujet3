import { ServiceUnavailableException } from '@nestjs/common';
import type { DataSource, EntityManager } from 'typeorm';
import { AgencyWorkerHealthController } from './agency-worker-health.controller';
import type { AgencyDlqStore } from './projection/agency-dlq.store';
import type { AgencyKafkaRuntime } from './projection/agency-kafka.runtime';

describe('AgencyWorkerHealthController', () => {
  const runtime = {
    isReady: jest.fn().mockReturnValue(true),
    getStatus: jest.fn().mockReturnValue({
      state: 'running',
      checkpointPartitions: 2,
      maxObservedLag: '4',
      lastCheckpointAt: '2026-09-13T18:30:00.000Z',
    }),
  };
  const dlq = { countQuarantined: jest.fn().mockResolvedValue(0) };

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
    const controller = new AgencyWorkerHealthController(
      dataSource(query),
      runtime as unknown as AgencyKafkaRuntime,
      dlq as unknown as AgencyDlqStore,
      { enabled: false },
    );

    expect(controller.health()).toMatchObject({
      status: 'ok',
      service: 'blujet-agency-projection-worker',
    });
    expect(query).not.toHaveBeenCalled();
    expect(runtime.isReady).not.toHaveBeenCalled();
  });

  it('is ready only when the complete schema and consumer are ready', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const controller = new AgencyWorkerHealthController(
      dataSource(query),
      runtime as unknown as AgencyKafkaRuntime,
      dlq as unknown as AgencyDlqStore,
      { enabled: false },
    );

    await expect(controller.ready()).resolves.toEqual({
      status: 'ok',
      service: 'blujet-agency-projection-worker',
      info: {
        database: { status: 'up' },
        consumer: {
          status: 'up',
          state: 'running',
          checkpoint: {
            partitions: 2,
            maxObservedLag: '4',
            lastCheckpointAt: '2026-09-13T18:30:00.000Z',
          },
        },
        quarantine: { status: 'disabled' },
      },
    });
    expect(query).toHaveBeenCalledTimes(7);
  });

  it('returns safe 503 semantics when PostgreSQL is unavailable', async () => {
    const query = jest
      .fn()
      .mockRejectedValue(new Error('secret database detail'));
    const controller = new AgencyWorkerHealthController(
      dataSource(query),
      runtime as unknown as AgencyKafkaRuntime,
      dlq as unknown as AgencyDlqStore,
      { enabled: false },
    );

    await expect(controller.ready()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(controller.ready()).rejects.toMatchObject({
      response: {
        status: 'error',
        service: 'blujet-agency-projection-worker',
        error: { database: { status: 'down' } },
      },
    });
    expect(runtime.getStatus).not.toHaveBeenCalled();
  });

  it('returns only lifecycle state when the consumer is unavailable', async () => {
    runtime.isReady.mockReturnValueOnce(false);
    runtime.getStatus.mockReturnValueOnce({ state: 'failed' });
    const controller = new AgencyWorkerHealthController(
      dataSource(jest.fn().mockResolvedValue([])),
      runtime as unknown as AgencyKafkaRuntime,
      dlq as unknown as AgencyDlqStore,
      { enabled: false },
    );

    await expect(controller.ready()).rejects.toMatchObject({
      response: {
        status: 'error',
        service: 'blujet-agency-projection-worker',
        error: {
          database: { status: 'up' },
          consumer: { status: 'down', state: 'failed' },
        },
      },
    });
  });

  it('exposes only the quarantined count when enabled', async () => {
    dlq.countQuarantined.mockResolvedValueOnce(2);
    const controller = new AgencyWorkerHealthController(
      dataSource(jest.fn().mockResolvedValue([])),
      runtime as unknown as AgencyKafkaRuntime,
      dlq as unknown as AgencyDlqStore,
      {
        enabled: true,
        maxAttempts: 3,
        operatorToken: 'agency-operator-token-at-least-32-characters',
      },
    );

    await expect(controller.ready()).resolves.toMatchObject({
      info: { quarantine: { status: 'up', count: 2 } },
    });
  });

  it('fails readiness safely when quarantine storage is unavailable', async () => {
    dlq.countQuarantined.mockRejectedValueOnce(new Error('secret SQL'));
    const controller = new AgencyWorkerHealthController(
      dataSource(jest.fn().mockResolvedValue([])),
      runtime as unknown as AgencyKafkaRuntime,
      dlq as unknown as AgencyDlqStore,
      {
        enabled: true,
        maxAttempts: 3,
        operatorToken: 'agency-operator-token-at-least-32-characters',
      },
    );

    await expect(controller.ready()).rejects.toMatchObject({
      response: {
        status: 'error',
        service: 'blujet-agency-projection-worker',
        error: {
          database: { status: 'up' },
          consumer: { status: 'up', state: 'running' },
          quarantine: { status: 'down' },
        },
      },
    });
  });
});
