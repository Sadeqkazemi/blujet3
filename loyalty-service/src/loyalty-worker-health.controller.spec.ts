import { ServiceUnavailableException } from '@nestjs/common';
import type { DataSource, EntityManager } from 'typeorm';
import { LoyaltyWorkerHealthController } from './loyalty-worker-health.controller';
import type { LoyaltyKafkaRuntime } from './projection/loyalty-kafka.runtime';
import type { LoyaltyDlqStore } from './projection/loyalty-dlq.store';

describe('LoyaltyWorkerHealthController', () => {
  const validRoleAttestation = {
    role: 'blujet_loyalty_projection_runtime',
    isolatedDatabase: true,
    utcSession: true,
    boundedSession: true,
    safeSearchPath: true,
    restrictedRole: true,
    noMemberships: true,
    noOwnership: true,
    databaseAccess: true,
    schemaAccess: true,
    noDdl: true,
    requiredGrants: true,
    leastPrivilege: true,
    noCrossDomainAccess: true,
    noForeignConnect: true,
  };
  const runtime = {
    isReady: jest.fn().mockReturnValue(true),
    getStatus: jest.fn().mockReturnValue({
      state: 'running',
      checkpointPartitions: 2,
      maxObservedLag: '4',
      lastCheckpointAt: '2026-09-13T05:30:00.000Z',
    }),
  };
  const dlq = { countQuarantined: jest.fn().mockResolvedValue(0) };

  function dataSource(query: jest.Mock): DataSource {
    return {
      query,
      transaction: jest.fn(
        async (work: (manager: EntityManager) => Promise<void>) =>
          work({ query } as unknown as EntityManager),
      ),
    } as unknown as DataSource;
  }

  function controller(
    query: jest.Mock,
    dlqConfig:
      | { enabled: false }
      | {
          enabled: true;
          maxAttempts: number;
          operatorToken: string;
        } = { enabled: false },
  ): LoyaltyWorkerHealthController {
    return new LoyaltyWorkerHealthController(
      dataSource(query),
      runtime as unknown as LoyaltyKafkaRuntime,
      dlq as unknown as LoyaltyDlqStore,
      dlqConfig,
    );
  }

  beforeEach(() => jest.clearAllMocks());

  it('exposes only build identity from liveness', () => {
    const query = jest.fn();
    const target = controller(query);

    expect(target.health()).toMatchObject({
      status: 'ok',
      service: 'blujet-loyalty-projection-worker',
    });
    expect(query).not.toHaveBeenCalled();
    expect(runtime.isReady).not.toHaveBeenCalled();
  });

  it('is ready only when the complete schema and consumer are ready', async () => {
    const query = jest.fn().mockResolvedValue([validRoleAttestation]);
    const target = controller(query);

    await expect(target.ready()).resolves.toEqual({
      status: 'ok',
      service: 'blujet-loyalty-projection-worker',
      info: {
        database: { status: 'up' },
        consumer: {
          status: 'up',
          state: 'running',
          checkpoint: {
            partitions: 2,
            maxObservedLag: '4',
            lastCheckpointAt: '2026-09-13T05:30:00.000Z',
          },
        },
        quarantine: { status: 'disabled' },
      },
    });
    expect(query).toHaveBeenCalledTimes(11);
  });

  it('returns safe 503 semantics when PostgreSQL is unavailable', async () => {
    const query = jest
      .fn()
      .mockRejectedValue(new Error('secret database detail'));
    const target = controller(query);

    await expect(target.ready()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(target.ready()).rejects.toMatchObject({
      response: {
        status: 'error',
        service: 'blujet-loyalty-projection-worker',
        error: { database: { status: 'down-or-misconfigured' } },
      },
    });
    expect(runtime.getStatus).not.toHaveBeenCalled();
  });

  it('fails closed before schema or consumer checks for the wrong role', async () => {
    const query = jest
      .fn()
      .mockResolvedValue([
        { ...validRoleAttestation, role: 'loyalty_database_owner' },
      ]);
    const target = controller(query);

    await expect(target.ready()).rejects.toMatchObject({
      response: {
        error: { database: { status: 'down-or-misconfigured' } },
      },
    });
    expect(query).toHaveBeenCalledTimes(1);
    expect(runtime.isReady).not.toHaveBeenCalled();
  });

  it('returns only the lifecycle state when the consumer is unavailable', async () => {
    runtime.isReady.mockReturnValueOnce(false);
    runtime.getStatus.mockReturnValueOnce({ state: 'failed' });
    const target = controller(
      jest.fn().mockResolvedValue([validRoleAttestation]),
    );

    await expect(target.ready()).rejects.toMatchObject({
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

  it('reports only the quarantined count when enabled', async () => {
    dlq.countQuarantined.mockResolvedValueOnce(2);
    const target = controller(
      jest.fn().mockResolvedValue([validRoleAttestation]),
      {
        enabled: true,
        maxAttempts: 3,
        operatorToken: 'loyalty-operator-token-at-least-32-chars',
      },
    );

    await expect(target.ready()).resolves.toMatchObject({
      info: { quarantine: { status: 'up', count: 2 } },
    });
  });

  it('fails readiness safely when the quarantine registry is unavailable', async () => {
    dlq.countQuarantined.mockRejectedValueOnce(new Error('secret SQL'));
    const target = controller(
      jest.fn().mockResolvedValue([validRoleAttestation]),
      {
        enabled: true,
        maxAttempts: 3,
        operatorToken: 'loyalty-operator-token-at-least-32-chars',
      },
    );

    await expect(target.ready()).rejects.toMatchObject({
      response: {
        status: 'error',
        service: 'blujet-loyalty-projection-worker',
        error: {
          database: { status: 'up' },
          quarantine: { status: 'down' },
        },
      },
    });
  });
});
