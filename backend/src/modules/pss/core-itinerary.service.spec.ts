import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { Repository, SelectQueryBuilder } from 'typeorm';
import { Airport } from '../../database/entities/airport.entity';
import { FareRule } from '../../database/entities/fare-rule.entity';
import { FlightInstance } from '../../database/entities/flight-instance.entity';
import { Passenger } from '../../database/entities/passenger.entity';
import { CoreItinerarySegment } from '../../database/entities/core-itinerary-segment.entity';
import { SearchService } from '../booking-engine/search.service';
import { CoreItineraryService } from './core-itinerary.service';
import type { ResolveCoreItineraryDto } from './dto/resolve-core-itinerary.dto';

const FIRST_ID = '11111111-1111-4111-8111-111111111111';
const SECOND_ID = '22222222-2222-4222-8222-222222222222';

function instance(
  id: string,
  originCode: string,
  destinationCode: string,
  departureAt: string,
  arrivalAt: string,
  overrides: Partial<FlightInstance> = {},
): FlightInstance {
  return {
    id,
    status: 'SCHEDULED',
    definitionStatus: 'PUBLISHED',
    approvedSnapshot: null,
    departureAt: new Date(departureAt),
    arrivalAt: new Date(arrivalAt),
    saleStartsAt: null,
    saleEndsAt: null,
    publicSaleEnabled: true,
    agencySaleEnabled: true,
    commercialPanelSettings: null,
    flight: {
      flightNo: `BJ-${id.slice(0, 4)}`,
      route: { originCode, destCode: destinationCode },
    },
    ...overrides,
  } as FlightInstance;
}

function fareRule(
  flightInstanceId: string,
  overrides: Partial<FareRule> = {},
): FareRule {
  return {
    flightInstanceId,
    cabin: 'ECONOMY',
    classCode: 'Y',
    priceIrr: 10_000_000n,
    sitePriceIrr: 10_000_000n,
    agencyReleasePriceIrr: 9_000_000n,
    seatsAllocated: 4,
    siteSeatsReleased: 3,
    agencySeatsReleased: 2,
    allowedChannels: [],
    validFrom: null,
    validUntil: null,
    ...overrides,
  } as FareRule;
}

