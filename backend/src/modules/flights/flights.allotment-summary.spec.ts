import { FlightsService } from './flights.service';

describe('FlightsService allotmentSummary', () => {
  it('uses reservation seat occupants and active agency allotments to calculate free capacity', async () => {
    const instanceRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'fi-1',
        capacity: 180,
        charterSeats: 20,
      }),
    };
    const passengerCountQuery = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(10),
    };
    const passengerRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(passengerCountQuery),
    };

    const service = new FlightsService(
      {} as never,
      instanceRepo as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      passengerRepo as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    jest.spyOn(service, 'listAllotments').mockResolvedValue([
      {
        id: 'allot-1',
        agencyId: 'agency-1',
        agencyName: 'Agency One',
        seatsAllocated: 30,
        type: 'HARD',
        releaseAt: null,
        contractPriceIrr: 15_000_000n,
        createdAt: new Date('2026-08-11T00:00:00.000Z'),
        active: true,
      },
      {
        id: 'allot-expired',
        agencyId: 'agency-2',
        agencyName: 'Agency Two',
        seatsAllocated: 50,
        type: 'SOFT',
        releaseAt: new Date('2026-08-10T00:00:00.000Z'),
        contractPriceIrr: 10_000_000n,
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
        active: false,
      },
    ]);

    await expect(service.allotmentSummary('fi-1')).resolves.toEqual({
      flightInstanceId: 'fi-1',
      totalCapacity: 180,
      charterSeats: 20,
      directReserved: 10,
      agencySeats: 30,
      freeSeats: 120,
      agencyRevenueIrr: '450000000',
      agencies: [
        expect.objectContaining({
          id: 'allot-1',
          contractPriceIrr: '15000000',
          revenueIrr: '450000000',
        }),
      ],
    });
    expect(passengerCountQuery.andWhere).toHaveBeenCalledWith(
      'passenger.occupiesSeat = true',
    );
  });
});
