import { Client } from 'pg';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import * as path from 'node:path';
import { agencyMigrationDataSourceOptions } from '../../agency-service/src/database/data-source.options';
import {
  AGENCY_PROJECTION_RUNTIME_ROLE,
  provisionAgencyProjectionRuntimeRole,
} from '../src/database/provision-agency-projection-runtime-role';

dotenv.config({
  path: path.join(__dirname, '..', '.env.test'),
  override: false,
  quiet: true,
});

const PASSWORD = 'agency_proj_runtime_ci_password_20260916';

function ownerUrl(): string {
  const candidates = [
    process.env.AGENCY_PROJECTION_DATABASE_OWNER_URL,
    process.env.DATABASE_URL,
    process.env.AGENCY_DATABASE_URL,
  ];
  for (const url of candidates) {
    if (!url) continue;
    const username = decodeURIComponent(new URL(url).username);
    if (username !== AGENCY_PROJECTION_RUNTIME_ROLE) {
      return url;
    }
  }
  throw new Error(
    'AGENCY_PROJECTION_DATABASE_OWNER_URL is required for the runtime-role proof',
  );
}

function coreDatabaseUrl(): string {
  const url =
    process.env.AGENCY_PROJECTION_CORE_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is required to prove isolation from a real Core database',
    );
  }
  return url;
}

function databaseNameFromUrl(url: string): string {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, '')).split(
    '?',
  )[0];
}

function rewriteDatabase(url: string, databaseName: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${databaseName}`;
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString();
}

function maintenanceUrl(url: string): string {
  return rewriteDatabase(url, 'postgres');
}

function runtimeUrl(url: string, databaseName: string): string {
  const parsed = new URL(url);
  parsed.username = AGENCY_PROJECTION_RUNTIME_ROLE;
  parsed.password = PASSWORD;
  parsed.pathname = `/${databaseName}`;
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString();
}

function expectDenied(error: unknown, password: string): void {
  expect(error).toEqual(
    expect.objectContaining({
      code: expect.stringMatching(/^(42501|3F000|3D000|28000|28P01|25006)$/),
    }),
  );
  const message = error instanceof Error ? error.message : String(error);
  expect(message).not.toMatch(/postgresql:\/\//i);
  expect(message).not.toContain(password);
}

async function deny(operation: () => Promise<unknown>): Promise<void> {
  try {
    await operation();
    throw new Error('expected PostgreSQL to deny the operation');
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === 'expected PostgreSQL to deny the operation'
    ) {
      throw error;
    }
    expectDenied(error, PASSWORD);
  }
}

async function dropDatabase(admin: Client, name: string): Promise<void> {
  await admin.query(
    `SELECT pg_terminate_backend(pid)
     FROM pg_stat_activity
     WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [name],
  );
  await admin.query(`DROP DATABASE IF EXISTS ${quoteIdent(name)}`);
}

