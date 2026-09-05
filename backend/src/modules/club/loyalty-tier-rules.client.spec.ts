import { ServiceUnavailableException } from '@nestjs/common';
import { loyaltyTierRulesReadConfig } from '../../config/loyalty-tier-rules-read.config';
import { LoyaltyTierRulesClient } from './loyalty-tier-rules.client';

const token = 'loyalty-tier-rules-test-token-at-least-32-chars';

function client(enabled = 'true') {
  return new LoyaltyTierRulesClient(
    {
      get: (key: string) =>
        ({
          LOYALTY_TIER_RULES_READ_ENABLED: enabled,
          LOYALTY_SERVICE_URL: 'http://loyalty-service:3500',
          LOYALTY_INTERNAL_TOKEN: token,
        })[key],
    } as never,
    { warn: jest.fn() } as never,
  );
}

function body(overrides: Record<string, unknown> = {}) {
  return {
    success: true,
    data: {
      goldMinPoints: 5000,
      platinumMinPoints: 15000,
      cardRequestMinPoints: 5000,
      updatedAt: '2026-09-05T10:00:00.000Z',
      updatedById: null,
      ...overrides,
    },
  };
}

describe('LoyaltyTierRulesClient', () => {
  const runtimeOptions = Intl.DateTimeFormat().resolvedOptions();

  beforeEach(() => {
    jest
      .spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions')
      .mockReturnValue({ ...runtimeOptions, timeZone: 'UTC' });
  });

  afterEach(() => jest.restoreAllMocks());

  it('does no network work while disabled', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    await expect(client('false').get()).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('accepts the exact projection and propagates request identity', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(body())));
    await expect(client().get('tier-rules-read')).resolves.toMatchObject({
      goldMinPoints: 5000,
      updatedById: null,
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://loyalty-service:3500/internal/v1/loyalty/tier-rules',
      expect.objectContaining({
        redirect: 'manual',
        headers: expect.objectContaining({
          'X-Request-Id': 'tier-rules-read',
        }) as unknown,
      }),
    );
  });

  it('uses Core fallback for absent, unavailable and oversized responses', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 404 }));
    await expect(client().get()).resolves.toBeUndefined();
    jest.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('down'));
    await expect(client().get()).resolves.toBeUndefined();
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ padding: 'x'.repeat(17 * 1024) })),
      );
    await expect(client().get()).resolves.toBeUndefined();
  });

  it.each([
    body({ goldMinPoints: 15000, platinumMinPoints: 5000 }),
    body({ updatedAt: '2026-09-05' }),
    body({ updatedById: 'not-a-uuid' }),
    body({ unexpected: true }),
  ])('fails closed for malformed successful responses', async (payload) => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(payload)));
    await expect(client().get()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('validates flag, UTC, token and origin only when enabled', () => {
    expect(loyaltyTierRulesReadConfig({})).toEqual({ enabled: false });
    const good = {
      LOYALTY_TIER_RULES_READ_ENABLED: 'true',
      LOYALTY_SERVICE_URL: 'http://loyalty:3500',
      LOYALTY_INTERNAL_TOKEN: token,
    };
    expect(loyaltyTierRulesReadConfig(good)).toMatchObject({ enabled: true });
    for (const override of [
      { LOYALTY_TIER_RULES_READ_ENABLED: 'yes' },
      { LOYALTY_INTERNAL_TOKEN: '' },
      { LOYALTY_SERVICE_URL: 'http://user:secret@host' },
      { LOYALTY_SERVICE_URL: 'http://host/path' },
      { LOYALTY_SERVICE_URL: 'file:///tmp/a' },
    ])
      expect(() =>
        loyaltyTierRulesReadConfig({ ...good, ...override }),
      ).toThrow();
    jest
      .spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions')
      .mockReturnValue({ ...runtimeOptions, timeZone: 'Asia/Tehran' });
    expect(() => loyaltyTierRulesReadConfig(good)).toThrow('UTC');
    expect(loyaltyTierRulesReadConfig({})).toEqual({ enabled: false });
  });
});
