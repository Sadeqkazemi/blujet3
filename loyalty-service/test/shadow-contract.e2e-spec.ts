import { execFile } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { databaseOptions } from '../src/config';
import { verifyReader } from '../src/reader-verification';

describe('Built backend shadow CLI -> Loyalty HTTP -> restricted PostgreSQL', () => {
  const owner = randomUUID();
  const other = randomUUID();
  const memberId = randomUUID();
  const lockId = randomUUID();
  const role = 'loyalty_shadow_test_' + randomBytes(8).toString('hex');
  const quotedRole = '"' + role + '"';
  const password = randomBytes(32).toString('hex');
  const token = 'test-loyalty-internal-token-at-least-32-characters';
  const backend = resolve(__dirname, '../../backend');
  const grants = [
    'SELECT (id, "userId", level, "cardStatus", "deactivatedAt") ON loyalty.club_members',
    'SELECT ("clubMemberId", "signedPoints") ON loyalty.club_points_entries',
    'SELECT (id, "userId", "flightInstanceId", cabin, "lockedPriceIrr", "feeIrr", status, "expiresAt", "createdAt", "bookingId") ON loyalty.price_locks',
  ];
  let admin: DataSource;
  let reader: DataSource;
  let app: INestApplication;
  let serviceUrl: string;
  let readerUrl: string;
  let roleCreated = false;
  let before: unknown;

  async function snapshot() {
    return {
      members: await admin.query<unknown[]>(
        'SELECT * FROM loyalty.club_members WHERE id=$1',
        [memberId],
      ),
      points: await admin.query<unknown[]>(
        'SELECT * FROM loyalty.club_points_entries WHERE "clubMemberId"=$1 ORDER BY id',
        [memberId],
      ),
      locks: await admin.query<unknown[]>(
        'SELECT * FROM loyalty.price_locks WHERE "userId" IN ($1,$2) ORDER BY id',
        [owner, other],
      ),
    };
  }

  function compare(userId: string, overrides: NodeJS.ProcessEnv = {}) {
    return new Promise<{ code: number; stdout: string; stderr: string }>(
      (resolveResult, reject) => {
        execFile(
          process.execPath,
          ['dist/database/report-loyalty-shadow.js', userId],
          {
            cwd: backend,
            env: {
              ...process.env,
              NODE_ENV: 'test',
              DATABASE_URL: readerUrl,
              LOYALTY_SHADOW_ENABLED: 'true',
              LOYALTY_SERVICE_URL: serviceUrl,
              LOYALTY_INTERNAL_TOKEN: token,
              ...overrides,
            },
            timeout: 15000,
            maxBuffer: 64 * 1024,
            windowsHide: true,
            encoding: 'utf8',
          },
          (error, stdout, stderr) => {
            if (error && (typeof error.code !== 'number' || error.killed)) {
              reject(
                new Error(
                  'Shadow CLI failed to start or exceeded its test deadline',
                ),
              );
              return;
            }
            resolveResult({
              code: typeof error?.code === 'number' ? error.code : 0,
              stdout,
              stderr,
            });
          },
        );
      },
    );
  }

  function assertReport(
    result: { code: number; stdout: string; stderr: string },
    status: string,
    code: number,
  ) {
    expect(result.code).toBe(code);
    expect(result.stderr).toBe('');
    const report = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(Object.keys(report).sort()).toEqual(
      status === 'DISABLED' ? ['status'] : ['requestId', 'status'],
    );
    expect(report.status).toBe(status);
    if (status !== 'DISABLED')
      expect(report.requestId).toEqual(
        expect.stringMatching(/^[0-9a-f-]{36}$/),
      );
    for (const secret of [
      owner,
      other,
      password,
      role,
      token,
      'private-shadow@example.invalid',
      'shadow-private-id',
    ]) {
      expect(result.stdout + result.stderr).not.toContain(secret);
    }
  }

  beforeAll(async () => {
    if (!existsSync(resolve(backend, 'dist/database/report-loyalty-shadow.js')))
      throw new Error('Build backend before running the shadow contract suite');
    const url = new URL(process.env.LOYALTY_DATABASE_URL ?? '');
    if (!url.pathname.endsWith('_test'))
      throw new Error('Shadow contract requires an isolated _test database');
    admin = await new DataSource({
      type: 'postgres',
      url: url.toString(),
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
      roleCreated = true;
    } catch {
      throw new Error('Unable to provision ephemeral shadow reader');
    }
    await admin.query('GRANT USAGE ON SCHEMA loyalty TO ' + quotedRole);
    for (const grant of grants)
      await admin.query('GRANT ' + grant + ' TO ' + quotedRole);
    await admin.query(
      'ALTER ROLE ' + quotedRole + ' SET default_transaction_read_only=on',
    );
    url.username = role;
    url.password = password;
    readerUrl = url.toString();
    reader = await new DataSource(databaseOptions(readerUrl)).initialize();
    expect((await verifyReader(reader)).status).toBe('PASS');

    await admin.transaction(async (tx) => {
      for (const id of [owner, other])
        await tx.query(
          'INSERT INTO identity.users (id, role, "fullName", "updatedAt") VALUES ($1,$2,$3,NOW())',
          [id, 'USER', 'Shadow contract fixture'],
        );
      await tx.query(
        'INSERT INTO loyalty.club_members (id, "userId", "fullName", email, "nationalIdEnc", "nationalIdHash", points) VALUES ($1,$2,$3,$4,$5,$6,999)',
        [
          memberId,
          owner,
          'Private shadow fixture',
          'private-shadow@example.invalid',
          'shadow-private-id',
          randomUUID(),
        ],
      );
      await tx.query(
        'INSERT INTO loyalty.club_points_entries (id,"clubMemberId",type,"signedPoints") VALUES ($1,$2,$3,100),($4,$2,$3,-30)',
        [randomUUID(), memberId, 'EARN', randomUUID()],
      );
      const flights = await tx.query<Array<{ id: string }>>(
        'SELECT id FROM inventory.flight_instances ORDER BY id LIMIT 1',
      );
      if (!flights[0])
        throw new Error('Shadow contract requires the existing test seed');
      const now = Date.now();
      for (const [id, userId, expiry, status] of [
        [lockId, owner, new Date(now + 86400000).toISOString(), 'ACTIVE'],
        [randomUUID(), owner, new Date(now - 86400000).toISOString(), 'ACTIVE'],
        [
          randomUUID(),
          owner,
          new Date(now + 86400000).toISOString(),
          'EXPIRED',
        ],
        [randomUUID(), other, new Date(now + 86400000).toISOString(), 'ACTIVE'],
      ])
        await tx.query(
          'INSERT INTO loyalty.price_locks (id,"userId","flightInstanceId",cabin,"lockedPriceIrr","feeIrr",status,"expiresAt","createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
          [
            id,
            userId,
            flights[0].id,
            'ECONOMY',
            '9007199254740993',
            '300000',
            status,
            expiry,
            new Date(now).toISOString(),
          ],
        );
    });
    before = await snapshot();
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
    await app.listen(0, '127.0.0.1');
    serviceUrl = await app.getUrl();
  });

  afterEach(async () => {
    expect(await snapshot()).toEqual(before);
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
              'DELETE FROM loyalty.price_locks WHERE "userId" IN ($1,$2)',
              [owner, other],
            );
            await tx.query(
              'DELETE FROM loyalty.club_points_entries WHERE "clubMemberId"=$1',
              [memberId],
            );
            await tx.query('DELETE FROM loyalty.club_members WHERE id=$1', [
              memberId,
            ]);
            await tx.query('DELETE FROM identity.users WHERE id IN ($1,$2)', [
              owner,
              other,
            ]);
          });
          if (roleCreated) {
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

  it('matches real projections while independently proving exact amounts, ledger totals and owner/expiry filters', async () => {
    const headers = { 'X-Internal-Token': token, 'X-Loyalty-User-Id': owner };
    const member = await fetch(
      serviceUrl + '/internal/v1/loyalty/members/' + owner,
      { headers, signal: AbortSignal.timeout(2000) },
    );
    expect(member.status).toBe(200);
    expect(await member.json()).toMatchObject({
      success: true,
      data: { id: memberId, userId: owner, points: '70' },
    });
    const locks = await fetch(
      serviceUrl + '/internal/v1/loyalty/price-locks/' + owner,
      { headers, signal: AbortSignal.timeout(2000) },
    );
    expect(locks.status).toBe(200);
    expect(await locks.json()).toMatchObject({
      success: true,
      data: [
        { id: lockId, lockedPriceIrr: '9007199254740993', feeIrr: '300000' },
      ],
    });
    assertReport(await compare(owner), 'MATCH', 0);
  });

  it('matches an absent member without exposing the requested identity', async () => {
    assertReport(await compare(randomUUID()), 'MATCH', 0);
  });

  it('matches a deactivated member while preserving owned active locks', async () => {
    await admin.query(
      'UPDATE loyalty.club_members SET "deactivatedAt"=NOW() WHERE id=$1',
      [memberId],
    );
    try {
      const response = await fetch(
        serviceUrl + '/internal/v1/loyalty/members/' + owner,
        {
          headers: { 'X-Internal-Token': token, 'X-Loyalty-User-Id': owner },
          signal: AbortSignal.timeout(2000),
        },
      );
      expect(response.status).toBe(404);
      await response.arrayBuffer();
      assertReport(await compare(owner), 'MATCH', 0);
    } finally {
      await admin.query(
        'UPDATE loyalty.club_members SET "deactivatedAt"=NULL WHERE id=$1',
        [memberId],
      );
    }
  });

  it('fails closed on invalid service identity', async () => {
    assertReport(
      await compare(owner, {
        LOYALTY_INTERNAL_TOKEN: 'wrong-service-token-at-least-32-characters',
      }),
      'UNAVAILABLE',
      2,
    );
  });

  it('fails closed when the real HTTP listener is stopped', async () => {
    await app.close();
    assertReport(await compare(owner), 'UNAVAILABLE', 2);
  });

  it('rolls back to DISABLED without usable database, token or service configuration', async () => {
    assertReport(
      await compare('not-a-uuid', {
        LOYALTY_SHADOW_ENABLED: 'false',
        DATABASE_URL: 'invalid',
        LOYALTY_SERVICE_URL: 'invalid',
        LOYALTY_INTERNAL_TOKEN: '',
      }),
      'DISABLED',
      0,
    );
  });
});
