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
import type { ExecutiveCardRequestView } from '../src/loyalty/card-requests.dto';

describe('Built Core card requests -> real Loyalty HTTP -> restricted PostgreSQL', () => {
  const role = 'loyalty_cards_test_' + randomBytes(8).toString('hex');
  const quotedRole = '"' + role + '"';
  const password = randomBytes(32).toString('hex');
  const memberId = randomUUID();
  const ids = Array.from({ length: 4 }, () => randomUUID());
  const overflowIds = Array.from({ length: 1001 }, () => randomUUID());
  const token = 'test-loyalty-internal-token-at-least-32-characters';
  const history = [{ step: 'referred', labelFa: 'ارجاع آزمایشی', at: 'اکنون' }];
  const grants = [
    'SELECT (id, "userId", level, "cardStatus", "deactivatedAt", "fullName", email, points) ON loyalty.club_members',
    'SELECT ("clubMemberId", "signedPoints") ON loyalty.club_points_entries',
    'SELECT (id, "userId", "flightInstanceId", cabin, "lockedPriceIrr", "feeIrr", status, "expiresAt", "createdAt", "bookingId") ON loyalty.price_locks',
    'SELECT (id, "memberId", level, points, status, "assignedTo", "decidedById", "decidedAt", "cardNo", history, "createdAt") ON loyalty.club_card_requests',
  ];
  let admin: DataSource;
  let reader: DataSource;
  let app: INestApplication;
  let serviceUrl: string;
  let coreUrl: string;
  let created = false;
  let baseline: unknown;

  async function snapshot() {
    return {
      members: await admin.query<unknown[]>(
        'SELECT * FROM loyalty.club_members WHERE id=$1',
        [memberId],
      ),
      requests: await admin.query<unknown[]>(
        'SELECT * FROM loyalty.club_card_requests WHERE "memberId"=$1 ORDER BY id',
        [memberId],
      ),
    };
  }
  function probe(overrides: NodeJS.ProcessEnv = {}) {
    return new Promise<Record<string, unknown>>((resolveReport, reject) => {
      execFile(
        process.execPath,
        // The probe is typechecked by the package/CI typecheck before E2E.
        [
          '-r',
          'ts-node/register/transpile-only',
          'test/helpers/card-requests-core-probe.ts',
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
              new Error('Core card contract probe failed; output suppressed'),
            );
            return;
          }
          try {
            for (const secret of [password, token, memberId])
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
            reject(new Error('Unsafe or invalid Core card contract report'));
          }
        },
      );
    });
  }
  async function get(path = '/internal/v1/loyalty/card-requests') {
    return fetch(serviceUrl + path, {
      headers: { 'X-Internal-Token': token },
      signal: AbortSignal.timeout(2000),
    });
  }
  const matchedRemote = {
    status: 'MATCH',
    calls: 1,
    remoteResults: 1,
    warnings: 0,
  };
  const matchedFallback = {
    status: 'MATCH',
    calls: 1,
    remoteResults: 0,
    warnings: 1,
  };

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
    try {
      await admin.query(
        'CREATE ROLE ' +
          quotedRole +
          " LOGIN PASSWORD '" +
          password +
          "' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS",
      );
      created = true;
    } catch {
      throw new Error('Unable to provision ephemeral card reader');
    }
    await admin.query('GRANT USAGE ON SCHEMA loyalty TO ' + quotedRole);
    for (const grant of grants)
      await admin.query('GRANT ' + grant + ' TO ' + quotedRole);
    url.username = role;
    url.password = password;
    reader = await new DataSource(databaseOptions(url.toString())).initialize();
    expect((await verifyReader(reader, false, false, false, true)).status).toBe(
      'PASS',
    );
    await admin.query(
      `INSERT INTO loyalty.club_members (id, "fullName", email, "nationalIdEnc", "nationalIdHash", points, level, "deactivatedAt")
       VALUES ($1, 'عضو آزمایش صف', 'cards@example.invalid', 'protected-ciphertext', $2, 6500, 'GOLD', '2026-09-05T00:00:00.000Z')`,
      [memberId, randomBytes(32).toString('hex')],
    );
    for (const [index, status] of [
      'REFERRED',
      'APPROVED',
      'REJECTED',
      'SUBMITTED',
    ].entries()) {
      await admin.query(
        `INSERT INTO loyalty.club_card_requests
          (id, "memberId", level, points, status, "assignedTo", "decidedAt", "cardNo", history, "createdAt")
         VALUES ($1,$2,'GOLD',6000,$3,'CHAIR',$4,$5,$6::jsonb,$7)`,
        [
          ids[index],
          memberId,
          status,
          index === 1 ? '2026-09-05T13:00:00.456Z' : null,
          index === 1 ? 'GOLD-1234' : null,
          JSON.stringify(history),
          '2026-09-05T12:00:0' + index + '.123Z',
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
    config.set('LOYALTY_CARD_REQUESTS_PROJECTION_ENABLED', 'true');
    for (const flag of [
      'LOYALTY_MEMBERS_LIST_PROJECTION_ENABLED',
      'LOYALTY_MEMBERSHIP_PROJECTION_ENABLED',
      'LOYALTY_TIER_RULES_PROJECTION_ENABLED',
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
            'DELETE FROM loyalty.club_card_requests WHERE "memberId"=$1',
            [memberId],
          );
          await admin.query('DELETE FROM loyalty.club_members WHERE id=$1', [
            memberId,
          ]);
          if (created) {
            for (const grant of grants)
              await admin.query('REVOKE ' + grant + ' FROM ' + quotedRole);
            await admin.query(
              'REVOKE USAGE ON SCHEMA loyalty FROM ' + quotedRole,
            );
            await admin.query('DROP ROLE ' + quotedRole);
          }
        } finally {
          await admin.destroy();
        }
      }
    }
  });

  it('matches fields, all executive statuses, UTC decisions/history and newest-first order including inactive members', async () => {
    const response = await get();
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: ExecutiveCardRequestView[];
    };
    const fixtures = body.data.filter((row) => row.memberId === memberId);
    expect(fixtures.map((row) => row.id)).toEqual([ids[2], ids[1], ids[0]]);
    expect(fixtures[1]).toMatchObject({
      decidedAt: '2026-09-05T13:00:00.456Z',
      cardNo: 'GOLD-1234',
      history,
      member: { id: memberId, points: 6500 },
    });
    expect(JSON.stringify(body)).not.toContain('nationalId');
    expect(await probe()).toEqual(matchedRemote);
  });
  it('rolls back via either disabled flag and rejects a wrong internal credential', async () => {
    const config = app.get(ConfigService);
    config.set('LOYALTY_CARD_REQUESTS_PROJECTION_ENABLED', 'false');
    try {
      expect(await probe()).toEqual(matchedFallback);
      expect(
        await probe({
          PROBE_ENABLED: 'false',
          PROBE_SERVICE_URL: 'invalid',
          PROBE_INTERNAL_TOKEN: '',
        }),
      ).toEqual({ ...matchedRemote, remoteResults: 0 });
    } finally {
      config.set('LOYALTY_CARD_REQUESTS_PROJECTION_ENABLED', 'true');
    }
    expect(
      await probe({
        PROBE_INTERNAL_TOKEN: 'incorrect-internal-token-at-least-32-chars',
      }),
    ).toEqual({ status: 'REJECTED', calls: 1, remoteResults: 0, warnings: 1 });
  }, 45000);
  it('fails readiness for a lost decision-column grant and falls back to Core', async () => {
    const grant = 'SELECT ("decidedAt") ON loyalty.club_card_requests';
    await admin.query('REVOKE ' + grant + ' FROM ' + quotedRole);
    try {
      expect(
        (await verifyReader(reader, false, false, false, true)).status,
      ).toBe('FAIL');
      const response = await get('/ready');
      expect(response.status).toBe(503);
      await response.arrayBuffer();
      expect(await probe()).toEqual(matchedFallback);
    } finally {
      await admin.query('GRANT ' + grant + ' TO ' + quotedRole);
    }
    expect((await verifyReader(reader, false, false, false, true)).status).toBe(
      'PASS',
    );
  });
  it('returns 409 and complete Core fallback for oversized history', async () => {
    await admin.query(
      'UPDATE loyalty.club_card_requests SET history=$2::jsonb WHERE id=$1',
      [ids[0], JSON.stringify(Array.from({ length: 33 }, () => history[0]))],
    );
    try {
      const response = await get();
      expect(response.status).toBe(409);
      await response.arrayBuffer();
      expect(await probe()).toEqual(matchedFallback);
    } finally {
      await admin.query(
        'UPDATE loyalty.club_card_requests SET history=$2::jsonb WHERE id=$1',
        [ids[0], JSON.stringify(history)],
      );
    }
  });
  it('returns 409 and complete Core fallback beyond 1000 rows', async () => {
    try {
      await admin.query(
        `INSERT INTO loyalty.club_card_requests (id, "memberId", level, points, status, history)
         SELECT fixture, $2, 'GOLD', 6000, 'REFERRED', $3::jsonb FROM unnest($1::text[]) AS fixture`,
        [overflowIds, memberId, JSON.stringify(history)],
      );
      const response = await get();
      expect(response.status).toBe(409);
      await response.arrayBuffer();
      expect(await probe()).toEqual(matchedFallback);
    } finally {
      await admin.query(
        'DELETE FROM loyalty.club_card_requests WHERE id=ANY($1::text[])',
        [overflowIds],
      );
    }
  });
  it('preserves Core results after stopping the real listener', async () => {
    await app.close();
    expect(await probe()).toEqual(matchedFallback);
  });
});
