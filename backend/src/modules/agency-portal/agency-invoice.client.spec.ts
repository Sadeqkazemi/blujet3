import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { Test } from '@nestjs/testing';
import { AgencyInvoiceClient } from './agency-invoice.client';
import { agencyInvoiceReadConfig } from '../../config/agency-invoice-read.config';

describe('Agency portal invoice client', () => {
  const owner = randomUUID();
  const token = 'private-test-service-token-at-least-32-characters';
  const row = {
    id: randomUUID(),
    agencyId: owner,
    bookingId: null,
    invoiceNo: 'INV-1',
    issuedById: randomUUID(),
    issuedAt: '2026-09-01T00:00:00.000Z',
    dueAt: '2026-10-01T00:00:00.000Z',
    paidAt: null,
    amountIrr: '9007199254740993',
    descriptionFa: 'confidential',
    status: 'UNPAID',
  };
  let server: Server, client: AgencyInvoiceClient, config: ConfigService;
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
          ? 'x'.repeat(1024 * 1024 + 1)
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
      AGENCY_INVOICES_READ_ENABLED: 'true',
      AGENCY_SERVICE_URL: 'http://127.0.0.1:' + address.port,
      AGENCY_INTERNAL_TOKEN: token,
    });
    const module = await Test.createTestingModule({
      providers: [
        AgencyInvoiceClient,
        { provide: ConfigService, useValue: config },
        { provide: PinoLogger, useValue: { warn } },
      ],
    }).compile();
    client = module.get(AgencyInvoiceClient);
  });
  beforeEach(() => {
    data = [{ ...row }];
    status = 200;
    mode = '';
    calls = [];
    warn.mockClear();
    config.set('AGENCY_INVOICES_READ_ENABLED', 'true');
  });
  afterAll(async () => {
    runtimeZone.mockRestore();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  it('preserves every wire field, exact IRR, trusted owner and correlation', async () => {
    expect(await client.list(owner, 'invoice-read-test')).toEqual([row]);
    expect(calls).toEqual([
      {
        path: '/internal/v1/agencies/' + owner + '/portal-invoices',
        owner,
        token,
        requestId: 'invoice-read-test',
      },
    ]);
    expect(warn).not.toHaveBeenCalled();
  });
  it('keeps disabled rollback free of HTTP, even with invalid owner', async () => {
    config.set('AGENCY_INVOICES_READ_ENABLED', 'false');
    expect(await client.list('invalid')).toBeUndefined();
    expect(calls).toEqual([]);
  });
  it('returns honest empty arrays', async () => {
    data = [];
    expect(await client.list(owner)).toEqual([]);
  });
  it('falls back when the service cannot be reached', async () => {
    const url = config.get<string>('AGENCY_SERVICE_URL');
    config.set('AGENCY_SERVICE_URL', 'http://127.0.0.1:1');
    try {
      expect(await client.list(owner)).toBeUndefined();
      expect(calls).toEqual([]);
    } finally {
      config.set('AGENCY_SERVICE_URL', url);
    }
  });
  it('rejects invalid owner before HTTP', async () => {
    await expect(client.list('../foreign')).rejects.toMatchObject({
      status: 503,
    });
    expect(calls).toEqual([]);
  });
  it.each([401, 403, 404, 429, 302])(
    'fails closed for status %s without following redirects',
    async (code) => {
      status = code;
      await expect(client.list(owner)).rejects.toMatchObject({ status: 503 });
      expect(calls).toHaveLength(1);
    },
  );
  it.each([500, 502, 503])(
    'allows authorized Core fallback for status %s',
    async (code) => {
      status = code;
      expect(await client.list(owner)).toBeUndefined();
    },
  );
  it.each([
    { agencyId: randomUUID() },
    { amountIrr: 10 },
    { amountIrr: '01' },
    { dueAt: '2026-02-30T00:00:00.000Z' },
    { password: 'private' },
    { bookingId: '../bad' },
    { issuedById: '' },
    { status: 'INVALID' },
  ])('rejects malformed or foreign rows: %j', async (override) => {
    data = [{ ...row, ...override }];
    await expect(client.list(owner)).rejects.toMatchObject({ status: 503 });
    const logs = JSON.stringify(warn.mock.calls);
    for (const secret of [owner, token, 'confidential', row.amountIrr])
      expect(logs).not.toContain(secret);
  });
  it('rejects duplicates, partial objects and wrong ordering', async () => {
    for (const invalid of [
      [row, row],
      [{ id: row.id }],
      [row, { ...row, id: randomUUID(), issuedAt: '2026-09-02T00:00:00.000Z' }],
    ]) {
      data = invalid;
      await expect(client.list(owner)).rejects.toMatchObject({ status: 503 });
    }
  });
  it('fails closed for malformed JSON', async () => {
    mode = 'invalid-json';
    await expect(client.list(owner)).rejects.toMatchObject({ status: 503 });
  });
  it.each(['timeout', 'stalled-body', 'oversized'])(
    'bounds %s and recovers without cached data',
    async (failure) => {
      mode = failure;
      const started = Date.now();
      expect(await client.list(owner)).toBeUndefined();
      expect(Date.now() - started).toBeLessThan(3500);
      mode = '';
      expect(await client.list(owner)).toEqual([row]);
    },
  );
  it('validates the enabled origin/token/flag but ignores disabled credentials', () => {
    expect(agencyInvoiceReadConfig({})).toEqual({ enabled: false });
    const good = {
      AGENCY_INVOICES_READ_ENABLED: 'true',
      AGENCY_SERVICE_URL: 'http://agency:3600',
      AGENCY_INTERNAL_TOKEN: token,
    };
    expect(agencyInvoiceReadConfig(good)).toMatchObject({ enabled: true });
    for (const override of [
      { AGENCY_INVOICES_READ_ENABLED: 'yes' },
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
      expect(() => agencyInvoiceReadConfig({ ...good, ...override })).toThrow();
  });
  it('refuses non-UTC cutover without changing the disabled path', () => {
    runtimeZone.mockReturnValue({ ...runtimeOptions, timeZone: 'Asia/Tehran' });
    try {
      expect(() =>
        agencyInvoiceReadConfig({
          AGENCY_INVOICES_READ_ENABLED: 'true',
          AGENCY_SERVICE_URL: 'http://agency:3600',
          AGENCY_INTERNAL_TOKEN: token,
        }),
      ).toThrow('UTC');
      expect(agencyInvoiceReadConfig({})).toEqual({ enabled: false });
    } finally {
      runtimeZone.mockReturnValue({ ...runtimeOptions, timeZone: 'UTC' });
    }
  });
});
