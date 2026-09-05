import { execFile } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { databaseOptions } from '../src/config';
import { verifyReader } from '../src/reader-verification';

describe('Built Core membership -> real Loyalty HTTP -> restricted PostgreSQL', () => {
  const owners = [randomUUID(), randomUUID()];
  const absentOwner = randomUUID();
  const members = [randomUUID(), randomUUID()];
  const requests = [randomUUID(), randomUUID(), randomUUID()];
  const role = 'loyalty_membership_test_' + randomBytes(8).toString('hex');
  const quotedRole = '"' + role + '"';
  const password = randomBytes(32).toString('hex');
  const token = 'test-loyalty-internal-token-at-least-32-characters';
  const history = [{ step: 'referred', labelFa: 'ارجاع آزمایشی', at: 'اکنون' }];
  const createdAt = '2026-09-05T10:11:12.345Z';
  const grants = [
    'SELECT (id, "userId", level, "cardStatus", "deactivatedAt", "cardNo") ON loyalty.club_members',
    'SELECT ("clubMemberId", "signedPoints") ON loyalty.club_points_entries',
    'SELECT (id, "userId", "flightInstanceId", cabin, "lockedPriceIrr", "feeIrr", status, "expiresAt", "createdAt", "bookingId") ON loyalty.price_locks',
    'SELECT (id, "memberId", status, history, "cardNo", "createdAt") ON loyalty.club_card_requests',
    'SELECT ("goldMinPoints", "platinumMinPoints", "cardRequestMinPoints", "createdAt") ON loyalty.club_tier_rules',
  ];
  const remote = { status: 'MATCH', calls: 1, remoteResults: 1, warnings: 0 };
  const fallback = { status: 'MATCH', calls: 1, remoteResults: 0, warnings: 1 };
  const rejected = {
    status: 'REJECTED',
    calls: 1,
    remoteResults: 0,
    warnings: 1,
  };
  let admin: DataSource;
  let reader: DataSource;
  let app: INestApplication;
  let serviceUrl: string;
  let coreUrl: string;
  let created = false;
  let baseline: unknown;
  let rules: {
    goldMinPoints: number;
    platinumMinPoints: number;
    cardRequestMinPoints: number;
  };

  async function snapshot() {
    return {
      users: await admin.query<unknown[]>(
        'SELECT * FROM identity.users WHERE id=ANY($1::text[]) ORDER BY id',
        [owners],
      ),
      members: await admin.query<unknown[]>(
        'SELECT * FROM loyalty.club_members WHERE id=ANY($1::text[]) ORDER BY id',
        [members],
      ),
      points: await admin.query<unknown[]>(
        'SELECT * FROM loyalty.club_points_entries WHERE "clubMemberId"=ANY($1::text[]) ORDER BY id',
        [members],
      ),
      requests: await admin.query<unknown[]>(
        'SELECT * FROM loyalty.club_card_requests WHERE "memberId"=ANY($1::text[]) ORDER BY id',
        [members],
      ),
      rules: await admin.query<unknown[]>(
        'SELECT * FROM loyalty.club_tier_rules ORDER BY id',
      ),
    };
  }
  function expected(status = 'REFERRED') {
    return {
      isMember: true,
      level: 'SILVER',
      balance: 70,
      cardStatus: 'NONE',
      cardNo: null,
      tierRules: rules,
      cardRequest: {
        id: requests[1],
        status,
        history,
        cardNo: null,
        createdAt,
      },
      canRequestCard: false,
      pointsNeededForCard: Math.max(rules.cardRequestMinPoints - 70, 0),
    };
  }
  function absent() {
    return {
      isMember: false,
      level: null,
      balance: 0,
      cardStatus: null,
      cardNo: null,
      tierRules: rules,
      cardRequest: null,
      canRequestCard: false,
      pointsNeededForCard: rules.cardRequestMinPoints,
    };
  }
  function probe(overrides: NodeJS.ProcessEnv = {}) {
    return new Promise<Record<string, unknown>>((resolveReport, reject) => {
      execFile(
        process.execPath,
        [
          '-r',
          'ts-node/register/transpile-only',
          'test/helpers/membership-core-probe.ts',
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
            PROBE_OWNER: owners[0],
            PROBE_EXPECTED: JSON.stringify(expected()),
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
              new Error('Core membership probe failed; output suppressed'),
            );
            return;
          }
          try {
            for (const secret of [
              password,
              token,
              ...owners,
              ...members,
              ...requests,
            ])
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
            reject(new Error('Unsafe or invalid membership report'));
          }
        },
      );
    });
  }
  function get(path: string, owner = owners[0], credential = token) {
    return fetch(serviceUrl + path, {
      headers: {
        'X-Internal-Token': credential,
        'X-Loyalty-User-Id': owner,
      },
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
    const existing = await admin.query<(typeof rules)[]>(
      'SELECT "goldMinPoints", "platinumMinPoints", "cardRequestMinPoints" FROM loyalty.club_tier_rules ORDER BY "createdAt" ASC LIMIT 1',
    );
    if (!existing[0]) throw new Error('Seeded tier rule required');
    rules = existing[0];
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
    expect((await verifyReader(reader, true)).status).toBe('PASS');
    await admin.transaction(async (tx) => {
      for (const [index, owner] of owners.entries()) {
        await tx.query(
          'INSERT INTO identity.users (id, role, "fullName", "updatedAt") VALUES ($1,\'USER\',\'Membership test\',NOW())',
          [owner],
        );
        await tx.query(
          `INSERT INTO loyalty.club_members
          (id,"userId","fullName",email,"nationalIdEnc","nationalIdHash",points)
          VALUES ($1,$2,'Private membership','membership@example.invalid','test-ciphertext',$3,999)`,
          [members[index], owner, randomUUID()],
        );
        await tx.query(
          `INSERT INTO loyalty.club_points_entries (id,"clubMemberId",type,"signedPoints")
          VALUES ($1,$2,'EARN',$3)`,
          [
            randomUUID(),
            members[index],
            index === 0 ? 100 : rules.cardRequestMinPoints + 25,
          ],
        );
      }
      await tx.query(
        `INSERT INTO loyalty.club_points_entries (id,"clubMemberId",type,"signedPoints")
        VALUES ($1,$2,'EARN',-30)`,
        [randomUUID(), members[0]],
      );
      for (const [index, status] of [
        'SUBMITTED',
        'REFERRED',
        'REJECTED',
      ].entries())
        await tx.query(
          `INSERT INTO loyalty.club_card_requests (id,"memberId",level,points,status,history,"createdAt")
          VALUES ($1,$2,'SILVER',70,$3,$4::jsonb,$5)`,
          [
            requests[index],
            members[0],
            status,
            JSON.stringify(history),
            index === 1
              ? createdAt
              : index === 0
                ? '2026-09-04T00:00:00.000Z'
                : '2026-09-06T00:00:00.000Z',
          ],
        );
    });
    baseline = await snapshot();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DataSource)
      .useValue(reader)
      .compile();
    app = module.createNestApplication({ logger: false });
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    app.get(ConfigService).set('LOYALTY_MEMBERSHIP_PROJECTION_ENABLED', 'true');
    for (const flag of [
      'LOYALTY_TIER_RULES_PROJECTION_ENABLED',
      'LOYALTY_MEMBERS_LIST_PROJECTION_ENABLED',
      'LOYALTY_CARD_REQUESTS_PROJECTION_ENABLED',
    ])
      app.get(ConfigService).set(flag, 'false');
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
          await admin.transaction(async (tx) => {
            await tx.query(
              'DELETE FROM loyalty.club_card_requests WHERE "memberId"=ANY($1::text[])',
              [members],
            );
            await tx.query(
              'DELETE FROM loyalty.club_points_entries WHERE "clubMemberId"=ANY($1::text[])',
              [members],
            );
            await tx.query(
              'DELETE FROM loyalty.club_members WHERE id=ANY($1::text[])',
              [members],
            );
            await tx.query(
              'DELETE FROM identity.users WHERE id=ANY($1::text[])',
              [owners],
            );
          });
          if (created) {
            for (const grant of grants)
              await admin.query('REVOKE ' + grant + ' FROM ' + quotedRole);
            await admin.query(
              'REVOKE USAGE ON SCHEMA loyalty FROM ' + quotedRole,
            );
            await admin.query('DROP ROLE ' + quotedRole);
          }
          const remaining = await snapshot();
          expect(remaining.users).toEqual([]);
          expect(remaining.members).toEqual([]);
          expect(remaining.points).toEqual([]);
          expect(remaining.requests).toEqual([]);
        } finally {
          await admin.destroy();
        }
      }
    }
  });

  it.each(['SUBMITTED', 'REFERRED', 'APPROVED'])(
    'matches ledger and latest readable %s card request, ignoring newer rejection',
    async (status) => {
      await admin.query(
        'UPDATE loyalty.club_card_requests SET status=$2 WHERE id=$1',
        [requests[1], status],
      );
      try {
        expect(
          await probe({ PROBE_EXPECTED: JSON.stringify(expected(status)) }),
        ).toEqual(remote);
      } finally {
        await admin.query(
          "UPDATE loyalty.club_card_requests SET status='REFERRED' WHERE id=$1",
          [requests[1]],
        );
      }
    },
  );
  it('isolates another member balance and eligibility without a card request', async () => {
    expect(
      await probe({
        PROBE_OWNER: owners[1],
        PROBE_EXPECTED: JSON.stringify({
          ...expected(),
          balance: rules.cardRequestMinPoints + 25,
          cardRequest: null,
          canRequestCard: true,
          pointsNeededForCard: 0,
        }),
      }),
    ).toEqual(remote);
  });
  it('preserves absent and deactivated membership without exposing old requests', async () => {
    expect(
      await probe({
        PROBE_OWNER: absentOwner,
        PROBE_EXPECTED: JSON.stringify(absent()),
      }),
    ).toEqual(remote);
    await admin.query(
      'UPDATE loyalty.club_members SET "deactivatedAt"=NOW() WHERE id=$1',
      [members[0]],
    );
    try {
      expect(await probe({ PROBE_EXPECTED: JSON.stringify(absent()) })).toEqual(
        remote,
      );
    } finally {
      await admin.query(
        'UPDATE loyalty.club_members SET "deactivatedAt"=NULL WHERE id=$1',
        [members[0]],
      );
    }
  }, 40000);
  it('enforces owner assertion, service credentials and UUID validation over HTTP', async () => {
    for (const [path, owner, credential, status] of [
      ['/internal/v1/loyalty/membership/' + owners[0], owners[1], token, 403],
      [
        '/internal/v1/loyalty/membership/' + owners[0],
        owners[0],
        'wrong-token',
        401,
      ],
      ['/internal/v1/loyalty/membership/invalid', owners[0], token, 400],
    ] as const) {
      const response = await get(path, owner, credential);
      expect(response.status).toBe(status);
      const body = await response.text();
      for (const privateValue of [
        ...owners,
        ...members,
        'membership@example.invalid',
        'test-ciphertext',
      ])
        expect(body).not.toContain(privateValue);
    }
  });
  it('makes zero HTTP calls with Core flag disabled and invalid service config', async () => {
    expect(
      await probe({
        PROBE_ENABLED: 'false',
        PROBE_SERVICE_URL: 'invalid',
        PROBE_INTERNAL_TOKEN: '',
      }),
    ).toEqual({ ...remote, calls: 0, remoteResults: 0 });
  });
  it('fails closed for a disabled service projection until Core flag rollback', async () => {
    app
      .get(ConfigService)
      .set('LOYALTY_MEMBERSHIP_PROJECTION_ENABLED', 'false');
    try {
      expect(await probe()).toEqual(rejected);
    } finally {
      app
        .get(ConfigService)
        .set('LOYALTY_MEMBERSHIP_PROJECTION_ENABLED', 'true');
    }
  });
  it('rejects invalid service credentials without fallback', async () => {
    expect(
      await probe({
        PROBE_INTERNAL_TOKEN: 'incorrect-internal-token-at-least-32-chars',
      }),
    ).toEqual(rejected);
  });
  it('fails readiness for lost history grant, falls back and recovers after grant restoration', async () => {
    const grant = 'SELECT (history) ON loyalty.club_card_requests';
    await admin.query('REVOKE ' + grant + ' FROM ' + quotedRole);
    try {
      expect((await verifyReader(reader, true)).status).toBe('FAIL');
      const response = await get('/ready');
      expect(response.status).toBe(503);
      await response.arrayBuffer();
      expect(await probe()).toEqual(fallback);
    } finally {
      await admin.query('GRANT ' + grant + ' TO ' + quotedRole);
    }
    expect((await verifyReader(reader, true)).status).toBe('PASS');
    expect(await probe()).toEqual(remote);
  }, 40000);
  it('preserves membership via Core when the real listener stops', async () => {
    await app.close();
    expect(await probe()).toEqual(fallback);
  });
});
