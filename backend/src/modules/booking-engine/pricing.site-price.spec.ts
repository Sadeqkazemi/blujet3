import type { EntityManager } from 'typeorm';
import type { FareRule } from '../../database/entities/fare-rule.entity';
import { resolveFareClass } from './pricing';

function managerFor(
  rules: Partial<FareRule>[],
  usageRows: { fareClassCode: string; channel: string; count: string }[] = [],
): EntityManager {
  const usageQuery = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    addGroupBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue(usageRows),
  };
  return {
    find: jest.fn().mockResolvedValue(rules),
    createQueryBuilder: jest.fn().mockReturnValue(usageQuery),
  } as unknown as EntityManager;
}

describe('fare-class channel pricing', () => {
  const common = {
    flightInstanceId: 'flight-1',
    cabin: 'ECONOMY' as const,
    seatsAllocated: 20,
    siteSeatsReleased: 20,
    agencySeatsReleased: 0,
    agencyReleasePriceIrr: null,
    taxIrr: 0n,
    validFrom: null,
    validUntil: null,
    allowedChannels: [],
  };

  it('sorts and prices public-site sales with the independent site price', async () => {
    const manager = managerFor([
      {
        ...common,
        classCode: 'Y',
        priceIrr: 5_000_000n,
        sitePriceIrr: 7_000_000n,
      },
      {
        ...common,
        classCode: 'B',
        priceIrr: 6_000_000n,
        sitePriceIrr: 4_000_000n,
      },
    ]);

    await expect(
      resolveFareClass(manager, 'flight-1', 'ECONOMY', 'SYSTEM'),
    ).resolves.toEqual({
      classCode: 'B',
      priceIrr: 4_000_000n,
      taxIrr: 0n,
    });
  });

  it('uses the independent agency pool and agency price', async () => {
    const manager = managerFor([
      {
        ...common,
        classCode: 'Y',
        priceIrr: 5_000_000n,
        sitePriceIrr: 7_000_000n,
        agencySeatsReleased: 4,
        agencyReleasePriceIrr: 5_500_000n,
      },
      {
        ...common,
        classCode: 'B',
        priceIrr: 6_000_000n,
        sitePriceIrr: 4_000_000n,
        agencySeatsReleased: 10,
        agencyReleasePriceIrr: 6_500_000n,
      },
    ]);

    await expect(
      resolveFareClass(manager, 'flight-1', 'ECONOMY', 'AGENCY'),
    ).resolves.toEqual({
      classCode: 'Y',
      priceIrr: 5_500_000n,
      taxIrr: 0n,
    });
  });

  it('skips an exhausted site bucket without consuming the agency pool', async () => {
    const manager = managerFor(
      [
        {
          ...common,
          classCode: 'Y',
          priceIrr: 5_000_000n,
          sitePriceIrr: 4_000_000n,
          siteSeatsReleased: 2,
          agencySeatsReleased: 8,
          agencyReleasePriceIrr: 3_500_000n,
        },
        {
          ...common,
          classCode: 'B',
          priceIrr: 6_000_000n,
          sitePriceIrr: 6_500_000n,
          siteSeatsReleased: 6,
          agencySeatsReleased: 0,
        },
      ],
      [{ fareClassCode: 'Y', channel: 'SYSTEM', count: '2' }],
    );

    await expect(
      resolveFareClass(manager, 'flight-1', 'ECONOMY', 'SYSTEM'),
    ).resolves.toEqual({
      classCode: 'B',
      priceIrr: 6_500_000n,
      taxIrr: 0n,
    });

    await expect(
      resolveFareClass(manager, 'flight-1', 'ECONOMY', 'AGENCY'),
    ).resolves.toEqual({
      classCode: 'Y',
      priceIrr: 3_500_000n,
      taxIrr: 0n,
    });
  });

  it('reduces both channels from the same reservation inventory', async () => {
    const manager = managerFor(
      [
        {
          ...common,
          classCode: 'Y',
          priceIrr: 5_000_000n,
          sitePriceIrr: 5_000_000n,
          siteSeatsReleased: 20,
          agencySeatsReleased: 20,
          agencyReleasePriceIrr: 4_500_000n,
        },
      ],
      [{ fareClassCode: 'Y', channel: 'SYSTEM', count: '20' }],
    );

    await expect(
      resolveFareClass(manager, 'flight-1', 'ECONOMY', 'SYSTEM'),
    ).resolves.toBeNull();
    await expect(
      resolveFareClass(manager, 'flight-1', 'ECONOMY', 'AGENCY'),
    ).resolves.toBeNull();
  });

  it('excludes only the current HELD booking while re-pricing the last bucket seat', async () => {
    const manager = managerFor(
      [
        {
          ...common,
          classCode: 'Y',
          priceIrr: 5_000_000n,
          sitePriceIrr: 5_000_000n,
          siteSeatsReleased: 20,
        },
      ],
      // The database result after applying b.id != current-booking.
      [{ fareClassCode: 'Y', channel: 'SYSTEM', count: '19' }],
    );

    await expect(
      resolveFareClass(
        manager,
        'flight-1',
        'ECONOMY',
        'SYSTEM',
        'current-booking',
      ),
    ).resolves.toMatchObject({ classCode: 'Y', priceIrr: 5_000_000n });

    const usageQuery = (manager.createQueryBuilder as jest.Mock).mock.results[0]
      .value as { andWhere: jest.Mock };
    expect(usageQuery.andWhere).toHaveBeenCalledWith(
      'b.id != :excludeBookingId',
      { excludeBookingId: 'current-booking' },
    );
  });
});
