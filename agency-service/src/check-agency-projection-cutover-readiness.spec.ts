import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';
import {
  AGENCY_BUSINESS_TABLES,
  agencyTableCountSql,
  agencyTableFingerprintSql,
} from './projection/agency-projection-reconciliation';
import {
  AGENCY_CUTOVER_CLIENT_OPTIONS,
  AGENCY_CUTOVER_CONNECT_TIMEOUT_MS,
  AGENCY_CUTOVER_OUTBOX_PRODUCER,
  AGENCY_CUTOVER_QUERY_TIMEOUT_MS,
  AGENCY_CUTOVER_REASONS,
  assertReadOnlyAgencyCutoverSql,
  classifyAgencyCutoverDatabaseUrls,
  createAgencyCutoverReadClient,
  emptyAgencyCutoverReport,
  evaluateAgencyCutoverReadiness,
  loadAgencyCutoverCheckConfig,
  parseAgencyCutoverBatchSize,
  parseAgencyCutoverPartitions,
  runAgencyCutoverReadinessCheck,
  serializeAgencyCutoverReport,
  type AgencyCutoverSqlClient,
} from './check-agency-projection-cutover-readiness';

const SOURCE = 'postgresql://owner:secret@localhost:5432/blujet';
const TARGET = 'postgresql://owner:secret@localhost:5432/blujet_agency';
const GROUP = 'blujet-agency-projection-v1';
const TOPIC = 'blujet.events.v1';

function enabledEnv(
  overrides: Record<string, string | undefined> = {},
): NodeJS.ProcessEnv {
  return {
    TZ: 'UTC',
    AGENCY_CUTOVER_CHECK_ENABLED: 'true',
    AGENCY_CUTOVER_SOURCE_DATABASE_URL: SOURCE,
    AGENCY_CUTOVER_TARGET_DATABASE_URL: TARGET,
    AGENCY_CUTOVER_KAFKA_GROUP_ID: GROUP,
    AGENCY_CUTOVER_KAFKA_TOPIC: TOPIC,
    AGENCY_CUTOVER_EXPECTED_PARTITIONS: '0,1,2',
    AGENCY_CUTOVER_BATCH_SIZE: '2',
    ...overrides,
  };
}

