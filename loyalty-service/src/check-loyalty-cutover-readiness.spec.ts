import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  LOYALTY_CUTOVER_DATA_SOURCE_OPTIONS,
  LOYALTY_CUTOVER_REASONS,
  classifyLoyaltyCutoverDatabaseUrls,
  emptyLoyaltyCutoverReport,
  evaluateLoyaltyCutoverEvidence,
  loadLoyaltyCutoverCheckConfig,
  parseLoyaltyCutoverLimit,
  parseLoyaltyCutoverPartitions,
  runLoyaltyCutoverReadinessCheck,
  serializeLoyaltyCutoverReport,
  type LoyaltyCutoverEvidence,
} from './check-loyalty-cutover-readiness';
import { LOYALTY_BUSINESS_TABLES } from './projection/loyalty-projection-reconciliation';

const SOURCE = 'postgresql://source:secret@core-db:5432/blujet';
const TARGET = 'postgresql://target:secret@loyalty-db:5432/blujet_loyalty';

function enabledEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    TZ: 'UTC',
    LOYALTY_CUTOVER_CHECK_ENABLED: 'true',
    LOYALTY_CUTOVER_SOURCE_DATABASE_URL: SOURCE,
    LOYALTY_CUTOVER_TARGET_DATABASE_URL: TARGET,
    LOYALTY_CUTOVER_KAFKA_GROUP_ID: 'blujet-loyalty-projection-v1',
    LOYALTY_CUTOVER_KAFKA_TOPIC: 'blujet.events.v1',
    LOYALTY_CUTOVER_EXPECTED_PARTITIONS: '0,1,2',
    LOYALTY_CUTOVER_RECONCILIATION_LIMIT: '10000',
    ...overrides,
  };
}

function evidence(): LoyaltyCutoverEvidence {
  return {
    reconciliation: {
      status: 'MATCH',
      capturedAt: '2026-09-15T00:00:00.000Z',
      limit: 10_000,
      tables: LOYALTY_BUSINESS_TABLES.map((table) => ({
        table,
        sourceCount: '2',
        projectionCount: '2',
        sourceHashA: '11',
        projectionHashA: '11',
        sourceHashB: '22',
        projectionHashB: '22',
        status: 'MATCH' as const,
      })),
    },
    auditReceipts: {
      sourceCount: '12',
      targetCount: '12',
      countMatches: true,
      fingerprintMatches: true,
    },
    slotMismatchCount: 0,
    outbox: { pending: 0, inFlight: 0, expiredLease: 0, deadLetter: 0 },
    openFailureCount: 0,
    checkpoints: {
      observed: 3,
      missing: 0,
      unexpected: 0,
      missingWatermark: 0,
      lagging: 0,
      maxLag: '0',
    },
    expectedPartitionCount: 3,
  };
}

