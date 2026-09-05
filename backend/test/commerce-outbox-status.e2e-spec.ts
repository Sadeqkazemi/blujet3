import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as path from 'node:path';
import { DataSource } from 'typeorm';
import { dataSourceOptions } from '../src/database/data-source.options';
import { CommerceOutboxEvent } from '../src/database/entities/commerce-outbox-event.entity';
import { readCommerceOutboxStatus } from '../src/modules/commerce-outbox/commerce-outbox-status';

const execute = promisify(execFile);

describe('commerce outbox status (PostgreSQL + CLI)', () => {
  let db: DataSource;
  const producer = `status-test-${randomUUID()}`;
  const role = `outbox_status_${randomUUID().replaceAll('-', '')}`;
  let roleCreated = false;
  const repo = () => db.getRepository(CommerceOutboxEvent);
  async function insert(change: Partial<CommerceOutboxEvent> = {}) {
    const id = randomUUID();
    await repo().insert({
      id,
      producer,
      idempotencyKey: id,
      fingerprint: 'test',
      envelopeEncrypted: 'SECRET-unreadable-ciphertext',
      createdAt: new Date(Date.now() - 10_000),
      nextAttemptAt: new Date(0),
      ...change,
    });
    // TIMESTAMP columns represent UTC by project contract. Do not let the
    // Windows pg Date serializer insert local wall-clock components here.
    await db.query(
      `UPDATE orders.commerce_outbox_events SET
      "createdAt" = $1::timestamp, "nextAttemptAt" = $2::timestamp,
      "claimedAt" = $3::timestamp, "deliveredAt" = $4::timestamp,
      "deadLetterAt" = $5::timestamp WHERE id = $6`,
      [
        (change.createdAt ?? new Date(Date.now() - 10_000)).toISOString(),
        (change.nextAttemptAt ?? new Date(0)).toISOString(),
        change.claimedAt?.toISOString() ?? null,
        change.deliveredAt?.toISOString() ?? null,
        change.deadLetterAt?.toISOString() ?? null,
        id,
      ],
    );
    return id;
  }
  async function cli(
    env: Record<string, string> = {},
  ): Promise<{ stdout: string; stderr: string; code: number }> {
    const args = [
      path.resolve('node_modules/tsx/dist/cli.mjs'),
      path.resolve('src/database/report-commerce-outbox.ts'),
    ];
    try {
      return {
        ...(await execute(process.execPath, args, {
          env: {
            ...process.env,
            KAFKA_EVENTS_ENABLED: 'false',
            KAFKA_BROKERS: '',
            PII_ENCRYPTION_KEY: '',
            ...env,
          },
          timeout: 15000,
        })),
        code: 0,
      };
    } catch (error: unknown) {
      if (
        !error ||
        typeof error !== 'object' ||
        !('code' in error) ||
        typeof error.code !== 'number' ||
        !('stdout' in error) ||
        typeof error.stdout !== 'string' ||
        !('stderr' in error) ||
        typeof error.stderr !== 'string'
      )
        throw error;
      return { stdout: error.stdout, stderr: error.stderr, code: error.code };
    }
  }
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? '');
    if (
      !['localhost', '127.0.0.1', 'postgres'].includes(url.hostname) ||
      !url.pathname.endsWith('_test')
    )
      throw new Error('Local test database required');
    db = await new DataSource({
      ...dataSourceOptions,
      logging: false,
    }).initialize();
  });
  beforeEach(async () => {
    expect(await repo().count()).toBe(0);
  });
  afterEach(async () => {
    if (db?.isInitialized) await repo().delete({ producer });
  });
  afterAll(async () => {
    if (!db?.isInitialized) return;
    try {
      if (roleCreated) {
        await db.query(
          `REVOKE ALL PRIVILEGES ON orders.commerce_outbox_events FROM "${role}"`,
        );
        await db.query(
          `REVOKE SELECT ("createdAt", "nextAttemptAt", "claimedAt", "deliveredAt", "deadLetterAt") ON orders.commerce_outbox_events FROM "${role}"`,
        );
        await db.query(`REVOKE USAGE ON SCHEMA orders FROM "${role}"`);
        await db.query(`DROP ROLE "${role}"`);
      }
    } finally {
      await db.destroy();
    }
  });
  it('reports an empty queue and UTC time without claiming broker health', async () => {
    const report = await readCommerceOutboxStatus(db, true);
    expect(report.status).toBe('IDLE');
    expect(report.oldestPendingAgeSeconds).toBeNull();
    expect(Object.values(report.counts)).toEqual([
      '0',
      '0',
      '0',
      '0',
      '0',
      '0',
    ]);
    expect(new Date(report.capturedAt).toISOString()).toBe(report.capturedAt);
  });
  it('partitions pending states, excludes delivered history and never changes rows', async () => {
    await insert();
    await insert({ nextAttemptAt: new Date(Date.now() + 60_000) });
    await insert({
      claimedAt: new Date(Date.now() + 60_000),
      claimToken: randomUUID(),
    });
    await insert({
      claimedAt: new Date(Date.now() - 180_000),
      claimToken: randomUUID(),
    });
    await insert({ deadLetterAt: new Date() });
    await insert({ deliveredAt: new Date(), createdAt: new Date(0) });
    const before = await repo().find({ order: { id: 'ASC' } });
    const report = await readCommerceOutboxStatus(db, false);
    expect(report.counts).toEqual({
      pending: '4',
      ready: '1',
      scheduled: '1',
      inFlight: '1',
      expiredLease: '1',
      quarantined: '1',
    });
    expect(report.status).toBe('ATTENTION');
    expect(
      BigInt(report.oldestPendingAgeSeconds ?? '0'),
    ).toBeGreaterThanOrEqual(10n);
    expect(JSON.stringify(report)).not.toMatch(
      /SECRET|envelope|fingerprint|claimToken|idempotencyKey/,
    );
    expect(await repo().find({ order: { id: 'ASC' } })).toEqual(before);
  });
  it('distinguishes configured pause from normal pending and clamps future age', async () => {
    await insert({ createdAt: new Date(Date.now() + 60_000) });
    expect(await readCommerceOutboxStatus(db, false)).toMatchObject({
      status: 'PAUSED',
      oldestPendingAgeSeconds: '0',
    });
    expect((await readCommerceOutboxStatus(db, true)).status).toBe('PENDING');
  });
  it('works with metadata-column grants and denies payload access and writes', async () => {
    await insert();
    // Isolated NOLOGIN role in the local test DB, removed in afterAll.
    await db.query(`CREATE ROLE "${role}" NOLOGIN`);
    roleCreated = true;
    await db.query(`GRANT USAGE ON SCHEMA orders TO "${role}"`);
    await db.query(
      `GRANT SELECT ("createdAt", "nextAttemptAt", "claimedAt", "deliveredAt", "deadLetterAt") ON orders.commerce_outbox_events TO "${role}"`,
    );
    const reader = await new DataSource({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      logging: false,
      extra: {
        max: 1,
        options: `-c role=${role} -c default_transaction_read_only=on -c timezone=UTC`,
      },
    }).initialize();
    try {
      expect(
        (await readCommerceOutboxStatus(reader, true)).counts.pending,
      ).toBe('1');
      await expect(
        reader.query(
          'SELECT "envelopeEncrypted" FROM orders.commerce_outbox_events',
        ),
      ).rejects.toThrow();
      await expect(
        reader.query(
          'UPDATE orders.commerce_outbox_events SET attempts = attempts',
        ),
      ).rejects.toThrow();
    } finally {
      await reader.destroy();
    }
  });
  it('CLI runs without Kafka or PII credentials and signals a paused backlog', async () => {
    const idle = await cli();
    expect(idle.code).toBe(0);
    expect(JSON.parse(idle.stdout)).toMatchObject({
      status: 'IDLE',
      reportVersion: 1,
    });
    await insert();
    const paused = await cli();
    expect(paused.code).toBe(2);
    expect(JSON.parse(paused.stdout)).toMatchObject({
      status: 'PAUSED',
      counts: { pending: '1' },
    });
    const configured = await cli({ KAFKA_EVENTS_ENABLED: 'true' });
    expect(configured.code).toBe(0);
    expect(JSON.parse(configured.stdout)).toMatchObject({ status: 'PENDING' });
  });

  it('times out on a blocked table and remains usable after lock release', async () => {
    const lock = db.createQueryRunner();
    await lock.connect();
    await lock.startTransaction();
    try {
      await lock.query(
        'LOCK TABLE orders.commerce_outbox_events IN ACCESS EXCLUSIVE MODE',
      );
      await expect(readCommerceOutboxStatus(db, true)).rejects.toThrow();
    } finally {
      await lock.rollbackTransaction();
      await lock.release();
    }
    expect((await readCommerceOutboxStatus(db, true)).status).toBe('IDLE');
  });
  it.each([
    { KAFKA_EVENTS_ENABLED: 'yes' },
    { DATABASE_URL: 'postgresql://test:SECRET@127.0.0.1:1/blujet_test' },
    { DATABASE_URL: 'not-a-database-SECRET' },
  ])('CLI redacts failure case %# and exits nonzero', async (env) => {
    const result = await cli(env);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stdout)).toEqual({
      reportVersion: 1,
      status: 'UNAVAILABLE',
    });
    expect(result.stderr).toBe('');
    expect(result.stdout).not.toContain('SECRET');
  });
});
