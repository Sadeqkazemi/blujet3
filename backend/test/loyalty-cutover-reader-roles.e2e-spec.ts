import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import {
  LOYALTY_CUTOVER_SOURCE_ROLE,
  LOYALTY_CUTOVER_TARGET_ROLE,
  provisionLoyaltyCutoverReaderRole,
} from '../src/database/provision-loyalty-cutover-reader-roles';
import { runLoyaltyCutoverReadinessCheck } from '../../loyalty-service/src/check-loyalty-cutover-readiness';
import { loyaltyMigrationDataSourceOptions } from '../../loyalty-service/src/database/data-source.options';

const SOURCE_PASSWORD = 'loyalty_cutover_source_password_2026';
const TARGET_PASSWORD = 'loyalty_cutover_target_password_2026';
const GROUP = 'blujet-loyalty-reader-role-e2e';
const TOPIC = 'blujet.events.v1';

function configuredOwnerUrl(): string {
  const url = process.env.LOYALTY_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error('LOYALTY_DATABASE_URL is required');
  const parsed = new URL(url);
  if (
    !['localhost', '127.0.0.1'].includes(parsed.hostname) ||
    !parsed.pathname.endsWith('_test')
  ) {
    throw new Error('Loyalty reader-role E2E requires a local _test database');
  }
  return url;
}

function databaseUrl(base: string, databaseName: string): string {
  const url = new URL(base);
  url.pathname = `/${databaseName}`;
  url.search = '';
  url.hash = '';
  return url.toString();
}

function readerUrl(
  owner: string,
  databaseName: string,
  role: string,
  password: string,
): string {
  const url = new URL(databaseUrl(owner, databaseName));
  url.username = role;
  url.password = password;
  return url.toString();
}

function identifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

async function dropDatabase(
  admin: Client,
  databaseName: string,
): Promise<void> {
  await admin.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
     WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [databaseName],
  );
  await admin.query(`DROP DATABASE IF EXISTS ${identifier(databaseName)}`);
}