describe('Loyalty cutover readiness gate', () => {
  it('does not create a database connection while disabled', async () => {
    const createDataSource = jest.fn();
    await expect(
      runLoyaltyCutoverReadinessCheck({
        env: { LOYALTY_CUTOVER_CHECK_ENABLED: 'false' },
        createDataSource,
        capturedAt: '2026-09-15T00:00:00.000Z',
      }),
    ).resolves.toEqual(
      expect.objectContaining({ status: 'DISABLED', reasons: [] }),
    );
    expect(createDataSource).not.toHaveBeenCalled();
  });

  it('loads only an exact, UTC, complete enabled configuration', () => {
    expect(loadLoyaltyCutoverCheckConfig(enabledEnv())).toEqual({
      enabled: true,
      sourceUrl: SOURCE,
      targetUrl: TARGET,
      kafkaGroupId: 'blujet-loyalty-projection-v1',
      kafkaTopic: 'blujet.events.v1',
      expectedPartitions: [0, 1, 2],
      reconciliationLimit: 10_000,
    });
    for (const env of [
      enabledEnv({ TZ: 'Asia/Tehran' }),
      enabledEnv({ LOYALTY_CUTOVER_CHECK_ENABLED: 'yes' }),
      enabledEnv({ LOYALTY_CUTOVER_SOURCE_DATABASE_URL: undefined }),
      enabledEnv({ LOYALTY_CUTOVER_KAFKA_GROUP_ID: 'bad group' }),
      enabledEnv({ LOYALTY_CUTOVER_KAFKA_TOPIC: '' }),
    ]) {
      expect(() => loadLoyaltyCutoverCheckConfig(env)).toThrow(
        'configuration is invalid',
      );
    }
  });

  it('validates unique partitions and the bounded reconciliation limit', () => {
    expect(parseLoyaltyCutoverPartitions('0, 2,9')).toEqual([0, 2, 9]);
    expect(parseLoyaltyCutoverLimit(undefined)).toBe(10_000);
    expect(parseLoyaltyCutoverLimit('1000000')).toBe(1_000_000);
    for (const value of ['', '-1', '1,1', '1.2']) {
      expect(() => parseLoyaltyCutoverPartitions(value)).toThrow(
        'configuration is invalid',
      );
    }
    for (const value of ['0', '-1', '1000001', '1.5']) {
      expect(() => parseLoyaltyCutoverLimit(value)).toThrow(
        'configuration is invalid',
      );
    }
  });

  it('rejects identical or directionally incorrect databases before connect', async () => {
    expect(classifyLoyaltyCutoverDatabaseUrls(SOURCE, SOURCE)).toEqual([
      'IDENTICAL_DATABASE',
    ]);
    expect(
      classifyLoyaltyCutoverDatabaseUrls(
        'postgresql://source:secret@core-db:5432/blujet_loyalty_old',
        'postgresql://target:secret@loyalty-db:5432/blujet',
      ),
    ).toEqual(['INVALID_SOURCE_DATABASE', 'INVALID_TARGET_DATABASE']);
    const createDataSource = jest.fn();
    await expect(
      runLoyaltyCutoverReadinessCheck({
        env: enabledEnv({
          LOYALTY_CUTOVER_TARGET_DATABASE_URL: SOURCE,
        }),
        createDataSource,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        status: 'NOT_READY',
        reasons: ['IDENTICAL_DATABASE'],
      }),
    );
    expect(createDataSource).not.toHaveBeenCalled();
  });

  it('returns READY only when all six tables and operational gates agree', () => {
    const report = evaluateLoyaltyCutoverEvidence(
      evidence(),
      '2026-09-15T00:00:00.000Z',
    );
    expect(report).toEqual(
      expect.objectContaining({
        status: 'READY',
        reasons: [],
        businessTableCount: '6',
        sourceRowCount: '12',
        targetRowCount: '12',
        auditReceiptParity: true,
        slotMismatchCount: '0',
        expectedPartitionCount: '3',
        observedPartitionCount: '3',
        maxLag: '0',
      }),
    );
  });

  it('reports table mismatch and an inconclusive fingerprint without row data', () => {
    const value = evidence();
    value.reconciliation.tables[0] = {
      ...value.reconciliation.tables[0],
      projectionCount: '3',
      status: 'MISMATCH',
    };
    value.reconciliation.tables[1] = {
      ...value.reconciliation.tables[1],
      sourceHashA: null,
      projectionHashA: null,
      sourceHashB: null,
      projectionHashB: null,
      status: 'INCONCLUSIVE',
    };
    const report = evaluateLoyaltyCutoverEvidence(value);
    expect(report.status).toBe('NOT_READY');
    expect(report.reasons).toEqual([
      'PROJECTION_MISMATCH',
      'PROJECTION_INCONCLUSIVE',
    ]);
    expect(report.mismatchedTableCount).toBe('1');
    expect(report.inconclusiveTableCount).toBe('1');
  });

  it('classifies outbox, idempotency and DLQ blockers independently', () => {
    const value = evidence();
    value.auditReceipts = {
      sourceCount: '12',
      targetCount: '11',
      countMatches: false,
      fingerprintMatches: false,
    };
    value.slotMismatchCount = 2;
    value.outbox = { pending: 4, inFlight: 1, expiredLease: 2, deadLetter: 3 };
    value.openFailureCount = 5;
    const report = evaluateLoyaltyCutoverEvidence(value);
    expect(report.status).toBe('NOT_READY');
    expect(report.reasons).toEqual(
      expect.arrayContaining([
        'AUDIT_RECEIPT_COUNT_MISMATCH',
        'AUDIT_RECEIPT_FINGERPRINT_MISMATCH',
        'SLOT_MISMATCH',
        'OUTBOX_PENDING',
        'OUTBOX_IN_FLIGHT',
        'OUTBOX_EXPIRED_LEASE',
        'OUTBOX_DEAD_LETTER',
        'DLQ_OPEN',
      ]),
    );
    expect(report.blockingOutboxCount).toBe('7');
    expect(report.openFailureCount).toBe('5');
  });

  it('blocks missing, unexpected, watermark-less and lagging checkpoints', () => {
    const value = evidence();
    value.checkpoints = {
      observed: 3,
      missing: 1,
      unexpected: 1,
      missingWatermark: 1,
      lagging: 1,
      maxLag: null,
    };
    const report = evaluateLoyaltyCutoverEvidence(value);
    expect(report.reasons).toEqual([
      'CHECKPOINT_MISSING',
      'CHECKPOINT_UNEXPECTED',
      'CHECKPOINT_WATERMARK_MISSING',
      'CHECKPOINT_LAG',
    ]);
    expect(report.status).toBe('NOT_READY');
  });

  it('serializes an allowlisted metadata-only report', () => {
    const serialized = serializeLoyaltyCutoverReport({
      ...emptyLoyaltyCutoverReport('UNAVAILABLE', ['UNAVAILABLE']),
      sourceRowCount: '12',
      reasons: ['UNAVAILABLE'],
    });
    const parsed: unknown = JSON.parse(serialized);
    expect(parsed).toEqual(
      expect.objectContaining({
        reportVersion: 1,
        status: 'UNAVAILABLE',
        sourceRowCount: '12',
      }),
    );
    expect(serialized).not.toMatch(/postgresql:|secret|payload|hashA|member-/i);
    expect(LOYALTY_CUTOVER_REASONS).toContain('CHECKPOINT_LAG');
  });

  it('bounds every PostgreSQL session as read-only UTC', () => {
    expect(LOYALTY_CUTOVER_DATA_SOURCE_OPTIONS).toMatchObject({
      synchronize: false,
      migrationsRun: false,
      extra: {
        max: 1,
        connectionTimeoutMillis: 2_000,
        query_timeout: 5_000,
        statement_timeout: 5_000,
        lock_timeout: 2_000,
        options:
          '-c default_transaction_read_only=on -c timezone=UTC -c statement_timeout=5000 -c lock_timeout=2000',
      },
    });
  });

  it('keeps the operational command CI-wired, default-off and undeployed', () => {
    const packageManifest = readFileSync(
      resolve(__dirname, '..', 'package.json'),
      'utf8',
    );
    const environmentExample = readFileSync(
      resolve(__dirname, '..', '.env.example'),
      'utf8',
    );
    const workflow = readFileSync(
      resolve(__dirname, '..', '..', '.github', 'workflows', 'ci.yml'),
      'utf8',
    );
    const productionCompose = readFileSync(
      resolve(__dirname, '..', '..', 'docker-compose.prod.yml'),
      'utf8',
    );

    expect(packageManifest).toContain(
      '"check:cutover:prod": "node dist/check-loyalty-cutover-readiness.js"',
    );
    expect(packageManifest).toContain(
      '"test:cutover-readiness": "cross-env NODE_OPTIONS=--experimental-vm-modules jest --config ./test/jest-cutover-readiness.json --runInBand"',
    );
    expect(environmentExample).toContain('LOYALTY_CUTOVER_CHECK_ENABLED=false');
    expect(workflow).toContain('npm run test:cutover-readiness');
    expect(productionCompose).not.toContain('check:cutover:prod');
    expect(productionCompose).not.toContain('LOYALTY_CUTOVER_CHECK_ENABLED');
  });
});
