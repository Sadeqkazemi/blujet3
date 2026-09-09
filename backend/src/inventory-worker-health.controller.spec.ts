import { ServiceUnavailableException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { InventoryWorkerHealthController } from './inventory-worker-health.controller';

describe('InventoryWorkerHealthController', () => {
  it('reports live without database access', () => {
    const controller = new InventoryWorkerHealthController({} as DataSource);
    expect(controller.live()).toEqual({
      status: 'ok',
      service: 'blujet-inventory',
    });
  });

  it('fails readiness when the reader contract is not proven', async () => {
    const controller = new InventoryWorkerHealthController({
      query: jest.fn().mockResolvedValue([
        {
          role: 'blujet_inventory_reader',
          readOnly: 'off',
          restricted: true,
          noOwnership: true,
          noDdl: true,
        },
      ]),
    } as unknown as DataSource);
    await expect(controller.ready()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
