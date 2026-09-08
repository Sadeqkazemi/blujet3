import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CoreItineraryQuoteService } from './core-itinerary-quote.service';
import { CoreItineraryHoldService } from './core-itinerary-hold.service';
import { CoreOfferService } from './core-offer.service';
import { CoreOfferPricingService } from './core-offer-pricing.service';
import type {
  CoreOfferHoldDto,
  CoreOfferRepriceDto,
  CoreOfferSearchDto,
} from './dto/core-offer.dto';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const AGENCY_ID = '22222222-2222-4222-8222-222222222222';
const SECRET = 'core-offer-signing-secret-at-least-32-characters';

function request(): CoreOfferSearchDto {
  return {
    channel: 'SYSTEM',
    seller: { type: 'USER', id: USER_ID },
    segments: [
      {
        flightInstanceId: '33333333-3333-4333-8333-333333333333',
        sequence: 1,
        cabin: 'ECONOMY',
      },
    ],
    travellers: [{ passengerType: 'ADULT', birthDate: '1990-01-01' }],
  };
}

function quote(totalIrr = '10000000') {
  return {
    currency: 'IRR' as const,
    quotedAt: '2026-09-07T12:00:00.000Z',
    requiresReprice: true as const,
    channel: 'SYSTEM' as const,
    segments: [],
    fareIrr: totalIrr,
    taxIrr: '0',
    extrasIrr: '0',
    totalIrr,
  };
}

