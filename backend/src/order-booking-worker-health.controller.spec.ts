import { ServiceUnavailableException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { OrderBookingWorkerHealthController } from './order-booking-worker-health.controller';

describe('OrderBookingWorkerHealthController', () => {
  it('reports live and restricted read-only readiness', async () => {
    const dataSource = {
      query: jest.fn().mockResolvedValue([
        {
          role: 'blujet_order_booking_reader',
          readOnly: 'on',
          restricted: true,
          noOwnership: true,
          noDdl: true,
        },
      ]),
    } as unknown as DataSource;
    const controller = new OrderBookingWorkerHealthController(dataSource);
    expect(controller.live()).toEqual({
      status: 'ok',
      service: 'blujet-order-booking',
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
          role: 'blujet_order_booking_reader',
          readOnly: 'off',
          restricted: true,
          noOwnership: true,
          noDdl: true,
        },
      ]),
    } as unknown as DataSource;
    const controller = new OrderBookingWorkerHealthController(dataSource);
    await expect(controller.ready()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
