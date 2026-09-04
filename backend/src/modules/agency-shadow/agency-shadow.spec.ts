import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import {
  compareAgencyShadow,
  shadowConfig,
  type AgencyProjection,
} from './agency-shadow';

describe('offline Agency shadow comparison', () => {
  const agencyId = randomUUID();
  const token = 'agency-shadow-test-token-at-least-32-characters';
  const profile = {
    agencyId,
    city: 'تهران',
    tier: 'NORMAL',
    joinedAt: '2026-09-04T12:34:56.789Z',
    suspendedAt: null,
  };
  const ids = [randomUUID(), randomUUID()].sort().reverse();
  const items = ids.map((id) => ({
    id,
    invoiceNo: 'INV-' + id,
    amountIrr: '9007199254740993',
    status: 'UNPAID',
    issuedAt: '2026-09-04T12:34:56.789Z',
    dueAt: '2026-10-04T12:34:56.789Z',
    paidAt: null,
  }));
  const snapshot: AgencyProjection = {
    profile,
    invoices: { items, total: '2', page: 1, pageSize: 10 },
  };
  // Keep fixtures in Jest's realm; structuredClone creates host-realm prototypes.
  function copyProjection(value = snapshot): AgencyProjection {
    return {
      ...(value.invoice === undefined
        ? {}
        : { invoice: value.invoice === null ? null : { ...value.invoice } }),
      profile: value.profile ? { ...value.profile } : null,
      invoices: value.invoices
        ? {
            ...value.invoices,
            items: value.invoices.items.map((item) => ({ ...item })),
          }
        : null,
    };
  }
  let server: Server, url: string, mode: string;
  let view: AgencyProjection;
  const calls: Array<{
    path?: string;
    owner?: string | string[];
    token?: string | string[];
    requestId?: string | string[];
  }> = [];

  beforeAll(async () => {
    server = createServer((req, res) => {
      calls.push({
        path: req.url,
        owner: req.headers['x-agency-id'],
        token: req.headers['x-internal-token'],
        requestId: req.headers['x-request-id'],
      });
      if (mode === 'timeout') return;
      if (mode === 'redirect') {
        res.writeHead(302, { Location: '/private' });
        res.end();
        return;
      }
      if (mode === 'failure') {
        res.writeHead(503);
        res.end('{}');
        return;
      }
      if (mode === 'oversized') {
        res.end('x'.repeat(64 * 1024 + 1));
        return;
      }
      const isDetail = req.url?.includes('/invoices/');
      if (isDetail && mode === 'detail-timeout') return;
      if (isDetail && mode === 'detail-redirect') {
        res.writeHead(302, { Location: '/private' });
        res.end();
        return;
      }
      if (isDetail && mode === 'detail-oversized') {
        res.end('x'.repeat(64 * 1024 + 1));
        return;
      }
      if (!view.profile && !(isDetail && mode === 'orphan-detail')) {
        res.writeHead(404);
        res.end(
          JSON.stringify({
            success: false,
            error: { code: 'NOT_FOUND', message: 'یافت نشد' },
          }),
        );
        return;
      }
      const isProfile = req.url?.endsWith('/profile');
      if (isDetail) {
        if (!view.invoice || mode === 'detail-unsafe404') {
          res.writeHead(404);
          res.end(
            JSON.stringify({
              success: false,
              error: {
                code:
                  mode === 'detail-unsafe404' ? 'INTERNAL_ERROR' : 'NOT_FOUND',
                message: 'یافت نشد',
              },
            }),
          );
          return;
        }
        let detail: unknown = view.invoice;
        if (mode === 'detail-wrong-id')
          detail = { ...view.invoice, id: randomUUID() };
        if (mode === 'detail-pii')
          detail = { ...view.invoice, descriptionFa: 'private' };
        if (mode === 'detail-number')
          detail = { ...view.invoice, amountIrr: 900 };
        if (mode === 'detail-time')
          detail = { ...view.invoice, paidAt: '2026-02-30T00:00:00.000Z' };
        res.end(JSON.stringify({ success: true, data: detail }));
        return;
      }
      if (mode === 'partial-missing' && !isProfile) {
        res.writeHead(404);
        res.end('{}');
        return;
      }
      let data: unknown = isProfile ? view.profile : view.invoices;
      if (isProfile) {
        if (mode === 'wrong-owner')
          data = { ...view.profile, agencyId: randomUUID() };
        if (mode === 'pii') data = { ...view.profile, phone: 'private' };
        if (mode === 'invalid-time')
          data = { ...view.profile, joinedAt: '2026-02-30T12:34:56.789Z' };
      } else if (view.invoices) {
        const page = {
          ...view.invoices,
          items: view.invoices.items.map((item) => ({ ...item })),
        };
        if (mode === 'numeric-amount')
          data = { ...page, items: [{ ...items[0], amountIrr: 900 }] };
        if (mode === 'decimal-amount')
          data = {
            ...page,
            items: [{ ...items[0], amountIrr: '1.50' }, items[1]],
          };
        if (mode === 'wrong-page') data = { ...page, page: 2 };
        if (mode === 'wrong-size') data = { ...page, pageSize: 20 };
        if (mode === 'wrong-count') data = { ...page, total: '3' };
        if (mode === 'numeric-total') data = { ...page, total: 2 };
        if (mode === 'duplicate')
          data = { ...page, items: [items[0], items[0]] };
        if (mode === 'extra-field')
          data = {
            ...page,
            items: [{ ...items[0], issuedById: 'private' }, items[1]],
          };
        if (mode === 'reversed')
          data = { ...page, items: [...page.items].reverse() };
        if (mode === 'foreign-invoice')
          data = {
            ...page,
            items: [{ ...items[0], id: randomUUID() }, items[1]],
          };
      }
      res.setHeader('Content-Type', 'application/json');
      res.end(
        mode === 'invalid-json'
          ? '{broken'
          : JSON.stringify({ success: true, data }),
      );
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    url = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
  });
  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });
  beforeEach(() => {
    mode = 'match';
    calls.length = 0;
    view = copyProjection();
  });
  const local = () => Promise.resolve(copyProjection());
  const config = () =>
    shadowConfig({
      AGENCY_SHADOW_ENABLED: 'true',
      AGENCY_SERVICE_URL: url,
      AGENCY_INTERNAL_TOKEN: token,
    });

  it('defaults off and rollback does not read or connect', async () => {
    const read = jest.fn(local);
    expect(
      (await compareAgencyShadow(shadowConfig({}), '', 0, read)).status,
    ).toBe('DISABLED');
    expect(shadowConfig({ AGENCY_SHADOW_ENABLED: 'false' })).toEqual({
      enabled: false,
    });
    expect(read).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });
  it('validates strict flags, credentials, service origins and samples', async () => {
    for (const env of [
      { AGENCY_SHADOW_ENABLED: 'yes' },
      { AGENCY_SHADOW_ENABLED: 'true' },
      ...[
        'http://user:secret@localhost',
        'http://localhost/path',
        'http://localhost?x=1',
        'http://localhost#x',
        'ftp://localhost',
      ].map((origin) => ({
        AGENCY_SHADOW_ENABLED: 'true',
        AGENCY_INTERNAL_TOKEN: token,
        AGENCY_SERVICE_URL: origin,
      })),
    ])
      expect(() => shadowConfig(env)).toThrow();
    for (const page of [0, 1001, 1.5, NaN])
      await expect(
        compareAgencyShadow(config(), agencyId, page, local),
      ).rejects.toThrow();
    await expect(
      compareAgencyShadow(config(), '../other', 1, local),
    ).rejects.toThrow();
    expect(calls).toEqual([]);
  });
  it('matches exact IRR, owner and request correlation without exposing data', async () => {
    const read = jest.fn(local);
    const report = await compareAgencyShadow(config(), agencyId, 1, read);
    expect(report.status).toBe('MATCH');
    expect(read).toHaveBeenCalledTimes(2);
    expect(read).toHaveBeenNthCalledWith(1, agencyId, 1);
    expect(read).toHaveBeenNthCalledWith(2, agencyId, 1);
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.owner).toBe(agencyId);
      expect(call.token).toBe(token);
      expect(call.requestId).toBe(report.requestId);
    }
    expect(calls.map((call) => call.path)).toContain(
      '/internal/v1/agencies/' + agencyId + '/invoices?page=1',
    );
    expect(Object.keys(report).sort()).toEqual(['requestId', 'status']);
    expect(JSON.stringify(report)).not.toContain('9007199254740993');
  });
  it('detects one-rial drift beyond JS safe integer', async () => {
    if (!view.invoices) throw new Error('Fixture missing');
    view.invoices.items[0].amountIrr = '9007199254740994';
    expect(
      (await compareAgencyShadow(config(), agencyId, 1, local)).status,
    ).toBe('MISMATCH');
  });
  it('preserves totals beyond JS safe integer without rounding or scanning all pages', async () => {
    view.invoices = {
      items: Array.from({ length: 10 }, () => ({
        ...items[0],
        id: randomUUID(),
      })),
      total: '9007199254740993',
      page: 1,
      pageSize: 10,
    };
    const expected = copyProjection(view);
    expect(
      (
        await compareAgencyShadow(config(), agencyId, 1, () =>
          Promise.resolve(expected),
        )
      ).status,
    ).toBe('MATCH');
    view.invoices.total = '9007199254740994';
    expect(
      (
        await compareAgencyShadow(config(), agencyId, 1, () =>
          Promise.resolve(expected),
        )
      ).status,
    ).toBe('MISMATCH');
  });
  it.each(['reversed', 'foreign-invoice'])(
    'does not hide %s drift',
    async (value) => {
      mode = value;
      expect(
        (await compareAgencyShadow(config(), agencyId, 1, local)).status,
      ).toBe('MISMATCH');
    },
  );
  it('reports changing local snapshots as inconclusive', async () => {
    let count = 0;
    const read = () => {
      const result = copyProjection();
      if (++count === 2 && result.profile) result.profile.city = 'شیراز';
      return Promise.resolve(result);
    };
    expect(
      (await compareAgencyShadow(config(), agencyId, 1, read)).status,
    ).toBe('INCONCLUSIVE');
  });
  it('compares explicit missing profiles and distinguishes them from empty ones', async () => {
    view = { profile: null, invoices: null };
    expect(
      (
        await compareAgencyShadow(config(), agencyId, 1, () =>
          Promise.resolve(view),
        )
      ).status,
    ).toBe('MATCH');
    expect(
      (await compareAgencyShadow(config(), agencyId, 1, local)).status,
    ).toBe('MISMATCH');
  });
  it.each([
    'wrong-owner',
    'pii',
    'invalid-time',
    'numeric-amount',
    'decimal-amount',
    'wrong-page',
    'wrong-size',
    'wrong-count',
    'numeric-total',
    'duplicate',
    'extra-field',
    'partial-missing',
    'redirect',
    'failure',
    'invalid-json',
    'oversized',
  ])('fails closed on %s', async (value) => {
    mode = value;
    const report = await compareAgencyShadow(config(), agencyId, 1, local);
    expect(report.status).toBe('UNAVAILABLE');
    for (const secret of [agencyId, token, 'private'])
      expect(JSON.stringify(report)).not.toContain(secret);
  });
  it('bounds delay and recovers after timeout', async () => {
    mode = 'timeout';
    const started = Date.now();
    expect(
      (await compareAgencyShadow(config(), agencyId, 1, local)).status,
    ).toBe('UNAVAILABLE');
    expect(Date.now() - started).toBeLessThan(3500);
    mode = 'match';
    expect(
      (await compareAgencyShadow(config(), agencyId, 1, local)).status,
    ).toBe('MATCH');
  });
  it('does not call HTTP if the local database is unavailable', async () => {
    expect(
      (
        await compareAgencyShadow(config(), agencyId, 1, () =>
          Promise.reject(new Error('private SQL')),
        )
      ).status,
    ).toBe('UNAVAILABLE');
    expect(calls).toEqual([]);
  });

  const detailLocal = () =>
    Promise.resolve({ ...copyProjection(), invoice: { ...items[0] } });

  it('compares an explicit detail with exact ID, tenant and shared request correlation', async () => {
    view.invoice = { ...items[0] };
    const read = jest.fn(detailLocal);
    const report = await compareAgencyShadow(
      config(),
      agencyId,
      1,
      read,
      ids[0],
    );
    expect(report.status).toBe('MATCH');
    expect(read).toHaveBeenNthCalledWith(1, agencyId, 1, ids[0]);
    expect(read).toHaveBeenNthCalledWith(2, agencyId, 1, ids[0]);
    expect(calls).toHaveLength(3);
    for (const call of calls) {
      expect(call.owner).toBe(agencyId);
      expect(call.token).toBe(token);
      expect(call.requestId).toBe(report.requestId);
    }
    expect(calls.map((call) => call.path)).toContain(
      '/internal/v1/agencies/' + agencyId + '/invoices/' + ids[0],
    );
    expect(Object.keys(report).sort()).toEqual(['requestId', 'status']);
    expect(JSON.stringify(report)).not.toContain(ids[0]);
  });

  it('rejects invalid optional IDs before IO but retains disabled rollback', async () => {
    const read = jest.fn(detailLocal);
    for (const invalid of ['', '../foreign'])
      await expect(
        compareAgencyShadow(config(), agencyId, 1, read, invalid),
      ).rejects.toThrow();
    expect(read).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
    expect(
      (await compareAgencyShadow({ enabled: false }, '', 0, read, '../foreign'))
        .status,
    ).toBe('DISABLED');
    expect(read).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  it('detects detail-only one-rial drift and unexpected invoice visibility', async () => {
    view.invoice = { ...items[0], amountIrr: '9007199254740994' };
    expect(
      (await compareAgencyShadow(config(), agencyId, 1, detailLocal, ids[0]))
        .status,
    ).toBe('MISMATCH');
    expect(
      (
        await compareAgencyShadow(
          config(),
          agencyId,
          1,
          () => Promise.resolve({ ...copyProjection(), invoice: null }),
          ids[0],
        )
      ).status,
    ).toBe('MISMATCH');
  });

  it('marks detail-only concurrent changes inconclusive', async () => {
    view.invoice = { ...items[0] };
    let reads = 0;
    const changing = () =>
      Promise.resolve({
        ...copyProjection(),
        invoice: {
          ...items[0],
          amountIrr: ++reads === 1 ? '9007199254740993' : '9007199254740994',
        },
      });
    expect(
      (await compareAgencyShadow(config(), agencyId, 1, changing, ids[0]))
        .status,
    ).toBe('INCONCLUSIVE');
  });

  it('compares safe missing/foreign details without requiring page membership', async () => {
    view.invoice = null;
    expect(
      (
        await compareAgencyShadow(
          config(),
          agencyId,
          1,
          () => Promise.resolve(copyProjection(view)),
          randomUUID(),
        )
      ).status,
    ).toBe('MATCH');
    expect(
      (await compareAgencyShadow(config(), agencyId, 1, detailLocal, ids[0]))
        .status,
    ).toBe('MISMATCH');
    view = { profile: null, invoices: null, invoice: null };
    expect(
      (
        await compareAgencyShadow(
          config(),
          agencyId,
          1,
          () => Promise.resolve(copyProjection(view)),
          ids[0],
        )
      ).status,
    ).toBe('MATCH');
  });

  it.each([
    'detail-wrong-id',
    'detail-pii',
    'detail-number',
    'detail-time',
    'detail-unsafe404',
    'detail-redirect',
    'detail-oversized',
  ])('rejects invalid detail boundary: %s', async (testMode) => {
    mode = testMode;
    view.invoice = { ...items[0] };
    const report = await compareAgencyShadow(
      config(),
      agencyId,
      1,
      detailLocal,
      ids[0],
    );
    expect(report.status).toBe('UNAVAILABLE');
    for (const secret of [agencyId, ids[0], token, 'private'])
      expect(JSON.stringify(report)).not.toContain(secret);
  });

  it('rejects a successful detail alongside a missing profile', async () => {
    mode = 'orphan-detail';
    view = { profile: null, invoices: null, invoice: { ...items[0] } };
    expect(
      (
        await compareAgencyShadow(
          config(),
          agencyId,
          1,
          () =>
            Promise.resolve({ profile: null, invoices: null, invoice: null }),
          ids[0],
        )
      ).status,
    ).toBe('UNAVAILABLE');
  });

  it('applies the shared deadline to a stalled detail and recovers', async () => {
    mode = 'detail-timeout';
    view.invoice = { ...items[0] };
    const started = Date.now();
    expect(
      (await compareAgencyShadow(config(), agencyId, 1, detailLocal, ids[0]))
        .status,
    ).toBe('UNAVAILABLE');
    expect(Date.now() - started).toBeLessThan(3500);
    mode = 'match';
    expect(
      (await compareAgencyShadow(config(), agencyId, 1, detailLocal, ids[0]))
        .status,
    ).toBe('MATCH');
  });
});