describe('CoreItineraryService', () => {
  const flightGetMany = jest.fn<Promise<FlightInstance[]>, []>();
  const usageGetRawMany = jest.fn<Promise<unknown[]>, []>();
  const itineraryUsageGetRawMany = jest.fn<Promise<unknown[]>, []>();
  const flightQuery = chainQuery<FlightInstance>(flightGetMany);
  const usageQuery = chainQuery<Passenger>(usageGetRawMany);
  const itineraryUsageQuery = chainQuery<CoreItinerarySegment>(
    itineraryUsageGetRawMany,
  );
  const fareFind = jest.fn();
  const airportFind = jest.fn();
  const cabinAvailability = jest.fn();
  const service = new CoreItineraryService(
    {
      createQueryBuilder: jest.fn(() => flightQuery),
    } as unknown as Repository<FlightInstance>,
    { find: fareFind } as unknown as Repository<FareRule>,
    {
      createQueryBuilder: jest.fn(() => usageQuery),
    } as unknown as Repository<Passenger>,
    { cabinAvailability } as unknown as SearchService,
    { find: airportFind } as unknown as Repository<Airport>,
    {
      createQueryBuilder: jest.fn(() => itineraryUsageQuery),
    } as unknown as Repository<CoreItinerarySegment>,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    usageGetRawMany.mockResolvedValue([]);
    itineraryUsageGetRawMany.mockResolvedValue([]);
    fareFind.mockResolvedValue([]);
    airportFind.mockResolvedValue([{ code: 'DXB', minConnectMin: 60 }]);
    cabinAvailability.mockResolvedValue({ capacity: 4, seatsLeft: 4 });
  });

  it('orders and resolves a connected itinerary with current fare availability', async () => {
    flightGetMany.mockResolvedValue([
      instance(
        FIRST_ID,
        'IKA',
        'DXB',
        '2099-10-01T08:00:00.000Z',
        '2099-10-01T10:00:00.000Z',
      ),
      instance(
        SECOND_ID,
        'DXB',
        'IST',
        '2099-10-01T12:00:00.000Z',
        '2099-10-01T16:00:00.000Z',
      ),
    ]);
    fareFind.mockResolvedValue([fareRule(FIRST_ID), fareRule(SECOND_ID)]);

    const result = await service.resolve({
      channel: 'SYSTEM',
      segments: [
        {
          flightInstanceId: SECOND_ID,
          sequence: 2,
          cabin: 'ECONOMY',
        },
        {
          flightInstanceId: FIRST_ID,
          sequence: 1,
          cabin: 'ECONOMY',
        },
      ],
    });

    expect(result.segments.map((segment) => segment.flightInstanceId)).toEqual([
      FIRST_ID,
      SECOND_ID,
    ]);
    expect(result.segments[0]).toMatchObject({
      originCode: 'IKA',
      destinationCode: 'DXB',
      fareClassCode: 'Y',
      availableSeats: 3,
    });
  });

  it('rejects a non-contiguous sequence before reading inventory', async () => {
    const promise = service.resolve({
      channel: 'SYSTEM',
      segments: [{ flightInstanceId: FIRST_ID, sequence: 2, cabin: 'ECONOMY' }],
    });

    await expect(promise).rejects.toMatchObject({
      response: { code: 'VALIDATION_FAILED' },
    });
    expect(flightGetMany).not.toHaveBeenCalled();
  });

  it('hides an unpublished flight as not found', async () => {
    flightGetMany.mockResolvedValue([
      instance(
        FIRST_ID,
        'IKA',
        'DXB',
        '2099-10-01T08:00:00.000Z',
        '2099-10-01T10:00:00.000Z',
        { definitionStatus: 'DRAFT' },
      ),
    ]);

    await expect(service.resolve(singleSegment())).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects a discontinuous route', async () => {
    flightGetMany.mockResolvedValue([
      instance(
        FIRST_ID,
        'IKA',
        'DXB',
        '2099-10-01T08:00:00.000Z',
        '2099-10-01T10:00:00.000Z',
      ),
      instance(
        SECOND_ID,
        'DOH',
        'IST',
        '2099-10-01T12:00:00.000Z',
        '2099-10-01T16:00:00.000Z',
      ),
    ]);

    await expect(
      service.resolve({
        channel: 'SYSTEM',
        segments: [
          { flightInstanceId: FIRST_ID, sequence: 1, cabin: 'ECONOMY' },
          { flightInstanceId: SECOND_ID, sequence: 2, cabin: 'ECONOMY' },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a next departure that is not after the previous arrival', async () => {
    flightGetMany.mockResolvedValue([
      instance(
        FIRST_ID,
        'IKA',
        'DXB',
        '2099-10-01T08:00:00.000Z',
        '2099-10-01T10:00:00.000Z',
      ),
      instance(
        SECOND_ID,
        'DXB',
        'IST',
        '2099-10-01T09:00:00.000Z',
        '2099-10-01T12:00:00.000Z',
      ),
    ]);

    await expect(
      service.resolve({
        channel: 'SYSTEM',
        segments: [
          { flightInstanceId: FIRST_ID, sequence: 1, cabin: 'ECONOMY' },
          { flightInstanceId: SECOND_ID, sequence: 2, cabin: 'ECONOMY' },
        ],
      }),
    ).rejects.toMatchObject({
      response: { code: 'VALIDATION_FAILED' },
    });
  });

  it('rejects a requested fare class whose channel quota is consumed', async () => {
    flightGetMany.mockResolvedValue([
      instance(
        FIRST_ID,
        'IKA',
        'DXB',
        '2099-10-01T08:00:00.000Z',
        '2099-10-01T10:00:00.000Z',
      ),
    ]);
    fareFind.mockResolvedValue([fareRule(FIRST_ID, { siteSeatsReleased: 2 })]);
    usageGetRawMany.mockResolvedValue([
      {
        flightInstanceId: FIRST_ID,
        cabin: 'ECONOMY',
        fareClassCode: 'Y',
        channel: 'SYSTEM',
        usedSeats: '2',
      },
    ]);

    await expect(
      service.resolve({
        channel: 'SYSTEM',
        segments: [
          {
            flightInstanceId: FIRST_ID,
            sequence: 1,
            cabin: 'ECONOMY',
            fareClassCode: 'Y',
          },
        ],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('requires one fare bucket to fit the whole requested party', async () => {
    flightGetMany.mockResolvedValue([
      instance(
        FIRST_ID,
        'IKA',
        'DXB',
        '2099-10-01T08:00:00.000Z',
        '2099-10-01T10:00:00.000Z',
      ),
    ]);
    fareFind.mockResolvedValue([fareRule(FIRST_ID, { siteSeatsReleased: 3 })]);

    await expect(service.resolve(singleSegment(), 4)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  describe('connection time', () => {
    function connectedRequest(): ResolveCoreItineraryDto {
      return {
        channel: 'SYSTEM',
        segments: [
          { flightInstanceId: FIRST_ID, sequence: 1, cabin: 'ECONOMY' },
          { flightInstanceId: SECOND_ID, sequence: 2, cabin: 'ECONOMY' },
        ],
      };
    }

    beforeEach(() => {
      flightGetMany.mockResolvedValue([
        instance(
          FIRST_ID,
          'IKA',
          'DXB',
          '2099-10-01T08:00:00Z',
          '2099-10-01T10:00:00Z',
        ),
        instance(
          SECOND_ID,
          'DXB',
          'IST',
          '2099-10-01T11:00:00Z',
          '2099-10-01T14:00:00Z',
        ),
      ]);
    });

    it('accepts exactly the persisted minimum', async () => {
      const result = await service.resolve(connectedRequest());
      expect(result.segments).toHaveLength(2);
      expect(airportFind).toHaveBeenCalledTimes(1);
    });

    it('rejects a positive gap shorter than the persisted minimum', async () => {
      airportFind.mockResolvedValue([{ code: 'DXB', minConnectMin: 61 }]);
      await expect(service.resolve(connectedRequest())).rejects.toMatchObject({
        response: {
          code: 'VALIDATION_FAILED',
          message: 'فاصله بین سگمنت‌ها کمتر از حداقل زمان اتصال فرودگاه است.',
        },
      });
    });

    it.each([null, undefined, -1, 1.5, NaN])(
      'rejects invalid MCT %s',
      async (minConnectMin) => {
        airportFind.mockResolvedValue([{ code: 'DXB', minConnectMin }]);
        await expect(service.resolve(connectedRequest())).rejects.toMatchObject(
          {
            response: { code: 'VALIDATION_FAILED' },
          },
        );
      },
    );

    it('rejects an unknown transfer airport without assuming a fallback', async () => {
      airportFind.mockResolvedValue([]);
      await expect(service.resolve(connectedRequest())).rejects.toMatchObject({
        response: { code: 'VALIDATION_FAILED' },
      });
    });

    it('accepts configured zero MCT when chronology is strictly positive', async () => {
      airportFind.mockResolvedValue([{ code: 'DXB', minConnectMin: 0 }]);
      await expect(service.resolve(connectedRequest())).resolves.toMatchObject({
        channel: 'SYSTEM',
      });
    });

    it('does not query airports for a direct itinerary', async () => {
      await expect(service.resolve(singleSegment())).resolves.toMatchObject({
        channel: 'SYSTEM',
      });
      expect(airportFind).not.toHaveBeenCalled();
    });

    it('checks the second transfer in a three-segment itinerary', async () => {
      const thirdId = '33333333-3333-4333-8333-333333333333';
      flightGetMany.mockResolvedValue([
        instance(
          FIRST_ID,
          'IKA',
          'DXB',
          '2099-10-01T08:00:00Z',
          '2099-10-01T10:00:00Z',
        ),
        instance(
          SECOND_ID,
          'DXB',
          'IST',
          '2099-10-01T11:00:00Z',
          '2099-10-01T14:00:00Z',
        ),
        instance(
          thirdId,
          'IST',
          'LHR',
          '2099-10-01T14:30:00Z',
          '2099-10-01T18:00:00Z',
        ),
      ]);
      airportFind.mockResolvedValue([
        { code: 'DXB', minConnectMin: 60 },
        { code: 'IST', minConnectMin: 31 },
      ]);
      const dto = connectedRequest();
      dto.segments.push({
        flightInstanceId: thirdId,
        sequence: 3,
        cabin: 'ECONOMY',
      });
      await expect(service.resolve(dto)).rejects.toMatchObject({
        response: { code: 'VALIDATION_FAILED' },
      });
      airportFind.mockResolvedValue([
        { code: 'DXB', minConnectMin: 60 },
        { code: 'IST', minConnectMin: 30 },
      ]);
      const result = await service.resolve(dto);
      expect(result.segments).toHaveLength(3);
      expect(airportFind).toHaveBeenCalledTimes(2);
    });

    it.each(['2099-10-01T08:00:00Z', '2099-10-01T07:59:59Z'])(
      'rejects a segment arriving at or before departure: %s',
      async (arrivalAt) => {
        flightGetMany.mockResolvedValue([
          instance(FIRST_ID, 'IKA', 'DXB', '2099-10-01T08:00:00Z', arrivalAt),
        ]);
        await expect(service.resolve(singleSegment())).rejects.toMatchObject({
          response: { code: 'VALIDATION_FAILED' },
        });
      },
    );
  });

  it('uses the agency release only for the agency channel', async () => {
    flightGetMany.mockResolvedValue([
      instance(
        FIRST_ID,
        'IKA',
        'DXB',
        '2099-10-01T08:00:00.000Z',
        '2099-10-01T10:00:00.000Z',
      ),
    ]);
    fareFind.mockResolvedValue([
      fareRule(FIRST_ID, { siteSeatsReleased: 4, agencySeatsReleased: 1 }),
    ]);

    const result = await service.resolve({
      channel: 'AGENCY',
      segments: [{ flightInstanceId: FIRST_ID, sequence: 1, cabin: 'ECONOMY' }],
    });

    expect(result.segments[0].availableSeats).toBe(1);
  });

  it('hides an agency-disabled flight from the agency channel', async () => {
    flightGetMany.mockResolvedValue([
      instance(
        FIRST_ID,
        'IKA',
        'DXB',
        '2099-10-01T08:00:00.000Z',
        '2099-10-01T10:00:00.000Z',
        { agencySaleEnabled: false },
      ),
    ]);

    await expect(
      service.resolve({
        channel: 'AGENCY',
        segments: [
          { flightInstanceId: FIRST_ID, sequence: 1, cabin: 'ECONOMY' },
        ],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

function singleSegment(): ResolveCoreItineraryDto {
  return {
    channel: 'SYSTEM',
    segments: [{ flightInstanceId: FIRST_ID, sequence: 1, cabin: 'ECONOMY' }],
  };
}

function chainQuery<Entity>(terminal: jest.Mock) {
  const query = {
    leftJoinAndSelect: jest.fn(),
    innerJoin: jest.fn(),
    select: jest.fn(),
    addSelect: jest.fn(),
    where: jest.fn(),
    andWhere: jest.fn(),
    groupBy: jest.fn(),
    addGroupBy: jest.fn(),
    getMany: terminal,
    getRawMany: terminal,
  };
  for (const method of [
    'leftJoinAndSelect',
    'innerJoin',
    'select',
    'addSelect',
    'where',
    'andWhere',
    'groupBy',
    'addGroupBy',
  ] as const) {
    query[method].mockReturnValue(query);
  }
  return query as unknown as SelectQueryBuilder<Entity>;
}
