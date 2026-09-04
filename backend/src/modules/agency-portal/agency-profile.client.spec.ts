import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { Test } from '@nestjs/testing';
import { agencyProfileReadConfig } from '../../config/agency-profile-read.config';
import { AgencyProfileClient } from './agency-profile.client';

describe('Agency portal profile client', () => {
  const owner = randomUUID();
  const token = 'private-test-service-token-at-least-32-characters';
  const row = {
    agencyId: owner,
    managerName: 'مدیر آزمایشی',
    licenseNo: 'LIC-1',
    phone: '02112345678',
    email: 'agency@example.invalid',
    city: 'تهران',
    address: 'نشانی محرمانه',
    tier: 'GOLD',
    suspendedAt: null,
    suspendReason: null,
    joinedAt: '2026-09-01T00:00:00.000Z',
  };
  let server: Server, client: AgencyProfileClient, config: ConfigService;
  let data: unknown, status: number, mode: string;
  let calls: Array<{
    path: string | undefined;
    owner: string | string[] | undefined;
    requestId: string | string[] | undefined;
    token: string | string[] | undefined;
  }>;
  const warn = jest.fn();
  const runtimeOptions = Intl.DateTimeFormat().resolvedOptions();
  let runtimeZone: jest.SpyInstance;

  beforeAll(async () => {
    runtimeZone = jest
      .spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions')
      .mockReturnValue({ ...runtimeOptions, timeZone: 'UTC' });
    server = createServer((req, res) => {
      calls.push({
        path: req.url,
        owner: req.headers['x-agency-id'],
        requestId: req.headers['x-request-id'],
        token: req.headers['x-internal-token'],
      });
      if (mode === 'timeout') return;
      res.writeHead(status, {
        'Content-Type': 'application/json',
        Location: '/must-not-follow',
      });
      if (mode === 'stalled-body') {
        res.write('{');
        return;
      }
      res.end(
        mode === 'oversized'
          ? 'x'.repeat(64 * 1024 + 1)
          : mode === 'invalid-json'
            ? '{'
            : JSON.stringify({ success: true, data }),
      );
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('HTTP fixture unavailable');
    config = new ConfigService({
      AGENCY_PROFILE_READ_ENABLED: 'true',
      AGENCY_SERVICE_URL: 'http://127.0.0.1:' + address.port,
      AGENCY_INTERNAL_TOKEN: token,
    });
    const module = await Test.createTestingModule({
      providers: [
        AgencyProfileClient,
        { provide: ConfigService, useValue: config },
        { provide: PinoLogger, useValue: { warn } },
      ],
    }).compile();
    client = module.get(AgencyProfileClient);
  });

  beforeEach(() => {
    data = { ...row };
    status = 200;
    mode = '';
    calls = [];
    warn.mockClear();
    config.set('AGENCY_PROFILE_READ_ENABLED', 'true');
  });

  afterAll(async () => {
    runtimeZone.mockRestore();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('preserves Agency fields, trusted owner and correlation', async () => {
    expect(await client.get(owner, 'profile-read-test')).toEqual(row);
    expect(calls).toEqual([
      {
        path: '/internal/v1/agencies/' + owner + '/portal-profile',
        owner,
        token,
        requestId: 'profile-read-test',
      },
    ]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('keeps disabled rollback free of HTTP, even with invalid owner', async () => {
    config.set('AGENCY_PROFILE_READ_ENABLED', 'false');
    expect(await client.get('invalid')).toBeUndefined();
    expect(calls).toEqual([]);
  });

  it('falls back when the service cannot be reached', async () => {
    const url = config.get<string>('AGENCY_SERVICE_URL');
    config.set('AGENCY_SERVICE_URL', 'http://127.0.0.1:1');
    try {
      expect(await client.get(owner)).toBeUndefined();
      expect(calls).toEqual([]);
    } finally {
      config.set('AGENCY_SERVICE_URL', url);
    }
  });

  it('rejects an invalid owner before HTTP', async () => {
    await expect(client.get('../foreign')).rejects.toMatchObject({
      status: 503,
    });
    expect(calls).toEqual([]);
  });

  it('preserves the owned-profile not-found contract', async () => {
    status = 404;
    await expect(client.get(owner)).rejects.toMatchObject({ status: 404 });
  });

  it.each([401, 403, 429, 302])(
    'fails closed for status %s without following redirects',
    async (code) => {
      status = code;
      await expect(client.get(owner)).rejects.toMatchObject({ status: 503 });
      expect(calls).toHaveLength(1);
    },
  );

  it.each([500, 502, 503])(
    'allows authorized Core fallback for status %s',
    async (code) => {
      status = code;
      expect(await client.get(owner)).toBeUndefined();
    },
  );

  it.each([
    { agencyId: randomUUID() },
    { managerName: null },
    { tier: 'VIP' },
    { joinedAt: '2026-02-30T00:00:00.000Z' },
    { suspendedAt: '2026-09-01' },
    { password: 'private' },
  ])('rejects malformed or foreign data: %j', async (override) => {
    data = { ...row, ...override };
    await expect(client.get(owner)).rejects.toMatchObject({ status: 503 });
    const logs = JSON.stringify(warn.mock.calls);
    for (const secret of [owner, token, row.address, row.phone])
      expect(logs).not.toContain(secret);
  });

  it('rejects malformed envelopes and JSON', async () => {
    data = [row];
    await expect(client.get(owner)).rejects.toMatchObject({ status: 503 });
    mode = 'invalid-json';
    await expect(client.get(owner)).rejects.toMatchObject({ status: 503 });
  });

  it.each(['timeout', 'stalled-body', 'oversized'])(
    'bounds %s and recovers without cached data',
    async (failure) => {
      mode = failure;
      const started = Date.now();
      expect(await client.get(owner)).toBeUndefined();
      expect(Date.now() - started).toBeLessThan(3500);
      mode = '';
      expect(await client.get(owner)).toEqual(row);
    },
  );

  it('validates enabled origin/token/flag but ignores disabled credentials', () => {
    expect(agencyProfileReadConfig({})).toEqual({ enabled: false });
    const good = {
      AGENCY_PROFILE_READ_ENABLED: 'true',
      AGENCY_SERVICE_URL: 'http://agency:3600',
      AGENCY_INTERNAL_TOKEN: token,
    };
    expect(agencyProfileReadConfig(good)).toMatchObject({ enabled: true });
    for (const override of [
      { AGENCY_PROFILE_READ_ENABLED: 'yes' },
      { AGENCY_INTERNAL_TOKEN: '' },
      ...[
        'http://user:secret@host',
        'http://host/path',
        'http://host/?key=secret',
        'file:///tmp/a',
        'http://host/#x',
        'bad',
      ].map((url) => ({ AGENCY_SERVICE_URL: url })),
    ])
      expect(() => agencyProfileReadConfig({ ...good, ...override })).toThrow();
  });

  it('refuses non-UTC cutover without changing disabled behavior', () => {
    runtimeZone.mockReturnValue({ ...runtimeOptions, timeZone: 'Asia/Tehran' });
    try {
      expect(() =>
        agencyProfileReadConfig({
          AGENCY_PROFILE_READ_ENABLED: 'true',
          AGENCY_SERVICE_URL: 'http://agency:3600',
          AGENCY_INTERNAL_TOKEN: token,
        }),
      ).toThrow('UTC');
      expect(agencyProfileReadConfig({})).toEqual({ enabled: false });
    } finally {
      runtimeZone.mockReturnValue({ ...runtimeOptions, timeZone: 'UTC' });
    }
  });
});
