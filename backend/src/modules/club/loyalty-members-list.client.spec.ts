import { ServiceUnavailableException } from '@nestjs/common';
import { loyaltyMembersListReadConfig } from '../../config/loyalty-members-list-read.config';
import { LoyaltyMembersListClient } from './loyalty-members-list.client';

const token = 'loyalty-members-list-test-token-at-least-32-chars';

function client(enabled = 'true') {
  return new LoyaltyMembersListClient(
    {
      get: (key: string) =>
        ({
          LOYALTY_MEMBERS_LIST_READ_ENABLED: enabled,
          LOYALTY_SERVICE_URL: 'http://loyalty-service:3500',
          LOYALTY_INTERNAL_TOKEN: token,
        })[key],
    } as never,
    { warn: jest.fn() } as never,
  );
}

function member(overrides: Record<string, unknown> = {}) {
  return {
    id: 'member-1',
    userId: '00000000-0000-4000-8000-000000000001',
    fullName: 'عضو تست',
    email: 'member@example.com',
    birthDate: null,
    joinDate: '2026-09-05T10:00:00.000Z',
    points: 6200,
    level: 'GOLD',
    cardStatus: 'ISSUED',
    cardNo: 'GOLD-1001',
    issuedByLabelFa: 'مدیر عامل',
    createdAt: '2026-09-05T10:00:00.000Z',
    ...overrides,
  };
}

function body(overrides: Record<string, unknown> = {}) {
  return {
    success: true,
    data: {
      members: [member()],
      kpis: {
        totalMembers: 3,
        issuedCards: 1,
        pendingRequests: 2,
        submittedRequests: 1,
        tierCounts: { SILVER: 1, GOLD: 1, PLATINUM: 1 },
      },
      ...overrides,
    },
  };
}

function response(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status });
}

describe('LoyaltyMembersListClient', () => {
  const runtimeOptions = Intl.DateTimeFormat().resolvedOptions();

  beforeEach(() => {
    jest
      .spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions')
      .mockReturnValue({ ...runtimeOptions, timeZone: 'UTC' });
  });

  afterEach(() => jest.restoreAllMocks());

  it('does no network work while disabled', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    await expect(client('false').get({})).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('accepts the exact projection and propagates filters and request identity', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(response(body()));
    await expect(
      client().get({ level: 'GOLD', q: 'عضو تست' }, 'members-list-read'),
    ).resolves.toMatchObject({
      members: [{ id: 'member-1', level: 'GOLD' }],
      kpis: { totalMembers: 3 },
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://loyalty-service:3500/internal/v1/loyalty/members-list?level=GOLD&q=%D8%B9%D8%B6%D9%88+%D8%AA%D8%B3%D8%AA',
      expect.objectContaining({
        redirect: 'manual',
        headers: expect.objectContaining({
          'X-Internal-Token': token,
          'X-Request-Id': 'members-list-read',
        }) as unknown,
      }),
    );
  });

  it('accepts an empty filtered list with whole-club KPIs', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      response(
        body({
          members: [],
        }),
      ),
    );
    await expect(client().get({ q: 'absent' })).resolves.toMatchObject({
      members: [],
      kpis: { totalMembers: 3 },
    });
  });

  it.each([404, 409, 503])('uses Core fallback for HTTP %i', async (status) => {
    jest.spyOn(global, 'fetch').mockResolvedValue(response({}, status));
    await expect(client().get({})).resolves.toBeUndefined();
  });

  it('uses Core fallback for network and bounded-body failures', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('down'));
    await expect(client().get({})).resolves.toBeUndefined();
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(response({ padding: 'x'.repeat(513 * 1024) }));
    await expect(client().get({})).resolves.toBeUndefined();
  });

  it.each([
    body({ members: [member({ nationalId: '0012345678' })] }),
    body({ members: [member({ joinDate: '2026-09-05' })] }),
    body({ members: [member({ level: 'UNKNOWN' })] }),
    body({ members: [member({ points: 1.5 })] }),
    body({ kpis: { totalMembers: 1 } }),
    body({
      kpis: {
        totalMembers: 3,
        issuedCards: 1,
        pendingRequests: 2,
        submittedRequests: 1,
        tierCounts: { SILVER: 1, GOLD: 1, PLATINUM: 0 },
      },
    }),
    body({ unexpected: true }),
  ])('fails closed for malformed successful responses', async (payload) => {
    jest.spyOn(global, 'fetch').mockResolvedValue(response(payload));
    await expect(client().get({})).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('fails closed for an unexpected client error', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(response({}, 400));
    await expect(client().get({})).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('validates flag, UTC, token and origin only when enabled', () => {
    expect(loyaltyMembersListReadConfig({})).toEqual({ enabled: false });
    const good = {
      LOYALTY_MEMBERS_LIST_READ_ENABLED: 'true',
      LOYALTY_SERVICE_URL: 'http://loyalty:3500',
      LOYALTY_INTERNAL_TOKEN: token,
    };
    expect(loyaltyMembersListReadConfig(good)).toMatchObject({ enabled: true });
    for (const override of [
      { LOYALTY_MEMBERS_LIST_READ_ENABLED: 'yes' },
      { LOYALTY_INTERNAL_TOKEN: '' },
      { LOYALTY_SERVICE_URL: 'http://user:secret@host' },
      { LOYALTY_SERVICE_URL: 'http://host/path' },
      { LOYALTY_SERVICE_URL: 'file:///tmp/a' },
    ])
      expect(() =>
        loyaltyMembersListReadConfig({ ...good, ...override }),
      ).toThrow();
    jest
      .spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions')
      .mockReturnValue({ ...runtimeOptions, timeZone: 'Asia/Tehran' });
    expect(() => loyaltyMembersListReadConfig(good)).toThrow('UTC');
    expect(loyaltyMembersListReadConfig({})).toEqual({ enabled: false });
  });
});
