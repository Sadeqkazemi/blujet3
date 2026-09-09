import { NotFoundException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { InventoryReadService } from './inventory-read.service';

describe('InventoryReadService', () => {
  it('returns a bounded, non-negative availability projection without PII', async () => {
    const query = jest.fn().mockResolvedValue([
      {
        flightInstanceId: 'flight-1',
        departureAt: new Date('2026-09-09T08:00:00.000Z'),
        arrivalAt: new Date('2026-09-09T10:00:00.000Z'),
        capacity: 10,
        charterSeats: 1,
        agencySeatsAllocated: 2,
        status: 'SCHEDULED',
        version: 3,
        soldSeats: 8,
        heldSeats: 2,
        activeSeatLocks: 1,
      },
    ]);
    const service = new InventoryReadService({
      query,
    } as unknown as DataSource);

    const result = await service.getAvailability('flight-1');

    expect(result).toMatchObject({
      flightInstanceId: 'flight-1',
      capacity: 10,
      soldSeats: 8,
      heldSeats: 2,
      activeSeatLocks: 1,
      availableSeats: 0,
    });
    expect(result).not.toHaveProperty('passengerNationalId');
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('core_itinerary_segments'),
      ['flight-1', expect.any(Date)],
    );
  });

  it('rejects an unknown flight instance', async () => {
    const service = new InventoryReadService({
      query: jest.fn().mockResolvedValue([]),
    } as unknown as DataSource);
    await expect(service.getAvailability('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