async function expectDenied(
  operation: () => Promise<unknown>,
  password: string,
): Promise<void> {
  try {
    await operation();
    throw new Error('expected PostgreSQL to deny the operation');
  } catch (error) {
    expect(error).toEqual(
      expect.objectContaining({
        code: expect.stringMatching(
          /^(42501|3F000|3D000|28000|28P01|25006|42P01)$/,
        ),
      }),
    );
    const message = error instanceof Error ? error.message : String(error);
    expect(message).not.toMatch(/postgresql:\/\//i);
    expect(message).not.toContain(password);
  }
}

async function migrateLoyalty(url: string): Promise<void> {
  const dataSource = new DataSource(loyaltyMigrationDataSourceOptions(url));
  await dataSource.initialize();
  await dataSource.runMigrations({ transaction: 'all' });
  await dataSource.destroy();
}

describe('Loyalty cutover reader roles (PostgreSQL)', () => {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
  const sourceName = `blujet_core_loyalty_reader_${suffix}_test`;
  const targetName = `blujet_loyalty_reader_${suffix}_test`;
  let rootUrl: string;
  let sourceUrl: string;
  let targetUrl: string;
  let admin: Client;
  let sourceOwner: Client;
  let targetOwner: Client;
  let sourceReader: Client;
  let targetReader: Client;

  beforeAll(async () => {
    rootUrl = configuredOwnerUrl();
    sourceUrl = databaseUrl(rootUrl, sourceName);
    targetUrl = databaseUrl(rootUrl, targetName);
    admin = new Client({
      connectionString: databaseUrl(rootUrl, 'postgres'),
    });
    await admin.connect();
    await dropDatabase(admin, sourceName);
    await dropDatabase(admin, targetName);
    await admin.query(
      `DROP ROLE IF EXISTS ${identifier(LOYALTY_CUTOVER_SOURCE_ROLE)}`,
    );
    await admin.query(
      `DROP ROLE IF EXISTS ${identifier(LOYALTY_CUTOVER_TARGET_ROLE)}`,
    );
    await admin.query(`CREATE DATABASE ${identifier(sourceName)}`);
    await admin.query(`CREATE DATABASE ${identifier(targetName)}`);
    await admin.query(
      `REVOKE CONNECT, TEMPORARY, CREATE ON DATABASE ${identifier(sourceName)} FROM PUBLIC`,
    );
    await admin.query(
      `REVOKE CONNECT, TEMPORARY, CREATE ON DATABASE ${identifier(targetName)} FROM PUBLIC`,
    );
    await migrateLoyalty(sourceUrl);
    await migrateLoyalty(targetUrl);

    sourceOwner = new Client({ connectionString: sourceUrl });
    targetOwner = new Client({ connectionString: targetUrl });
    await sourceOwner.connect();
    await targetOwner.connect();
    for (const owner of [sourceOwner, targetOwner]) {
      await owner.query('REVOKE ALL ON SCHEMA public FROM PUBLIC');
    }
    await sourceOwner.query(`CREATE TABLE loyalty.loyalty_projection_audits (
      id text PRIMARY KEY,
      "aggregateType" text NOT NULL,
      "aggregateId" text NOT NULL,
      "recordVersion" integer NOT NULL,
      mutation text NOT NULL
    )`);
    await sourceOwner.query('CREATE SCHEMA orders');
    await sourceOwner.query(`CREATE TABLE orders.commerce_outbox_events (
      producer text NOT NULL,
      "deliveredAt" timestamp,
      "deadLetterAt" timestamp,
      "claimedAt" timestamp,
      "envelopeEncrypted" text,
      "lastError" text
    )`);
    await sourceOwner.query('CREATE SCHEMA outside_domain');
    await sourceOwner.query(
      'CREATE TABLE outside_domain.private_rows (id integer PRIMARY KEY)',
    );
    await sourceOwner.query('CREATE SEQUENCE loyalty.reader_test_sequence');
    await targetOwner.query(
      `INSERT INTO loyalty.kafka_consumer_checkpoints
        ("consumerGroup", topic, partition, "nextOffset", "highWatermark")
       VALUES ($1, $2, 0, 0, 0)`,
      [GROUP, TOPIC],
    );

    await provisionLoyaltyCutoverReaderRole(
      sourceOwner,
      SOURCE_PASSWORD,
      'source',
      sourceName,
      targetName,
    );
    await provisionLoyaltyCutoverReaderRole(
      targetOwner,
      TARGET_PASSWORD,
      'target',
      targetName,
      sourceName,
    );
    sourceReader = new Client({
      connectionString: readerUrl(
        rootUrl,
        sourceName,
        LOYALTY_CUTOVER_SOURCE_ROLE,
        SOURCE_PASSWORD,
      ),
    });
    targetReader = new Client({
      connectionString: readerUrl(
        rootUrl,
        targetName,
        LOYALTY_CUTOVER_TARGET_ROLE,
        TARGET_PASSWORD,
      ),
    });
    await sourceReader.connect();
    await targetReader.connect();
  });

  afterAll(async () => {
    await sourceReader?.end().catch(() => undefined);
    await targetReader?.end().catch(() => undefined);
    await sourceOwner?.end().catch(() => undefined);
    await targetOwner?.end().catch(() => undefined);
    if (admin) {
      await dropDatabase(admin, sourceName);
      await dropDatabase(admin, targetName);
      await admin.query(
        `DROP ROLE IF EXISTS ${identifier(LOYALTY_CUTOVER_SOURCE_ROLE)}`,
      );
      await admin.query(
        `DROP ROLE IF EXISTS ${identifier(LOYALTY_CUTOVER_TARGET_ROLE)}`,
      );
      await admin.end();
    }
  });

  it('runs the complete readiness gate with only the two reader roles', async () => {
    const report = await runLoyaltyCutoverReadinessCheck({
      env: {
        TZ: 'UTC',
        LOYALTY_CUTOVER_CHECK_ENABLED: 'true',
        LOYALTY_CUTOVER_SOURCE_DATABASE_URL: readerUrl(
          rootUrl,
          sourceName,
          LOYALTY_CUTOVER_SOURCE_ROLE,
          SOURCE_PASSWORD,
        ),
        LOYALTY_CUTOVER_TARGET_DATABASE_URL: readerUrl(
          rootUrl,
          targetName,
          LOYALTY_CUTOVER_TARGET_ROLE,
          TARGET_PASSWORD,
        ),
        LOYALTY_CUTOVER_KAFKA_GROUP_ID: GROUP,
        LOYALTY_CUTOVER_KAFKA_TOPIC: TOPIC,
        LOYALTY_CUTOVER_EXPECTED_PARTITIONS: '0',
        LOYALTY_CUTOVER_RECONCILIATION_LIMIT: '100',
      },
    });
    expect(report).toEqual(
      expect.objectContaining({
        status: 'READY',
        reasons: [],
        businessTableCount: '6',
        auditReceiptParity: true,
        maxLag: '0',
      }),
    );
  });

  it('allows only the documented columns and denies mutation or DDL', async () => {
    await expect(
      sourceReader.query(
        `SELECT producer, "deliveredAt", "deadLetterAt", "claimedAt"
         FROM orders.commerce_outbox_events`,
      ),
    ).resolves.toBeDefined();
    await expect(
      sourceReader.query(
        `SELECT id, "aggregateType", "aggregateId", "recordVersion"
         FROM loyalty.loyalty_projection_audits`,
      ),
    ).resolves.toBeDefined();
    await expect(
      targetReader.query(
        `SELECT "consumerGroup", topic, partition, "nextOffset", "highWatermark"
         FROM loyalty.kafka_consumer_checkpoints`,
      ),
    ).resolves.toBeDefined();
    await expectDenied(
      () =>
        sourceReader.query(
          'SELECT "envelopeEncrypted" FROM orders.commerce_outbox_events',
        ),
      SOURCE_PASSWORD,
    );
    await expectDenied(
      () =>
        sourceReader.query(
          'SELECT mutation FROM loyalty.loyalty_projection_audits',
        ),
      SOURCE_PASSWORD,
    );
    await expectDenied(
      () =>
        targetReader.query(
          'SELECT "semanticFingerprint" FROM loyalty.loyalty_projection_event_receipts',
        ),
      TARGET_PASSWORD,
    );
    await expectDenied(
      () =>
        targetReader.query(
          'SELECT "approvedBy" FROM loyalty.kafka_processing_failures',
        ),
      TARGET_PASSWORD,
    );
    await expectDenied(
      () => sourceReader.query('UPDATE loyalty.club_members SET points=1'),
      SOURCE_PASSWORD,
    );
    await expectDenied(
      () => sourceReader.query('CREATE TABLE loyalty.forbidden (id integer)'),
      SOURCE_PASSWORD,
    );
    await expectDenied(
      () =>
        sourceReader.query("SELECT nextval('loyalty.reader_test_sequence')"),
      SOURCE_PASSWORD,
    );
    await expectDenied(
      () => sourceReader.query('SELECT id FROM outside_domain.private_rows'),
      SOURCE_PASSWORD,
    );
  });

  it('denies the counterpart database and repairs an excess column grant', async () => {
    const sourceOnTarget = new Client({
      connectionString: readerUrl(
        rootUrl,
        targetName,
        LOYALTY_CUTOVER_SOURCE_ROLE,
        SOURCE_PASSWORD,
      ),
    });
    const targetOnSource = new Client({
      connectionString: readerUrl(
        rootUrl,
        sourceName,
        LOYALTY_CUTOVER_TARGET_ROLE,
        TARGET_PASSWORD,
      ),
    });
    await expectDenied(() => sourceOnTarget.connect(), SOURCE_PASSWORD);
    await expectDenied(() => targetOnSource.connect(), TARGET_PASSWORD);
    await sourceOnTarget.end().catch(() => undefined);
    await targetOnSource.end().catch(() => undefined);

    await sourceOwner.query(
      `GRANT SELECT (mutation) ON loyalty.loyalty_projection_audits
       TO ${identifier(LOYALTY_CUTOVER_SOURCE_ROLE)}`,
    );
    await provisionLoyaltyCutoverReaderRole(
      sourceOwner,
      SOURCE_PASSWORD,
      'source',
      sourceName,
      targetName,
    );
    await expectDenied(
      () =>
        sourceReader.query(
          'SELECT mutation FROM loyalty.loyalty_projection_audits',
        ),
      SOURCE_PASSWORD,
    );
  });
});
