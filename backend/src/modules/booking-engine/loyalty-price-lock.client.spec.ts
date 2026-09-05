import { ServiceUnavailableException } from '@nestjs/common';
import { loyaltyPriceLockReadConfig } from '../../config/loyalty-price-lock-read.config';
import { LoyaltyPriceLockClient } from './loyalty-price-lock.client';

const owner = '00000000-0000-4000-8000-000000000001';
const token = 'loyalty-price-lock-test-token-at-least-32-characters';
const lock = {
  id: 'lock-1',
  flightInstanceId: 'flight-instance-1',
  cabin: 'ECONOMY',
  lockedPriceIrr: '9223372036854775807',
  feeIrr: '300000',
  status: 'ACTIVE',
  expiresAt: '2026-09-05T12:00:00.000Z',
  createdAt: '2026-09-04T12:00:00.000Z',
  bookingId: null,
};

function client(enabled = 'true', url = 'http://loyalty-service:3500/') {
  return new LoyaltyPriceLockClient(
    {
      get: (key: string) =>
        ({
          LOYALTY_PRICE_LOCK_READ_ENABLED: enabled,
          LOYALTY_SERVICE_URL: url,
          LOYALTY_INTERNAL_TOKEN: token,
        })[key],
    } as never,
    { warn: jest.fn() } as never,
  );
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('LoyaltyPriceLockClient', () => {
  const runtimeOptions = Intl.DateTimeFormat().resolvedOptions();
  let runtimeZone: jest.SpyInstance;

  beforeEach(() => {
    runtimeZone = jest
      .spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions')
      .mockReturnValue({ ...runtimeOptions, timeZone: 'UTC' });
  });

  afterEach(() => jest.restoreAllMocks());

  it('does no network work while disabled', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    await expect(client('false').get(owner)).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('accepts the exact owner-bound all-status history', async () => {
    let requestInit: RequestInit | undefined;
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockImplementation((_input, init) => {
        requestInit = init;
        return Promise.resolve(
          response({ success: true, data: { userId: owner, locks: [lock] } }),
        );
      });
    await expect(client().get(owner, 'request-1')).resolves.toEqual({
      userId: owner,
      locks: [lock],
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(requestInit).toEqual(
      expect.objectContaining({
        redirect: 'manual',
        headers: {
          'X-Loyalty-User-Id': owner,
          'X-Request-Id': 'request-1',
          'X-Internal-Token': token,
        },
      }),
    );
  });

  it('accepts an empty history', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        response({ success: true, data: { userId: owner, locks: [] } }),
      );
    await expect(client().get(owner)).resolves.toEqual({
      userId: owner,
      locks: [],
    });
  });

  it('falls back on network, server, not-found and bounded-result failures', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('down'));
    await expect(client().get(owner)).resolves.toBeUndefined();
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(response({}, 503));
    await expect(client().get(owner)).resolves.toBeUndefined();
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(response({}, 404));
    await expect(client().get(owner)).resolves.toBeUndefined();
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(response({}, 409));
    await expect(client().get(owner)).resolves.toBeUndefined();
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(response({ padding: 'x'.repeat(513 * 1024) }));
    await expect(client().get(owner)).resolves.toBeUndefined();
  });

  it('rejects malformed and foreign-owner projections safely', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      response({
        success: true,
        data: { userId: owner, locks: [{ ...lock, lockedPriceIrr: '1.5' }] },
      }),
    );
    await expect(client().get(owner)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        response({ success: true, data: { userId: owner + '2', locks: [] } }),
      );
    await expect(client().get(owner)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('rejects duplicate, unsorted and over-limit histories', async () => {
    for (const locks of [
      [lock, lock],
      [
        { ...lock, id: 'older', createdAt: '2026-09-04T11:00:00.000Z' },
        { ...lock, id: 'newer', createdAt: '2026-09-04T13:00:00.000Z' },
      ],
      Array.from({ length: 1001 }, (_, index) => ({
        ...lock,
        id: `lock-${String(index).padStart(4, '0')}`,
      })),
    ]) {
      jest
        .spyOn(global, 'fetch')
        .mockResolvedValueOnce(
          response({ success: true, data: { userId: owner, locks } }),
        );
      await expect(client().get(owner)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    }
  });

  it('rejects invalid owner and non-success statuses without trusting the body', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    await expect(client().get('not-a-uuid')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockResolvedValue(response({ success: true }, 401));
    await expect(client().get(owner)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('validates enabled origin/token/flag but ignores disabled credentials', () => {
    expect(loyaltyPriceLockReadConfig({})).toEqual({ enabled: false });
    const good = {
      LOYALTY_PRICE_LOCK_READ_ENABLED: 'true',
      LOYALTY_SERVICE_URL: 'http://loyalty:3500',
      LOYALTY_INTERNAL_TOKEN: token,
    };
    expect(loyaltyPriceLockReadConfig(good)).toMatchObject({ enabled: true });
    for (const override of [
      { LOYALTY_PRICE_LOCK_READ_ENABLED: 'yes' },
      { LOYALTY_INTERNAL_TOKEN: '' },
      ...[
        'http://user:secret@host',
        'http://host/path',
        'http://host/?key=secret',
        'file:///tmp/a',
        'http://host/#x',
        'bad',
      ].map((url) => ({ LOYALTY_SERVICE_URL: url })),
    ])
      expect(() =>
        loyaltyPriceLockReadConfig({ ...good, ...override }),
      ).toThrow();
  });

  it('refuses non-UTC cutover without changing disabled behavior', () => {
    runtimeZone.mockReturnValue({ ...runtimeOptions, timeZone: 'Asia/Tehran' });
    try {
      expect(() =>
        loyaltyPriceLockReadConfig({
          LOYALTY_PRICE_LOCK_READ_ENABLED: 'true',
          LOYALTY_SERVICE_URL: 'http://loyalty:3500',
          LOYALTY_INTERNAL_TOKEN: token,
        }),
      ).toThrow('UTC');
      expect(loyaltyPriceLockReadConfig({})).toEqual({ enabled: false });
    } finally {
      runtimeZone.mockReturnValue({ ...runtimeOptions, timeZone: 'UTC' });
    }
  });
});
