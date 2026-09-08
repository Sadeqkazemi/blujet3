import { ServiceUnavailableException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import type { ReportingKafkaRuntime } from './modules/reporting/reporting-kafka.runtime';
import { ReportingWorkerHealthController } from './reporting-worker-health.controller';

describe('ReportingWorkerHealthController', () => {
  const runtime = {
    isReady: jest.fn().mockReturnValue(true),
    getStatus: jest.fn().mockReturnValue({ state: 'running' }),
  };

  beforeEach(() => jest.clearAllMocks());

  it('exposes only build identity from liveness', () => {
    const query = jest.fn();
    const dataSource = { query } as unknown as DataSource;
    const controller = new ReportingWorkerHealthController(
      dataSource,
      runtime as unknown as ReportingKafkaRuntime,
    );

    expect(controller.health()).toMatchObject({
      status: 'ok',
      service: 'blujet-reporting',
    });
    expect(query).not.toHaveBeenCalled();
  });

  it('is ready only when PostgreSQL and the consumer are ready', async () => {
    const dataSource = {
      query: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    } as unknown as DataSource;
    const controller = new ReportingWorkerHealthController(
      dataSource,
      runtime as unknown as ReportingKafkaRuntime,
    );

    await expect(controller.ready()).resolves.toEqual({
      status: 'ok',
      service: 'blujet-reporting',
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
    const controller = new ReportingWorkerHealthController(
      dataSource,
      runtime as unknown as ReportingKafkaRuntime,
    );

    await expect(controller.ready()).rejects.toBeInstanceOf(
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
    const controller = new ReportingWorkerHealthController(
      dataSource,
      runtime as unknown as ReportingKafkaRuntime,
    );

    await expect(controller.ready()).rejects.toMatchObject({
      response: {
        status: 'error',
        service: 'blujet-reporting',
        error: {
          database: { status: 'up' },
          consumer: { status: 'down', state: 'failed' },
        },
      },
    });
  });
});
