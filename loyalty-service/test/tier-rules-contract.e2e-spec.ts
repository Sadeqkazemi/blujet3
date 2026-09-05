import { execFile } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { databaseOptions } from '../src/config';
import { verifyReader } from '../src/reader-verification';

describe('Built Core tier rules -> real Loyalty HTTP -> restricted PostgreSQL', () => {
  const role = 'loyalty_tiers_test_' + randomBytes(8).toString('hex');
  const quotedRole = '"' + role + '"';
  const password = randomBytes(32).toString('hex');
  const ids = [randomUUID(), randomUUID()];
  const token = 'test-loyalty-internal-token-at-least-32-characters';
  const updatedAt = '2026-09-05T10:11:12.345Z';
  const grants = [
    'SELECT (id, "userId", level, "cardStatus", "deactivatedAt") ON loyalty.club_members',
    'SELECT ("clubMemberId", "signedPoints") ON loyalty.club_points_entries',
    'SELECT (id, "userId", "flightInstanceId", cabin, "lockedPriceIrr", "feeIrr", status, "expiresAt", "createdAt", "bookingId") ON loyalty.price_locks',
    'SELECT ("goldMinPoints", "platinumMinPoints", "cardRequestMinPoints", "updatedAt", "updatedById", "createdAt") ON loyalty.club_tier_rules',
  ];
  const expected = {
    goldMinPoints: 6001,
    platinumMinPoints: 19001,
    cardRequestMinPoints: 701,
    updatedAt,
    updatedByLabelFa: 'مدیر بازرگانی',
    preview: [
      { tier: 'SILVER', minPoints: 0, maxPoints: 6000 },
      { tier: 'GOLD', minPoints: 6001, maxPoints: 19000 },
      { tier: 'PLATINUM', minPoints: 19001, maxPoints: null },
    ],
  };
  const remote = { status: 'MATCH', calls: 1, remoteResults: 1, warnings: 0 };
  const fallback = { status: 'MATCH', calls: 1, remoteResults: 0, warnings: 1 };
  let admin: DataSource;
  let reader: DataSource;
  let app: INestApplication;
  let serviceUrl: string;
  let coreUrl: string;
  let updaterId: string;
  let created = false;
  let baseline: unknown;
  let originalRules: unknown;

  async function snapshot() {
    return admin.query<unknown[]>(
      'SELECT * FROM loyalty.club_tier_rules ORDER BY id',
    );
  }
  function probe(overrides: NodeJS.ProcessEnv = {}) {
    return new Promise<Record<string, unknown>>((resolveReport, reject) => {
      execFile(
        process.execPath,
        [
          '-r',
          'ts-node/register/transpile-only',
          'test/helpers/tier-rules-core-probe.ts',
        ],
        {
          cwd: resolve(__dirname, '..'),
          env: {
            ...process.env,
            NODE_ENV: 'test',
            TZ: 'UTC',
            CORE_TEST_DATABASE_URL: coreUrl,
            PROBE_SERVICE_URL: serviceUrl,
            PROBE_INTERNAL_TOKEN: token,
            PROBE_EXPECTED: JSON.stringify(expected),
            ...overrides,
          },
          timeout: 15000,
          windowsHide: true,
          maxBuffer: 8192,
          encoding: 'utf8',
        },
        (error, stdout, stderr) => {
          if (error || stderr) {
            reject(
              new Error(
                'Core tier-rules contract probe failed; output suppressed',
              ),
            );
            return;
          }
          try {
            for (const secret of [password, token, updaterId, ...ids])
              expect(stdout).not.toContain(secret);
            const report = JSON.parse(stdout) as Record<string, unknown>;
            expect(Object.keys(report).sort()).toEqual([
              'calls',
              'remoteResults',
              'status',
              'warnings',
            ]);
            resolveReport(report);
          } catch {
            reject(new Error('Unsafe or invalid Core tier-rules report'));
          }
        },
      );
    });
  }
  async function get(path = '/internal/v1/loyalty/tier-rules') {
    return fetch(serviceUrl + path, {
      headers: { 'X-Internal-Token': token },
      signal: AbortSignal.timeout(2000),
    });
  }

  beforeAll(async () => {
    const url = new URL(process.env.LOYALTY_DATABASE_URL ?? '');
    if (!url.pathname.endsWith('_test'))
      throw new Error('Test database required');
    coreUrl = url.toString();
    admin = await new DataSource({
      type: 'postgres',
      url: coreUrl,
      entities: [],
      synchronize: false,
      logging: false,
    }).initialize();
    originalRules = await snapshot();
    const earlier = await admin.query<unknown[]>(
      `SELECT id FROM loyalty.club_tier_rules WHERE "createdAt" <= '1901-01-01' LIMIT 1`,
    );
    if (earlier.length) throw new Error('Test requires no pre-1901 tier rules');
    const staff = await admin.query<{ id: string }[]>(
      `SELECT id FROM identity.users WHERE role='COMMERCIAL_MANAGER' ORDER BY id LIMIT 1`,
    );
    if (!staff[0]) throw new Error('Seeded commercial manager required');
    updaterId = staff[0].id;
    await admin.query(
      'CREATE ROLE ' +
        quotedRole +
        " LOGIN PASSWORD '" +
        password +
        "' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS",
    );
    created = true;
    await admin.query('GRANT USAGE ON SCHEMA loyalty TO ' + quotedRole);
    for (const grant of grants)
      await admin.query('GRANT ' + grant + ' TO ' + quotedRole);
    url.username = role;
    url.password = password;
    reader = await new DataSource(databaseOptions(url.toString())).initialize();
    expect((await verifyReader(reader, false, true)).status).toBe('PASS');
    for (const [index, id] of ids.entries()) {
      await admin.query(
        `INSERT INTO loyalty.club_tier_rules
         (id, "goldMinPoints", "platinumMinPoints", "cardRequestMinPoints", "updatedAt", "updatedById", "createdAt")
         VALUES ($1,$2,19001,701,$3,$4,$5)`,
        [
          id,
          6001 + index,
          updatedAt,
          updaterId,
          index === 0 ? '1900-01-01' : '1901-01-01',
        ],
      );
    }
    baseline = await snapshot();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DataSource)
      .useValue(reader)
      .compile();
    app = module.createNestApplication({ logger: false });
    const config = app.get(ConfigService);
    config.set('LOYALTY_TIER_RULES_PROJECTION_ENABLED', 'true');
    for (const flag of [
      'LOYALTY_CARD_REQUESTS_PROJECTION_ENABLED',
      'LOYALTY_MEMBERS_LIST_PROJECTION_ENABLED',
      'LOYALTY_MEMBERSHIP_PROJECTION_ENABLED',
    ])
      config.set(flag, 'false');
    await app.listen(0, '127.0.0.1');
    serviceUrl = await app.getUrl();
  });
  afterEach(async () => {
    if (admin?.isInitialized && baseline)
      expect(await snapshot()).toEqual(baseline);
  });
  afterAll(async () => {
    try {
      if (app) await app.close();
    } finally {
      if (reader?.isInitialized) await reader.destroy();
      if (admin?.isInitialized) {
        try {
          await admin.query(
            'DELETE FROM loyalty.club_tier_rules WHERE id=ANY($1::text[])',
            [ids],
          );
          if (created) {
            for (const grant of grants)
              await admin.query('REVOKE ' + grant + ' FROM ' + quotedRole);
            await admin.query(
              'REVOKE USAGE ON SCHEMA loyalty FROM ' + quotedRole,
            );
            await admin.query('DROP ROLE ' + quotedRole);
          }
          if (originalRules) expect(await snapshot()).toEqual(originalRules);
        } finally {
          await admin.destroy();
        }
      }
    }
  });

  it('matches oldest-rule thresholds, exact UTC, Persian updater label and preview through real transport', async () => {
    const response = await get();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: {
        goldMinPoints: 6001,
        platinumMinPoints: 19001,
        cardRequestMinPoints: 701,
        updatedAt,
        updatedById: updaterId,
      },
    });
    expect(await probe()).toEqual(remote);
  });
  it('preserves null updater and zero card-request threshold', async () => {
    await admin.query(
      'UPDATE loyalty.club_tier_rules SET "updatedById"=NULL, "cardRequestMinPoints"=0 WHERE id=$1',
      [ids[0]],
    );
    try {
      expect(
        await probe({
          PROBE_EXPECTED: JSON.stringify({
            ...expected,
            updatedByLabelFa: null,
            cardRequestMinPoints: 0,
          }),
        }),
      ).toEqual(remote);
    } finally {
      await admin.query(
        'UPDATE loyalty.club_tier_rules SET "updatedById"=$2, "cardRequestMinPoints"=701 WHERE id=$1',
        [ids[0], updaterId],
      );
    }
  });
  it('makes zero HTTP calls when Core flag is disabled, even with invalid connection config', async () => {
    expect(
      await probe({
        PROBE_ENABLED: 'false',
        PROBE_SERVICE_URL: 'invalid',
        PROBE_INTERNAL_TOKEN: '',
      }),
    ).toEqual({ ...remote, calls: 0, remoteResults: 0 });
  });
  it('falls back when the service projection is disabled', async () => {
    app
      .get(ConfigService)
      .set('LOYALTY_TIER_RULES_PROJECTION_ENABLED', 'false');
    try {
      expect(await probe()).toEqual(fallback);
    } finally {
      app
        .get(ConfigService)
        .set('LOYALTY_TIER_RULES_PROJECTION_ENABLED', 'true');
    }
  });
  it('rejects a wrong internal credential without Core fallback', async () => {
    expect(
      await probe({
        PROBE_INTERNAL_TOKEN: 'incorrect-internal-token-at-least-32-chars',
      }),
    ).toEqual({ status: 'REJECTED', calls: 1, remoteResults: 0, warnings: 1 });
  });
  it('fails readiness for lost update-column access and recovers after restoring the grant', async () => {
    const grant = 'SELECT ("updatedAt") ON loyalty.club_tier_rules';
    await admin.query('REVOKE ' + grant + ' FROM ' + quotedRole);
    try {
      expect((await verifyReader(reader, false, true)).status).toBe('FAIL');
      const response = await get('/ready');
      expect(response.status).toBe(503);
      await response.arrayBuffer();
      expect(await probe()).toEqual(fallback);
    } finally {
      await admin.query('GRANT ' + grant + ' TO ' + quotedRole);
    }
    expect((await verifyReader(reader, false, true)).status).toBe('PASS');
    expect(await probe()).toEqual(remote);
  }, 40000);
  it('denies Identity reads and rule writes even without session read-only', async () => {
    const connection = reader.createQueryRunner();
    await connection.connect();
    try {
      await connection.query('SET default_transaction_read_only=off');
      await expect(
        connection.query('SELECT role FROM identity.users WHERE id=$1', [
          updaterId,
        ]),
      ).rejects.toMatchObject({ code: '42501' });
      await expect(
        connection.query(
          'UPDATE loyalty.club_tier_rules SET "goldMinPoints"=0 WHERE false',
        ),
      ).rejects.toMatchObject({ code: '42501' });
    } finally {
      await connection.release();
    }
  });
  it('preserves Core results when the real service listener stops', async () => {
    await app.close();
    expect(await probe()).toEqual(fallback);
  });
});
