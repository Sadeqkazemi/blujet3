import { SearchService } from './search.service';
import { SearchController } from './search.controller';

describe('SearchService airports', () => {
  it('queries only active non-test airports before caching the public catalog', async () => {
    const airports = [{ code: 'THR', cityFa: 'تهران', active: true }];
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(airports),
    };
    const airportRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    };
    const redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    };
    const service = new SearchService(
      airportRepo as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      redis as never,
    );

    await expect(service.airports()).resolves.toEqual(airports);
    expect(qb.where).toHaveBeenCalledWith('airport.active = true');
    expect(qb.andWhere).toHaveBeenCalledWith(
      'trim(airport.cityFa) !~ :testCityPattern',
      { testCityPattern: '^شهر[[:space:]]*(تست|آزمایش)' },
    );
    expect(redis.set).toHaveBeenCalledWith('search:airports:v5', airports, 600);
  });
});

describe('SearchController flight cabin contract', () => {
  it('forwards the requested cabin to the availability engine', async () => {
    const search = {
      search: jest.fn().mockResolvedValue([]),
    };
    const controller = new SearchController(search as never, {} as never);

    await controller.flights({
      origin: 'THR',
      dest: 'MHD',
      date: '2026-08-28',
      cabin: 'FIRST',
    });

    expect(search.search).toHaveBeenCalledWith(
      'THR',
      'MHD',
      '2026-08-28',
      'FIRST',
    );
  });
});
