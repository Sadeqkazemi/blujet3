import { NotFoundException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { OrderBookingReadService } from './order-booking-read.service';

describe('OrderBookingReadService', () => {
  it('maps a bounded due-Hold observation without mutating state', async () => {
    const query = jest.fn().mockResolvedValue([
      {
        id: 'order-1',
        pnr: 'ABC123',
        channel: 'SYSTEM',
        status: 'HELD',
        currency: 'IRR',
        totalIrr: '2500000',
        holdExpiresAt: '2026-09-09T08:00:00.000Z',
        version: 2,
      },
    ]);
    const service = new OrderBookingReadService({
      query,
    } as unknown as DataSource);

    await expect(
      service.listDueHolds('2026-09-09T09:00:00.000Z', 25),
    ).resolves.toEqual([
      expect.objectContaining({
        id: 'order-1',
        totalIrr: '2500000',
        holdExpiresAt: '2026-09-09T08:00:00.000Z',
      }),
    ]);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("status = 'HELD'"),
      [new Date('2026-09-09T09:00:00.000Z'), 25],
    );
  });

  it('returns segment and lifecycle projections without passenger PII', async () => {
    const dataSource = {
      query: jest
        .fn()
        .mockResolvedValueOnce([
          {
            id: 'order-1',
            pnr: 'ABC123',
            channel: 'SYSTEM',
            status: 'HELD',
            currency: 'IRR',
            sourceOfferId: 'offer-1',
            fareIrr: '2000000',
            taxIrr: '400000',
            extrasIrr: '100000',
            totalIrr: '2500000',
            holdExpiresAt: '2026-09-09T08:15:00.000Z',
            version: 1,
            createdAt: '2026-09-09T08:00:00.000Z',
            updatedAt: '2026-09-09T08:00:00.000Z',
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 'segment-1',
            sequence: 1,
            flightInstanceId: 'flight-1',
            flightNo: 'BJ101',
            originCode: 'IKA',
            destinationCode: 'MHD',
            departureAt: '2026-09-10T08:00:00.000Z',
            arrivalAt: '2026-09-10T09:30:00.000Z',
            cabin: 'ECONOMY',
            fareClassCode: 'Y',
            occupiedSeats: 1,
            travellerCount: 1,
            fareIrr: '2000000',
            taxIrr: '400000',
            extrasIrr: '100000',
            totalIrr: '2500000',
          },
        ])
        .mockResolvedValueOnce([]),
    } as unknown as DataSource;
    const result = await new OrderBookingReadService(dataSource).getOrder(
      'ABC123',
    );

    expect(result).toMatchObject({
      order: { pnr: 'ABC123', totalIrr: '2500000' },
      segments: [{ flightNo: 'BJ101', travellerCount: 1 }],
      lifecycle: [],
    });
    expect(JSON.stringify(result)).not.toMatch(
      /fullName|contactPhone|nationalId|passport|birthDate|mobile/i,
    );
  });

  it('rejects an unknown Order', async () => {
    const dataSource = {
      query: jest.fn().mockResolvedValue([]),
    } as unknown as DataSource;
    await expect(
      new OrderBookingReadService(dataSource).getOrder('MISSING'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
