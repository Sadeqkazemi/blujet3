import { ServiceUnavailableException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import type { OpsAdminKafkaRuntime } from './modules/ops-admin/ops-admin-kafka.runtime';
import { OpsAdminProjectionWorkerHealthController } from './ops-admin-projection-worker-health.controller';

describe('OpsAdminProjectionWorkerHealthController', () => {
  const runtime = {
    isReady: jest.fn().mockReturnValue(true),
    getStatus: jest.fn().mockReturnValue({ state: 'running' }),
  };

  beforeEach(() => jest.clearAllMocks());

  function controller(dataSource: DataSource) {
    return new OpsAdminProjectionWorkerHealthController(
      dataSource,
      runtime as unknown as OpsAdminKafkaRuntime,
    );
  }

  it('exposes only process and build identity from liveness', () => {
    const query = jest.fn();
    expect(
      controller({ query } as unknown as DataSource).health(),
    ).toMatchObject({
      status: 'ok',
      service: 'blujet-ops-admin-projection',
    });
    expect(query).not.toHaveBeenCalled();
  });

  it('is ready only when PostgreSQL and the consumer are ready', async () => {
    const dataSource = {
      query: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    } as unknown as DataSource;

    await expect(controller(dataSource).ready()).resolves.toEqual({
      status: 'ok',
      service: 'blujet-ops-admin-projection',
      info: {
        database: { status: 'up' },
        consumer: { status: 'up', state: 'running' },
      },
    });
  });

  it('returns safe 503 semantics when PostgreSQL is unavailable', async () => {
    const dataSource = {
      query: jest.fn().mockRejectedValue(new Error('secret database detail')),
    } as unknown as DataSource;

    await expect(controller(dataSource).ready()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(runtime.getStatus).not.toHaveBeenCalled();
  });

  it('returns only the lifecycle state when the consumer is unavailable', async () => {
    runtime.isReady.mockReturnValueOnce(false);
    runtime.getStatus.mockReturnValueOnce({ state: 'failed' });
    const dataSource = {
      query: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    } as unknown as DataSource;

    await expect(controller(dataSource).ready()).rejects.toMatchObject({
      response: {
        status: 'error',
        service: 'blujet-ops-admin-projection',
        error: {
          database: { status: 'up' },
          consumer: { status: 'down', state: 'failed' },
        },
      },
    });
  });
});
