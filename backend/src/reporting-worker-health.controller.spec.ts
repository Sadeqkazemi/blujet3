import { ServiceUnavailableException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import type { ReportingKafkaRuntime } from './modules/reporting/reporting-kafka.runtime';
import type { ReportingDlqStore } from './modules/reporting/reporting-dlq.store';
import { ReportingWorkerHealthController } from './reporting-worker-health.controller';

describe('ReportingWorkerHealthController', () => {
  const runtime = {
    isReady: jest.fn().mockReturnValue(true),
    getStatus: jest.fn().mockReturnValue({ state: 'running' }),
  };
  const dlq = {
    countQuarantined: jest.fn().mockResolvedValue(0),
  };

  beforeEach(() => jest.clearAllMocks());

  it('exposes only build identity from liveness', () => {
    const query = jest.fn();
    const dataSource = { query } as unknown as DataSource;
    const controller = new ReportingWorkerHealthController(
      dataSource,
      runtime as unknown as ReportingKafkaRuntime,
      dlq as unknown as ReportingDlqStore,
      { enabled: false },
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
      dlq as unknown as ReportingDlqStore,
      { enabled: false },
    );

    await expect(controller.ready()).resolves.toEqual({
      status: 'ok',
      service: 'blujet-reporting',
      info: {
        database: { status: 'up' },
        consumer: { status: 'up', state: 'running' },
        quarantine: { status: 'disabled' },
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
      dlq as unknown as ReportingDlqStore,
      { enabled: false },
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
      dlq as unknown as ReportingDlqStore,
      { enabled: false },
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

  it('reports the bounded quarantine count only when the feature is enabled', async () => {
    dlq.countQuarantined.mockResolvedValueOnce(2);
    const dataSource = {
      query: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    } as unknown as DataSource;
    const controller = new ReportingWorkerHealthController(
      dataSource,
      runtime as unknown as ReportingKafkaRuntime,
      dlq as unknown as ReportingDlqStore,
      {
        enabled: true,
        maxAttempts: 3,
        operatorToken: 'reporting-operator-token-at-least-32-characters',
      },
    );

    await expect(controller.ready()).resolves.toMatchObject({
      info: { quarantine: { status: 'up', count: 2 } },
    });
  });
});
