import { ServiceUnavailableException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { HealthController } from './health.controller';

describe('PSS HealthController', () => {
  const originalCommit = process.env.GIT_COMMIT_SHA;
  const originalVersion = process.env.SERVICE_VERSION;

  afterEach(() => {
    if (originalCommit === undefined) delete process.env.GIT_COMMIT_SHA;
    else process.env.GIT_COMMIT_SHA = originalCommit;
    if (originalVersion === undefined) delete process.env.SERVICE_VERSION;
    else process.env.SERVICE_VERSION = originalVersion;
  });

  it('reports the exact service build identity when ready', async () => {
    process.env.GIT_COMMIT_SHA = '0123456789abcdef0123456789abcdef01234567';
    process.env.SERVICE_VERSION = '0.1.0';
    const dataSource = {
      query: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    } as unknown as DataSource;

    await expect(new HealthController(dataSource).check()).resolves.toEqual({
      status: 'ok',
      service: 'blujet-pss',
      database: 'up',
      version: '0.1.0',
      commit: '0123456789abcdef0123456789abcdef01234567',
    });
  });

  it('fails closed when its database is unavailable', async () => {
    const dataSource = {
      query: jest.fn().mockRejectedValue(new Error('database unavailable')),
    } as unknown as DataSource;

    await expect(
      new HealthController(dataSource).check(),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
