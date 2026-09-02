import { FlightsService } from './flights.service';

describe('FlightsService createAllotment physical capacity', () => {
  it('rejects a manual agency lock when online reservations plus allotments exceed the flight capacity', async () => {
    const allotmentQuery = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([{ seatsAllocated: 30 }]),
    };
    const passengerQuery = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(140),
    };
    const instanceQuery = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({
        id: 'fi-1',
        capacity: 180,
        charterSeats: 0,
        status: 'SCHEDULED',
      }),
    };
    const manager = {
      createQueryBuilder: jest.fn().mockReturnValue(instanceQuery),
      getRepository: jest.fn((entity: { name?: string }) => ({
        createQueryBuilder: jest
          .fn()
          .mockReturnValue(
            entity.name === 'Passenger' ? passengerQuery : allotmentQuery,
          ),
      })),
      create: jest.fn(),
      save: jest.fn(),
    };
    const dataSource = {
      transaction: jest.fn((run: (tx: typeof manager) => unknown) =>
        run(manager),
      ),
    };
    const agencyProfileRepo = {
      findOneBy: jest.fn().mockResolvedValue({ userId: 'agency-1' }),
    };
    const audit = { record: jest.fn() };
    const empty = {} as never;
    const service = new FlightsService(
      dataSource as never,
      empty,
      empty,
      empty,
      empty,
      empty,
      empty,
      empty,
      empty,
      agencyProfileRepo as never,
      empty,
      empty,
      empty,
      empty,
      empty,
      empty,
      empty,
      audit as never,
      empty,
      empty,
      empty,
      empty,
      empty,
    );

    await expect(
      service.createAllotment(
        {
          id: 'manager-1',
          role: 'COMMERCIAL_MANAGER',
          fullName: 'Manager',
        } as never,
        'fi-1',
        { agencyId: 'agency-1', seatsAllocated: 12, type: 'HARD' },
      ),
    ).rejects.toThrow('فقط 10 صندلی');
    expect(manager.save).not.toHaveBeenCalled();
  });
});
