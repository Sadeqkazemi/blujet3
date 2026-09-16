import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import {
  connectAgencyCutoverReadClient,
  evaluateAgencyCutoverReadiness,
  serializeAgencyCutoverReport,
} from '../../agency-service/src/check-agency-projection-cutover-readiness';
import { agencyMigrationDataSourceOptions } from '../../agency-service/src/database/data-source.options';
import { dataSourceOptions } from '../src/database/data-source.options';
import {
  AGENCY_CUTOVER_SOURCE_ROLE,
  AGENCY_CUTOVER_TARGET_ROLE,
  classifyAgencyCutoverOwnerUrls,
  provisionAgencyCutoverReaderRole,
} from '../src/database/provision-agency-cutover-reader-roles';

const SOURCE_PASSWORD = 'agency_cutover_source_password_2026xx';
const TARGET_PASSWORD = 'agency_cutover_target_password_2026xx';
const UNRELATED_PASSWORD = 'agency_unrelated_password_2026xxxxxx';
const SECRET = 'SECRET-PII-SHOULD-NOT-LEAK';
const FINGERPRINT = 'a'.repeat(64);
const GROUP = 'blujet-agency-projection-v1';
const TOPIC = 'blujet.events.v1';

function ownerUrl(): string {
  const url =
    process.env.DATABASE_URL ?? process.env.AGENCY_CUTOVER_SOURCE_OWNER_URL;
  if (!url) {
    throw new Error('DATABASE_URL is required for the cutover-reader proof');
  }
  return url;
}