function mockPair(options: {
  sourceCounts?: Record<string, string>;
  targetCounts?: Record<string, string>;
  sourceHashes?: Record<string, { hashA: string; hashB: string }>;
  targetHashes?: Record<string, { hashA: string; hashB: string }>;
  outbox?: {
    pending?: string;
    inFlight?: string;
    expiredLease?: string;
    deadLetter?: string;
  };
  receiptSlotMismatch?: string;
  auditReceiptSource?: { count: string; hashA: string; hashB: string };
  auditReceiptTarget?: { count: string; hashA: string; hashB: string };
  openFailures?: string;
  checkpoints?: Array<{
    partition: number;
    nextOffset: string;
    highWatermark: string | null;
  }>;
}): {
  source: AgencyCutoverSqlClient;
  target: AgencyCutoverSqlClient;
  statements: string[];
} {
  const statements: string[] = [];
  const defaultHash = { hashA: '11', hashB: '22' };
  const defaultAuditReceipt = { count: '3', hashA: '31', hashB: '32' };
  const defaultCounts: Record<string, string> = {
    agency_profiles: '1',
    agency_invoices: '1',
    agency_credit_requests: '1',
  };
  const tableFromSql = (sql: string): string | undefined =>
    AGENCY_BUSINESS_TABLES.find((table) => sql.includes(`"${table}"`));
  const source: AgencyCutoverSqlClient = {
    query: jest.fn((sql: string, values?: readonly unknown[]) => {
      statements.push(sql);
      if (sql.startsWith('BEGIN') || sql === 'COMMIT' || sql === 'ROLLBACK') {
        return Promise.resolve({ rows: [] });
      }
      if (sql.includes('agency_projection_audits')) {
        return Promise.resolve({
          rows: [options.auditReceiptSource ?? defaultAuditReceipt],
        });
      }
      if (sql.includes('commerce_outbox_events')) {
        expect(values?.[1]).toBe(AGENCY_CUTOVER_OUTBOX_PRODUCER);
        return Promise.resolve({
          rows: [
            {
              pending: options.outbox?.pending ?? '0',
              inFlight: options.outbox?.inFlight ?? '0',
              expiredLease: options.outbox?.expiredLease ?? '0',
              deadLetter: options.outbox?.deadLetter ?? '0',
            },
          ],
        });
      }
      const table = tableFromSql(sql);
      if (table && sql.includes('COUNT(*)')) {
        return Promise.resolve({
          rows: [
            {
              count:
                options.sourceCounts?.[table] ?? defaultCounts[table] ?? '0',
            },
          ],
        });
      }
      if (table && sql.includes('hashtextextended')) {
        return Promise.resolve({
          rows: [options.sourceHashes?.[table] ?? defaultHash],
        });
      }
      throw new Error(`unexpected source SQL ${sql.slice(0, 80)}`);
    }),
  };
  const target: AgencyCutoverSqlClient = {
    query: jest.fn((sql: string, values?: readonly unknown[]) => {
      statements.push(sql);
      if (sql.startsWith('BEGIN') || sql === 'COMMIT' || sql === 'ROLLBACK') {
        return Promise.resolve({ rows: [] });
      }
      if (
        sql.includes('agency_projection_event_receipts') &&
        sql.includes('hashtextextended')
      ) {
        return Promise.resolve({
          rows: [options.auditReceiptTarget ?? defaultAuditReceipt],
        });
      }
      if (sql.includes('agency_projection_slots')) {
        return Promise.resolve({
          rows: [{ count: options.receiptSlotMismatch ?? '0' }],
        });
      }
      if (sql.includes('kafka_processing_failures')) {
        return Promise.resolve({
          rows: [{ count: options.openFailures ?? '0' }],
        });
      }
      if (sql.includes('kafka_consumer_checkpoints')) {
        expect(values?.[0]).toBe(GROUP);
        expect(values?.[1]).toBe(TOPIC);
        return Promise.resolve({
          rows:
            options.checkpoints ??
            [0, 1, 2].map((partition) => ({
              partition,
              nextOffset: '4',
              highWatermark: '4',
            })),
        });
      }
      const table = tableFromSql(sql);
      if (table && sql.includes('COUNT(*)')) {
        return Promise.resolve({
          rows: [
            {
              count:
                options.targetCounts?.[table] ?? defaultCounts[table] ?? '0',
            },
          ],
        });
      }
      if (table && sql.includes('hashtextextended')) {
        return Promise.resolve({
          rows: [options.targetHashes?.[table] ?? defaultHash],
        });
      }
      throw new Error(`unexpected target SQL ${sql.slice(0, 80)}`);
    }),
  };
  return { source, target, statements };
}

