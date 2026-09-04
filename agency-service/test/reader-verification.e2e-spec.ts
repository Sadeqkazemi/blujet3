import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { DataSource } from 'typeorm';
import { databaseOptions } from '../src/config';
import { verifyReader, type ReaderChecks } from '../src/reader-verification';

describe('Agency reader permission gate (real PostgreSQL)', () => {
  const suffix = randomBytes(8).toString('hex');
  const role = 'agency_verify_test_' + suffix;
  const parent = 'agency_parent_test_' + suffix;
  const quotedRole = '"' + role + '"';
  const quotedParent = '"' + parent + '"';
  const password = randomBytes(32).toString('hex');
  const grants = [
    'SELECT ("userId",city,tier,"joinedAt","suspendedAt") ON agency.agency_profiles',
    'SELECT (id,"agencyId","invoiceNo","amountIrr",status,"issuedAt","dueAt","paidAt") ON agency.agency_invoices',
  ];
  let admin: DataSource, reader: DataSource, readerUrl: string;
  let created = false,
    parentCreated = false;

  async function restoreReads() {
    for (const grant of grants)
      await admin.query('GRANT ' + grant + ' TO ' + quotedRole);
  }

  beforeAll(async () => {
    const url = new URL(process.env.AGENCY_DATABASE_URL ?? '');
    if (!url.pathname.endsWith('_test'))
      throw new Error('Permission tests require an isolated _test database');
    admin = await new DataSource({
      type: 'postgres',
      url: url.toString(),
      entities: [],
      synchronize: false,
      logging: false,
    }).initialize();
    try {
      // Identifiers and password are generated hex, not user input. Hide DDL errors.
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
      throw new Error('Unable to provision ephemeral Agency test roles');
    }
    await admin.query('GRANT USAGE ON SCHEMA agency TO ' + quotedRole);
    await restoreReads();
    await admin.query(
      'ALTER ROLE ' + quotedRole + ' SET default_transaction_read_only=on',
    );
    url.username = role;
    url.password = password;
    readerUrl = url.toString();
    reader = await new DataSource(databaseOptions(readerUrl)).initialize();
  });

  afterEach(async () => {
    if (reader?.isInitialized)
      expect(await verifyReader(reader)).toMatchObject({ status: 'PASS' });
  });

  afterAll(async () => {
    if (reader?.isInitialized) await reader.destroy();
    if (!admin?.isInitialized) return;
    try {
      if (created) {
        for (const grant of grants)
          await admin.query('REVOKE ' + grant + ' FROM ' + quotedRole);
        await admin.query('REVOKE USAGE ON SCHEMA agency FROM ' + quotedRole);
        if (parentCreated)
          await admin.query('REVOKE ' + quotedParent + ' FROM ' + quotedRole);
        await admin.query('DROP ROLE ' + quotedRole);
      }
      if (parentCreated) await admin.query('DROP ROLE ' + quotedParent);
    } finally {
      await admin.destroy();
    }
  });

  it('passes exact grants, exposes only named booleans and retains connection identity', async () => {
    const report = await verifyReader(reader);
    expect(report).toEqual({
      status: 'PASS',
      checks: {
        restrictedRole: true,
        noMemberships: true,
        noOwnership: true,
        noCreate: true,
        requiredReads: true,
        exactReads: true,
        noWrites: true,
        noSequenceAccess: true,
        noDefinerExecute: true,
      },
    });
    expect(
      await reader.query<unknown[]>('SELECT current_user AS role'),
    ).toEqual([{ role }]);
  });

  it.each([
    'SELECT ("amountIrr") ON agency.agency_invoices',
    'SELECT ("agencyId") ON agency.agency_invoices',
    'SELECT ("userId") ON agency.agency_profiles',
    'USAGE ON SCHEMA agency',
  ])('requires projection, owner and schema access: %s', async (grant) => {
    await admin.query('REVOKE ' + grant + ' FROM ' + quotedRole);
    try {
      expect(await verifyReader(reader)).toMatchObject({
        status: 'FAIL',
        checks: { requiredReads: false },
      });
    } finally {
      await admin.query('GRANT ' + grant + ' TO ' + quotedRole);
    }
  });

  const unsafeGrants: Array<[string, keyof ReaderChecks]> = [
    ['SELECT ON agency.agency_profiles', 'exactReads'],
    ['SELECT ("managerName") ON agency.agency_profiles', 'exactReads'],
    ['SELECT ("issuedById") ON agency.agency_invoices', 'exactReads'],
    ['SELECT ("descriptionFa") ON agency.agency_invoices', 'exactReads'],
    ['SELECT (id) ON identity.users', 'exactReads'],
    ['UPDATE ("amountIrr") ON agency.agency_invoices', 'noWrites'],
    [
      'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON agency.agency_invoices',
      'noWrites',
    ],
    ['CREATE ON SCHEMA agency', 'noCreate'],
  ];
  it.each(unsafeGrants)('rejects excessive grant: %s', async (grant, check) => {
    await admin.query('GRANT ' + grant + ' TO ' + quotedRole);
    try {
      expect(await verifyReader(reader)).toMatchObject({
        status: 'FAIL',
        checks: { [check]: false },
      });
    } finally {
      await admin.query('REVOKE ' + grant + ' FROM ' + quotedRole);
      // Table-level REVOKE can remove corresponding column grants.
      await restoreReads();
    }
  });

  it('rejects database CREATE privileges', async () => {
    const rows = await admin.query<Array<{ name: string }>>(
      'SELECT current_database() AS name',
    );
    const database = '"' + rows[0].name.replaceAll('"', '""') + '"';
    await admin.query(
      'GRANT CREATE ON DATABASE ' + database + ' TO ' + quotedRole,
    );
    try {
      expect(await verifyReader(reader)).toMatchObject({
        status: 'FAIL',
        checks: { noCreate: false },
      });
    } finally {
      await admin.query(
        'REVOKE CREATE ON DATABASE ' + database + ' FROM ' + quotedRole,
      );
    }
  });

  it.each(['INHERIT', 'CREATEROLE', 'CREATEDB', 'BYPASSRLS', 'REPLICATION'])(
    'rejects elevated role flag %s',
    async (flag) => {
      await admin.query('ALTER ROLE ' + quotedRole + ' ' + flag);
      try {
        expect(await verifyReader(reader)).toMatchObject({
          status: 'FAIL',
          checks: { restrictedRole: false },
        });
      } finally {
        await admin.query('ALTER ROLE ' + quotedRole + ' NO' + flag);
      }
    },
  );

  it('rejects membership even in a nonprivileged NOINHERIT parent', async () => {
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

  it('detects sequence access and ownership of a disposable object', async () => {
    const sequence = 'agency."verify_sequence_' + suffix + '"';
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

  it('detects PUBLIC SELECT on a disposable foreign projection', async () => {
    const table = 'agency."verify_table_' + suffix + '"';
    await admin.query('CREATE TABLE ' + table + ' (id integer)');
    try {
      await admin.query('GRANT SELECT ON ' + table + ' TO PUBLIC');
      expect(await verifyReader(reader)).toMatchObject({
        status: 'FAIL',
        checks: { exactReads: false },
      });
    } finally {
      await admin.query('DROP TABLE ' + table);
    }
  });

  it('detects executable SECURITY DEFINER routines including PUBLIC privileges', async () => {
    const routine = 'agency."verify_function_' + suffix + '"()';
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
      expect(await verifyReader(reader)).toMatchObject({ status: 'PASS' });
      await admin.query(
        'GRANT EXECUTE ON FUNCTION ' + routine + ' TO ' + quotedRole,
      );
      expect(await verifyReader(reader)).toMatchObject({
        status: 'FAIL',
        checks: { noDefinerExecute: false },
      });
    } finally {
      await admin.query('DROP FUNCTION ' + routine);
    }
  });

  it('reports safe CLI PASS and FAIL even when an elevated connection is set read-only', () => {
    for (const [url, status, code] of [
      [readerUrl, 'PASS', 0],
      [process.env.AGENCY_DATABASE_URL ?? '', 'FAIL', 2],
    ] as const) {
      const result = spawnSync(
        process.execPath,
        [resolve(__dirname, '../dist/verify-reader.js')],
        {
          env: { ...process.env, AGENCY_DATABASE_URL: url },
          encoding: 'utf8',
          timeout: 10000,
          windowsHide: true,
        },
      );
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(code);
      expect(result.stderr).toBe('');
      const report: unknown = JSON.parse(result.stdout);
      expect(report).toMatchObject({ status });
      expect(result.stdout).not.toContain(password);
      expect(result.stdout).not.toContain(role);
      expect(result.stdout).not.toContain(url);
    }
  });
});
