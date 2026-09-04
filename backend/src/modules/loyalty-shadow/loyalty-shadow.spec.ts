import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import {
  compareLoyaltyShadow,
  shadowConfig,
  type LoyaltyProjection,
} from './loyalty-shadow';

describe('offline Loyalty shadow comparison', () => {
  const userId = randomUUID();
  const token = 'shadow-test-token-at-least-32-characters';
  const member = {
    id: randomUUID(),
    userId,
    level: 'GOLD',
    cardStatus: 'NONE',
    points: '70',
  };
  const snapshot: LoyaltyProjection = { member, locks: [] };
  let server: Server;
  let url: string;
  let mode = 'match';
  const captured: Array<{
    owner?: string | string[];
    token?: string | string[];
    id?: string | string[];
    path?: string;
  }> = [];

  beforeAll(async () => {
    server = createServer((req, res) => {
      captured.push({
        owner: req.headers['x-loyalty-user-id'],
        token: req.headers['x-internal-token'],
        id: req.headers['x-request-id'],
        path: req.url,
      });
      if (mode === 'timeout') return;
      if (mode === 'redirect') {
        res.writeHead(302, { Location: '/secret' });
        res.end();
        return;
      }
      res.setHeader('Content-Type', 'application/json');
      if (mode === 'oversized') {
        res.end('x'.repeat(512 * 1024 + 1));
        return;
      }
      if (mode === 'failure') {
        res.writeHead(503);
        res.end('{}');
        return;
      }
      if (req.url?.includes('/members/')) {
        if (mode === 'not-found') {
          res.writeHead(404);
          res.end(
            JSON.stringify({ success: false, error: { code: 'NOT_FOUND' } }),
          );
          return;
        }
        const data =
          mode === 'pii'
            ? { ...member, nationalIdEnc: 'private' }
            : mode === 'wrong-owner'
              ? { ...member, userId: randomUUID() }
              : mode === 'mismatch'
                ? { ...member, points: '71' }
                : member;
        res.end(JSON.stringify({ success: true, data }));
      } else {
        res.end(
          JSON.stringify({
            success: true,
            data: mode === 'malformed' ? [{ id: 'incomplete' }] : [],
          }),
        );
      }
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
    captured.length = 0;
  });
  const local = () => Promise.resolve({ member: { ...member }, locks: [] });
  const config = () =>
    shadowConfig({
      LOYALTY_SHADOW_ENABLED: 'true',
      LOYALTY_INTERNAL_TOKEN: token,
      LOYALTY_SERVICE_URL: url,
    });

  it('defaults off and performs no local reads or HTTP requests on rollback', async () => {
    const read = jest.fn(local);
    const report = await compareLoyaltyShadow(shadowConfig({}), userId, read);
    expect(report.status).toBe('DISABLED');
    expect(read).not.toHaveBeenCalled();
    expect(captured).toEqual([]);
    expect(shadowConfig({ LOYALTY_SHADOW_ENABLED: 'false' })).toEqual({
      enabled: false,
    });
  });
  it('validates configured origins, secrets, flags and explicit owner', async () => {
    for (const env of [
      { LOYALTY_SHADOW_ENABLED: 'yes' },
      { LOYALTY_SHADOW_ENABLED: 'true' },
      {
        LOYALTY_SHADOW_ENABLED: 'true',
        LOYALTY_INTERNAL_TOKEN: token,
        LOYALTY_SERVICE_URL: 'http://user:secret@localhost',
      },
      {
        LOYALTY_SHADOW_ENABLED: 'true',
        LOYALTY_INTERNAL_TOKEN: token,
        LOYALTY_SERVICE_URL: 'http://localhost/path',
      },
    ])
      expect(() => shadowConfig(env)).toThrow();
    await expect(
      compareLoyaltyShadow(config(), '../other', local),
    ).rejects.toThrow();
  });
  it('matches real HTTP responses with the same owner, request ID and comparison instant', async () => {
    const read = jest.fn<Promise<LoyaltyProjection>, [string, Date]>(local);
    const report = await compareLoyaltyShadow(config(), userId, read);
    expect(report.status).toBe('MATCH');
    expect(read).toHaveBeenCalledTimes(2);
    expect(read.mock.calls[0][1]).toEqual(read.mock.calls[1][1]);
    expect(captured).toHaveLength(2);
    for (const call of captured) {
      expect(call.owner).toBe(userId);
      expect(call.token).toBe(token);
      expect(call.id).toBe(report.requestId);
    }
    const lockRequest = captured.find((call) =>
      call.path?.includes('/price-locks/'),
    );
    expect(new URL(lockRequest?.path ?? '', url).searchParams.get('at')).toBe(
      read.mock.calls[0][1].toISOString(),
    );
    expect(Object.keys(report).sort()).toEqual(['requestId', 'status']);
  });
  it('distinguishes stable drift from concurrent local changes', async () => {
    mode = 'mismatch';
    expect((await compareLoyaltyShadow(config(), userId, local)).status).toBe(
      'MISMATCH',
    );
    let reads = 0;
    const changing = () => {
      reads++;
      return Promise.resolve({
        ...snapshot,
        member: { ...member, points: reads === 1 ? '70' : '71' },
      });
    };
    expect(
      (await compareLoyaltyShadow(config(), userId, changing)).status,
    ).toBe('INCONCLUSIVE');
  });
  it('compares absent members explicitly', async () => {
    mode = 'not-found';
    expect(
      (
        await compareLoyaltyShadow(config(), userId, () =>
          Promise.resolve({ member: null, locks: [] }),
        )
      ).status,
    ).toBe('MATCH');
  });
  it.each([
    'failure',
    'malformed',
    'pii',
    'wrong-owner',
    'redirect',
    'oversized',
  ])('fails safely on %s without logging projections', async (testMode) => {
    mode = testMode;
    const report = await compareLoyaltyShadow(config(), userId, local);
    expect(report.status).toBe('UNAVAILABLE');
    expect(JSON.stringify(report)).not.toContain(userId);
    expect(JSON.stringify(report)).not.toContain(token);
  });
  it('bounds remote delay and remains usable after timeout', async () => {
    mode = 'timeout';
    const started = Date.now();
    expect((await compareLoyaltyShadow(config(), userId, local)).status).toBe(
      'UNAVAILABLE',
    );
    expect(Date.now() - started).toBeLessThan(3500);
    mode = 'match';
    expect((await compareLoyaltyShadow(config(), userId, local)).status).toBe(
      'MATCH',
    );
  });
  it('does not call the remote service when the local database fails', async () => {
    expect(
      (
        await compareLoyaltyShadow(config(), userId, () =>
          Promise.reject(new Error('private SQL')),
        )
      ).status,
    ).toBe('UNAVAILABLE');
    expect(captured).toEqual([]);
  });
});
