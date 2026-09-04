import type { EntityManager, Repository } from 'typeorm';
import { FareRule } from '../../database/entities/fare-rule.entity';
import { TravelExtraSetting } from '../../database/entities/travel-extra-setting.entity';
import { AncillaryServicesService } from '../ancillary-services/ancillary-services.service';
import { CoreItineraryQuoteService } from './core-itinerary-quote.service';
import { CoreItineraryService } from './core-itinerary.service';
import type { QuoteCoreItineraryDto } from './dto/quote-core-itinerary.dto';

const FIRST_ID = '11111111-1111-4111-8111-111111111111';
const SECOND_ID = '22222222-2222-4222-8222-222222222222';
const EXTRA_ID = '33333333-3333-4333-8333-333333333333';

function rule(
  flightInstanceId: string,
  priceIrr: bigint,
  taxIrr: bigint,
  baggageAllowanceKg: number,
): FareRule {
  return {
    flightInstanceId,
    cabin: 'ECONOMY',
    classCode: 'Y',
    priceIrr,
    sitePriceIrr: priceIrr,
    agencyReleasePriceIrr: priceIrr + 1_000_000n,
    taxIrr,
    baggageAllowanceKg,
  } as FareRule;
}

function request(): QuoteCoreItineraryDto {
  return {
    channel: 'SYSTEM',
    segments: [
      { flightInstanceId: FIRST_ID, sequence: 1, cabin: 'ECONOMY' },
      {
        flightInstanceId: SECOND_ID,
        sequence: 2,
        cabin: 'ECONOMY',
        extras: [{ id: EXTRA_ID, quantity: 3 }],
      },
    ],
    travellers: [
      { passengerType: 'ADULT', birthDate: '1990-01-01' },
      { passengerType: 'CHILD', birthDate: '2095-01-01' },
    ],
  };
}