describe('Agency cutover readiness gate', () => {
  it('stays disconnected when the check is disabled', async () => {
    const connect = jest.fn();
    const result = await runAgencyCutoverReadinessCheck({
      env: { AGENCY_CUTOVER_CHECK_ENABLED: 'false' },
      connect,
    });
    expect(connect).not.toHaveBeenCalled();
    expect(result.exitCode).toBe(0);
    expect(result.report.status).toBe('DISABLED');
    expect(loadAgencyCutoverCheckConfig({})).toEqual({ enabled: false });
  });

  it('rejects empty or non-boolean enable flags without connecting', async () => {
    const connect = jest.fn();
    await expect(
      runAgencyCutoverReadinessCheck({
        env: enabledEnv({ AGENCY_CUTOVER_CHECK_ENABLED: '' }),
        connect,
      }),
    ).rejects.toThrow('configuration is invalid');
    await expect(
      runAgencyCutoverReadinessCheck({
        env: enabledEnv({ AGENCY_CUTOVER_CHECK_ENABLED: 'yes' }),
        connect,
      }),
    ).rejects.toThrow('configuration is invalid');
    expect(connect).not.toHaveBeenCalled();
  });

  it('rejects invalid configuration, missing TZ and duplicate partitions', async () => {
    const connect = jest.fn();
    await expect(
      runAgencyCutoverReadinessCheck({
        env: enabledEnv({ TZ: 'Asia/Tehran' }),
        connect,
      }),
    ).rejects.toThrow('configuration is invalid');
    await expect(
      runAgencyCutoverReadinessCheck({
        env: enabledEnv({ AGENCY_CUTOVER_BATCH_SIZE: '0' }),
        connect,
      }),
    ).rejects.toThrow('configuration is invalid');
    await expect(
      runAgencyCutoverReadinessCheck({
        env: enabledEnv({ AGENCY_CUTOVER_EXPECTED_PARTITIONS: '0,0' }),
        connect,
      }),
    ).rejects.toThrow('configuration is invalid');
    await expect(
      runAgencyCutoverReadinessCheck({
        env: enabledEnv({ AGENCY_CUTOVER_SOURCE_DATABASE_URL: undefined }),
        connect,
      }),
    ).rejects.toThrow('configuration is invalid');
    expect(connect).not.toHaveBeenCalled();
    expect(() => parseAgencyCutoverBatchSize('1001')).toThrow();
    expect(() => parseAgencyCutoverPartitions('0,x')).toThrow();
    expect(() => parseAgencyCutoverPartitions('-1')).toThrow();
  });

  it('returns NOT_READY for identical or mixed-up databases without connecting', async () => {
    const connect = jest.fn();
    const identical = await runAgencyCutoverReadinessCheck({
      env: enabledEnv({ AGENCY_CUTOVER_TARGET_DATABASE_URL: SOURCE }),
      connect,
    });
    expect(connect).not.toHaveBeenCalled();
    expect(identical.exitCode).toBe(2);
    expect(identical.report.reasons).toEqual(['IDENTICAL_DATABASE']);
    expect(
      classifyAgencyCutoverDatabaseUrls(
        TARGET,
        'postgresql://owner:secret@localhost:5432/blujet',
      ),
    ).toEqual(['INVALID_SOURCE_DATABASE', 'INVALID_TARGET_DATABASE']);
  });

  it('reports READY with checksum equality for the three owned tables only', async () => {
    const { source, target, statements } = mockPair({});
    const report = await evaluateAgencyCutoverReadiness({
      source,
      target,
      kafkaGroupId: GROUP,
      kafkaTopic: TOPIC,
      expectedPartitions: [0, 1, 2],
      batchSize: 2,
      checkedAt: '2026-09-15T00:00:00.000Z',
    });
    expect(report).toMatchObject({
      status: 'READY',
      reasons: [],
      sourceCount: '3',
      targetCount: '3',
      checksumEqual: true,
      auditReceiptParity: true,
      mismatchCount: '0',
      maxLag: '0',
    });
    expect(AGENCY_BUSINESS_TABLES).toEqual([
      'agency_profiles',
      'agency_invoices',
      'agency_credit_requests',
    ]);
    expect(statements.some((sql) => sql.includes('agency_profiles'))).toBe(
      true,
    );
    expect(
      statements.some((sql) => sql.includes('agency_projection_audits')),
    ).toBe(true);
    expect(
      statements.some((sql) =>
        sql.includes('agency_projection_event_receipts'),
      ),
    ).toBe(true);
    expect(statements.some((sql) => sql.includes('payload'))).toBe(false);
    expect(agencyTableCountSql('agency_profiles')).toContain('agency_profiles');
    expect(agencyTableFingerprintSql('agency_invoices')).toContain(
      'hashtextextended',
    );
  });

  it('aggregates count and checksum mismatches without leaking row samples', async () => {
    const { source, target } = mockPair({
      targetCounts: {
        agency_profiles: '2',
        agency_invoices: '1',
        agency_credit_requests: '1',
      },
      targetHashes: {
        agency_invoices: { hashA: '99', hashB: '88' },
      },
    });
    const report = await evaluateAgencyCutoverReadiness({
      source,
      target,
      kafkaGroupId: GROUP,
      kafkaTopic: TOPIC,
      expectedPartitions: [0, 1, 2],
      batchSize: 2,
    });
    expect(report.status).toBe('NOT_READY');
    expect(report.checksumEqual).toBe(false);
    expect(report.reasons).toEqual(
      expect.arrayContaining([
        'PROJECTION_COUNT_MISMATCH',
        'PROJECTION_CHECKSUM_MISMATCH',
      ]),
    );
    const serialized = serializeAgencyCutoverReport(report);
    expect(serialized).not.toMatch(/postgresql:\/\//i);
    expect(serialized).not.toContain('secret');
    expect(serialized).not.toContain('managerName');
  });

  it('fails closed on Core audit vs Agency receipt count or fingerprint mismatch', async () => {
    const countMismatch = await evaluateAgencyCutoverReadiness({
      ...mockPair({
        auditReceiptTarget: { count: '2', hashA: '31', hashB: '32' },
      }),
      kafkaGroupId: GROUP,
      kafkaTopic: TOPIC,
      expectedPartitions: [0, 1, 2],
      batchSize: 2,
    });
    expect(countMismatch.status).toBe('NOT_READY');
    expect(countMismatch.auditReceiptParity).toBe(false);
    expect(countMismatch.checksumEqual).toBe(true);
    expect(countMismatch.reasons).toEqual(
      expect.arrayContaining(['AUDIT_RECEIPT_COUNT_MISMATCH']),
    );
    const fingerprintMismatch = await evaluateAgencyCutoverReadiness({
      ...mockPair({
        auditReceiptTarget: { count: '3', hashA: '99', hashB: '88' },
      }),
      kafkaGroupId: GROUP,
      kafkaTopic: TOPIC,
      expectedPartitions: [0, 1, 2],
      batchSize: 2,
    });
    expect(fingerprintMismatch.reasons).toEqual(
      expect.arrayContaining(['AUDIT_RECEIPT_FINGERPRINT_MISMATCH']),
    );
    expect(fingerprintMismatch.reasons).not.toContain(
      'AUDIT_RECEIPT_COUNT_MISMATCH',
    );
    const serialized = serializeAgencyCutoverReport(fingerprintMismatch);
    expect(serialized).not.toContain('99');
    expect(serialized).not.toContain('hashA');
  });

  it('fails closed on source backlog, lag, unresolved DLQ and missing partitions', async () => {
    const { source, target } = mockPair({
      outbox: { pending: '1' },
      openFailures: '1',
      checkpoints: [{ partition: 0, nextOffset: '1', highWatermark: '4' }],
    });
    const report = await evaluateAgencyCutoverReadiness({
      source,
      target,
      kafkaGroupId: GROUP,
      kafkaTopic: TOPIC,
      expectedPartitions: [0, 1, 2],
      batchSize: 2,
    });
    expect(report.status).toBe('NOT_READY');
    expect(report.reasons).toEqual(
      expect.arrayContaining([
        'OUTBOX_PENDING',
        'DLQ_OPEN',
        'CHECKPOINT_MISSING',
        'CHECKPOINT_LAG',
      ]),
    );
  });

  it('uses UTC checkedAt, read-only SQL, client timeouts and sanitized UNAVAILABLE output', () => {
    expect(emptyAgencyCutoverReport('DISABLED').checkedAt).toMatch(/Z$/);
    expect(() => assertReadOnlyAgencyCutoverSql('SELECT 1')).not.toThrow();
    expect(() =>
      assertReadOnlyAgencyCutoverSql('INSERT INTO x VALUES (1)'),
    ).toThrow('read-only');
    const client = createAgencyCutoverReadClient(SOURCE);
    expect(client).toBeInstanceOf(Client);
    expect(AGENCY_CUTOVER_CLIENT_OPTIONS.connectionTimeoutMillis).toBe(
      AGENCY_CUTOVER_CONNECT_TIMEOUT_MS,
    );
    expect(AGENCY_CUTOVER_CLIENT_OPTIONS.statement_timeout).toBe(
      AGENCY_CUTOVER_QUERY_TIMEOUT_MS,
    );
    const serialized = serializeAgencyCutoverReport(
      emptyAgencyCutoverReport('UNAVAILABLE', ['UNAVAILABLE']),
    );
    const parsed = JSON.parse(serialized) as { status: string };
    expect(parsed.status).toBe('UNAVAILABLE');
    expect(serialized).not.toMatch(/postgresql:\/\//i);
    expect(AGENCY_CUTOVER_REASONS).toContain('RECEIPT_SLOT_MISMATCH');
    expect(AGENCY_CUTOVER_REASONS).toContain('AUDIT_RECEIPT_COUNT_MISMATCH');
    expect(AGENCY_CUTOVER_REASONS).toContain(
      'AUDIT_RECEIPT_FINGERPRINT_MISMATCH',
    );
  });

  it('keeps the cutover CLI on agency-service, default-off and undeployed', () => {
    const packageManifest = readFileSync(
      resolve(__dirname, '..', 'package.json'),
      'utf8',
    );
    const environmentExample = readFileSync(
      resolve(__dirname, '..', '.env.example'),
      'utf8',
    );
    const backendEnv = readFileSync(
      resolve(__dirname, '..', '..', 'backend', '.env.example'),
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
      '"database:check-agency-cutover:prod": "node dist/check-agency-projection-cutover-readiness.js"',
    );
    expect(environmentExample).toContain('AGENCY_CUTOVER_CHECK_ENABLED=false');
    expect(backendEnv).not.toContain('AGENCY_CUTOVER_CHECK_ENABLED');
    expect(backendEnv).not.toContain('AGENCY_CUTOVER_SOURCE_DATABASE_URL');
    expect(workflow).toContain('npm run test:e2e:cutover-readiness');
    expect(productionCompose).not.toContain(
      'check-agency-projection-cutover-readiness',
    );
    expect(productionCompose).not.toContain('AGENCY_CUTOVER_CHECK_ENABLED');
  });
});
