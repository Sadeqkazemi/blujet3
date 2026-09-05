import { ServiceUnavailableException } from '@nestjs/common';
import { LoyaltyCardRequestsClient } from './loyalty-card-requests.client';
import { loyaltyCardRequestsReadConfig } from '../../config/loyalty-card-requests-read.config';

const token = 'loyalty-card-requests-test-token-at-least-32-chars';

function client(enabled = 'true') {
  return new LoyaltyCardRequestsClient(
    {
      get: (key: string) =>
        ({
          LOYALTY_CARD_REQUESTS_READ_ENABLED: enabled,
          LOYALTY_SERVICE_URL: 'http://loyalty-service:3500',
          LOYALTY_INTERNAL_TOKEN: token,
        })[key],
    } as never,
    { warn: jest.fn() } as never,
  );
}

function response(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status });
}

const row = {
  id: 'request-1',
  memberId: 'member-1',
  level: 'GOLD',
  points: 5000,
  status: 'REFERRED',
  assignedTo: 'CEO',
  decidedById: null,
  decidedAt: null,
  cardNo: null,
  history: [{ step: 'referred', labelFa: 'ارجاع', at: 'اکنون' }],
  createdAt: '2026-09-05T10:00:00.000Z',
  member: {
    id: 'member-1',
    fullName: 'عضو تست',
    email: 'member@example.com',
    points: 5000,
    level: 'GOLD',
  },
};

describe('LoyaltyCardRequestsClient', () => {
  const runtimeOptions = Intl.DateTimeFormat().resolvedOptions();
  beforeEach(() => {
    jest
      .spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions')
      .mockReturnValue({ ...runtimeOptions, timeZone: 'UTC' });
  });
  afterEach(() => jest.restoreAllMocks());

  it('validates the flag, credential, origin and UTC runtime only when enabled', () => {
    expect(loyaltyCardRequestsReadConfig({})).toEqual({ enabled: false });
    const good = {
      LOYALTY_CARD_REQUESTS_READ_ENABLED: 'true',
      LOYALTY_SERVICE_URL: 'http://loyalty:3500',
      LOYALTY_INTERNAL_TOKEN: token,
    };
    expect(loyaltyCardRequestsReadConfig(good)).toMatchObject({
      enabled: true,
    });
    for (const override of [
      { LOYALTY_CARD_REQUESTS_READ_ENABLED: 'yes' },
      { LOYALTY_INTERNAL_TOKEN: 'short' },
      { LOYALTY_SERVICE_URL: 'http://user:secret@loyalty' },
      { LOYALTY_SERVICE_URL: 'http://loyalty/path' },
      { LOYALTY_SERVICE_URL: 'file:///tmp/test' },
    ])
      expect(() =>
        loyaltyCardRequestsReadConfig({ ...good, ...override }),
      ).toThrow();
    jest
      .spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions')
      .mockReturnValue({ ...runtimeOptions, timeZone: 'Asia/Tehran' });
    expect(() => loyaltyCardRequestsReadConfig(good)).toThrow('UTC');
  });

  it('accepts an empty queue', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(response({ success: true, data: [] }));
    await expect(client().get()).resolves.toEqual([]);
  });

  it.each([301, 302, 400, 401, 403])(
    'rejects HTTP %i without Core fallback',
    async (status) => {
      jest.spyOn(global, 'fetch').mockResolvedValue(response({}, status));
      await expect(client().get()).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    },
  );

  it('uses fallback for network errors and oversized response bodies', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('unreachable'));
    await expect(client().get()).resolves.toBeUndefined();
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(response({ padding: 'x'.repeat(513 * 1024) }));
    await expect(client().get()).resolves.toBeUndefined();
  });

  it('does no network work while disabled', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    await expect(client('false').get()).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('accepts the exact projection and propagates request identity', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(response({ success: true, data: [row] }));
    await expect(client().get('card-requests-read')).resolves.toEqual([row]);
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://loyalty-service:3500/internal/v1/loyalty/card-requests',
      expect.objectContaining({
        redirect: 'manual',
        headers: expect.objectContaining({
          'X-Internal-Token': token,
          'X-Request-Id': 'card-requests-read',
        }) as unknown,
      }),
    );
  });

  it.each([404, 409, 503])('falls back for HTTP %i', async (status) => {
    jest.spyOn(global, 'fetch').mockResolvedValue(response({}, status));
    await expect(client().get()).resolves.toBeUndefined();
  });

  it.each([
    { success: true, data: [{ ...row, status: 'SUBMITTED' }] },
    { success: true, data: [{ ...row, nationalId: '0012345678' }] },
    { success: true, data: [{ ...row, history: new Array(33).fill({}) }] },
    { success: true, data: [{ ...row, decidedAt: '2026-09-05' }] },
    {
      success: true,
      data: [
        { ...row, history: [{ ...row.history[0], nationalId: 'secret' }] },
      ],
    },
    {
      success: true,
      data: [{ ...row, member: { ...row.member, nationalIdEnc: 'secret' } }],
    },
    {
      success: true,
      data: [{ ...row, member: { ...row.member, points: 1.5 } }],
    },
  ])('fails closed for malformed successful response', async (payload) => {
    jest.spyOn(global, 'fetch').mockResolvedValue(response(payload));
    await expect(client().get()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