describe('CoreItineraryQuoteService', () => {
  const resolve = jest.fn();
  const fareFind = jest.fn();
  const extraFind = jest.fn();
  const overlayTravelExtras = jest.fn();
  const manager = {
    find: jest.fn().mockResolvedValue([]),
  } as unknown as EntityManager;
  const service = new CoreItineraryQuoteService(
    { resolve } as unknown as CoreItineraryService,
    { find: fareFind, manager } as unknown as Repository<FareRule>,
    { find: extraFind } as unknown as Repository<TravelExtraSetting>,
    { overlayTravelExtras } as unknown as AncillaryServicesService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    resolve.mockResolvedValue({
      channel: 'SYSTEM',
      segments: [
        resolvedSegment(FIRST_ID, 1, 'IKA', 'DXB', '2099-10-01T08:00:00Z'),
        resolvedSegment(SECOND_ID, 2, 'DXB', 'IST', '2099-10-01T12:00:00Z'),
      ],
    });
    fareFind.mockResolvedValue([
      rule(FIRST_ID, 10_000_000n, 1_000_000n, 20),
      rule(SECOND_ID, 20_000_000n, 2_000_000n, 15),
    ]);
    const extra = {
      id: EXTRA_ID,
      code: 'EXTRA_BAGGAGE',
      titleFa: 'بار اضافه',
      billingUnit: 'PER_KG',
      priceIrr: 500_000n,
      active: true,
      purchaseEnabled: true,
    } as TravelExtraSetting;
    extraFind.mockResolvedValue([extra]);
    overlayTravelExtras.mockResolvedValue([extra]);
  });

  it('adds segment prices while retaining baggage and extras per leg', async () => {
    const result = await service.quote(request());

    expect(resolve).toHaveBeenCalledWith(expect.anything(), 2);
    expect(result).toMatchObject({
      currency: 'IRR',
      requiresReprice: true,
      fareIrr: '45000000',
      taxIrr: '4500000',
      extrasIrr: '1500000',
      totalIrr: '51000000',
    });
    expect(result.segments[0]).toMatchObject({
      baggageAllowanceKg: 20,
      extras: [],
      fareIrr: '15000000',
      taxIrr: '1500000',
    });
    expect(result.segments[1]).toMatchObject({
      baggageAllowanceKg: 15,
      extras: [{ quantity: 3, totalIrr: '1500000' }],
      fareIrr: '30000000',
      taxIrr: '3000000',
    });
  });

  it('uses exact bigint arithmetic beyond JavaScript safe integers', async () => {
    const huge = 9_007_199_254_740_993n;
    const dto = request();
    dto.segments = dto.segments.slice(0, 1);
    dto.travellers = dto.travellers.slice(0, 1);
    resolve.mockResolvedValue({
      channel: 'SYSTEM',
      segments: [
        resolvedSegment(FIRST_ID, 1, 'IKA', 'DXB', '2099-10-01T08:00:00Z'),
      ],
    });
    fareFind.mockResolvedValue([rule(FIRST_ID, huge, 7n, 20)]);
    extraFind.mockResolvedValue([]);
    overlayTravelExtras.mockResolvedValue([]);

    const result = await service.quote(dto);

    expect(result.fareIrr).toBe('9007199254740993');
    expect(result.totalIrr).toBe('9007199254741000');
  });

  it('uses agency fares and the existing full child rate', async () => {
    const dto = request();
    dto.channel = 'AGENCY';
    const result = await service.quote(dto);

    expect(result.fareIrr).toBe('64000000');
    expect(result.channel).toBe('AGENCY');
  });

  it('charges a per-passenger extra only on its selected segment', async () => {
    const dto = request();
    dto.segments[1].extras = [{ id: EXTRA_ID, quantity: 1 }];
    const extra = {
      id: EXTRA_ID,
      code: 'SPECIAL_MEAL',
      titleFa: 'غذای ویژه',
      billingUnit: 'PER_PASSENGER',
      priceIrr: 500_000n,
      active: true,
      purchaseEnabled: true,
    } as TravelExtraSetting;
    extraFind.mockResolvedValue([extra]);
    overlayTravelExtras.mockResolvedValue([extra]);

    const result = await service.quote(dto);

    expect(result.extrasIrr).toBe('1000000');
    expect(result.segments[0].extras).toEqual([]);
    expect(result.segments[1].extras).toEqual([
      expect.objectContaining({
        code: 'SPECIAL_MEAL',
        quantity: 2,
        totalIrr: '1000000',
      }),
    ]);
  });

  it('rejects duplicate extras on one segment', async () => {
    const dto = request();
    dto.segments[1].extras = [
      { id: EXTRA_ID, quantity: 1 },
      { id: EXTRA_ID, quantity: 1 },
    ];
    await expect(service.quote(dto)).rejects.toMatchObject({
      response: { code: 'VALIDATION_FAILED' },
    });
  });

  it('does not treat an unknown baggage allowance as zero', async () => {
    const dto = request();
    dto.segments = dto.segments.slice(0, 1);
    dto.travellers = dto.travellers.slice(0, 1);
    resolve.mockResolvedValue({
      channel: 'SYSTEM',
      segments: [
        resolvedSegment(FIRST_ID, 1, 'IKA', 'DXB', '2099-10-01T08:00:00Z'),
      ],
    });
    fareFind.mockResolvedValue([
      { ...rule(FIRST_ID, 10_000_000n, 0n, 20), baggageAllowanceKg: null },
    ]);
    extraFind.mockResolvedValue([]);
    overlayTravelExtras.mockResolvedValue([]);

    const result = await service.quote(dto);

    expect(result.segments[0].baggageAllowanceKg).toBeNull();
  });

  it('rejects an all-infant itinerary before resolving inventory', async () => {
    const dto = request();
    dto.travellers = [{ passengerType: 'INFANT', birthDate: '2099-01-01' }];
    await expect(service.quote(dto)).rejects.toMatchObject({
      response: { code: 'VALIDATION_FAILED' },
    });
    expect(resolve).not.toHaveBeenCalled();
  });
});

function resolvedSegment(
  flightInstanceId: string,
  sequence: number,
  originCode: string,
  destinationCode: string,
  departureAt: string,
) {
  return {
    flightInstanceId,
    sequence,
    flightNo: `BJ${sequence}`,
    originCode,
    destinationCode,
    departureAt: new Date(departureAt),
    arrivalAt: new Date(new Date(departureAt).getTime() + 2 * 60 * 60_000),
    cabin: 'ECONOMY',
    fareClassCode: 'Y',
    availableSeats: 3,
  };
}
