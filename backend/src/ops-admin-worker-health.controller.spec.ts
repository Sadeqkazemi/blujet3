import { ServiceUnavailableException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { OpsAdminWorkerHealthController } from './ops-admin-worker-health.controller';

describe('OpsAdminWorkerHealthController', () => {
  it('reports live and restricted read-only readiness', async () => {
    const dataSource = {
      query: jest.fn().mockResolvedValue([
        {
          role: 'blujet_ops_admin_reader',
          readOnly: 'on',
          restricted: true,
          noOwnership: true,
          noDdl: true,
        },
      ]),
    } as unknown as DataSource;
    const controller = new OpsAdminWorkerHealthController(dataSource);
    expect(controller.live()).toEqual({
      status: 'ok',
      service: 'blujet-ops-admin',
    });
    await expect(controller.ready()).resolves.toMatchObject({
      status: 'ok',
      info: { database: { readOnly: true } },
    });
  });

  it('fails closed when the database is writable', async () => {
    const dataSource = {
      query: jest.fn().mockResolvedValue([
        {
          role: 'blujet_ops_admin_reader',
          readOnly: 'off',
          restricted: true,
          noOwnership: true,
          noDdl: true,
        },
      ]),
    } as unknown as DataSource;
    const controller = new OpsAdminWorkerHealthController(dataSource);
    await expect(controller.ready()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
