import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { DataSource } from 'typeorm';
import { databaseOptions } from '../src/config';
import { LoyaltyService } from '../src/loyalty/loyalty.service';
import { verifyReader } from '../src/reader-verification';

describe('Loyalty least-privilege reader (real PostgreSQL login)', () => {
  const suffix = randomBytes(8).toString('hex');
  const role = 'loyalty_reader_test_' + suffix;
  const parent = 'loyalty_parent_test_' + suffix;
  const password = randomBytes(32).toString('hex');
  const quotedRole = '"' + role + '"';
  const quotedParent = '"' + parent + '"';
  let admin: DataSource;
  let reader: DataSource;
  let readerUrl: string;
  let created = false;
  let parentCreated = false;
  const grantStatements = [
    'SELECT (id, "userId", level, "cardStatus", "deactivatedAt") ON loyalty.club_members',
    'SELECT ("clubMemberId", "signedPoints") ON loyalty.club_points_entries',
    'SELECT (id, "userId", "flightInstanceId", cabin, "lockedPriceIrr", "feeIrr", status, "expiresAt", "createdAt", "bookingId") ON loyalty.price_locks',
  ];
  const membershipGrantStatements = [
    'SELECT ("cardNo") ON loyalty.club_members',
    'SELECT (id, "memberId", status, history, "cardNo", "createdAt") ON loyalty.club_card_requests',
    'SELECT ("goldMinPoints", "platinumMinPoints", "cardRequestMinPoints", "createdAt") ON loyalty.club_tier_rules',
  ];
  const tierRulesGrantStatements = [
    'SELECT ("goldMinPoints", "platinumMinPoints", "cardRequestMinPoints", "updatedAt", "updatedById", "createdAt") ON loyalty.club_tier_rules',
  ];
  const membersListGrantStatements = [
    'SELECT ("fullName", email, "birthDate", "joinDate", points, "cardNo", "issuedByLabelFa", "createdAt") ON loyalty.club_members',
    'SELECT (status) ON loyalty.club_card_requests',
  ];
  const cardRequestsGrantStatements = [
    'SELECT ("fullName", email, points) ON loyalty.club_members',
    'SELECT (id, "memberId", level, points, status, "assignedTo", "decidedById", "decidedAt", "cardNo", history, "createdAt") ON loyalty.club_card_requests',
  ];

  beforeAll(async () => {
    const url = new URL(process.env.LOYALTY_DATABASE_URL ?? '');
    if (!url.pathname.endsWith('_test'))
      throw new Error('Permission tests require a _test database');
    admin = await new DataSource({
      type: 'postgres',
      url: url.toString(),
      entities: [],
      synchronize: false,
      logging: false,
    }).initialize();
    // The identifier/password consist solely of locally generated hex, never input.
    // Hide driver SQL if provisioning fails: the CREATE ROLE text contains a secret.
    try {
      await admin.query(
        'CREATE ROLE ' +
          quotedRole +
          " LOGIN PASSWORD '" +
          password +
          "' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS",
      );
      created = true;
      await admin.query('CREATE ROLE ' + quotedParent + ' NOLOGIN NOINHERIT');
      parentCreated = true;
    } catch {
      throw new Error('Unable to provision ephemeral test roles');
    }
    await admin.query('GRANT USAGE ON SCHEMA loyalty TO ' + quotedRole);
    for (const grant of grantStatements)
      await admin.query('GRANT ' + grant + ' TO ' + quotedRole);
    await admin.query(
      'ALTER ROLE ' + quotedRole + ' SET default_transaction_read_only = on',
    );
    url.username = role;
    url.password = password;
    readerUrl = url.toString();
    reader = await new DataSource(databaseOptions(readerUrl)).initialize();
  });

  afterAll(async () => {
    if (reader?.isInitialized) await reader.destroy();
    if (!admin?.isInitialized) return;
    try {
      if (created) {
        // Revoke only this suite's exact grants; never DROP OWNED or alter PUBLIC.
        await admin.query('REVOKE SELECT ON identity.users FROM ' + quotedRole);
        await admin.query(
          'REVOKE SELECT (id) ON identity.users FROM ' + quotedRole,
        );
        for (const table of [
          'club_members',
          'club_points_entries',
          'price_locks',
          'club_card_requests',
          'club_tier_rules',
        ]) {
          await admin.query(
            'REVOKE ALL PRIVILEGES ON loyalty.' + table + ' FROM ' + quotedRole,
          );
        }
        for (const grant of grantStatements)
          await admin.query('REVOKE ' + grant + ' FROM ' + quotedRole);
        await admin.query(
          'REVOKE SELECT ("nationalIdEnc"), UPDATE (points) ON loyalty.club_members FROM ' +
            quotedRole,
        );
        await admin.query('REVOKE USAGE ON SCHEMA loyalty FROM ' + quotedRole);
        if (parentCreated)
          await admin.query('REVOKE ' + quotedParent + ' FROM ' + quotedRole);
        await admin.query('DROP ROLE ' + quotedRole);
      }
      if (parentCreated) await admin.query('DROP ROLE ' + quotedParent);
    } finally {
      await admin.destroy();
    }
  });

  it('passes only with exact projection grants and never changes connection identity', async () => {
    const report = await verifyReader(reader);
    expect(report.status).toBe('PASS');
    expect(Object.values(report.checks).every(Boolean)).toBe(true);
    expect(
      await reader.query<unknown[]>('SELECT current_user AS role'),
    ).toEqual([{ role }]);
  });

  it('requires the optional exact membership projection only when enabled', async () => {
    expect(await verifyReader(reader, true)).toMatchObject({ status: 'FAIL' });
    try {
      for (const grant of membershipGrantStatements)
        await admin.query('GRANT ' + grant + ' TO ' + quotedRole);
      expect(await verifyReader(reader, true)).toMatchObject({
        status: 'PASS',
      });
      const owners = await admin.query<Array<{ userId: string }>>(
        'SELECT "userId" FROM loyalty.club_members WHERE "userId" IS NOT NULL AND "deactivatedAt" IS NULL LIMIT 1',
      );
      expect(owners).toHaveLength(1);
      expect(
        await new LoyaltyService(reader).membership(
          owners[0].userId,
          owners[0].userId,
        ),
      ).toMatchObject({
        userId: owners[0].userId,
        isMember: true,
        balance: expect.any(String) as unknown,
      });
    } finally {
      for (const grant of membershipGrantStatements)
        await admin.query('REVOKE ' + grant + ' FROM ' + quotedRole);
    }
    expect(await verifyReader(reader)).toMatchObject({ status: 'PASS' });
  });

  it('requires the optional exact tier-rules projection only when enabled', async () => {
    expect(await verifyReader(reader, false, true)).toMatchObject({
      status: 'FAIL',
    });
    try {
      for (const grant of tierRulesGrantStatements)
        await admin.query('GRANT ' + grant + ' TO ' + quotedRole);
      expect(await verifyReader(reader, false, true)).toMatchObject({
        status: 'PASS',
      });
      expect(await new LoyaltyService(reader).tierRules()).toMatchObject({
        goldMinPoints: expect.any(Number) as unknown,
        updatedAt: expect.any(String) as unknown,
      });
    } finally {
      for (const grant of tierRulesGrantStatements)
        await admin.query('REVOKE ' + grant + ' FROM ' + quotedRole);
    }
    expect(await verifyReader(reader)).toMatchObject({ status: 'PASS' });
  });

  it('requires only the exact PII-minimized members-list grants when enabled', async () => {
    expect(await verifyReader(reader, false, false, true)).toMatchObject({
      status: 'FAIL',
    });
    try {
      for (const grant of membersListGrantStatements)
        await admin.query('GRANT ' + grant + ' TO ' + quotedRole);
      expect(await verifyReader(reader, false, false, true)).toMatchObject({
        status: 'PASS',
      });
      const projection = await new LoyaltyService(reader).membersList({});
      expect(projection).toMatchObject({
        members: expect.any(Array) as unknown,
        kpis: {
          totalMembers: expect.any(Number) as unknown,
          tierCounts: {
            SILVER: expect.any(Number) as unknown,
            GOLD: expect.any(Number) as unknown,
            PLATINUM: expect.any(Number) as unknown,
          },
        },
      });
      expect(JSON.stringify(projection)).not.toContain('nationalId');
    } finally {
      for (const grant of membersListGrantStatements)
        await admin.query('REVOKE ' + grant + ' FROM ' + quotedRole);
    }
    expect(await verifyReader(reader)).toMatchObject({ status: 'PASS' });
  });

  it('requires only the exact executive card-request grants when enabled', async () => {
    expect(await verifyReader(reader, false, false, false, true)).toMatchObject(
      {
        status: 'FAIL',
      },
    );
    try {
      for (const grant of cardRequestsGrantStatements)
        await admin.query('GRANT ' + grant + ' TO ' + quotedRole);
      expect(
        await verifyReader(reader, false, false, false, true),
      ).toMatchObject({ status: 'PASS' });
      expect(await new LoyaltyService(reader).cardRequests()).toEqual(
        expect.any(Array),
      );
    } finally {
      for (const grant of cardRequestsGrantStatements)
        await admin.query('REVOKE ' + grant + ' FROM ' + quotedRole);
    }
    expect(await verifyReader(reader)).toMatchObject({ status: 'PASS' });
  });

  afterEach(async () => {
    if (reader?.isInitialized)
      expect(await verifyReader(reader)).toMatchObject({ status: 'PASS' });
  });

  it('reads real existing membership and lock projections using the restricted login', async () => {
    const owners = await admin.query<Array<{ userId: string }>>(
      'SELECT "userId" FROM loyalty.club_members WHERE "userId" IS NOT NULL AND "deactivatedAt" IS NULL LIMIT 1',
    );
    expect(owners).toHaveLength(1);
    const service = new LoyaltyService(reader);
    expect(
      await service.member(owners[0].userId, owners[0].userId),
    ).toMatchObject({
      userId: owners[0].userId,
      points: expect.any(String) as unknown,
    });
    expect(
      Array.isArray(await service.locks(owners[0].userId, owners[0].userId)),
    ).toBe(true);
  });

  it('denies writes, PII and cross-domain reads even when read-only mode is turned off', async () => {
    const session = reader.createQueryRunner();
    try {
      await session.connect();
      await session.query('SET default_transaction_read_only = off');
      for (const sql of [
        'UPDATE loyalty.club_members SET points=points WHERE false',
        'DELETE FROM loyalty.price_locks WHERE false',
        'SELECT "nationalIdEnc" FROM loyalty.club_members LIMIT 0',
        'SELECT id FROM identity.users LIMIT 0',
      ]) {
        await expect(session.query(sql)).rejects.toMatchObject({
          driverError: { code: '42501' },
        });
      }
    } finally {
      await session.query('SET default_transaction_read_only = on');
      await session.release();
    }
  });

  it('detects missing required columns', async () => {
    await admin.query(
      'REVOKE SELECT ("signedPoints") ON loyalty.club_points_entries FROM ' +
        quotedRole,
    );
    try {
      expect(await verifyReader(reader)).toMatchObject({
        status: 'FAIL',
        checks: { requiredReads: false },
      });
    } finally {
      await admin.query(
        'GRANT SELECT ("signedPoints") ON loyalty.club_points_entries TO ' +
          quotedRole,
      );
    }
  });

  it('requires schema USAGE, not just column privileges', async () => {
    await admin.query('REVOKE USAGE ON SCHEMA loyalty FROM ' + quotedRole);
    try {
      expect(await verifyReader(reader)).toMatchObject({
        status: 'FAIL',
        checks: { requiredReads: false },
      });
    } finally {
      await admin.query('GRANT USAGE ON SCHEMA loyalty TO ' + quotedRole);
    }
  });

  it('rejects schema CREATE privilege', async () => {
    await admin.query('GRANT CREATE ON SCHEMA loyalty TO ' + quotedRole);
    try {
      expect(await verifyReader(reader)).toMatchObject({
        status: 'FAIL',
        checks: { noCreate: false },
      });
    } finally {
      await admin.query('REVOKE CREATE ON SCHEMA loyalty FROM ' + quotedRole);
    }
  });

  it('detects sequence privileges and ownership of a synthetic object', async () => {
    const sequence = 'loyalty."reader_test_sequence_' + suffix + '"';
    await admin.query('CREATE SEQUENCE ' + sequence);
    try {
      await admin.query(
        'GRANT USAGE ON SEQUENCE ' + sequence + ' TO ' + quotedRole,
      );
      expect(await verifyReader(reader)).toMatchObject({
        status: 'FAIL',
        checks: { noSequenceAccess: false },
      });
      await admin.query(
        'ALTER SEQUENCE ' + sequence + ' OWNER TO ' + quotedRole,
      );
      expect(await verifyReader(reader)).toMatchObject({
        status: 'FAIL',
        checks: { noOwnership: false },
      });
    } finally {
      await admin.query('DROP SEQUENCE ' + sequence);
    }
  });

  it('rejects executable SECURITY DEFINER routines, including PUBLIC grants', async () => {
    const routine = 'loyalty."reader_test_function_' + suffix + '"()';
    await admin.query(
      'CREATE FUNCTION ' +
        routine +
        " RETURNS integer LANGUAGE sql SECURITY DEFINER AS 'SELECT 1'",
    );
    try {
      expect(await verifyReader(reader)).toMatchObject({
        status: 'FAIL',
        checks: { noDefinerExecute: false },
      });
      await admin.query(
        'REVOKE EXECUTE ON FUNCTION ' + routine + ' FROM PUBLIC',
      );
      expect(await verifyReader(reader)).toMatchObject({
        status: 'PASS',
        checks: { noDefinerExecute: true },
      });
    } finally {
      await admin.query('DROP FUNCTION ' + routine);
    }
  });

  it('detects table-wide SELECT and unapproved PII columns', async () => {
    for (const grant of [
      'SELECT ON loyalty.club_members',
      'SELECT ("nationalIdEnc") ON loyalty.club_members',
    ]) {
      await admin.query('GRANT ' + grant + ' TO ' + quotedRole);
      try {
        expect(await verifyReader(reader)).toMatchObject({
          status: 'FAIL',
          checks: { exactReads: false },
        });
      } finally {
        await admin.query('REVOKE ' + grant + ' FROM ' + quotedRole);
        // PostgreSQL table-level REVOKE also removes matching column grants.
        await admin.query('GRANT ' + grantStatements[0] + ' TO ' + quotedRole);
      }
    }
  });

  it('detects column UPDATE and another domain SELECT even without table-wide grants', async () => {
    await admin.query(
      'GRANT UPDATE (points) ON loyalty.club_members TO ' + quotedRole,
    );
    await admin.query('GRANT SELECT (id) ON identity.users TO ' + quotedRole);
    try {
      expect(await verifyReader(reader)).toMatchObject({
        status: 'FAIL',
        checks: { noWrites: false, exactReads: false },
      });
    } finally {
      await admin.query(
        'REVOKE UPDATE (points) ON loyalty.club_members FROM ' + quotedRole,
      );
      await admin.query(
        'REVOKE SELECT (id) ON identity.users FROM ' + quotedRole,
      );
    }
  });

  it('rejects inheriting roles and even membership in a nonprivileged role', async () => {
    await admin.query('ALTER ROLE ' + quotedRole + ' INHERIT');
    try {
      expect(await verifyReader(reader)).toMatchObject({
        status: 'FAIL',
        checks: { restrictedRole: false },
      });
    } finally {
      await admin.query('ALTER ROLE ' + quotedRole + ' NOINHERIT');
    }
    await admin.query('GRANT ' + quotedParent + ' TO ' + quotedRole);
    try {
      expect(await verifyReader(reader)).toMatchObject({
        status: 'FAIL',
        checks: { noMemberships: false },
      });
    } finally {
      await admin.query('REVOKE ' + quotedParent + ' FROM ' + quotedRole);
    }
  });

  it('rejects the elevated fixture writer without exposing its name', async () => {
    const report = await verifyReader(admin);
    expect(report).toMatchObject({
      status: 'FAIL',
      checks: { restrictedRole: false, noWrites: false },
    });
    expect(Object.keys(report).sort()).toEqual(['checks', 'status']);
  });

  it('provides safe CLI output and exit codes for PASS, FAIL and configuration failure', () => {
    const run = (url: string) =>
      spawnSync(
        process.execPath,
        [resolve(__dirname, '../dist/verify-reader.js')],
        {
          env: { ...process.env, LOYALTY_DATABASE_URL: url },
          encoding: 'utf8',
          timeout: 15000,
          windowsHide: true,
        },
      );
    const good = run(readerUrl);
    expect(good.status).toBe(0);
    expect(JSON.parse(good.stdout) as unknown).toMatchObject({
      status: 'PASS',
    });
    const broad = run(process.env.LOYALTY_DATABASE_URL ?? '');
    expect(broad.status).toBe(2);
    expect(JSON.parse(broad.stdout) as unknown).toMatchObject({
      status: 'FAIL',
    });
    const bad = run('invalid:' + password);
    expect(bad.status).toBe(1);
    expect(JSON.parse(bad.stdout) as unknown).toEqual({
      status: 'UNAVAILABLE',
    });
    for (const result of [good, broad, bad]) {
      expect(result.stdout + result.stderr).not.toContain(password);
      expect(result.stdout + result.stderr).not.toContain(role);
    }
  });
});
