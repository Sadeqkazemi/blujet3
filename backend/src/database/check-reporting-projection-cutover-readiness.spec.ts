import { Client } from 'pg';
import {
  REPORTING_CUTOVER_CLIENT_OPTIONS,
  REPORTING_CUTOVER_CONNECT_TIMEOUT_MS,
  REPORTING_CUTOVER_QUERY_TIMEOUT_MS,
  REPORTING_CUTOVER_REASONS,
  assertReadOnlyReportingCutoverSql,
  classifyReportingCutoverDatabaseUrls,
  createReportingCutoverReadClient,
  emptyReportingCutoverReport,
  evaluateReportingCutoverReadiness,
  loadReportingCutoverCheckConfig,
  parseReportingCutoverBatchSize,
  parseReportingCutoverPartitions,
  runReportingCutoverReadinessCheck,
  serializeReportingCutoverReport,
  type ReportingCutoverSqlClient,
} from './check-reporting-projection-cutover-readiness';

const SOURCE = 'postgresql://owner:secret@localhost:5432/blujet';
const TARGET = 'postgresql://owner:secret@localhost:5432/blujet_reporting';
const GROUP = 'blujet-reporting-v1';
const TOPIC = 'blujet.events.v1';

type ProjectionSeed = {
  orderId: string;
  eventType: string;
  eventId: string;
  fingerprint: string;
  orderVersion: number;
  currency: string;
  occurredAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

type ReceiptSeed = {
  eventId: string;
  fingerprint: string;
  orderId: string;
  eventType: string;
  orderVersion: number;
  receivedAt: Date;
};

function hex(char: string): string {
  return char.repeat(64);
}

function projection(
  orderId: string,
  eventType = 'OrderCreated',
  version = 1,
): ProjectionSeed {
  const stamp = new Date('2026-01-01T00:00:00.000Z');
  return {
    orderId,
    eventType,
    eventId: `11111111-1111-4111-8111-${orderId.padEnd(12, '0').slice(0, 12)}`,
    fingerprint: hex('a'),
    orderVersion: version,
    currency: 'IRR',
    occurredAt: stamp,
    createdAt: stamp,
    updatedAt: stamp,
  };
}

function receiptFrom(row: ProjectionSeed): ReceiptSeed {
  return {
    eventId: row.eventId,
    fingerprint: row.fingerprint,
    orderId: row.orderId,
    eventType: row.eventType,
    orderVersion: row.orderVersion,
    receivedAt: row.createdAt,
  };
}

function enabledEnv(
  overrides: Record<string, string | undefined> = {},
): NodeJS.ProcessEnv {
  return {
    REPORTING_CUTOVER_CHECK_ENABLED: 'true',
    REPORTING_CUTOVER_SOURCE_DATABASE_URL: SOURCE,
    REPORTING_CUTOVER_TARGET_DATABASE_URL: TARGET,
    REPORTING_CUTOVER_KAFKA_GROUP_ID: GROUP,
    REPORTING_CUTOVER_KAFKA_TOPIC: TOPIC,
    REPORTING_CUTOVER_EXPECTED_PARTITIONS: '0,1,2',
    REPORTING_CUTOVER_BATCH_SIZE: '2',
    ...overrides,
  };
}

function mockPair(options: {
  sourceProjections: ProjectionSeed[];
  targetProjections: ProjectionSeed[];
  sourceReceipts?: ReceiptSeed[];
  targetReceipts?: ReceiptSeed[];
  sourceOpenFailures?: string;
  targetOpenFailures?: string;
  sourceCheckpoints?: Array<{
    partition: number;
    nextOffset: string;
    highWatermark: string | null;
  }>;
  targetCheckpoints?: Array<{
    partition: number;
    nextOffset: string;
    highWatermark: string | null;
  }>;
}): {
  source: ReportingCutoverSqlClient;
  target: ReportingCutoverSqlClient;
  statements: string[];
} {
  const statements: string[] = [];
  const defaultCheckpoints = [0, 1, 2].map((partition) => ({
    partition,
    nextOffset: '4',
    highWatermark: '4',
  }));
  const pageProjections = (
    rows: ProjectionSeed[],
    afterOrderId: unknown,
    afterEventType: unknown,
    limit: unknown,
  ) => {
    const startId = typeof afterOrderId === 'string' ? afterOrderId : '';
    const startType = typeof afterEventType === 'string' ? afterEventType : '';
    const size = typeof limit === 'number' ? limit : Number(limit);
    return [...rows]
      .sort((left, right) => {
        const byId = left.orderId.localeCompare(right.orderId);
        return byId !== 0
          ? byId
          : left.eventType.localeCompare(right.eventType);
      })
      .filter(
        (item) =>
          item.orderId > startId ||
          (item.orderId === startId && item.eventType > startType),
      )
      .slice(0, size)
      .map((item) => ({ ...item }));
  };
  const pageReceipts = (
    rows: ReceiptSeed[],
    afterId: unknown,
    limit: unknown,
  ) => {
    const start = typeof afterId === 'string' ? afterId : '';
    const size = typeof limit === 'number' ? limit : Number(limit);
    return [...rows]
      .filter((item) => item.eventId > start)
      .sort((left, right) => left.eventId.localeCompare(right.eventId))
      .slice(0, size)
      .map((item) => ({ ...item }));
  };
  const parityCount = (
    projections: ProjectionSeed[],
    receipts: ReceiptSeed[],
  ) =>
    String(
      projections.filter(
        (item) =>
          !receipts.some(
            (receipt) =>
              receipt.eventId === item.eventId &&
              receipt.fingerprint === item.fingerprint &&
              receipt.orderId === item.orderId &&
              receipt.eventType === item.eventType &&
              receipt.orderVersion === item.orderVersion,
          ),
      ).length,
    );
  const clientFor = (
    projections: ProjectionSeed[],
    receipts: ReceiptSeed[],
    openFailures: string,
    checkpoints: Array<{
      partition: number;
      nextOffset: string;
      highWatermark: string | null;
    }>,
  ): ReportingCutoverSqlClient => ({
    query: jest.fn((sql: string, values?: readonly unknown[]) => {
      statements.push(sql);
      if (sql.startsWith('BEGIN') || sql === 'COMMIT' || sql === 'ROLLBACK') {
        return Promise.resolve({ rows: [] });
      }
      if (sql.includes('core_itinerary_event_projections p')) {
        return Promise.resolve({
          rows: [{ count: parityCount(projections, receipts) }],
        });
      }
      if (
        sql.includes(
          'count("eventId")::text AS count FROM reporting.core_itinerary_event_projections',
        )
      ) {
        return Promise.resolve({
          rows: [{ count: String(projections.length) }],
        });
      }
      if (
        sql.includes(
          'count("eventId")::text AS count FROM reporting.core_itinerary_event_receipts',
        )
      ) {
        return Promise.resolve({ rows: [{ count: String(receipts.length) }] });
      }
      if (
        sql.includes('FROM reporting.core_itinerary_event_projections') &&
        sql.includes('LIMIT')
      ) {
        return Promise.resolve({
          rows: pageProjections(
            projections,
            values?.[0],
            values?.[1],
            values?.[2],
          ),
        });
      }
      if (
        sql.includes('FROM reporting.core_itinerary_event_receipts') &&
        sql.includes('LIMIT')
      ) {
        return Promise.resolve({
          rows: pageReceipts(receipts, values?.[0], values?.[1]),
        });
      }
      if (sql.includes('kafka_processing_failures')) {
        return Promise.resolve({ rows: [{ count: openFailures }] });
      }
      if (sql.includes('kafka_consumer_checkpoints')) {
        expect(values?.[0]).toBe(GROUP);
        expect(values?.[1]).toBe(TOPIC);
        return Promise.resolve({ rows: checkpoints });
      }
      throw new Error(`unexpected SQL ${sql.slice(0, 80)}`);
    }),
  });
  const sourceReceipts =
    options.sourceReceipts ?? options.sourceProjections.map(receiptFrom);
  const targetReceipts =
    options.targetReceipts ?? options.targetProjections.map(receiptFrom);
  return {
    source: clientFor(
      options.sourceProjections,
      sourceReceipts,
      options.sourceOpenFailures ?? '0',
      options.sourceCheckpoints ?? defaultCheckpoints,
    ),
    target: clientFor(
      options.targetProjections,
      targetReceipts,
      options.targetOpenFailures ?? '0',
      options.targetCheckpoints ?? defaultCheckpoints,
    ),
    statements,
  };
}

describe('Reporting cutover readiness gate', () => {
  it('stays disconnected when the check is disabled', async () => {
    const connect = jest.fn();
    const result = await runReportingCutoverReadinessCheck({
      env: { REPORTING_CUTOVER_CHECK_ENABLED: 'false' },
      connect,
    });
    expect(connect).not.toHaveBeenCalled();
    expect(result.exitCode).toBe(0);
    expect(result.report.status).toBe('DISABLED');
    expect(loadReportingCutoverCheckConfig({})).toEqual({ enabled: false });
  });

  it('rejects invalid configuration without connecting', async () => {
    const connect = jest.fn();
    await expect(
      runReportingCutoverReadinessCheck({
        env: enabledEnv({ REPORTING_CUTOVER_BATCH_SIZE: '0' }),
        connect,
      }),
    ).rejects.toThrow('configuration is invalid');
    await expect(
      runReportingCutoverReadinessCheck({
        env: enabledEnv({ REPORTING_CUTOVER_EXPECTED_PARTITIONS: '0,0' }),
        connect,
      }),
    ).rejects.toThrow('configuration is invalid');
    await expect(
      runReportingCutoverReadinessCheck({
        env: enabledEnv({ REPORTING_CUTOVER_SOURCE_DATABASE_URL: undefined }),
        connect,
      }),
    ).rejects.toThrow('configuration is invalid');
    expect(connect).not.toHaveBeenCalled();
    expect(() => parseReportingCutoverBatchSize('1001')).toThrow();
    expect(() => parseReportingCutoverPartitions('0,x')).toThrow();
  });

  it('returns NOT_READY for identical or non-isolated databases without connecting', async () => {
    const connect = jest.fn();
    const identical = await runReportingCutoverReadinessCheck({
      env: enabledEnv({ REPORTING_CUTOVER_TARGET_DATABASE_URL: SOURCE }),
      connect,
    });
    expect(connect).not.toHaveBeenCalled();
    expect(identical.exitCode).toBe(2);
    expect(identical.report.status).toBe('NOT_READY');
    expect(identical.report.reasons).toEqual(['IDENTICAL_DATABASE']);
    expect(
      classifyReportingCutoverDatabaseUrls(
        TARGET,
        'postgresql://owner:secret@localhost:5432/blujet_loyalty',
      ),
    ).toEqual(['INVALID_SOURCE_DATABASE', 'INVALID_TARGET_DATABASE']);
  });

  it('matches multiple projection and receipt pages', async () => {
    const rows = [projection('a'), projection('b'), projection('c')];
    const { source, target, statements } = mockPair({
      sourceProjections: rows,
      targetProjections: rows,
    });
    const report = await evaluateReportingCutoverReadiness({
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
    expect(report.receiptTargetCount).toBe('3');
    expect(report.maxLag).toBe('0');
    expect(
      statements.filter((sql) =>
        sql.includes('FROM reporting.core_itinerary_event_projections'),
      ).length,
    ).toBeGreaterThanOrEqual(4);
    expect(
      statements.every((sql) => !/\b(INSERT|UPDATE|DELETE)\b/i.test(sql)),
    ).toBe(true);
    statements.forEach((sql) => assertReadOnlyReportingCutoverSql(sql));
  });

  it('classifies count and fingerprint mismatches', async () => {
    const missing = await evaluateReportingCutoverReadiness({
      ...mockPair({
        sourceProjections: [projection('a'), projection('b')],
        targetProjections: [projection('a')],
      }),
      kafkaGroupId: GROUP,
      kafkaTopic: TOPIC,
      expectedPartitions: [0, 1, 2],
      batchSize: 10,
    });
    expect(missing.reasons).toEqual(
      expect.arrayContaining([
        'PROJECTION_MISSING',
        'PROJECTION_COUNT_MISMATCH',
        'RECEIPT_MISSING',
        'RECEIPT_COUNT_MISMATCH',
      ]),
    );

    const changed = projection('a');
    changed.currency = 'USD';
    const mismatch = await evaluateReportingCutoverReadiness({
      ...mockPair({
        sourceProjections: [projection('a')],
        targetProjections: [changed],
        sourceReceipts: [receiptFrom(projection('a'))],
        targetReceipts: [receiptFrom(changed)],
      }),
      kafkaGroupId: GROUP,
      kafkaTopic: TOPIC,
      expectedPartitions: [0, 1, 2],
      batchSize: 10,
    });
    expect(mismatch.status).toBe('NOT_READY');
    expect(mismatch.reasons).toContain('PROJECTION_MISMATCH');
  });

  it('does not collapse distinct date-like identifier strings', async () => {
    const sourceRow = projection('slot');
    sourceRow.fingerprint = '2020-01-01T00:00:00.000Z';
    const targetRow = projection('slot');
    targetRow.fingerprint = '2020-01-01T00:00:00.000+00:00';
    const report = await evaluateReportingCutoverReadiness({
      ...mockPair({
        sourceProjections: [sourceRow],
        targetProjections: [targetRow],
        sourceReceipts: [receiptFrom(sourceRow)],
        targetReceipts: [receiptFrom(targetRow)],
      }),
      kafkaGroupId: GROUP,
      kafkaTopic: TOPIC,
      expectedPartitions: [0, 1, 2],
      batchSize: 10,
    });
    expect(report.status).toBe('NOT_READY');
    expect(report.reasons).toEqual(['PROJECTION_MISMATCH', 'RECEIPT_MISMATCH']);
  });

  it('ends the source client when target connect rejects', async () => {
    const sourceEnd = jest.fn().mockResolvedValue(undefined);
    const connect = jest
      .fn()
      .mockResolvedValueOnce({
        query: jest.fn(),
        end: sourceEnd,
      })
      .mockRejectedValueOnce(new Error('target refused'));
    await expect(
      runReportingCutoverReadinessCheck({
        env: enabledEnv(),
        connect,
      }),
    ).rejects.toThrow('target refused');
    expect(connect).toHaveBeenCalledTimes(2);
    expect(sourceEnd).toHaveBeenCalledTimes(1);
  });

  it('bounds PostgreSQL connect and statement timeouts as read-only UTC', () => {
    expect(REPORTING_CUTOVER_CLIENT_OPTIONS).toEqual(
      expect.objectContaining({
        connectionTimeoutMillis: REPORTING_CUTOVER_CONNECT_TIMEOUT_MS,
        query_timeout: REPORTING_CUTOVER_QUERY_TIMEOUT_MS,
        statement_timeout: REPORTING_CUTOVER_QUERY_TIMEOUT_MS,
        options:
          '-c default_transaction_read_only=on -c timezone=UTC -c statement_timeout=5000',
      }),
    );
    expect(createReportingCutoverReadClient(SOURCE)).toBeInstanceOf(Client);
  });

  it('fails closed for receipt parity gaps and open failures', async () => {
    const row = projection('a');
    const parity = await evaluateReportingCutoverReadiness({
      ...mockPair({
        sourceProjections: [row],
        targetProjections: [row],
        sourceReceipts: [],
        targetReceipts: [receiptFrom(row)],
      }),
      kafkaGroupId: GROUP,
      kafkaTopic: TOPIC,
      expectedPartitions: [0, 1, 2],
      batchSize: 10,
    });
    expect(parity.reasons).toEqual(
      expect.arrayContaining([
        'RECEIPT_COUNT_MISMATCH',
        'RECEIPT_UNEXPECTED',
        'RECEIPT_PARITY_MISMATCH',
      ]),
    );

    const open = await evaluateReportingCutoverReadiness({
      ...mockPair({
        sourceProjections: [row],
        targetProjections: [row],
        targetOpenFailures: '2',
      }),
      kafkaGroupId: GROUP,
      kafkaTopic: TOPIC,
      expectedPartitions: [0, 1, 2],
      batchSize: 10,
    });
    expect(open.reasons).toContain('FAILURE_OPEN');
    expect(open.openFailureCount).toBe('2');
    expect(open.status).toBe('NOT_READY');
  });

  it('fails closed for missing, extra and lagging checkpoints', async () => {
    const row = projection('a');
    const missing = await evaluateReportingCutoverReadiness({
      ...mockPair({
        sourceProjections: [row],
        targetProjections: [row],
        sourceCheckpoints: [
          { partition: 0, nextOffset: '1', highWatermark: '1' },
          { partition: 1, nextOffset: '1', highWatermark: '1' },
        ],
        targetCheckpoints: [
          { partition: 0, nextOffset: '1', highWatermark: '1' },
          { partition: 1, nextOffset: '1', highWatermark: '1' },
        ],
      }),
      kafkaGroupId: GROUP,
      kafkaTopic: TOPIC,
      expectedPartitions: [0, 1, 2],
      batchSize: 10,
    });
    expect(missing.reasons).toContain('CHECKPOINT_MISSING');

    const extra = await evaluateReportingCutoverReadiness({
      ...mockPair({
        sourceProjections: [row],
        targetProjections: [row],
        sourceCheckpoints: [
          { partition: 0, nextOffset: '1', highWatermark: '1' },
          { partition: 1, nextOffset: '1', highWatermark: '1' },
          { partition: 2, nextOffset: '1', highWatermark: '1' },
          { partition: 9, nextOffset: '1', highWatermark: '1' },
        ],
        targetCheckpoints: [
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

    const lag = await evaluateReportingCutoverReadiness({
      ...mockPair({
        sourceProjections: [row],
        targetProjections: [row],
        sourceCheckpoints: [
          { partition: 0, nextOffset: '1', highWatermark: '9' },
          { partition: 1, nextOffset: '4', highWatermark: '4' },
          { partition: 2, nextOffset: '4', highWatermark: '4' },
        ],
        targetCheckpoints: [
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
    const report = emptyReportingCutoverReport('UNAVAILABLE', ['UNAVAILABLE']);
    const serialized = serializeReportingCutoverReport({
      ...report,
      sourceCount: '4',
    });
    const parsed: unknown = JSON.parse(serialized);
    expect(parsed).toEqual(
      expect.objectContaining({ reportVersion: 1, sourceCount: '4' }),
    );
    expect(serialized).not.toMatch(/postgresql:\/\//i);
    expect(serialized).not.toContain('secret');
    expect(serialized).not.toContain('order-');
    expect(serialized).not.toContain('payload');
    expect(REPORTING_CUTOVER_REASONS).toContain('CHECKPOINT_LAG');
    expect(() =>
      assertReadOnlyReportingCutoverSql(
        'INSERT INTO reporting.core_itinerary_event_projections VALUES (1)',
      ),
    ).toThrow('read-only');
  });
});