function quoteIdent(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

const DATABASE_PRIVILEGES = new Set(['CONNECT', 'CREATE', 'TEMPORARY']);

function agencyMigrationDataSource(url: string): DataSource {
  const options = agencyMigrationDataSourceOptions(url);
  if (options.type !== 'postgres') {
    throw new Error('Agency projection runtime role E2E requires PostgreSQL');
  }
  return new DataSource(options);
}

async function snapshotPublicDatabasePrivileges(
  client: Client,
): Promise<Map<string, string[]>> {
  const publicGrants = await client.query<{
    databaseName: string;
    privilege: string;
  }>(
    `SELECT d.datname AS "databaseName", acl.privilege_type AS privilege
     FROM pg_database d
     JOIN LATERAL aclexplode(
       COALESCE(d.datacl, acldefault('d', d.datdba))
     ) acl ON true
     WHERE d.datallowconn AND NOT d.datistemplate
       AND acl.grantee = 0
       AND acl.privilege_type IN ('CONNECT', 'CREATE', 'TEMPORARY')`,
  );
  return publicGrants.rows.reduce((grants, row) => {
    if (!DATABASE_PRIVILEGES.has(row.privilege)) {
      throw new Error('Unexpected PostgreSQL database privilege');
    }
    const privileges = grants.get(row.databaseName) ?? [];
    privileges.push(row.privilege);
    grants.set(row.databaseName, privileges);
    return grants;
  }, new Map<string, string[]>());
}

async function restorePublicDatabasePrivileges(
  client: Client,
  snapshot: Map<string, string[]>,
): Promise<void> {
  const databases = await client.query<{ databaseName: string }>(
    `SELECT datname AS "databaseName"
     FROM pg_database
     WHERE datallowconn AND NOT datistemplate`,
  );
  for (const database of databases.rows) {
    await client.query(
      `REVOKE ALL PRIVILEGES ON DATABASE ${quoteIdent(database.databaseName)} FROM PUBLIC`,
    );
    const privileges = snapshot.get(database.databaseName);
    if (privileges?.length) {
      await client.query(
        `GRANT ${privileges.join(', ')} ON DATABASE ${quoteIdent(database.databaseName)} TO PUBLIC`,
      );
    }
  }
}

function serializePublicDatabasePrivileges(
  snapshot: Map<string, string[]>,
): Record<string, string[]> {
  return Object.fromEntries(
    [...snapshot.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([databaseName, privileges]) => [
        databaseName,
        [...privileges].sort(),
      ]),
  );
}

describe('Agency projection runtime role (PostgreSQL)', () => {
  const suffix = `${Date.now()}`;
  const databaseName = `blujet_agency_runtime_${suffix}`;
  const incompleteName = `blujet_agency_incomplete_${suffix}`;
  const coreName = databaseNameFromUrl(coreDatabaseUrl());
  let source: string;
  let admin: Client;
  let owner: Client;
  let coreOwner: Client;
  let runtime: Client;
  let publicDatabasePrivileges: Map<string, string[]> | undefined;

  beforeAll(async () => {
    source = ownerUrl();
    admin = new Client({ connectionString: maintenanceUrl(source) });
    await admin.connect();
    publicDatabasePrivileges = await snapshotPublicDatabasePrivileges(admin);
    try {
      await dropDatabase(admin, databaseName);
      await dropDatabase(admin, incompleteName);
      await admin.query(`CREATE DATABASE ${quoteIdent(databaseName)}`);
      await admin.query(`CREATE DATABASE ${quoteIdent(incompleteName)}`);

      const isolatedUrl = rewriteDatabase(source, databaseName);
      const migrations = agencyMigrationDataSource(isolatedUrl);
      await migrations.initialize();
      await migrations.runMigrations();
      await migrations.destroy();

      coreOwner = new Client({ connectionString: coreDatabaseUrl() });
      await coreOwner.connect();

      owner = new Client({ connectionString: isolatedUrl });
      await owner.connect();
      await owner.query(`CREATE SCHEMA IF NOT EXISTS identity`);
      await owner.query(
        `CREATE TABLE identity.users (id text PRIMARY KEY, secret text)`,
      );
      await owner.query(
        `INSERT INTO identity.users (id, secret) VALUES ('u1', 'credential-material')`,
      );
      await owner.query(`CREATE TABLE public.secrets (token text)`);
      await owner.query(
        `INSERT INTO public.secrets (token) VALUES ('gateway-secret')`,
      );
      await owner.query(`CREATE SEQUENCE agency.agency_seq`);

      const first = await provisionAgencyProjectionRuntimeRole(
        owner,
        PASSWORD,
        databaseName,
      );
      expect(first).toEqual({
        status: 'PASS',
        role: AGENCY_PROJECTION_RUNTIME_ROLE,
        relationCount: 7,
      });

      await owner.query(
        `GRANT UPDATE ON TABLE agency.agency_projection_event_receipts TO ${quoteIdent(AGENCY_PROJECTION_RUNTIME_ROLE)}`,
      );
      await owner.query(
        `GRANT SELECT ON TABLE identity.users TO ${quoteIdent(AGENCY_PROJECTION_RUNTIME_ROLE)}`,
      );

      const rerun = await provisionAgencyProjectionRuntimeRole(
        owner,
        PASSWORD,
        databaseName,
      );
      expect(rerun).toEqual(first);

      const ownership = await owner.query(
        `SELECT c.relname
       FROM pg_class c
       JOIN pg_roles r ON r.oid = c.relowner
       WHERE r.rolname = $1
       UNION ALL
       SELECT n.nspname
       FROM pg_namespace n
       JOIN pg_roles r ON r.oid = n.nspowner
       WHERE r.rolname = $1`,
        [AGENCY_PROJECTION_RUNTIME_ROLE],
      );
      expect(ownership.rows).toEqual([]);
      const memberships = await owner.query(
        `SELECT 1
       FROM pg_auth_members membership
       JOIN pg_roles member ON member.oid = membership.member
       WHERE member.rolname = $1`,
        [AGENCY_PROJECTION_RUNTIME_ROLE],
      );
      expect(memberships.rows).toEqual([]);

      const tables = await owner.query(
        `SELECT c.relname
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'agency'
         AND c.relkind IN ('r', 'p')
         AND has_any_column_privilege($1, c.oid, 'SELECT,INSERT,UPDATE')
       ORDER BY c.relname`,
        [AGENCY_PROJECTION_RUNTIME_ROLE],
      );
      expect(
        tables.rows.map((row: { relname: string }) => row.relname),
      ).toEqual([
        'agency_credit_requests',
        'agency_invoices',
        'agency_profiles',
        'agency_projection_event_receipts',
        'agency_projection_slots',
        'kafka_consumer_checkpoints',
        'kafka_processing_failures',
      ]);

      const foreignConnect = await owner.query(
        `SELECT d.datname
       FROM pg_database d
       WHERE d.datallowconn AND NOT d.datistemplate
         AND d.datname <> current_database()
         AND has_database_privilege($1, d.oid, 'CONNECT')`,
        [AGENCY_PROJECTION_RUNTIME_ROLE],
      );
      expect(foreignConnect.rows).toEqual([]);
      const coreConnect = await coreOwner.query(
        `SELECT has_database_privilege($1, current_database(), 'CONNECT') AS allowed,
              EXISTS (
                SELECT 1 FROM pg_namespace n
                WHERE n.nspname = 'identity'
                  AND has_schema_privilege($1, n.oid, 'USAGE')
              ) AS identity_usage,
              EXISTS (
                SELECT 1 FROM pg_class c
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = 'identity' AND c.relname = 'users'
                  AND has_table_privilege($1, c.oid, 'SELECT')
              ) AS users_select`,
        [AGENCY_PROJECTION_RUNTIME_ROLE],
      );
      expect(coreConnect.rows[0]).toEqual({
        allowed: false,
        identity_usage: false,
        users_select: false,
      });

      const incomplete = new Client({
        connectionString: rewriteDatabase(source, incompleteName),
      });
      await incomplete.connect();
      await incomplete.query('CREATE SCHEMA agency');
      const incompleteSql: string[] = [];
      const recording = {
        query: async (text: string, values?: unknown[]) => {
          incompleteSql.push(text);
          return incomplete.query(text, values);
        },
      };
      await expect(
        provisionAgencyProjectionRuntimeRole(
          recording,
          PASSWORD,
          incompleteName,
        ),
      ).rejects.toThrow('relations are missing');
      expect(incompleteSql.at(-1)).toBe('ROLLBACK');
      await incomplete.end();

      runtime = new Client({
        connectionString: runtimeUrl(source, databaseName),
      });
      await runtime.connect();
    } catch (error) {
      if (publicDatabasePrivileges) {
        await restorePublicDatabasePrivileges(
          admin,
          publicDatabasePrivileges,
        ).catch(() => undefined);
      }
      throw error;
    }
  }, 120000);

  afterAll(async () => {
    try {
      if (runtime) await runtime.end().catch(() => undefined);
      if (coreOwner) await coreOwner.end().catch(() => undefined);
      if (owner) {
        await owner
          .query(
            `DROP OWNED BY ${quoteIdent(AGENCY_PROJECTION_RUNTIME_ROLE)} CASCADE`,
          )
          .catch(() => undefined);
        await owner.end().catch(() => undefined);
      }
      if (admin) {
        await dropDatabase(admin, databaseName).catch(() => undefined);
        await dropDatabase(admin, incompleteName).catch(() => undefined);
        await admin
          .query(
            `DROP ROLE IF EXISTS ${quoteIdent(AGENCY_PROJECTION_RUNTIME_ROLE)}`,
          )
          .catch(() => undefined);
      }
    } finally {
      if (admin && publicDatabasePrivileges) {
        await restorePublicDatabasePrivileges(admin, publicDatabasePrivileges);
        const restored = await snapshotPublicDatabasePrivileges(admin);
        expect(serializePublicDatabasePrivileges(restored)).toEqual(
          serializePublicDatabasePrivileges(publicDatabasePrivileges),
        );
        await admin.end().catch(() => undefined);
      } else if (admin) {
        await admin.end().catch(() => undefined);
      }
    }
  });

  it('allows exact DML: projections, slots, checkpoints and failures may UPDATE; receipts may not', async () => {
    await runtime.query(`INSERT INTO agency.agency_profiles
      ("userId", "licenseNo", "managerName", phone, email, city, address, version)
      VALUES ('agency-runtime-1', 'LIC-1', 'Manager', '09120000000',
        'runtime@example.invalid', 'Tehran', 'Address', 1)`);
    await runtime.query(
      `UPDATE agency.agency_profiles SET city = 'Isfahan' WHERE "userId" = 'agency-runtime-1'`,
    );

    await runtime.query(`INSERT INTO agency.agency_invoices
      ("id", "agencyId", "invoiceNo", "issuedById", "dueAt", "amountIrr", version)
      VALUES ('inv-runtime-1', 'agency-runtime-1', 'INV-1', 'issuer-1',
        now() + interval '7 days', 1000, 1)`);
    await runtime.query(
      `UPDATE agency.agency_invoices SET "amountIrr" = 2000 WHERE "id" = 'inv-runtime-1'`,
    );

    await runtime.query(`INSERT INTO agency.agency_credit_requests
      ("id", "agencyId", "requestedLimitIrr", version)
      VALUES ('cr-runtime-1', 'agency-runtime-1', 5000, 1)`);
    await runtime.query(
      `UPDATE agency.agency_credit_requests SET "requestedLimitIrr" = 8000 WHERE "id" = 'cr-runtime-1'`,
    );

    await runtime.query(`INSERT INTO agency.agency_projection_slots
      ("aggregateType", "aggregateId", "recordVersion", "semanticFingerprint", "auditId")
      VALUES ('AgencyProfile', 'agency-runtime-1', 1, '${'a'.repeat(64)}', 'audit-1')`);
    await runtime.query(
      `UPDATE agency.agency_projection_slots SET "recordVersion" = 2 WHERE "aggregateId" = 'agency-runtime-1'`,
    );

    await runtime.query(`INSERT INTO agency.agency_projection_event_receipts
      ("eventId", "envelopeFingerprint", "semanticFingerprint",
       "aggregateType", "aggregateId", "recordVersion", "auditId")
      VALUES (
        '11111111-1111-1111-1111-111111111111',
        '${'b'.repeat(64)}',
        '${'a'.repeat(64)}',
        'AgencyProfile',
        'agency-runtime-1',
        1,
        'audit-1'
      )`);
    const receipts = await runtime.query(
      `SELECT "recordVersion" FROM agency.agency_projection_event_receipts`,
    );
    expect(receipts.rows[0]?.recordVersion).toBe(1);
    await deny(() =>
      runtime.query(`UPDATE agency.agency_projection_event_receipts
        SET "recordVersion" = 2
        WHERE "eventId" = '11111111-1111-1111-1111-111111111111'`),
    );

    await runtime.query(`INSERT INTO agency.kafka_consumer_checkpoints
      ("consumerGroup", "topic", "partition", "nextOffset")
      VALUES ('agency-projection', 'blujet.events.v1', 0, 1)`);
    await runtime.query(`UPDATE agency.kafka_consumer_checkpoints
      SET "nextOffset" = 2
      WHERE "consumerGroup" = 'agency-projection'`);
    const checkpoints = await runtime.query(
      `SELECT "nextOffset" FROM agency.kafka_consumer_checkpoints`,
    );
    expect(checkpoints.rows[0]?.nextOffset).toBe('2');

    await runtime.query(`INSERT INTO agency.kafka_processing_failures
      ("id", "consumerGroup", "topic", "partition", "offset", "fingerprint",
       "stage", "attempts", "totalAttempts", "status", "firstFailedAt", "lastFailedAt")
      VALUES (
        '22222222-2222-2222-2222-222222222222',
        'agency-projection',
        'blujet.events.v1',
        0,
        1,
        '${'c'.repeat(64)}',
        'TRANSPORT',
        1,
        1,
        'RETRYING',
        now(),
        now()
      )`);
    await runtime.query(`UPDATE agency.kafka_processing_failures
      SET "status" = 'QUARANTINED', "attempts" = 3, "totalAttempts" = 3
      WHERE "id" = '22222222-2222-2222-2222-222222222222'`);
    const failures = await runtime.query(
      `SELECT "status", "attempts" FROM agency.kafka_processing_failures`,
    );
    expect(failures.rows).toEqual([{ status: 'QUARANTINED', attempts: 3 }]);
  });

  it('denies DELETE, TRUNCATE, sequences, TEMP, DDL, foreign schemas and Core CONNECT', async () => {
    await deny(() =>
      runtime.query(`DELETE FROM agency.agency_profiles WHERE false`),
    );
    await deny(() => runtime.query(`TRUNCATE agency.agency_profiles`));
    await deny(() =>
      runtime.query(
        `DELETE FROM agency.agency_projection_event_receipts WHERE false`,
      ),
    );
    await deny(() =>
      runtime.query(`TRUNCATE agency.agency_projection_event_receipts`),
    );
    await deny(() => runtime.query(`SELECT nextval('agency.agency_seq')`));
    await deny(() =>
      runtime.query(`CREATE TEMP TABLE forbidden_temp (id int)`),
    );
    await deny(() => runtime.query(`CREATE TABLE agency.forbidden (id int)`));
    await deny(() =>
      runtime.query(`ALTER TABLE agency.agency_profiles ADD COLUMN leak text`),
    );
    await deny(() => runtime.query(`DROP TABLE agency.agency_profiles`));
    await deny(() => runtime.query(`SELECT secret FROM identity.users`));
    await deny(() => runtime.query(`SELECT token FROM public.secrets`));
    await deny(() =>
      runtime.query(`SELECT rolpassword FROM pg_authid LIMIT 1`),
    );

    const coreProbe = new Client({
      connectionString: runtimeUrl(coreDatabaseUrl(), coreName),
    });
    await expect(coreProbe.connect()).rejects.toEqual(
      expect.objectContaining({
        code: expect.stringMatching(/^(42501|28000)$/),
      }),
    );
    await coreProbe.end().catch(() => undefined);
  });

  it('re-enables LOGIN after NOLOGIN and keeps PUBLIC database ACLs restorable', async () => {
    await runtime.end();
    await owner.query(
      `ALTER ROLE ${quoteIdent(AGENCY_PROJECTION_RUNTIME_ROLE)} NOLOGIN`,
    );
    const denied = new Client({
      connectionString: runtimeUrl(source, databaseName),
    });
    await expect(denied.connect()).rejects.toEqual(
      expect.objectContaining({
        code: expect.stringMatching(/^(28000|28P01)$/),
      }),
    );
    await denied.end().catch(() => undefined);

    await expect(
      provisionAgencyProjectionRuntimeRole(owner, PASSWORD, databaseName),
    ).resolves.toEqual({
      status: 'PASS',
      role: AGENCY_PROJECTION_RUNTIME_ROLE,
      relationCount: 7,
    });

    runtime = new Client({
      connectionString: runtimeUrl(source, databaseName),
    });
    await runtime.connect();
    await expect(runtime.query('SELECT 1 AS ok')).resolves.toMatchObject({
      rows: [{ ok: 1 }],
    });
  });
});
