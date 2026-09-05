import { ServiceUnavailableException } from '@nestjs/common';
import { loyaltyMembershipReadConfig } from '../../config/loyalty-membership-read.config';
import { LoyaltyMembershipClient } from './loyalty-membership.client';

const owner = '00000000-0000-4000-8000-000000000001';
const token = 'loyalty-membership-test-token-at-least-32-chars';

function client(enabled = 'true') {
  return new LoyaltyMembershipClient(
    {
      get: (key: string) =>
        ({
          LOYALTY_MEMBERSHIP_READ_ENABLED: enabled,
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
      userId: owner,
      isMember: true,
      level: 'GOLD',
      balance: '6200',
      cardStatus: 'REVIEW',
      cardNo: null,
      tierRules: {
        goldMinPoints: 5000,
        platinumMinPoints: 15000,
        cardRequestMinPoints: 5000,
      },
      cardRequest: {
        id: 'request-1',
        status: 'SUBMITTED',
        history: [{ step: 'submitted', labelFa: 'ثبت درخواست', at: 'اکنون' }],
        cardNo: null,
        createdAt: '2026-09-05T10:00:00.000Z',
      },
      canRequestCard: false,
      pointsNeededForCard: '0',
      ...overrides,
    },
  };
}

function response(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status });
}

describe('LoyaltyMembershipClient', () => {
  const runtimeOptions = Intl.DateTimeFormat().resolvedOptions();

  beforeEach(() => {
    jest
      .spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions')
      .mockReturnValue({ ...runtimeOptions, timeZone: 'UTC' });
  });

  afterEach(() => jest.restoreAllMocks());

  it('does no network work while disabled', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    await expect(client('false').get(owner)).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('accepts the exact owner projection and propagates request identity', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(response(body()));
    await expect(client().get(owner, 'membership-read')).resolves.toMatchObject(
      {
        userId: owner,
        balance: '6200',
        cardRequest: { status: 'SUBMITTED' },
      },
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      `http://loyalty-service:3500/internal/v1/loyalty/membership/${owner}`,
      expect.objectContaining({
        redirect: 'manual',
        headers: expect.objectContaining({
          'X-Loyalty-User-Id': owner,
          'X-Request-Id': 'membership-read',
        }) as unknown,
      }),
    );
  });

  it('accepts the exact absent-member projection', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      response(
        body({
          isMember: false,
          level: null,
          balance: '0',
          cardStatus: null,
          cardNo: null,
          cardRequest: null,
          canRequestCard: false,
          pointsNeededForCard: '5000',
        }),
      ),
    );
    await expect(client().get(owner)).resolves.toMatchObject({
      isMember: false,
      pointsNeededForCard: '5000',
    });
  });

  it('uses Core fallback for availability and bounded-body failures', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('down'));
    await expect(client().get(owner)).resolves.toBeUndefined();
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(response({}, 503));
    await expect(client().get(owner)).resolves.toBeUndefined();
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(response({ padding: 'x'.repeat(65 * 1024) }));
    await expect(client().get(owner)).resolves.toBeUndefined();
  });

  it.each([
    body({ userId: '00000000-0000-4000-8000-000000000002' }),
    body({ balance: 'unsafe' }),
    body({ level: 'UNKNOWN' }),
    body({ unexpected: true }),
    body({
      cardRequest: {
        id: 'request-1',
        status: 'SUBMITTED',
        history: Array.from({ length: 33 }, () => ({
          step: 'submitted',
          labelFa: 'ثبت',
          at: 'اکنون',
        })),
        cardNo: null,
        createdAt: '2026-09-05T10:00:00.000Z',
      },
    }),
  ])('fails closed for malformed or foreign projections', async (payload) => {
    jest.spyOn(global, 'fetch').mockResolvedValue(response(payload));
    await expect(client().get(owner)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('fails closed for disabled service routes and invalid owners', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(response({}, 404));
    await expect(client().get(owner)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(client().get('not-a-uuid')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('validates flag, UTC, token and origin only when enabled', () => {
    expect(loyaltyMembershipReadConfig({})).toEqual({ enabled: false });
    const good = {
      LOYALTY_MEMBERSHIP_READ_ENABLED: 'true',
      LOYALTY_SERVICE_URL: 'http://loyalty:3500',
      LOYALTY_INTERNAL_TOKEN: token,
    };
    expect(loyaltyMembershipReadConfig(good)).toMatchObject({ enabled: true });
    for (const override of [
      { LOYALTY_MEMBERSHIP_READ_ENABLED: 'yes' },
      { LOYALTY_INTERNAL_TOKEN: '' },
      { LOYALTY_SERVICE_URL: 'http://user:secret@host' },
      { LOYALTY_SERVICE_URL: 'http://host/path' },
      { LOYALTY_SERVICE_URL: 'file:///tmp/a' },
    ])
      expect(() =>
        loyaltyMembershipReadConfig({ ...good, ...override }),
      ).toThrow();
    jest
      .spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions')
      .mockReturnValue({ ...runtimeOptions, timeZone: 'Asia/Tehran' });
    expect(() => loyaltyMembershipReadConfig(good)).toThrow('UTC');
    expect(loyaltyMembershipReadConfig({})).toEqual({ enabled: false });
  });
});