function rewriteDatabase(url: string, databaseName: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${databaseName}`;
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString();
}

function quoteIdent(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function readerUrl(
  owner: string,
  databaseName: string,
  role: string,
  password: string,
): string {
  const parsed = new URL(owner);
  parsed.username = role;
  parsed.password = password;
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
  expect(message).not.toContain(SECRET);
}

async function deny(
  operation: () => Promise<unknown>,
  password: string,
): Promise<void> {
  try {
    await operation();
    throw new Error('expected PostgreSQL to deny the operation');
  } catch (error) {
    expectDenied(error, password);
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

async function migrateCore(url: string): Promise<void> {
  const migrations = new DataSource({ ...dataSourceOptions, url });
  await migrations.initialize();
  await migrations.runMigrations();
  await migrations.destroy();
}

async function migrateAgency(url: string): Promise<void> {
  const migrations = new DataSource(agencyMigrationDataSourceOptions(url));
  await migrations.initialize();
  await migrations.runMigrations();
  await migrations.destroy();
}

describe('Agency cutover reader roles (PostgreSQL)', () => {
  const suffix = `${Date.now()}`;
  const sourceName = `blujet_core_agency_reader_${suffix}`;
  const targetName = `blujet_agency_cutover_reader_${suffix}`;
  const foreignName = `blujet_core_agency_guard_${suffix}`;
  const unsafeName = `blujet_core_agency_unsafe_${suffix}`;
  const unrelatedRole = `agency_cutover_unrelated_${suffix}`;
  let admin: Client;
  let sourceOwner: Client;
  let targetOwner: Client;
  let sourceReader: Client;
  let targetReader: Client;
  let root: string;
  let sourceUrl: string;
  let targetUrl: string;

  beforeAll(async () => {
    root = ownerUrl();
    sourceUrl = rewriteDatabase(root, sourceName);
    targetUrl = rewriteDatabase(root, targetName);
    admin = new Client({ connectionString: rewriteDatabase(root, 'postgres') });
    await admin.connect();
    await dropDatabase(admin, sourceName);
    await dropDatabase(admin, targetName);
    await dropDatabase(admin, foreignName);
    await dropDatabase(admin, unsafeName);
    await admin.query(`CREATE DATABASE ${quoteIdent(sourceName)}`);
    await admin.query(`CREATE DATABASE ${quoteIdent(targetName)}`);
    await admin.query(`CREATE DATABASE ${quoteIdent(foreignName)}`);
    await admin.query(`CREATE DATABASE ${quoteIdent(unsafeName)}`);
    await admin.query(
      `REVOKE CONNECT, TEMPORARY, CREATE ON DATABASE ${quoteIdent(sourceName)} FROM PUBLIC`,
    );
    await admin.query(
      `REVOKE CONNECT, TEMPORARY, CREATE ON DATABASE ${quoteIdent(targetName)} FROM PUBLIC`,
    );
    await admin.query(
      `CREATE ROLE ${quoteIdent(unrelatedRole)} LOGIN PASSWORD '${UNRELATED_PASSWORD}'`,
    );
    await admin.query(
      `GRANT CONNECT ON DATABASE ${quoteIdent(foreignName)} TO ${quoteIdent(unrelatedRole)}`,
    );
    await migrateCore(sourceUrl);
    await migrateAgency(targetUrl);
    await migrateCore(rewriteDatabase(root, unsafeName));
    sourceOwner = new Client({ connectionString: sourceUrl });
    await sourceOwner.connect();
    targetOwner = new Client({ connectionString: targetUrl });
    await targetOwner.connect();
    await sourceOwner.query('REVOKE ALL ON SCHEMA public FROM PUBLIC');
    await targetOwner.query('REVOKE ALL ON SCHEMA public FROM PUBLIC');
    await sourceOwner.query('CREATE SCHEMA IF NOT EXISTS outside_domain');
    await sourceOwner.query(
      'CREATE TABLE IF NOT EXISTS outside_domain.private_rows (id integer PRIMARY KEY)',
    );
    await sourceOwner.query(
      'CREATE SEQUENCE IF NOT EXISTS agency.cutover_reader_sequence',
    );
    await sourceOwner.query(
      `INSERT INTO agency.agency_projection_audits
        (id, "aggregateType", "aggregateId", "recordVersion", mutation)
       VALUES ('audit-profile-1', 'AgencyProfile', 'agency-reader-1', 1, 'UPSERT')`,
    );
    await targetOwner.query(
      `INSERT INTO agency.agency_profiles
        ("userId", "licenseNo", "managerName", phone, email, city, address, "joinedAt", version)
       VALUES ('agency-reader-1', 'LIC-1', $1, '02100000000', 'a@example.invalid',
         'تهران', 'addr', '2026-09-15T00:00:00.000Z', 1)`,
      [SECRET],
    );
    await targetOwner.query(
      `INSERT INTO agency.agency_projection_slots
        ("aggregateType", "aggregateId", "recordVersion", "semanticFingerprint", "auditId")
       VALUES ('AgencyProfile', 'agency-reader-1', 1, $1, 'audit-profile-1')`,
      [FINGERPRINT],
    );
    await targetOwner.query(
      `INSERT INTO agency.agency_projection_event_receipts
        ("eventId", "envelopeFingerprint", "semanticFingerprint",
         "aggregateType", "aggregateId", "recordVersion", "auditId")
       VALUES ($1, $2, $2, 'AgencyProfile', 'agency-reader-1', 1, 'audit-profile-1')`,
      [randomUUID(), FINGERPRINT],
    );
    await provisionAgencyCutoverReaderRole(
      sourceOwner,
      SOURCE_PASSWORD,
      'source',
      sourceName,
      targetName,
    );
    await provisionAgencyCutoverReaderRole(
      targetOwner,
      TARGET_PASSWORD,
      'target',
      targetName,
      sourceName,
    );
    sourceReader = new Client({
      connectionString: readerUrl(
        root,
        sourceName,
        AGENCY_CUTOVER_SOURCE_ROLE,
        SOURCE_PASSWORD,
      ),
    });
    await sourceReader.connect();
    targetReader = new Client({
      connectionString: readerUrl(
        root,
        targetName,
        AGENCY_CUTOVER_TARGET_ROLE,
        TARGET_PASSWORD,
      ),
    });
    await targetReader.connect();
  }, 120000);

  afterAll(async () => {
    if (sourceReader) await sourceReader.end().catch(() => undefined);
    if (targetReader) await targetReader.end().catch(() => undefined);
    if (sourceOwner) {
      await sourceOwner
        .query(`DROP OWNED BY ${quoteIdent(AGENCY_CUTOVER_SOURCE_ROLE)}`)
        .catch(() => undefined);
      await sourceOwner
        .query(`DROP ROLE IF EXISTS ${quoteIdent(AGENCY_CUTOVER_SOURCE_ROLE)}`)
        .catch(() => undefined);
      await sourceOwner.end().catch(() => undefined);
    }
    if (targetOwner) {
      await targetOwner
        .query(`DROP OWNED BY ${quoteIdent(AGENCY_CUTOVER_TARGET_ROLE)}`)
        .catch(() => undefined);
      await targetOwner
        .query(`DROP ROLE IF EXISTS ${quoteIdent(AGENCY_CUTOVER_TARGET_ROLE)}`)
        .catch(() => undefined);
      await targetOwner.end().catch(() => undefined);
    }
    if (admin) {
      await admin
        .query(
          `REVOKE CONNECT ON DATABASE ${quoteIdent(foreignName)} FROM ${quoteIdent(unrelatedRole)}`,
        )
        .catch(() => undefined);
      await admin
        .query(`DROP ROLE IF EXISTS ${quoteIdent(unrelatedRole)}`)
        .catch(() => undefined);
      await dropDatabase(admin, sourceName).catch(() => undefined);
      await dropDatabase(admin, targetName).catch(() => undefined);
      await dropDatabase(admin, foreignName).catch(() => undefined);
      await dropDatabase(admin, unsafeName).catch(() => undefined);
      await admin.end().catch(() => undefined);
    }
  });

  it('enforces read-only UTC timeouts and exact Gate column reads', async () => {
    const settings = await sourceReader.query(
      `SELECT current_setting('default_transaction_read_only') AS read_only,
              current_setting('TimeZone') AS timezone,
              current_setting('statement_timeout') AS statement_timeout,
              current_setting('lock_timeout') AS lock_timeout`,
    );
    expect(settings.rows[0]).toEqual(
      expect.objectContaining({
        read_only: 'on',
        timezone: 'UTC',
      }),
    );
    expect(['5s', '5000ms', '5000']).toContain(
      settings.rows[0]?.statement_timeout,
    );
    expect(['2s', '2000ms', '2000']).toContain(settings.rows[0]?.lock_timeout);
    await expect(
      sourceReader.query(
        `SELECT count("userId")::int AS count FROM agency.agency_profiles`,
      ),
    ).resolves.toMatchObject({ rows: [{ count: 0 }] });
    await expect(
      sourceReader.query(
        `SELECT id, "aggregateType" FROM agency.agency_projection_audits`,
      ),
    ).resolves.toMatchObject({
      rows: [{ id: 'audit-profile-1', aggregateType: 'AgencyProfile' }],
    });
    await expect(
      sourceReader.query(`SELECT producer FROM orders.commerce_outbox_events`),
    ).resolves.toMatchObject({ rows: [] });
    await expect(
      targetReader.query(
        `SELECT "aggregateType", "semanticFingerprint"
         FROM agency.agency_projection_slots`,
      ),
    ).resolves.toMatchObject({
      rows: [{ aggregateType: 'AgencyProfile' }],
    });
    await expect(
      targetReader.query(`SELECT status FROM agency.kafka_processing_failures`),
    ).resolves.toMatchObject({ rows: [] });
  });

  it('denies extra columns, writes, DDL, sequences, foreign schema and counterpart CONNECT', async () => {
    await deny(
      () =>
        targetReader.query(
          'SELECT "envelopeFingerprint" FROM agency.agency_projection_event_receipts',
        ),
      TARGET_PASSWORD,
    );
    await deny(
      () =>
        targetReader.query(
          'SELECT "receivedAt" FROM agency.agency_projection_event_receipts',
        ),
      TARGET_PASSWORD,
    );
    await deny(
      () =>
        targetReader.query(
          'SELECT "auditId" FROM agency.agency_projection_slots',
        ),
      TARGET_PASSWORD,
    );
    await deny(
      () =>
        sourceReader.query(
          'SELECT mutation FROM agency.agency_projection_audits',
        ),
      SOURCE_PASSWORD,
    );
    await deny(
      () =>
        sourceReader.query(
          `INSERT INTO agency.agency_profiles
            ("userId", "licenseNo", "managerName", phone, email, city, address)
           VALUES ('x', 'y', 'z', '1', 'e@x', 'c', 'a')`,
        ),
      SOURCE_PASSWORD,
    );
    await deny(
      () =>
        sourceReader.query('CREATE TABLE agency.injected (id int PRIMARY KEY)'),
      SOURCE_PASSWORD,
    );
    await deny(
      () =>
        sourceReader.query("SELECT nextval('agency.cutover_reader_sequence')"),
      SOURCE_PASSWORD,
    );
    await deny(
      () => sourceReader.query('SELECT id FROM outside_domain.private_rows'),
      SOURCE_PASSWORD,
    );
    const counterpart = new Client({
      connectionString: readerUrl(
        root,
        targetName,
        AGENCY_CUTOVER_SOURCE_ROLE,
        SOURCE_PASSWORD,
      ),
    });
    await deny(() => counterpart.connect(), SOURCE_PASSWORD);
    await counterpart.end().catch(() => undefined);
    const swapped = new Client({
      connectionString: readerUrl(
        root,
        sourceName,
        AGENCY_CUTOVER_TARGET_ROLE,
        TARGET_PASSWORD,
      ),
    });
    await deny(() => swapped.connect(), TARGET_PASSWORD);
    await swapped.end().catch(() => undefined);
  });

  it('does not change PUBLIC or unrelated-role access on other databases', async () => {
    const unrelated = new Client({
      connectionString: readerUrl(
        root,
        foreignName,
        unrelatedRole,
        UNRELATED_PASSWORD,
      ),
    });
    await unrelated.connect();
    await expect(
      unrelated.query('SELECT current_database() AS database'),
    ).resolves.toMatchObject({ rows: [{ database: foreignName }] });
    await unrelated.end();
  });

  it('fails closed when the current database retains PUBLIC privileges', async () => {
    const unsafeOwner = new Client({
      connectionString: rewriteDatabase(root, unsafeName),
    });
    await unsafeOwner.connect();
    await expect(
      provisionAgencyCutoverReaderRole(
        unsafeOwner,
        SOURCE_PASSWORD,
        'source',
        unsafeName,
        targetName,
      ),
    ).rejects.toThrow('reader role verification failed');
    await unsafeOwner.end();
  });

  it('corrects membership, elevation and extra grants on rerun', async () => {
    await sourceOwner.query('CREATE ROLE agency_cutover_probe_parent NOLOGIN');
    await sourceOwner.query(
      `GRANT agency_cutover_probe_parent TO ${quoteIdent(AGENCY_CUTOVER_SOURCE_ROLE)}`,
    );
    await sourceOwner.query(
      `ALTER ROLE ${quoteIdent(AGENCY_CUTOVER_SOURCE_ROLE)} SUPERUSER`,
    );
    await targetOwner.query(
      `GRANT SELECT ("auditId") ON TABLE agency.agency_projection_slots
       TO ${quoteIdent(AGENCY_CUTOVER_TARGET_ROLE)}`,
    );
    await provisionAgencyCutoverReaderRole(
      sourceOwner,
      SOURCE_PASSWORD,
      'source',
      sourceName,
      targetName,
    );
    await provisionAgencyCutoverReaderRole(
      targetOwner,
      TARGET_PASSWORD,
      'target',
      targetName,
      sourceName,
    );
    const state = await sourceOwner.query(
      `SELECT r.rolsuper,
        EXISTS (
          SELECT 1 FROM pg_auth_members membership
          JOIN pg_roles member ON member.oid = membership.member
          WHERE member.rolname = $1
        ) AS "hasMembership"
       FROM pg_roles r WHERE r.rolname = $1`,
      [AGENCY_CUTOVER_SOURCE_ROLE],
    );
    expect(state.rows[0]).toEqual({ rolsuper: false, hasMembership: false });
    await deny(
      () =>
        targetReader.query(
          'SELECT "auditId" FROM agency.agency_projection_slots',
        ),
      TARGET_PASSWORD,
    );
    await sourceOwner.query('DROP ROLE IF EXISTS agency_cutover_probe_parent');
  });

  it('fails closed for wrong database names and identical owner URLs', async () => {
    await expect(
      provisionAgencyCutoverReaderRole(
        targetOwner,
        TARGET_PASSWORD,
        'source',
        targetName,
        sourceName,
      ),
    ).rejects.toThrow('Core/shared');
    await expect(
      provisionAgencyCutoverReaderRole(
        sourceOwner,
        SOURCE_PASSWORD,
        'target',
        sourceName,
        targetName,
      ),
    ).rejects.toThrow('isolated Agency database');
    expect(() => classifyAgencyCutoverOwnerUrls(sourceUrl, sourceUrl)).toThrow(
      'distinct databases',
    );
    expect(() =>
      classifyAgencyCutoverOwnerUrls(sourceUrl, targetUrl),
    ).not.toThrow();
  });

  it('runs the Agency cutover gate with the provisioned readers', async () => {
    const source = await connectAgencyCutoverReadClient(
      readerUrl(root, sourceName, AGENCY_CUTOVER_SOURCE_ROLE, SOURCE_PASSWORD),
    );
    const target = await connectAgencyCutoverReadClient(
      readerUrl(root, targetName, AGENCY_CUTOVER_TARGET_ROLE, TARGET_PASSWORD),
    );
    try {
      const report = await evaluateAgencyCutoverReadiness({
        source,
        target,
        kafkaGroupId: GROUP,
        kafkaTopic: TOPIC,
        expectedPartitions: [0, 1, 2],
        batchSize: 100,
      });
      expect(['READY', 'NOT_READY']).toContain(report.status);
      const serialized = serializeAgencyCutoverReport(report);
      expect(serialized).not.toContain(SECRET);
      expect(serialized).not.toMatch(/postgresql:\/\//i);
      expect(serialized).not.toContain(SOURCE_PASSWORD);
    } finally {
      await source.end();
      await target.end();
    }
  });
});
