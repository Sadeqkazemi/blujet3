import { ANCILLARY_BUILT_IN_SERVICES } from './ancillary-services.catalog';
import { AncillaryServicesService } from './ancillary-services.service';
import { BadRequestException } from '@nestjs/common';

describe('AncillaryServicesService fixed checkout mirrors', () => {
  it('recreates a missing SEAT_SELECTION travel-extra row from the permanent built-in', async () => {
    const builtIns = new Map(
      ANCILLARY_BUILT_IN_SERVICES.map((row) => [
        row.key,
        {
          ...row,
          updatedById: null,
        },
      ]),
    );
    const ancillaryRepo = {
      findOneBy: jest.fn(({ key }: { key: string }) =>
        Promise.resolve(builtIns.get(key) ?? null),
      ),
      save: jest.fn((row: object) => Promise.resolve(row)),
      create: jest.fn((row: object) => row),
    };
    const travelExtraRepo = {
      findOneBy: jest.fn(({ code }: { code: string }) =>
        Promise.resolve(code === 'SEAT_SELECTION' ? null : { code }),
      ),
      create: jest.fn((row: object) => row),
      save: jest.fn((row: object) => Promise.resolve(row)),
    };

    const service = new AncillaryServicesService(
      ancillaryRepo as never,
      travelExtraRepo as never,
      { record: jest.fn() } as never,
    );

    await service.ensureBuiltIns();

    expect(travelExtraRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'SEAT_SELECTION',
        billingUnit: 'PER_PASSENGER',
        priceIrr: 800_000n,
        active: true,
        purchaseEnabled: true,
      }),
    );
    expect(travelExtraRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'SEAT_SELECTION' }),
    );
  });

  it('omits the refund fee from the commercial ancillary-services list', async () => {
    const rows = [
      {
        key: 'refund-fee',
        category: 'OTHER',
        titleFa: 'هزینه استرداد بلیط',
        descriptionFa: 'کسر از مبلغ استرداد طبق قوانین بلیط',
        priceIrr: 500_000n,
        enabled: true,
        isCustom: false,
      },
      {
        key: 'baggage',
        category: 'OTHER',
        titleFa: 'بار اضافه',
        descriptionFa: 'هر ۵ کیلوگرم بار اضافه بر مجاز',
        priceIrr: 2_000_000n,
        enabled: true,
        isCustom: false,
      },
    ];
    const service = new AncillaryServicesService(
      { find: jest.fn().mockResolvedValue(rows) } as never,
      {} as never,
      {} as never,
    );

    await expect(service.listManager()).resolves.toEqual({
      seatServices: [],
      otherServices: [
        expect.objectContaining({ key: 'baggage', titleFa: 'بار اضافه' }),
      ],
    });
  });

  it('prices selected seats from the current commercial seat-type rows', async () => {
    const rows = [
      {
        key: 'seat-normal',
        category: 'SEAT',
        titleFa: 'صندلی عادی',
        priceIrr: 0n,
        enabled: true,
      },
      {
        key: 'seat-legroom',
        category: 'SEAT',
        titleFa: 'فضای پای بیشتر',
        priceIrr: 4_000_000n,
        enabled: true,
      },
      {
        key: 'seat-window-aisle',
        category: 'SEAT',
        titleFa: 'پنجره یا راهرو',
        priceIrr: 2_000_000n,
        enabled: true,
      },
    ];
    const service = new AncillaryServicesService(
      { find: jest.fn().mockResolvedValue(rows) } as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.priceSelectedSeats(['19A', '12A', '12E'], 'MD-80'),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'SEAT_LEGROOM', totalIrr: '4000000' }),
        expect.objectContaining({
          code: 'SEAT_WINDOW_AISLE',
          totalIrr: '2000000',
        }),
        expect.objectContaining({ code: 'SEAT_NORMAL', totalIrr: '0' }),
      ]),
    );
  });

  it('rejects a selected seat when its commercial seat type is disabled', async () => {
    const service = new AncillaryServicesService(
      {
        find: jest.fn().mockResolvedValue([
          {
            key: 'seat-legroom',
            category: 'SEAT',
            titleFa: 'فضای پای بیشتر',
            priceIrr: 4_000_000n,
            enabled: false,
          },
        ]),
      } as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.priceSelectedSeats(['19A'], 'MD-80'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
