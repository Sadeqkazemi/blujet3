import { BadRequestException } from '@nestjs/common';
import { FlightsService } from './flights.service';

describe('FlightsService airport catalog', () => {
  function makeService() {
    const airportRepo = {
      findOneBy: jest.fn().mockResolvedValue(null),
      create: jest.fn((value: object) => value),
      save: jest.fn((value: object) =>
        Promise.resolve({ id: 'airport-1', ...value }),
      ),
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const redis = { del: jest.fn().mockResolvedValue(undefined) };
    const service = new FlightsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      airportRepo as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      audit as never,
      {} as never,
      {} as never,
      redis as never,
      {} as never,
      {} as never,
    );
    return { service, airportRepo };
  }

  it('normalizes a manually entered IATA code and city name', async () => {
    const { service, airportRepo } = makeService();

    await expect(
      service.createAirport(
        {
          id: 'commercial-1',
          role: 'COMMERCIAL_MANAGER',
          fullName: 'مدیر بازرگانی',
        } as never,
        {
          cityFa: '  گرگان  ',
          code: ' gbt ',
          airportNameFa: ' فرودگاه گرگان ',
          isInternational: false,
        },
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        cityFa: 'گرگان',
        code: 'GBT',
        airportNameFa: 'فرودگاه گرگان',
        isInternational: false,
      }),
    );
    expect(airportRepo.findOneBy).toHaveBeenCalledWith({ code: 'GBT' });
  });

  it('persists the foreign-airport classification used by public search', async () => {
    const { service, airportRepo } = makeService();

    await service.createAirport(
      {
        id: 'commercial-1',
        role: 'COMMERCIAL_MANAGER',
        fullName: 'مدیر بازرگانی',
      } as never,
      {
        cityFa: 'وان',
        code: 'VAN',
        airportNameFa: 'فرودگاه فرید ملن',
        tz: 'Europe/Istanbul',
        isInternational: true,
      },
    );

    expect(airportRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'VAN', isInternational: true }),
    );
  });

  it('rejects a malformed manually entered airport code inside the service', async () => {
    const { service } = makeService();

    await expect(
      service.createAirport(
        {
          id: 'commercial-1',
          role: 'COMMERCIAL_MANAGER',
          fullName: 'مدیر بازرگانی',
        } as never,
        { cityFa: 'گرگان', code: '12', isInternational: false },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
