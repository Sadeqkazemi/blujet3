import {
  OPS_ADMIN_CUTOVER_OUTBOX_PRODUCER,
  OPS_ADMIN_CUTOVER_REASONS,
  assertReadOnlyCutoverSql,
  classifyOpsAdminCutoverDatabaseUrls,
  emptyOpsAdminCutoverReport,
  evaluateOpsAdminCutoverReadiness,
  loadOpsAdminCutoverCheckConfig,
  parseOpsAdminCutoverBatchSize,
  parseOpsAdminCutoverPartitions,
  runOpsAdminCutoverReadinessCheck,
  serializeOpsAdminCutoverReport,
  type CutoverSqlClient,
} from './check-ops-admin-projection-cutover-readiness';

const SOURCE = 'postgresql://owner:secret@localhost:5432/blujet';
const TARGET = 'postgresql://owner:secret@localhost:5432/blujet_ops_admin';
const GROUP = 'blujet.ops-admin.cartable';
const TOPIC = 'blujet.ops-admin.cartable.v1';

type CartableSeed = {
  id: string;
  assigneeId: string;
  category: string;
  sourceType: string | null;
  sourceId: string | null;
  status: string;
  resolvedAt: Date | null;
  readAt: Date | null;
  taskVersion: number;
  createdAt: Date;
};

