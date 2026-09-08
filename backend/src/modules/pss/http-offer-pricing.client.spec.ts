import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpOfferPricingClient } from './http-offer-pricing.client';
import type { CoreOfferSearchDto } from './dto/core-offer.dto';

const request: CoreOfferSearchDto = {
  channel: 'SYSTEM',
  seller: { type: 'USER', id: '11111111-1111-4111-8111-111111111111' },
  segments: [
    {
      flightInstanceId: '22222222-2222-4222-8222-222222222222',
      sequence: 1,
      cabin: 'ECONOMY',
    },
  ],
  travellers: [{ passengerType: 'ADULT', birthDate: '1990-01-01' }],
};

describe('HttpOfferPricingClient', () => {
  const config = {
    get: jest.fn((key: string) =>
      key === 'OFFER_SERVICE_URL'
        ? 'http://offer-pricing:3600/'
        : key === 'OFFER_INTERNAL_TOKEN'
          ? 'internal-token-at-least-32-characters'
          : key === 'OFFER_REQUEST_TIMEOUT_MS'
            ? '3000'
            : undefined,
    ),
  } as unknown as ConfigService;
  const client = new HttpOfferPricingClient(config);

  afterEach(() => jest.restoreAllMocks());

  it('calls the authenticated internal route and unwraps the Offer', async () => {
    const data = {
      offerId: '33333333-3333-4333-8333-333333333333',
      expiresAt: '2026-09-08T12:15:00.000Z',
      integrityToken: 'payload.signature',
      seller: request.seller,
      quote: { totalIrr: '10000000' },
    };
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true, data }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(client.search(request)).resolves.toEqual(data);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://offer-pricing:3600/internal/v1/offers/search');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({
      'content-type': 'application/json',
      'x-internal-token': 'internal-token-at-least-32-characters',
    });
  });

  it('preserves a remote domain error instead of calculating locally', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          error: { code: 'POOL_EXHAUSTED', message: 'ظرفیت تکمیل است.' },
        }),
        { status: 409 },
      ),
    );
    await expect(client.search(request)).rejects.toMatchObject({
      response: { code: 'POOL_EXHAUSTED', message: 'ظرفیت تکمیل است.' },
    });
  });

  it('uses the remote reprice contract for internal cutover too', async () => {
    const data = {
      quote: { totalIrr: '11000000' },
      previousTotalIrr: '10000000',
      currentTotalIrr: '11000000',
      priceChanged: true,
      repricedAt: '2026-09-08T12:01:00.000Z',
    };
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ success: true, data }), { status: 200 }),
      );

    await expect(
      client.reprice('33333333-3333-4333-8333-333333333333', {
        ...request,
        integrityToken: 'payload.signature',
      }),
    ).resolves.toEqual(data);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://offer-pricing:3600/internal/v1/offers/33333333-3333-4333-8333-333333333333/reprice',
    );
  });

  it('fails closed on transport or malformed success responses', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('offline'));
    await expect(client.search(request)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );

    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: {} }), {
        status: 200,
      }),
    );
    await expect(client.search(request)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
