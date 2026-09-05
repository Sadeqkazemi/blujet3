import { ServiceUnavailableException } from '@nestjs/common';
import { loyaltyPointsReadConfig } from '../../config/loyalty-points-read.config';
import { LoyaltyPointsClient } from './loyalty-points.client';

const owner = '00000000-0000-4000-8000-000000000001';
const token = 'loyalty-points-test-token-at-least-32-characters';

function client(enabled = 'true', url = 'http://loyalty-service:3300/') {
  return new LoyaltyPointsClient(
    {
      get: (key: string) =>
        ({
          LOYALTY_POINTS_READ_ENABLED: enabled,
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

describe('LoyaltyPointsClient', () => {
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

  it('accepts the exact owner-bound member projection', async () => {
    let requestInit: RequestInit | undefined;
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockImplementation((_input, init) => {
        requestInit = init;
        return Promise.resolve(
          response({
            success: true,
            data: {
              id: 'member-1',
              userId: owner,
              level: 'GOLD',
              cardStatus: 'NONE',
              points: '5000',
            },
          }),
        );
      });
    await expect(client().get(owner, 'request-1')).resolves.toMatchObject({
      userId: owner,
      points: '5000',
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

  it('maps an absent member to null', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(response({ success: false }, 404));
    await expect(client().get(owner)).resolves.toBeNull();
  });

  it('falls back on network and server failures', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('down'));
    await expect(client().get(owner)).resolves.toBeUndefined();
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(response({}, 503));
    await expect(client().get(owner)).resolves.toBeUndefined();
  });

  it('rejects malformed and foreign projections safely', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      response({
        success: true,
        data: {
          id: 'member-1',
          userId: owner,
          level: 'GOLD',
          cardStatus: 'NONE',
          points: 'not-a-number',
        },
      }),
    );
    await expect(client().get(owner)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    jest.spyOn(global, 'fetch').mockResolvedValue(
      response({
        success: true,
        data: {
          id: 'member-1',
          userId: '00000000-0000-4000-8000-000000000002',
          level: 'GOLD',
          cardStatus: 'NONE',
          points: '1',
        },
      }),
    );
    await expect(client().get(owner)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('falls back when the response exceeds the fixed body limit', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(response({ padding: 'x'.repeat(17 * 1024) }));
    await expect(client().get(owner)).resolves.toBeUndefined();
  });

  it('rejects an invalid owner before issuing a request', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    await expect(client().get('not-a-uuid')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('validates enabled origin/token/flag but ignores disabled credentials', () => {
    expect(loyaltyPointsReadConfig({})).toEqual({ enabled: false });
    const good = {
      LOYALTY_POINTS_READ_ENABLED: 'true',
      LOYALTY_SERVICE_URL: 'http://loyalty:3500',
      LOYALTY_INTERNAL_TOKEN: token,
    };
    expect(loyaltyPointsReadConfig(good)).toMatchObject({ enabled: true });
    for (const override of [
      { LOYALTY_POINTS_READ_ENABLED: 'yes' },
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
      expect(() => loyaltyPointsReadConfig({ ...good, ...override })).toThrow();
  });

  it('refuses non-UTC cutover without changing disabled behavior', () => {
    runtimeZone.mockReturnValue({ ...runtimeOptions, timeZone: 'Asia/Tehran' });
    try {
      expect(() =>
        loyaltyPointsReadConfig({
          LOYALTY_POINTS_READ_ENABLED: 'true',
          LOYALTY_SERVICE_URL: 'http://loyalty:3500',
          LOYALTY_INTERNAL_TOKEN: token,
        }),
      ).toThrow('UTC');
      expect(loyaltyPointsReadConfig({})).toEqual({ enabled: false });
    } finally {
      runtimeZone.mockReturnValue({ ...runtimeOptions, timeZone: 'UTC' });
    }
  });
});
