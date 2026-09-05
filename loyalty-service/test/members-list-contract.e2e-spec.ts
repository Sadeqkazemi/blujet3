import { execFile } from 'node:child_process';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { databaseOptions } from '../src/config';
import { verifyReader } from '../src/reader-verification';

describe('Built Core members list -> real Loyalty HTTP -> restricted PostgreSQL', () => {
  const suffix = randomBytes(8).toString('hex');
  const marker = 'members-contract-' + suffix;
  const role = 'loyalty_members_test_' + suffix;
  const quotedRole = '"' + role + '"';
  const password = randomBytes(32).toString('hex');
  const piiKey = randomBytes(32).toString('hex');
  const nationalId = '0012345678';
  const ids = [randomUUID(), randomUUID()];
  const token = 'test-loyalty-internal-token-at-least-32-characters';
  const grants = [
    'SELECT (id, "userId", level, "cardStatus", "deactivatedAt", "fullName", email, "birthDate", "joinDate", points, "cardNo", "issuedByLabelFa", "createdAt") ON loyalty.club_members',
    'SELECT ("clubMemberId", "signedPoints") ON loyalty.club_points_entries',
    'SELECT (id, "userId", "flightInstanceId", cabin, "lockedPriceIrr", "feeIrr", status, "expiresAt", "createdAt", "bookingId") ON loyalty.price_locks',
    'SELECT (status) ON loyalty.club_card_requests',
  ];
  let admin: DataSource;
  let reader: DataSource;
  let app: INestApplication;
  let serviceUrl: string;
  let coreUrl: string;
  let created = false;
  let baseline: unknown;

  async function snapshot() {
    return admin.query<unknown[]>(
      'SELECT * FROM loyalty.club_members WHERE id = ANY($1::text[]) ORDER BY id',
      [ids],
    );
  }

  function probe(overrides: NodeJS.ProcessEnv = {}) {
    return new Promise<Record<string, unknown>>((resolveResult, reject) => {
      execFile(
        process.execPath,
        ['-r', 'ts-node/register', 'test/helpers/members-list-core-probe.ts'],
        {
          cwd: resolve(__dirname, '..'),
          env: {
            ...process.env,
            NODE_ENV: 'test',
            TZ: 'UTC',
            CORE_TEST_DATABASE_URL: coreUrl,
            PII_ENCRYPTION_KEY: piiKey,
            PROBE_SERVICE_URL: serviceUrl,
            PROBE_INTERNAL_TOKEN: token,
            PROBE_QUERY: marker,
            ...overrides,
          },
          timeout: 15000,
          windowsHide: true,
          maxBuffer: 8192,
          encoding: 'utf8',
        },
        (error, stdout, stderr) => {
          if (error || stderr) {
            reject(new Error('Core contract probe failed; output suppressed'));
            return;
          }
          try {
            for (const secret of [marker, password, piiKey, token, nationalId])
              expect(stdout).not.toContain(secret);
            const report = JSON.parse(stdout) as Record<string, unknown>;
            expect(Object.keys(report).sort()).toEqual(
              ['status', 'calls', 'remoteResults', 'warnings'].sort(),
            );
            resolveResult(report);
          } catch {
            reject(new Error('Core contract report is invalid or unsafe'));
          }
        },
      );
    });
  }

  beforeAll(async () => {
    if (
      !existsSync(
        resolve(__dirname, '../../backend/dist/modules/club/club.service.js'),
      )
    )
      throw new Error('Build backend before running the Core contract');
    const url = new URL(process.env.LOYALTY_DATABASE_URL ?? '');
    if (!url.pathname.endsWith('_test'))
      throw new Error('Test database required');
    coreUrl = url.toString();
    admin = await new DataSource({
      type: 'postgres',
      url: coreUrl,
      entities: [],
      synchronize: false,
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
      throw new Error('Unable to provision ephemeral members reader');
    }
    await admin.query('GRANT USAGE ON SCHEMA loyalty TO ' + quotedRole);
    for (const grant of grants)
      await admin.query('GRANT ' + grant + ' TO ' + quotedRole);
    await admin.query(
      'ALTER ROLE ' + quotedRole + ' SET default_transaction_read_only=on',
    );
    url.username = role;
    url.password = password;
    reader = await new DataSource(databaseOptions(url.toString())).initialize();
    expect((await verifyReader(reader, false, false, true)).status).toBe(
      'PASS',
    );
    for (const [index, id] of ids.entries()) {
      await admin.query(
        `INSERT INTO loyalty.club_members
          (id, "fullName", email, "nationalIdEnc", "nationalIdHash", points, level,
           "cardStatus", "cardNo", "issuedByLabelFa", "birthDate", "joinDate", "createdAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)`,
        [
          id,
          marker + '-' + index,
          marker + index + '@example.invalid',
          'protected-ciphertext',
          createHmac('sha256', Buffer.from(piiKey, 'hex'))
            .update(index === 0 ? nationalId : randomUUID())
            .digest('hex'),
          index === 0 ? 6200 : 50,
          index === 0 ? 'GOLD' : 'SILVER',
          index === 0 ? 'ISSUED' : 'NONE',
          index === 0 ? marker : null,
          index === 0 ? 'مدیر عامل' : null,
          index === 0 ? '1990-03-21T00:00:00.000Z' : null,
          index === 0 ? '2026-09-05T10:00:00.123Z' : '2026-09-04T09:00:00.456Z',
        ],
      );
    }
    baseline = await snapshot();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DataSource)
      .useValue(reader)
      .compile();
    app = module.createNestApplication({ logger: false });
    app
      .get(ConfigService)
      .set('LOYALTY_MEMBERS_LIST_PROJECTION_ENABLED', 'true');
    app
      .get(ConfigService)
      .set('LOYALTY_MEMBERSHIP_PROJECTION_ENABLED', 'false');
    app
      .get(ConfigService)
      .set('LOYALTY_TIER_RULES_PROJECTION_ENABLED', 'false');
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
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
            'DELETE FROM loyalty.club_members WHERE id = ANY($1::text[])',
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
          expect(await snapshot()).toEqual([]);
        } finally {
          await admin.destroy();
        }
      }
    }
  });

  it('matches Core fields, millisecond UTC timestamps, ordering, filters and KPIs over real HTTP', async () => {
    const response = await fetch(
      serviceUrl + '/internal/v1/loyalty/members-list?q=' + marker,
      {
        headers: { 'X-Internal-Token': token },
        signal: AbortSignal.timeout(2000),
      },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: {
        members: Array<{
          id: string;
          birthDate: string | null;
          joinDate: string;
        }>;
      };
    };
    expect(body.data.members.map((member) => member.id)).toEqual(ids);
    expect(body.data.members[0].birthDate).toBe('1990-03-21T00:00:00.000Z');
    expect(body.data.members[0].joinDate).toBe('2026-09-05T10:00:00.123Z');
    expect(JSON.stringify(body)).not.toContain('nationalId');
    expect(await probe()).toEqual({
      status: 'MATCH',
      calls: 1,
      remoteResults: 1,
      warnings: 0,
    });
    expect(await probe({ PROBE_LEVEL: 'GOLD' })).toEqual({
      status: 'MATCH',
      calls: 1,
      remoteResults: 1,
      warnings: 0,
    });
  });

  it('matches empty filtered lists without losing whole-club KPIs', async () => {
    expect(await probe({ PROBE_QUERY: marker + '-absent' })).toEqual({
      status: 'MATCH',
      calls: 1,
      remoteResults: 1,
      warnings: 0,
    });
  });

  it.each([
    { PROBE_ROLE: 'SITE_ADMIN' },
    { PROBE_QUERY: nationalId },
    { PROBE_QUERY: '۰۰۱۲۳۴۵۶۷۸' },
  ])(
    'keeps protected reads in Core without calling the client',
    async (overrides) => {
      expect(await probe(overrides)).toEqual({
        status: 'MATCH',
        calls: 0,
        remoteResults: 0,
        warnings: 0,
      });
    },
  );

  it('rolls back using disabled projection and disabled backend flag', async () => {
    const config = app.get(ConfigService);
    config.set('LOYALTY_MEMBERS_LIST_PROJECTION_ENABLED', 'false');
    try {
      expect(await probe()).toEqual({
        status: 'MATCH',
        calls: 1,
        remoteResults: 0,
        warnings: 1,
      });
      expect(
        await probe({
          PROBE_ENABLED: 'false',
          PROBE_SERVICE_URL: 'invalid',
          PROBE_INTERNAL_TOKEN: '',
        }),
      ).toEqual({ status: 'MATCH', calls: 1, remoteResults: 0, warnings: 0 });
    } finally {
      config.set('LOYALTY_MEMBERS_LIST_PROJECTION_ENABLED', 'true');
    }
  });

  it('rejects invalid service credentials with sanitized output', async () => {
    expect(
      await probe({
        PROBE_INTERNAL_TOKEN: 'wrong-token-at-least-32-characters',
      }),
    ).toEqual({ status: 'REJECTED', calls: 1, remoteResults: 0, warnings: 1 });
  });

  it('fails readiness on missing grants and preserves Core fallback', async () => {
    await admin.query(
      'REVOKE SELECT (email) ON loyalty.club_members FROM ' + quotedRole,
    );
    try {
      expect((await verifyReader(reader, false, false, true)).status).toBe(
        'FAIL',
      );
      const response = await fetch(serviceUrl + '/ready', {
        signal: AbortSignal.timeout(2000),
      });
      expect(response.status).toBe(503);
      await response.arrayBuffer();
      expect(await probe()).toEqual({
        status: 'MATCH',
        calls: 1,
        remoteResults: 0,
        warnings: 1,
      });
    } finally {
      await admin.query(
        'GRANT SELECT (email) ON loyalty.club_members TO ' + quotedRole,
      );
    }
    expect((await verifyReader(reader, false, false, true)).status).toBe(
      'PASS',
    );
  });

  it('preserves Core results after the real listener stops', async () => {
    await app.close();
    expect(await probe()).toEqual({
      status: 'MATCH',
      calls: 1,
      remoteResults: 0,
      warnings: 1,
    });
  });
});
