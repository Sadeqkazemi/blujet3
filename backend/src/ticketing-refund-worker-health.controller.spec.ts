import { ServiceUnavailableException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { TicketingRefundWorkerHealthController } from './ticketing-refund-worker-health.controller';

describe('TicketingRefundWorkerHealthController', () => {
  it('reports live and restricted read-only readiness', async () => {
    const dataSource = {
      query: jest.fn().mockResolvedValue([
        {
          role: 'blujet_ticketing_refund_reader',
          readOnly: 'on',
          restricted: true,
          noOwnership: true,
          noDdl: true,
        },
      ]),
    } as unknown as DataSource;
    const controller = new TicketingRefundWorkerHealthController(dataSource);
    expect(controller.live()).toEqual({
      status: 'ok',
      service: 'blujet-ticketing-refund',
    });
    await expect(controller.ready()).resolves.toMatchObject({
      status: 'ok',
      service: 'blujet-ticketing-refund',
      info: { database: { readOnly: true } },
    });
  });

  it('fails closed when the database is writable or unavailable', async () => {
    const dataSource = {
      query: jest.fn().mockResolvedValue([
        {
          role: 'blujet_ticketing_refund_reader',
          readOnly: 'off',
          restricted: true,
          noOwnership: true,
          noDdl: true,
        },
      ]),
    } as unknown as DataSource;
    const controller = new TicketingRefundWorkerHealthController(dataSource);
    await expect(controller.ready()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
