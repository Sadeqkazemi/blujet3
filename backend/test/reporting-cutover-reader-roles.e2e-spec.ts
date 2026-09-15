import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import {
  REPORTING_CUTOVER_SOURCE_ROLE,
  REPORTING_CUTOVER_TARGET_ROLE,
  classifyReportingCutoverOwnerUrls,
  provisionReportingCutoverReaderRole,
} from '../src/database/provision-reporting-cutover-reader-roles';
import { reportingDataSourceOptions } from '../src/database/reporting-data-source.options';

const SOURCE_PASSWORD = 'reporting_cutover_source_password_2026';
const TARGET_PASSWORD = 'reporting_cutover_target_password_2026';
const UNRELATED_PASSWORD = 'reporting_unrelated_password_2026';
const FINGERPRINT = 'a'.repeat(64);

function ownerUrl(): string {
  const url =
    process.env.REPORTING_DATABASE_URL ??
    process.env.DATABASE_URL ??
    process.env.REPORTING_CUTOVER_SOURCE_OWNER_URL;
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

async function migrateReporting(url: string): Promise<void> {
  const migrations = new DataSource(reportingDataSourceOptions(url));
  await migrations.initialize();
  await migrations.runMigrations();
  await migrations.destroy();
}

describe('Reporting cutover reader roles (PostgreSQL)', () => {
  const suffix = `${Date.now()}`;
  const sourceName = `blujet_core_cutover_reader_${suffix}`;
  const targetName = `blujet_reporting_cutover_reader_${suffix}`;
  const foreignName = `blujet_core_guard_reader_${suffix}`;
  const unsafeName = `blujet_core_unsafe_reader_${suffix}`;
  const unrelatedRole = `reporting_cutover_unrelated_${suffix}`;
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
    await migrateReporting(sourceUrl);
    await migrateReporting(targetUrl);
    await migrateReporting(rewriteDatabase(root, unsafeName));
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
      'CREATE SEQUENCE IF NOT EXISTS reporting.cutover_reader_sequence',
    );
    const eventId = randomUUID();
    await sourceOwner.query(
      `INSERT INTO reporting.core_itinerary_event_receipts
        ("eventId", fingerprint, "orderId", "eventType", "orderVersion")
       VALUES ($1, $2, 'order-reader', 'OrderCreated', 1)`,
      [eventId, FINGERPRINT],
    );
    await sourceOwner.query(
      `INSERT INTO reporting.core_itinerary_event_projections
        ("orderId", "eventType", "eventId", fingerprint, "orderVersion",
         currency, payload, "occurredAt")
       VALUES ('order-reader', 'OrderCreated', $1, $2, 1, 'IRR',
         '{"secret":"nope"}'::jsonb, '2026-09-15T00:00:00.000Z')`,
      [eventId, FINGERPRINT],
    );
    await sourceOwner.query(
      `INSERT INTO reporting.kafka_consumer_checkpoints
        ("consumerGroup", topic, partition, "nextOffset", "highWatermark")
       VALUES ('reporting-cutover-e2e', 'blujet.events.v1', 0, 4, 4)`,
    );
    await sourceOwner.query(
      `INSERT INTO reporting.kafka_processing_failures
        ("consumerGroup", topic, partition, "offset", fingerprint, stage,
         attempts, "totalAttempts", status, "firstFailedAt", "lastFailedAt")
       VALUES ('reporting-cutover-e2e', 'blujet.events.v1', 0, 1, $1,
         'PROJECTION', 1, 1, 'RESOLVED', now(), now())`,
      [FINGERPRINT],
    );
    await provisionReportingCutoverReaderRole(
      sourceOwner,
      SOURCE_PASSWORD,
      'source',
      sourceName,
      targetName,
    );
    await provisionReportingCutoverReaderRole(
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
        REPORTING_CUTOVER_SOURCE_ROLE,
        SOURCE_PASSWORD,
      ),
    });
    await sourceReader.connect();
    targetReader = new Client({
      connectionString: readerUrl(
        root,
        targetName,
        REPORTING_CUTOVER_TARGET_ROLE,
        TARGET_PASSWORD,
      ),
    });
    await targetReader.connect();
  }, 60000);

  afterAll(async () => {
    if (sourceReader) await sourceReader.end().catch(() => undefined);
    if (targetReader) await targetReader.end().catch(() => undefined);
    if (sourceOwner) {
      await sourceOwner
        .query(`DROP OWNED BY ${quoteIdent(REPORTING_CUTOVER_SOURCE_ROLE)}`)
        .catch(() => undefined);
      await sourceOwner
        .query(
          `DROP ROLE IF EXISTS ${quoteIdent(REPORTING_CUTOVER_SOURCE_ROLE)}`,
        )
        .catch(() => undefined);
      await sourceOwner.end().catch(() => undefined);
    }
    if (targetOwner) {
      await targetOwner
        .query(`DROP OWNED BY ${quoteIdent(REPORTING_CUTOVER_TARGET_ROLE)}`)
        .catch(() => undefined);
      await targetOwner
        .query(
          `DROP ROLE IF EXISTS ${quoteIdent(REPORTING_CUTOVER_TARGET_ROLE)}`,
        )
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

  it('enforces read-only UTC timeouts and exact column reads', async () => {
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
        `SELECT "orderId", "eventType", fingerprint FROM reporting.core_itinerary_event_projections`,
      ),
    ).resolves.toMatchObject({
      rows: [{ orderId: 'order-reader', eventType: 'OrderCreated' }],
    });
    await expect(
      sourceReader.query(
        `SELECT status, "consumerGroup" FROM reporting.kafka_processing_failures`,
      ),
    ).resolves.toMatchObject({
      rows: [{ status: 'RESOLVED', consumerGroup: 'reporting-cutover-e2e' }],
    });
    await expect(
      targetReader.query(
        `SELECT count("nextOffset")::int AS count FROM reporting.kafka_consumer_checkpoints`,
      ),
    ).resolves.toMatchObject({ rows: [{ count: 0 }] });
  });

  it('denies payload, writes, DDL, sequences, foreign schema and counterpart CONNECT', async () => {
    await deny(
      () =>
        sourceReader.query(
          'SELECT payload FROM reporting.core_itinerary_event_projections',
        ),
      SOURCE_PASSWORD,
    );
    await deny(
      () =>
        sourceReader.query(
          `INSERT INTO reporting.kafka_consumer_checkpoints
            ("consumerGroup", topic, partition, "nextOffset")
           VALUES ('x', 'y', 1, 0)`,
        ),
      SOURCE_PASSWORD,
    );
    await deny(
      () =>
        sourceReader.query(
          'CREATE TABLE reporting.injected (id int PRIMARY KEY)',
        ),
      SOURCE_PASSWORD,
    );
    await deny(
      () =>
        sourceReader.query(
          "SELECT nextval('reporting.cutover_reader_sequence')",
        ),
      SOURCE_PASSWORD,
    );
    await deny(
      () => sourceReader.query('SELECT id FROM outside_domain.private_rows'),
      SOURCE_PASSWORD,
    );
    const foreign = new Client({
      connectionString: readerUrl(
        root,
        targetName,
        REPORTING_CUTOVER_SOURCE_ROLE,
        SOURCE_PASSWORD,
      ),
    });
    await deny(() => foreign.connect(), SOURCE_PASSWORD);
    await foreign.end().catch(() => undefined);
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
      provisionReportingCutoverReaderRole(
        unsafeOwner,
        SOURCE_PASSWORD,
        'source',
        unsafeName,
        targetName,
      ),
    ).rejects.toThrow('reader role verification failed');
    await unsafeOwner.end();
  });

  it('corrects membership and elevation on rerun', async () => {
    await sourceOwner.query(
      'CREATE ROLE reporting_cutover_probe_parent NOLOGIN',
    );
    await sourceOwner.query(
      `GRANT reporting_cutover_probe_parent TO ${quoteIdent(REPORTING_CUTOVER_SOURCE_ROLE)}`,
    );
    await sourceOwner.query(
      `ALTER ROLE ${quoteIdent(REPORTING_CUTOVER_SOURCE_ROLE)} SUPERUSER`,
    );
    await provisionReportingCutoverReaderRole(
      sourceOwner,
      SOURCE_PASSWORD,
      'source',
      sourceName,
      targetName,
    );
    const state = await sourceOwner.query(
      `SELECT r.rolsuper,
        EXISTS (
          SELECT 1 FROM pg_auth_members membership
          JOIN pg_roles member ON member.oid = membership.member
          WHERE member.rolname = $1
        ) AS "hasMembership"
       FROM pg_roles r WHERE r.rolname = $1`,
      [REPORTING_CUTOVER_SOURCE_ROLE],
    );
    expect(state.rows[0]).toEqual({ rolsuper: false, hasMembership: false });
    await sourceOwner.query(
      'DROP ROLE IF EXISTS reporting_cutover_probe_parent',
    );
  });

  it('fails closed for wrong database names and identical owner URLs', async () => {
    await expect(
      provisionReportingCutoverReaderRole(
        targetOwner,
        TARGET_PASSWORD,
        'source',
        targetName,
        sourceName,
      ),
    ).rejects.toThrow('Core/shared');
    await expect(
      provisionReportingCutoverReaderRole(
        sourceOwner,
        SOURCE_PASSWORD,
        'target',
        sourceName,
        targetName,
      ),
    ).rejects.toThrow('isolated Reporting database');
    expect(() =>
      classifyReportingCutoverOwnerUrls(sourceUrl, sourceUrl),
    ).toThrow('distinct databases');
    expect(() =>
      classifyReportingCutoverOwnerUrls(sourceUrl, targetUrl),
    ).not.toThrow();
  });

  it('rolls back a failed verification without dropping prior grants', async () => {
    await sourceOwner.query(
      'CREATE TABLE reporting.cutover_reader_extra (id integer PRIMARY KEY)',
    );
    await expect(
      provisionReportingCutoverReaderRole(
        sourceOwner,
        SOURCE_PASSWORD,
        'source',
        sourceName,
        targetName,
      ),
    ).rejects.toThrow('relation contract does not match');
    await expect(
      sourceReader.query(
        'SELECT "orderId" FROM reporting.core_itinerary_event_projections',
      ),
    ).resolves.toMatchObject({
      rows: [{ orderId: 'order-reader' }],
    });
    await sourceOwner.query('DROP TABLE reporting.cutover_reader_extra');
    await expect(
      provisionReportingCutoverReaderRole(
        sourceOwner,
        SOURCE_PASSWORD,
        'source',
        sourceName,
        targetName,
      ),
    ).resolves.toEqual({
      status: 'PASS',
      role: REPORTING_CUTOVER_SOURCE_ROLE,
      relationCount: 4,
    });
  });
});