describe('CoreOfferService', () => {
  const quoteMock = jest.fn();
  const quoteService = {
    quote: quoteMock,
  } as unknown as CoreItineraryQuoteService;
  const holdMock = jest.fn();
  const holdService = {
    hold: holdMock,
  } as unknown as CoreItineraryHoldService;
  const config = {
    get: jest.fn((key: string) =>
      key === 'CORE_OFFER_SIGNING_SECRET'
        ? SECRET
        : key === 'CORE_OFFER_TTL_SECONDS'
          ? '900'
          : undefined,
    ),
  } as unknown as ConfigService;
  const pricing = new CoreOfferPricingService(quoteService, config);
  const service = new CoreOfferService(pricing, holdService);

  beforeEach(() => {
    jest.clearAllMocks();
    quoteMock.mockResolvedValue(quote());
    holdMock.mockResolvedValue({ id: 'order-id', sourceOfferId: 'offer-id' });
  });

  it('creates a seller-bound signed offer without embedding PII in the token', async () => {
    const result = await service.search(request());
    const [encodedPayload] = result.integrityToken.split('.');
    const tokenText = Buffer.from(encodedPayload, 'base64url').toString('utf8');

    expect(typeof result.offerId).toBe('string');
    expect(result).toMatchObject({
      seller: { type: 'USER', id: USER_ID },
      quote: { totalIrr: '10000000' },
    });
    expect(tokenText).not.toContain('1990-01-01');
    expect(tokenText).toContain(USER_ID);
  });

  it('reprices a matching offer and reports an unchanged exact IRR total', async () => {
    const original = request();
    const created = await service.search(original);
    const dto: CoreOfferRepriceDto = {
      ...original,
      integrityToken: created.integrityToken,
    };

    await expect(service.reprice(created.offerId, dto)).resolves.toMatchObject({
      previousTotalIrr: '10000000',
      currentTotalIrr: '10000000',
      priceChanged: false,
    });
  });

  it('binds an agency-channel offer to the agency seller', async () => {
    const result = await service.search({
      ...request(),
      channel: 'AGENCY',
      seller: { type: 'AGENCY', id: AGENCY_ID },
    });

    expect(result.seller).toEqual({ type: 'AGENCY', id: AGENCY_ID });
    expect(quoteMock).toHaveBeenCalledTimes(1);
  });

  it('rejects using a valid token under a different offer route ID', async () => {
    const original = request();
    const created = await service.search(original);

    await expect(
      service.reprice('44444444-4444-4444-8444-444444444444', {
        ...original,
        integrityToken: created.integrityToken,
      }),
    ).rejects.toMatchObject({ response: { code: 'OFFER_INVALID' } });
    expect(quoteMock).toHaveBeenCalledTimes(1);
  });

  it('reports a price change without accepting it as a payment authorization', async () => {
    const original = request();
    const created = await service.search(original);
    quoteMock.mockResolvedValue(quote('10000001'));

    const result = await service.reprice(created.offerId, {
      ...original,
      integrityToken: created.integrityToken,
    });

    expect(result).toMatchObject({
      previousTotalIrr: '10000000',
      currentTotalIrr: '10000001',
      priceChanged: true,
    });
  });

  it.each([
    [
      'tampered token',
      (dto: CoreOfferRepriceDto) => ({
        ...dto,
        integrityToken: `${dto.integrityToken}x`,
      }),
    ],
    [
      'changed request',
      (dto: CoreOfferRepriceDto) => ({
        ...dto,
        travellers: [{ passengerType: 'ADULT', birthDate: '1991-01-01' }],
      }),
    ],
    [
      'wrong seller',
      (dto: CoreOfferRepriceDto) => ({
        ...dto,
        seller: { type: 'USER', id: AGENCY_ID },
      }),
    ],
  ])('rejects %s before recalculating', async (_label, mutate) => {
    const original = request();
    const created = await service.search(original);
    quoteMock.mockResolvedValue(quote());

    await expect(
      service.reprice(
        created.offerId,
        mutate({ ...original, integrityToken: created.integrityToken }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(quoteMock).toHaveBeenCalledTimes(1);
  });

  it('rejects an expired offer and does not quote it again', async () => {
    jest.useFakeTimers({ now: new Date('2026-09-07T12:00:00.000Z') });
    try {
      const original = request();
      const created = await service.search(original);
      jest.setSystemTime(new Date('2026-09-07T12:15:00.001Z'));

      await expect(
        service.reprice(created.offerId, {
          ...original,
          integrityToken: created.integrityToken,
        }),
      ).rejects.toMatchObject({
        response: { code: 'OFFER_EXPIRED' },
      });
      expect(quoteMock).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('fails closed for a missing signing secret', async () => {
    const missingConfig = {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService;
    const missing = new CoreOfferPricingService(quoteService, missingConfig);

    await expect(missing.search(request())).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(quoteMock).not.toHaveBeenCalled();
  });

  it('requires the seller type to match the Core sales channel', async () => {
    await expect(
      service.search({
        ...request(),
        channel: 'AGENCY',
        seller: { type: 'USER', id: USER_ID },
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(quoteMock).not.toHaveBeenCalled();
  });

  it('delegates Offer consumption without persisting the integrity token', async () => {
    const original = request();
    const created = await service.search(original);
    const dto: CoreOfferHoldDto = {
      ownerId: USER_ID,
      channel: 'SYSTEM',
      segments: original.segments,
      travellers: [
        {
          fullName: 'علی رضایی',
          passengerType: 'ADULT',
          birthDate: '1990-01-01',
        },
      ],
      integrityToken: created.integrityToken,
    };

    await service.hold(created.offerId, dto, 'hold-key');

    expect(holdMock).toHaveBeenCalledWith(
      expect.objectContaining({ ownerId: USER_ID }),
      'hold-key',
      expect.objectContaining({
        offerId: created.offerId,
      }),
    );
    expect(
      pricing.verifyForHold(created.offerId, created.integrityToken, {
        ownerId: USER_ID,
        channel: 'SYSTEM',
        segments: original.segments,
        travellers: dto.travellers,
      }),
    ).toEqual({ expectedTotalIrr: '10000000' });
  });

  it('rejects Offer consumption when owner/channel binding differs', async () => {
    const created = await service.search(request());
    const dto: CoreOfferHoldDto = {
      ownerId: AGENCY_ID,
      channel: 'AGENCY',
      segments: request().segments,
      travellers: [
        {
          fullName: 'علی رضایی',
          passengerType: 'ADULT',
          birthDate: '1990-01-01',
        },
      ],
      integrityToken: created.integrityToken,
    };

    await service.hold(created.offerId, dto, 'hold-key');
    expect(() =>
      pricing.verifyForHold(created.offerId, created.integrityToken, {
        ownerId: AGENCY_ID,
        channel: 'AGENCY',
        segments: dto.segments,
        travellers: dto.travellers,
      }),
    ).toThrow(ConflictException);
  });
});
