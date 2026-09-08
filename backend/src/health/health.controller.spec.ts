import { ServiceUnavailableException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import type { ReportingKafkaRuntime } from '../modules/reporting/reporting-kafka.runtime';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  const originalCommit = process.env.GIT_COMMIT_SHA;
  const originalVersion = process.env.SERVICE_VERSION;

  const reportingRuntime = {
    getStatus: jest.fn().mockReturnValue({
      enabled: false,
      state: 'disabled',
      processingFailures: 0,
      lastProcessingFailureAt: null,
      lastMessageAt: null,
      lastProcessedAt: null,
      checkpointPartitions: 0,
      maxObservedLag: null,
      lastCheckpointAt: null,
    }),
    isReady: jest.fn().mockReturnValue(true),
  };

  afterEach(() => {
    if (originalCommit === undefined) delete process.env.GIT_COMMIT_SHA;
    else process.env.GIT_COMMIT_SHA = originalCommit;
    if (originalVersion === undefined) delete process.env.SERVICE_VERSION;
    else process.env.SERVICE_VERSION = originalVersion;
  });

  it('reports database and build metadata when PostgreSQL is reachable', async () => {
    process.env.GIT_COMMIT_SHA = '0123456789abcdef0123456789abcdef01234567';
    process.env.SERVICE_VERSION = '1.2.3';
    const dataSource = {
      query: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    } as unknown as DataSource;
    const controller = new HealthController(
      dataSource,
      reportingRuntime as unknown as ReportingKafkaRuntime,
    );

    await expect(controller.check()).resolves.toMatchObject({
      status: 'ok',
      service: 'blujet-backend',
      info: {
        database: { status: 'up' },
        build: {
          status: 'up',
          version: '1.2.3',
          commit: '0123456789abcdef0123456789abcdef01234567',
        },
      },
    });
  });

  it('fails with HTTP 503 semantics when PostgreSQL is unreachable', async () => {
    const dataSource = {
      query: jest.fn().mockRejectedValue(new Error('database unavailable')),
    } as unknown as DataSource;
    const controller = new HealthController(
      dataSource,
      reportingRuntime as unknown as ReportingKafkaRuntime,
    );

    await expect(controller.check()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('reports ready when the optional Reporting runtime is disabled', async () => {
    const dataSource = {
      query: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    } as unknown as DataSource;
    const controller = new HealthController(
      dataSource,
      reportingRuntime as unknown as ReportingKafkaRuntime,
    );

    await expect(controller.ready()).resolves.toMatchObject({
      status: 'ok',
      info: {
        database: { status: 'up' },
        reporting: { status: 'up', enabled: false, state: 'disabled' },
      },
    });
  });

  it('returns 503 readiness when enabled Reporting runtime is not running', async () => {
    reportingRuntime.getStatus.mockReturnValueOnce({
      enabled: true,
      state: 'failed',
      processingFailures: 2,
      lastProcessingFailureAt: '2026-09-07T00:00:00.000Z',
      lastMessageAt: '2026-09-07T00:00:01.000Z',
      lastProcessedAt: null,
    });
    reportingRuntime.isReady.mockReturnValueOnce(false);
    const dataSource = {
      query: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    } as unknown as DataSource;
    const controller = new HealthController(
      dataSource,
      reportingRuntime as unknown as ReportingKafkaRuntime,
    );

    await expect(controller.ready()).rejects.toMatchObject({
      response: {
        status: 'error',
        error: {
          database: { status: 'up' },
          reporting: {
            status: 'down',
            state: 'failed',
            processingFailures: 2,
          },
        },
      },
    });
  });
});
