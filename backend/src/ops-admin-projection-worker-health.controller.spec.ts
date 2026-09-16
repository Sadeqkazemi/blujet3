import { ServiceUnavailableException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import type { OpsAdminDlqConfig } from './config/ops-admin-dlq.config';
import type { OpsAdminDlqStore } from './modules/ops-admin/ops-admin-dlq.store';
import type { OpsAdminKafkaRuntime } from './modules/ops-admin/ops-admin-kafka.runtime';
import { OpsAdminProjectionWorkerHealthController } from './ops-admin-projection-worker-health.controller';
import { OPS_ADMIN_PROJECTION_RUNTIME_ROLE } from './modules/ops-admin/ops-admin-runtime-role.attestation';

describe('OpsAdminProjectionWorkerHealthController', () => {
  const runtime = {
    isReady: jest.fn().mockReturnValue(true),
    getStatus: jest.fn().mockReturnValue({
      state: 'running',
      checkpointPartitions: 2,
      maxObservedLag: '4',
      lastCheckpointAt: '2026-09-14T08:00:00.000Z',
    }),
  };
  const dlq = {
    countQuarantined: jest.fn().mockResolvedValue(2),
  };
  const validAttestation = {
    role: OPS_ADMIN_PROJECTION_RUNTIME_ROLE,
    sessionRole: OPS_ADMIN_PROJECTION_RUNTIME_ROLE,
    isolatedDatabase: true,
    safeSearchPath: true,
    loginRole: true,
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

  beforeEach(() => {
    jest.clearAllMocks();
    dlq.countQuarantined.mockResolvedValue(2);
  });

  function controller(
    dataSource: DataSource,
    dlqConfig: OpsAdminDlqConfig = { enabled: false },
  ) {
    return new OpsAdminProjectionWorkerHealthController(
      dataSource,
      runtime as unknown as OpsAdminKafkaRuntime,
      dlq as unknown as OpsAdminDlqStore,
      dlqConfig,
    );
  }

  function readyDataSource(
    managerQuery = jest.fn<Promise<unknown>, [string]>().mockResolvedValue([]),
  ) {
    return {
      dataSource: {
        query: jest.fn().mockResolvedValue([validAttestation]),
        transaction: jest
          .fn<
            Promise<void>,
            [(manager: { query: typeof managerQuery }) => Promise<void>]
          >()
          .mockImplementation((work) => work({ query: managerQuery })),
      } as unknown as DataSource,
      managerQuery,
    };
  }

  it('exposes only process and build identity from liveness', () => {
    const transaction = jest.fn();
    const query = jest.fn();
    expect(
      controller({ query, transaction } as unknown as DataSource).health(),
    ).toMatchObject({
      status: 'ok',
      service: 'blujet-ops-admin-projection',
    });
    expect(transaction).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it('is ready only when PostgreSQL and the consumer are ready', async () => {
    const { dataSource, managerQuery } = readyDataSource();

    await expect(controller(dataSource).ready()).resolves.toEqual({
      status: 'ok',
      service: 'blujet-ops-admin-projection',
      info: {
        database: { status: 'up' },
        consumer: {
          status: 'up',
          state: 'running',
          checkpoint: {
            partitions: 2,
            maxObservedLag: '4',
            lastCheckpointAt: '2026-09-14T08:00:00.000Z',
          },
        },
        quarantine: { status: 'disabled' },
      },
    });
    expect(managerQuery.mock.calls.map(([sql]) => sql)).toEqual([
      'SELECT id, "taskVersion" FROM ops.cartable_tasks LIMIT 0',
      'SELECT "eventId" FROM ops.cartable_projection_event_receipts LIMIT 0',
      'SELECT "consumerGroup", topic, "partition", "nextOffset", "highWatermark", "updatedAt" FROM ops.kafka_consumer_checkpoints LIMIT 0',
      'SELECT id, status FROM ops.kafka_processing_failures LIMIT 0',
    ]);
    expect(dlq.countQuarantined).not.toHaveBeenCalled();
  });

  it('reports the quarantine count when DLQ processing is enabled', async () => {
    const { dataSource } = readyDataSource();

    await expect(
      controller(dataSource, {
        enabled: true,
        maxAttempts: 3,
        operatorToken: 'x'.repeat(32),
      }).ready(),
    ).resolves.toMatchObject({
      info: { quarantine: { status: 'up', count: 2 } },
    });
    expect(dlq.countQuarantined).toHaveBeenCalledTimes(1);
  });

  it('fails readiness safely when the quarantine registry is unavailable', async () => {
    dlq.countQuarantined.mockRejectedValueOnce(
      new Error('secret database detail'),
    );
    const { dataSource } = readyDataSource();

    await expect(
      controller(dataSource, {
        enabled: true,
        maxAttempts: 3,
        operatorToken: 'x'.repeat(32),
      }).ready(),
    ).rejects.toMatchObject({
      response: {
        status: 'error',
        service: 'blujet-ops-admin-projection',
        error: {
          database: { status: 'up' },
          consumer: { status: 'up', state: 'running' },
          quarantine: { status: 'down' },
        },
      },
    });
  });

  it('returns safe 503 semantics when PostgreSQL is unavailable', async () => {
    const transaction = jest.fn();
    const dataSource = {
      query: jest.fn().mockRejectedValue(new Error('secret database detail')),
      transaction,
    } as unknown as DataSource;

    await expect(controller(dataSource).ready()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(runtime.getStatus).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it('fails readiness before relation or runtime checks for an invalid role', async () => {
    const transaction = jest.fn();
    const dataSource = {
      query: jest
        .fn()
        .mockResolvedValue([{ ...validAttestation, leastPrivilege: false }]),
      transaction,
    } as unknown as DataSource;

    await expect(controller(dataSource).ready()).rejects.toMatchObject({
      response: {
        status: 'error',
        service: 'blujet-ops-admin-projection',
        error: { database: { status: 'down' } },
      },
    });
    expect(transaction).not.toHaveBeenCalled();
    expect(runtime.getStatus).not.toHaveBeenCalled();
  });

  it('returns only the lifecycle state when the consumer is unavailable', async () => {
    runtime.isReady.mockReturnValueOnce(false);
    runtime.getStatus.mockReturnValueOnce({ state: 'failed' });
    const { dataSource } = readyDataSource();

    await expect(controller(dataSource).ready()).rejects.toMatchObject({
      response: {
        status: 'error',
        service: 'blujet-ops-admin-projection',
        error: {
          database: { status: 'up' },
          consumer: { status: 'down', state: 'failed' },
          quarantine: { status: 'disabled' },
        },
      },
    });
  });

  it('keeps the sanitized quarantine count visible when the consumer is down', async () => {
    runtime.isReady.mockReturnValueOnce(false);
    runtime.getStatus.mockReturnValueOnce({ state: 'failed' });
    const { dataSource } = readyDataSource();

    await expect(
      controller(dataSource, {
        enabled: true,
        maxAttempts: 3,
        operatorToken: 'x'.repeat(32),
      }).ready(),
    ).rejects.toMatchObject({
      response: {
        error: {
          consumer: { status: 'down', state: 'failed' },
          quarantine: { status: 'up', count: 2 },
        },
      },
    });
  });
});