function row(id: string, version = 1): CartableSeed {
  return {
    id,
    assigneeId: 'assignee-hidden',
    category: 'ADMIN',
    sourceType: 'AGENCY_REQUEST',
    sourceId: 'source-hidden',
    status: 'OPEN',
    resolvedAt: null,
    readAt: null,
    taskVersion: version,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

function enabledEnv(
  overrides: Record<string, string | undefined> = {},
): NodeJS.ProcessEnv {
  return {
    OPS_ADMIN_CUTOVER_CHECK_ENABLED: 'true',
    OPS_ADMIN_CUTOVER_SOURCE_DATABASE_URL: SOURCE,
    OPS_ADMIN_CUTOVER_TARGET_DATABASE_URL: TARGET,
    OPS_ADMIN_CUTOVER_KAFKA_GROUP_ID: GROUP,
    OPS_ADMIN_CUTOVER_KAFKA_TOPIC: TOPIC,
    OPS_ADMIN_CUTOVER_EXPECTED_PARTITIONS: '0,1,2',
    OPS_ADMIN_CUTOVER_BATCH_SIZE: '2',
    ...overrides,
  };
}

function mockPair(options: {
  sourceRows: CartableSeed[];
  targetRows: CartableSeed[];
  outbox?: {
    pending?: string;
    inFlight?: string;
    expiredLease?: string;
    deadLetter?: string;
  };
  openFailures?: string;
  checkpoints?: Array<{
    partition: number;
    nextOffset: string;
    highWatermark: string | null;
  }>;
}): {
  source: CutoverSqlClient;
  target: CutoverSqlClient;
  statements: string[];
} {
  const statements: string[] = [];
  const page = (rows: CartableSeed[], afterId: unknown, limit: unknown) => {
    const start = typeof afterId === 'string' ? afterId : '';
    const size = typeof limit === 'number' ? limit : Number(limit);
    return rows
      .filter((item) => item.id > start)
      .sort((left, right) => left.id.localeCompare(right.id))
      .slice(0, size)
      .map((item) => ({ ...item }));
  };
  const source: CutoverSqlClient = {
    query: jest.fn((sql: string, values?: readonly unknown[]) => {
      statements.push(sql);
      if (sql.startsWith('BEGIN') || sql === 'COMMIT' || sql === 'ROLLBACK') {
        return Promise.resolve({ rows: [] });
      }
      if (sql.includes('count(*)::text AS count FROM ops.cartable_tasks')) {
        return Promise.resolve({
          rows: [{ count: String(options.sourceRows.length) }],
        });
      }
      if (sql.includes('FROM ops.cartable_tasks') && sql.includes('LIMIT')) {
        return Promise.resolve({
          rows: page(options.sourceRows, values?.[0], values?.[1]),
        });
      }
      if (sql.includes('commerce_outbox_events')) {
        expect(values?.[1]).toBe(OPS_ADMIN_CUTOVER_OUTBOX_PRODUCER);
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
      throw new Error(`unexpected source SQL ${sql.slice(0, 80)}`);
    }),
  };
  const target: CutoverSqlClient = {
    query: jest.fn((sql: string, values?: readonly unknown[]) => {
      statements.push(sql);
      if (sql.startsWith('BEGIN') || sql === 'COMMIT' || sql === 'ROLLBACK') {
        return Promise.resolve({ rows: [] });
      }
      if (sql.includes('count(*)::text AS count FROM ops.cartable_tasks')) {
        return Promise.resolve({
          rows: [{ count: String(options.targetRows.length) }],
        });
      }
      if (sql.includes('FROM ops.cartable_tasks') && sql.includes('LIMIT')) {
        return Promise.resolve({
          rows: page(options.targetRows, values?.[0], values?.[1]),
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
      throw new Error(`unexpected target SQL ${sql.slice(0, 80)}`);
    }),
  };
  return { source, target, statements };
}

describe('Ops/Admin cutover readiness gate', () => {
  it('stays disconnected when the check is disabled', async () => {
    const connect = jest.fn();
    const result = await runOpsAdminCutoverReadinessCheck({
      env: { OPS_ADMIN_CUTOVER_CHECK_ENABLED: 'false' },
      connect,
    });
    expect(connect).not.toHaveBeenCalled();
    expect(result.exitCode).toBe(0);
    expect(result.report.status).toBe('DISABLED');
    expect(loadOpsAdminCutoverCheckConfig({})).toEqual({ enabled: false });
  });

  it('rejects invalid configuration without connecting', async () => {
    const connect = jest.fn();
    await expect(
      runOpsAdminCutoverReadinessCheck({
        env: enabledEnv({ OPS_ADMIN_CUTOVER_BATCH_SIZE: '0' }),
        connect,
      }),
    ).rejects.toThrow('configuration is invalid');
    await expect(
      runOpsAdminCutoverReadinessCheck({
        env: enabledEnv({ OPS_ADMIN_CUTOVER_EXPECTED_PARTITIONS: '0,0' }),
        connect,
      }),
    ).rejects.toThrow('configuration is invalid');
    await expect(
      runOpsAdminCutoverReadinessCheck({
        env: enabledEnv({ OPS_ADMIN_CUTOVER_SOURCE_DATABASE_URL: undefined }),
        connect,
      }),
    ).rejects.toThrow('configuration is invalid');
    expect(connect).not.toHaveBeenCalled();
    expect(() => parseOpsAdminCutoverBatchSize('1001')).toThrow();
    expect(() => parseOpsAdminCutoverPartitions('0,x')).toThrow();
  });

  it('returns NOT_READY for identical or non-isolated databases without connecting', async () => {
    const connect = jest.fn();
    const identical = await runOpsAdminCutoverReadinessCheck({
      env: enabledEnv({ OPS_ADMIN_CUTOVER_TARGET_DATABASE_URL: SOURCE }),
      connect,
    });
    expect(connect).not.toHaveBeenCalled();
    expect(identical.exitCode).toBe(2);
    expect(identical.report.status).toBe('NOT_READY');
    expect(identical.report.reasons).toEqual(['IDENTICAL_DATABASE']);
    expect(
      classifyOpsAdminCutoverDatabaseUrls(
        TARGET,
        'postgresql://owner:secret@localhost:5432/blujet_loyalty',
      ),
    ).toEqual(['INVALID_SOURCE_DATABASE', 'INVALID_TARGET_DATABASE']);
  });

  it('matches multiple cartable pages with bounded SELECT batches', async () => {
    const rows = [row('a'), row('b'), row('c')];
    const { source, target, statements } = mockPair({
      sourceRows: rows,
      targetRows: rows,
    });
    const report = await evaluateOpsAdminCutoverReadiness({
      source,
      target,
      kafkaGroupId: GROUP,
      kafkaTopic: TOPIC,
      expectedPartitions: [0, 1, 2],
      batchSize: 2,
      capturedAt: '2026-09-15T00:00:00.000Z',
    });
    expect(report.status).toBe('READY');
    expect(report.sourceCount).toBe('3');
    expect(report.targetCount).toBe('3');
    expect(report.maxLag).toBe('0');
    const cartableSelects = statements.filter((sql) =>
      sql.includes('FROM ops.cartable_tasks\nWHERE id > $1'),
    );
    expect(cartableSelects.length).toBeGreaterThanOrEqual(4);
    expect(statements.every((sql) => !/INSERT|UPDATE|DELETE/i.test(sql))).toBe(
      true,
    );
    statements.forEach((sql) => assertReadOnlyCutoverSql(sql));
  });

  it('classifies missing, unexpected, stale and field mismatches', async () => {
    const missing = await evaluateOpsAdminCutoverReadiness({
      ...mockPair({
        sourceRows: [row('a'), row('b')],
        targetRows: [row('a')],
        checkpoints: [
          { partition: 0, nextOffset: '1', highWatermark: '1' },
          { partition: 1, nextOffset: '1', highWatermark: '1' },
          { partition: 2, nextOffset: '1', highWatermark: '1' },
        ],
      }),
      kafkaGroupId: GROUP,
      kafkaTopic: TOPIC,
      expectedPartitions: [0, 1, 2],
      batchSize: 10,
    });
    expect(missing.reasons).toEqual(
      expect.arrayContaining(['CARTABLE_MISSING', 'CARTABLE_COUNT_MISMATCH']),
    );

    const unexpected = await evaluateOpsAdminCutoverReadiness({
      ...mockPair({
        sourceRows: [row('a')],
        targetRows: [row('a'), row('z')],
        checkpoints: [
          { partition: 0, nextOffset: '1', highWatermark: '1' },
          { partition: 1, nextOffset: '1', highWatermark: '1' },
          { partition: 2, nextOffset: '1', highWatermark: '1' },
        ],
      }),
      kafkaGroupId: GROUP,
      kafkaTopic: TOPIC,
      expectedPartitions: [0, 1, 2],
      batchSize: 10,
    });
    expect(unexpected.reasons).toContain('CARTABLE_UNEXPECTED');

    const stale = await evaluateOpsAdminCutoverReadiness({
      ...mockPair({
        sourceRows: [row('a', 3)],
        targetRows: [row('a', 1)],
        checkpoints: [
          { partition: 0, nextOffset: '1', highWatermark: '1' },
          { partition: 1, nextOffset: '1', highWatermark: '1' },
          { partition: 2, nextOffset: '1', highWatermark: '1' },
        ],
      }),
      kafkaGroupId: GROUP,
      kafkaTopic: TOPIC,
      expectedPartitions: [0, 1, 2],
      batchSize: 10,
    });
    expect(stale.reasons).toContain('CARTABLE_STALE');

    const changed = row('a');
    changed.status = 'APPROVED';
    const mismatch = await evaluateOpsAdminCutoverReadiness({
      ...mockPair({
        sourceRows: [row('a')],
        targetRows: [changed],
        checkpoints: [
          { partition: 0, nextOffset: '1', highWatermark: '1' },
          { partition: 1, nextOffset: '1', highWatermark: '1' },
          { partition: 2, nextOffset: '1', highWatermark: '1' },
        ],
      }),
      kafkaGroupId: GROUP,
      kafkaTopic: TOPIC,
      expectedPartitions: [0, 1, 2],
      batchSize: 10,
    });
    expect(mismatch.reasons).toContain('CARTABLE_MISMATCH');
  });

  it('fails closed for pending or dead-letter core-ops outbox rows', async () => {
    const pending = await evaluateOpsAdminCutoverReadiness({
      ...mockPair({
        sourceRows: [row('a')],
        targetRows: [row('a')],
        outbox: { pending: '1', inFlight: '1' },
      }),
      kafkaGroupId: GROUP,
      kafkaTopic: TOPIC,
      expectedPartitions: [0, 1, 2],
      batchSize: 10,
    });
    expect(pending.reasons).toEqual(
      expect.arrayContaining(['OUTBOX_PENDING', 'OUTBOX_IN_FLIGHT']),
    );
    expect(pending.blockingOutboxCount).toBe('1');

    const dead = await evaluateOpsAdminCutoverReadiness({
      ...mockPair({
        sourceRows: [row('a')],
        targetRows: [row('a')],
        outbox: { deadLetter: '2' },
      }),
      kafkaGroupId: GROUP,
      kafkaTopic: TOPIC,
      expectedPartitions: [0, 1, 2],
      batchSize: 10,
    });
    expect(dead.reasons).toContain('OUTBOX_DEAD_LETTER');
    expect(dead.blockingOutboxCount).toBe('2');
  });

  it('fails closed for non-terminal DLQ rows and checkpoint gaps', async () => {
    const dlq = await evaluateOpsAdminCutoverReadiness({
      ...mockPair({
        sourceRows: [row('a')],
        targetRows: [row('a')],
        openFailures: '3',
      }),
      kafkaGroupId: GROUP,
      kafkaTopic: TOPIC,
      expectedPartitions: [0, 1, 2],
      batchSize: 10,
    });
    expect(dlq.reasons).toContain('DLQ_OPEN');
    expect(dlq.openFailureCount).toBe('3');

    const missingCheckpoint = await evaluateOpsAdminCutoverReadiness({
      ...mockPair({
        sourceRows: [row('a')],
        targetRows: [row('a')],
        checkpoints: [
          { partition: 0, nextOffset: '1', highWatermark: '1' },
          { partition: 1, nextOffset: '1', highWatermark: '1' },
        ],
      }),
      kafkaGroupId: GROUP,
      kafkaTopic: TOPIC,
      expectedPartitions: [0, 1, 2],
      batchSize: 10,
    });
    expect(missingCheckpoint.reasons).toContain('CHECKPOINT_MISSING');

    const extra = await evaluateOpsAdminCutoverReadiness({
      ...mockPair({
        sourceRows: [row('a')],
        targetRows: [row('a')],
        checkpoints: [
          { partition: 0, nextOffset: '1', highWatermark: '1' },
          { partition: 1, nextOffset: '1', highWatermark: '1' },
          { partition: 2, nextOffset: '1', highWatermark: '1' },
          { partition: 9, nextOffset: '1', highWatermark: '1' },
        ],
      }),
      kafkaGroupId: GROUP,
      kafkaTopic: TOPIC,
      expectedPartitions: [0, 1, 2],
      batchSize: 10,
    });
    expect(extra.reasons).toContain('CHECKPOINT_UNEXPECTED');

    const watermark = await evaluateOpsAdminCutoverReadiness({
      ...mockPair({
        sourceRows: [row('a')],
        targetRows: [row('a')],
        checkpoints: [
          { partition: 0, nextOffset: '1', highWatermark: null },
          { partition: 1, nextOffset: '1', highWatermark: '1' },
          { partition: 2, nextOffset: '1', highWatermark: '1' },
        ],
      }),
      kafkaGroupId: GROUP,
      kafkaTopic: TOPIC,
      expectedPartitions: [0, 1, 2],
      batchSize: 10,
    });
    expect(watermark.reasons).toContain('CHECKPOINT_WATERMARK_MISSING');
    expect(watermark.maxLag).toBeNull();

    const lag = await evaluateOpsAdminCutoverReadiness({
      ...mockPair({
        sourceRows: [row('a')],
        targetRows: [row('a')],
        checkpoints: [
          { partition: 0, nextOffset: '1', highWatermark: '9' },
          { partition: 1, nextOffset: '4', highWatermark: '4' },
          { partition: 2, nextOffset: '4', highWatermark: '4' },
        ],
      }),
      kafkaGroupId: GROUP,
      kafkaTopic: TOPIC,
      expectedPartitions: [0, 1, 2],
      batchSize: 10,
    });
    expect(lag.reasons).toContain('CHECKPOINT_LAG');
    expect(lag.maxLag).toBe('8');
    expect(lag.status).toBe('NOT_READY');
  });

  it('serializes only aggregated metadata and allowlisted reasons', () => {
    const report = emptyOpsAdminCutoverReport('UNAVAILABLE', ['UNAVAILABLE']);
    const serialized = serializeOpsAdminCutoverReport({
      ...report,
      sourceCount: '4',
    });
    const parsed: unknown = JSON.parse(serialized);
    expect(parsed).toEqual(
      expect.objectContaining({ reportVersion: 1, sourceCount: '4' }),
    );
    expect(serialized).not.toMatch(/postgresql:\/\//i);
    expect(serialized).not.toContain('secret');
    expect(serialized).not.toContain('assignee');
    expect(serialized).not.toContain('task-');
    expect(OPS_ADMIN_CUTOVER_REASONS).toContain('CHECKPOINT_LAG');
    expect(() =>
      assertReadOnlyCutoverSql('INSERT INTO ops.cartable_tasks VALUES (1)'),
    ).toThrow('read-only');
  });
});
