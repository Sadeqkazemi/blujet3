import { ServiceUnavailableException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { PaymentReconciliationWorkerHealthController } from './payment-reconciliation-worker-health.controller';

describe('PaymentReconciliationWorkerHealthController', () => {
  it('reports live and restricted read-only readiness', async () => {
    const dataSource = {
      query: jest.fn().mockResolvedValue([
        {
          role: 'blujet_payment_reconciliation_reader',
          readOnly: 'on',
          restricted: true,
          noOwnership: true,
          noDdl: true,
        },
      ]),
    } as unknown as DataSource;
    const controller = new PaymentReconciliationWorkerHealthController(
      dataSource,
    );
    expect(controller.live()).toEqual({
      status: 'ok',
      service: 'blujet-payment-reconciliation',
    });
    await expect(controller.ready()).resolves.toMatchObject({
      status: 'ok',
      service: 'blujet-payment-reconciliation',
      info: { database: { readOnly: true } },
    });
  });

  it('fails closed when the database is writable', async () => {
    const dataSource = {
      query: jest.fn().mockResolvedValue([
        {
          role: 'blujet_payment_reconciliation_reader',
          readOnly: 'off',
          restricted: true,
          noOwnership: true,
          noDdl: true,
        },
      ]),
    } as unknown as DataSource;
    const controller = new PaymentReconciliationWorkerHealthController(
      dataSource,
    );
    await expect(controller.ready()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
