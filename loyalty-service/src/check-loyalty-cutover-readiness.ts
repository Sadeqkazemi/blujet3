import 'dotenv/config';
import 'reflect-metadata';
import {
  DataSource,
  type DataSourceOptions,
  type EntityManager,
} from 'typeorm';
import {
  LOYALTY_BUSINESS_TABLES,
  LOYALTY_RECONCILIATION_MAX_LIMIT,
  reconcileLoyaltyProjectionManagers,
  type LoyaltyReconciliationReport,
} from './projection/loyalty-projection-reconciliation';

export const LOYALTY_CUTOVER_REPORT_VERSION = 1;
export const LOYALTY_CUTOVER_DEFAULT_LIMIT = 10_000;
export const LOYALTY_CUTOVER_CONNECT_TIMEOUT_MS = 2_000;
export const LOYALTY_CUTOVER_QUERY_TIMEOUT_MS = 5_000;
export const LOYALTY_CUTOVER_LOCK_TIMEOUT_MS = 2_000;
export const LOYALTY_CUTOVER_OUTBOX_LEASE_MS = 120_000;
export const LOYALTY_CUTOVER_OUTBOX_PRODUCER = 'core-loyalty';

export const LOYALTY_CUTOVER_REASONS = [
  'IDENTICAL_DATABASE',
  'INVALID_SOURCE_DATABASE',
  'INVALID_TARGET_DATABASE',
  'PROJECTION_MISMATCH',
  'PROJECTION_INCONCLUSIVE',
  'AUDIT_RECEIPT_COUNT_MISMATCH',
  'AUDIT_RECEIPT_FINGERPRINT_MISMATCH',
  'SLOT_MISMATCH',
  'OUTBOX_PENDING',
  'OUTBOX_IN_FLIGHT',
  'OUTBOX_EXPIRED_LEASE',
  'OUTBOX_DEAD_LETTER',
  'DLQ_OPEN',
  'CHECKPOINT_MISSING',
  'CHECKPOINT_UNEXPECTED',
  'CHECKPOINT_WATERMARK_MISSING',
  'CHECKPOINT_LAG',
  'UNAVAILABLE',
] as const;

export type LoyaltyCutoverReason = (typeof LOYALTY_CUTOVER_REASONS)[number];
export type LoyaltyCutoverStatus =
  'DISABLED' | 'READY' | 'NOT_READY' | 'UNAVAILABLE';

export interface LoyaltyCutoverReadinessReport {
  reportVersion: typeof LOYALTY_CUTOVER_REPORT_VERSION;
  capturedAt: string;
  status: LoyaltyCutoverStatus;
  reasons: LoyaltyCutoverReason[];
  businessTableCount: string;
  sourceRowCount: string;
  targetRowCount: string;
  mismatchedTableCount: string;
  inconclusiveTableCount: string;
  auditReceiptParity: boolean;
  slotMismatchCount: string;
  blockingOutboxCount: string;
  openFailureCount: string;
  expectedPartitionCount: string;
  observedPartitionCount: string;
  maxLag: string | null;
}

export type LoyaltyCutoverCheckConfig =
  | { enabled: false }
  | {
      enabled: true;
      sourceUrl: string;
      targetUrl: string;
      kafkaGroupId: string;
      kafkaTopic: string;
      expectedPartitions: number[];
      reconciliationLimit: number;
    };

type OutboxEvidence = {
  pending: number;
  inFlight: number;
  expiredLease: number;
  deadLetter: number;
};

type ParityEvidence = {
  sourceCount: string;
  targetCount: string;
  countMatches: boolean;
  fingerprintMatches: boolean;
};

type CheckpointEvidence = {
  observed: number;
  missing: number;
  unexpected: number;
  missingWatermark: number;
  lagging: number;
  maxLag: string | null;
};

export interface LoyaltyCutoverEvidence {
  reconciliation: LoyaltyReconciliationReport;
  auditReceipts: ParityEvidence;
  slotMismatchCount: number;
  outbox: OutboxEvidence;
  openFailureCount: number;
  checkpoints: CheckpointEvidence;
  expectedPartitionCount: number;
}

const REASON_SET = new Set<string>(LOYALTY_CUTOVER_REASONS);
const LOYALTY_DATABASE_NAME = /^blujet_loyalty(?:$|[_-])/;
const KAFKA_IDENTIFIER = /^[A-Za-z0-9._-]+$/;

export class LoyaltyCutoverConfigError extends Error {
  constructor() {
    super('Loyalty cutover readiness configuration is invalid');
    this.name = 'LoyaltyCutoverConfigError';
  }
}

function postgresUrl(value: string): { parsed: URL; databaseName: string } {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new LoyaltyCutoverConfigError();
  }
  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    throw new LoyaltyCutoverConfigError();
  }
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!databaseName || databaseName.includes('/')) {
    throw new LoyaltyCutoverConfigError();
  }
  return { parsed, databaseName };
}

function databaseIdentity(parsed: URL): string {
  return `${parsed.hostname.toLowerCase()}:${parsed.port || '5432'}${parsed.pathname}`;
}

export function classifyLoyaltyCutoverDatabaseUrls(
  sourceUrl: string,
  targetUrl: string,
): LoyaltyCutoverReason[] {
  const source = postgresUrl(sourceUrl);
  const target = postgresUrl(targetUrl);
  if (databaseIdentity(source.parsed) === databaseIdentity(target.parsed)) {
    return ['IDENTICAL_DATABASE'];
  }
  const reasons: LoyaltyCutoverReason[] = [];
  if (LOYALTY_DATABASE_NAME.test(source.databaseName)) {
    reasons.push('INVALID_SOURCE_DATABASE');
  }
  if (!LOYALTY_DATABASE_NAME.test(target.databaseName)) {
    reasons.push('INVALID_TARGET_DATABASE');
  }
  return reasons;
}

function kafkaName(value: string, max: number): string {
  if (!KAFKA_IDENTIFIER.test(value) || value.length < 1 || value.length > max) {
    throw new LoyaltyCutoverConfigError();
  }
  return value;
}

export function parseLoyaltyCutoverPartitions(value: string): number[] {
  const raw = value.split(',').map((item) => item.trim());
  if (raw.length === 0 || raw.some((item) => item === '')) {
    throw new LoyaltyCutoverConfigError();
  }
  const partitions = raw.map((item) => {
    if (!/^(0|[1-9]\d{0,8})$/.test(item)) {
      throw new LoyaltyCutoverConfigError();
    }
    return Number(item);
  });
  if (new Set(partitions).size !== partitions.length) {
    throw new LoyaltyCutoverConfigError();
  }
  return partitions;
}

export function parseLoyaltyCutoverLimit(value: string | undefined): number {
  const raw = value ?? String(LOYALTY_CUTOVER_DEFAULT_LIMIT);
  if (!/^[1-9]\d{0,6}$/.test(raw)) {
    throw new LoyaltyCutoverConfigError();
  }
  const limit = Number(raw);
  if (limit > LOYALTY_RECONCILIATION_MAX_LIMIT) {
    throw new LoyaltyCutoverConfigError();
  }
  return limit;
}

export function loadLoyaltyCutoverCheckConfig(
  env: NodeJS.ProcessEnv = process.env,
): LoyaltyCutoverCheckConfig {
  const flag = env.LOYALTY_CUTOVER_CHECK_ENABLED ?? 'false';
  if (flag === 'false') return { enabled: false };
  if (flag !== 'true' || env.TZ !== 'UTC') {
    throw new LoyaltyCutoverConfigError();
  }
  const sourceUrl = env.LOYALTY_CUTOVER_SOURCE_DATABASE_URL;
  const targetUrl = env.LOYALTY_CUTOVER_TARGET_DATABASE_URL;
  const kafkaGroupId = env.LOYALTY_CUTOVER_KAFKA_GROUP_ID;
  const kafkaTopic = env.LOYALTY_CUTOVER_KAFKA_TOPIC;
  const partitions = env.LOYALTY_CUTOVER_EXPECTED_PARTITIONS;
  if (!sourceUrl || !targetUrl || !kafkaGroupId || !kafkaTopic || !partitions) {
    throw new LoyaltyCutoverConfigError();
  }
  postgresUrl(sourceUrl);
  postgresUrl(targetUrl);
  return {
    enabled: true,
    sourceUrl,
    targetUrl,
    kafkaGroupId: kafkaName(kafkaGroupId, 128),
    kafkaTopic: kafkaName(kafkaTopic, 249),
    expectedPartitions: parseLoyaltyCutoverPartitions(partitions),
    reconciliationLimit: parseLoyaltyCutoverLimit(
      env.LOYALTY_CUTOVER_RECONCILIATION_LIMIT,
    ),
  };
}

function safeCount(value: unknown): string {
  if (typeof value === 'string' && /^(0|[1-9]\d{0,19})$/.test(value)) {
    return value;
  }
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
    return String(value);
  }
  throw new Error('Loyalty cutover readiness count is invalid');
}

function addCounts(values: readonly string[]): string {
  return values.reduce((total, value) => total + BigInt(value), 0n).toString();
}

export function emptyLoyaltyCutoverReport(
  status: LoyaltyCutoverStatus,
  reasons: LoyaltyCutoverReason[] = [],
  capturedAt = new Date().toISOString(),
): LoyaltyCutoverReadinessReport {
  return {
    reportVersion: LOYALTY_CUTOVER_REPORT_VERSION,
    capturedAt,
    status,
    reasons: reasons.filter((reason) => REASON_SET.has(reason)),
    businessTableCount: String(LOYALTY_BUSINESS_TABLES.length),
    sourceRowCount: '0',
    targetRowCount: '0',
    mismatchedTableCount: '0',
    inconclusiveTableCount: '0',
    auditReceiptParity: false,
    slotMismatchCount: '0',
    blockingOutboxCount: '0',
    openFailureCount: '0',
    expectedPartitionCount: '0',
    observedPartitionCount: '0',
    maxLag: null,
  };
}

export function serializeLoyaltyCutoverReport(
  report: LoyaltyCutoverReadinessReport,
): string {
  return JSON.stringify({
    reportVersion: report.reportVersion,
    capturedAt: report.capturedAt,
    status: report.status,
    reasons: report.reasons.filter((reason) => REASON_SET.has(reason)),
    businessTableCount: report.businessTableCount,
    sourceRowCount: report.sourceRowCount,
    targetRowCount: report.targetRowCount,
    mismatchedTableCount: report.mismatchedTableCount,
    inconclusiveTableCount: report.inconclusiveTableCount,
    auditReceiptParity: report.auditReceiptParity,
    slotMismatchCount: report.slotMismatchCount,
    blockingOutboxCount: report.blockingOutboxCount,
    openFailureCount: report.openFailureCount,
    expectedPartitionCount: report.expectedPartitionCount,
    observedPartitionCount: report.observedPartitionCount,
    maxLag: report.maxLag,
  });
}

async function readOutboxEvidence(
  source: EntityManager,
): Promise<OutboxEvidence> {
  const rows = await source.query<Array<Record<string, unknown>>>(
    `SELECT
      (count(producer) FILTER (
        WHERE "deliveredAt" IS NULL AND "deadLetterAt" IS NULL
      ))::text AS pending,
      (count(producer) FILTER (
        WHERE "deliveredAt" IS NULL AND "deadLetterAt" IS NULL
          AND "claimedAt" IS NOT NULL
          AND "claimedAt" >= (transaction_timestamp() AT TIME ZONE 'UTC')
            - $1 * interval '1 millisecond'
      ))::text AS "inFlight",
      (count(producer) FILTER (
        WHERE "deliveredAt" IS NULL AND "deadLetterAt" IS NULL
          AND "claimedAt" IS NOT NULL
          AND "claimedAt" < (transaction_timestamp() AT TIME ZONE 'UTC')
            - $1 * interval '1 millisecond'
      ))::text AS "expiredLease",
      (count(producer) FILTER (WHERE "deadLetterAt" IS NOT NULL))::text
        AS "deadLetter"
    FROM orders.commerce_outbox_events
    WHERE producer = $2`,
    [LOYALTY_CUTOVER_OUTBOX_LEASE_MS, LOYALTY_CUTOVER_OUTBOX_PRODUCER],
  );
  const row = rows[0] ?? {};
  return {
    pending: Number(safeCount(row.pending)),
    inFlight: Number(safeCount(row.inFlight)),
    expiredLease: Number(safeCount(row.expiredLease)),
    deadLetter: Number(safeCount(row.deadLetter)),
  };
}

async function fingerprintAuditReceipts(
  manager: EntityManager,
  source: boolean,
): Promise<{ count: string; hashA: string; hashB: string }> {
  const table = source
    ? 'loyalty.loyalty_projection_audits'
    : 'loyalty.loyalty_projection_event_receipts';
  const id = source ? 'id' : '"auditId"';
  const rows = await manager.query<Array<Record<string, unknown>>>(`SELECT
      count(*)::text AS count,
      COALESCE(bit_xor(hashtextextended(
        concat_ws(E'\\x1f', ${id}::text, "aggregateType"::text,
          "aggregateId"::text, "recordVersion"::text), 0
      )), 0)::text AS "hashA",
      COALESCE(bit_xor(hashtextextended(
        concat_ws(E'\\x1f', ${id}::text, "aggregateType"::text,
          "aggregateId"::text, "recordVersion"::text), 1
      )), 0)::text AS "hashB"
    FROM ${table}`);
  const row = rows[0] ?? {};
  return {
    count: safeCount(row.count),
    hashA: typeof row.hashA === 'string' ? row.hashA : safeCount(row.hashA),
    hashB: typeof row.hashB === 'string' ? row.hashB : safeCount(row.hashB),
  };
}

async function readAuditReceiptParity(
  source: EntityManager,
  target: EntityManager,
): Promise<ParityEvidence> {
  const [audits, receipts] = await Promise.all([
    fingerprintAuditReceipts(source, true),
    fingerprintAuditReceipts(target, false),
  ]);
  return {
    sourceCount: audits.count,
    targetCount: receipts.count,
    countMatches: audits.count === receipts.count,
    fingerprintMatches:
      audits.hashA === receipts.hashA && audits.hashB === receipts.hashB,
  };
}

async function readSlotMismatchCount(target: EntityManager): Promise<number> {
  const rows = await target.query<
    Array<Record<string, unknown>>
  >(`WITH expected AS (
      SELECT 'LoyaltyMember'::text AS "aggregateType", id::text AS "aggregateId", version AS "recordVersion"
        FROM loyalty.club_members
      UNION ALL SELECT 'LoyaltyPointsEntry', id::text, version FROM loyalty.club_points_entries
      UNION ALL SELECT 'LoyaltyCardRequest', id::text, version FROM loyalty.club_card_requests
      UNION ALL SELECT 'LoyaltyTierRule', id::text, version FROM loyalty.club_tier_rules
      UNION ALL SELECT 'LoyaltyPriceLock', id::text, version FROM loyalty.price_locks
      UNION ALL SELECT 'LoyaltyReferral', id::text, version FROM loyalty.customer_referrals
    )
    SELECT count(*)::text AS count
    FROM expected
    FULL OUTER JOIN loyalty.loyalty_projection_slots slots
      USING ("aggregateType", "aggregateId")
    WHERE expected."aggregateId" IS NULL
       OR slots."aggregateId" IS NULL
       OR expected."recordVersion" <> slots."recordVersion"`);
  return Number(safeCount(rows[0]?.count));
}

async function readOpenFailureCount(target: EntityManager): Promise<number> {
  const rows = await target.query<Array<Record<string, unknown>>>(
    `SELECT count(*)::text AS count
       FROM loyalty.kafka_processing_failures
      WHERE status NOT IN ('RESOLVED', 'SKIPPED')`,
  );
  return Number(safeCount(rows[0]?.count));
}

async function readCheckpointEvidence(
  target: EntityManager,
  groupId: string,
  topic: string,
  expectedPartitions: readonly number[],
): Promise<CheckpointEvidence> {
  const rows = await target.query<Array<Record<string, unknown>>>(
    `SELECT "partition"::int AS partition,
        "nextOffset"::text AS "nextOffset",
        "highWatermark"::text AS "highWatermark"
       FROM loyalty.kafka_consumer_checkpoints
      WHERE "consumerGroup" = $1 AND topic = $2`,
    [groupId, topic],
  );
  const observed = new Map<
    number,
    { nextOffset: bigint; highWatermark: bigint | null }
  >();
  for (const row of rows) {
    const partition = Number(row.partition);
    if (!Number.isInteger(partition) || partition < 0) {
      throw new Error('Loyalty cutover checkpoint is invalid');
    }
    if (observed.has(partition)) {
      throw new Error('Loyalty cutover checkpoint is duplicated');
    }
    observed.set(partition, {
      nextOffset: BigInt(safeCount(row.nextOffset)),
      highWatermark:
        row.highWatermark === null || row.highWatermark === undefined
          ? null
          : BigInt(safeCount(row.highWatermark)),
    });
  }
  const expected = new Set(expectedPartitions);
  let missing = 0;
  let unexpected = 0;
  let missingWatermark = 0;
  let lagging = 0;
  let maxLag: bigint | null = 0n;
  for (const partition of expected) {
    const checkpoint = observed.get(partition);
    if (!checkpoint) {
      missing += 1;
      continue;
    }
    if (checkpoint.highWatermark === null) {
      missingWatermark += 1;
      maxLag = null;
      continue;
    }
    const lag =
      checkpoint.highWatermark > checkpoint.nextOffset
        ? checkpoint.highWatermark - checkpoint.nextOffset
        : 0n;
    if (lag > 0n) lagging += 1;
    if (maxLag !== null && lag > maxLag) maxLag = lag;
  }
  for (const partition of observed.keys()) {
    if (!expected.has(partition)) unexpected += 1;
  }
  return {
    observed: observed.size,
    missing,
    unexpected,
    missingWatermark,
    lagging,
    maxLag: maxLag === null ? null : maxLag.toString(),
  };
}

export async function collectLoyaltyCutoverEvidence(options: {
  source: EntityManager;
  target: EntityManager;
  kafkaGroupId: string;
  kafkaTopic: string;
  expectedPartitions: readonly number[];
  reconciliationLimit: number;
}): Promise<LoyaltyCutoverEvidence> {
  const reconciliation = await reconcileLoyaltyProjectionManagers(
    options.source,
    options.target,
    options.reconciliationLimit,
  );
  const auditReceipts = await readAuditReceiptParity(
    options.source,
    options.target,
  );
  const outbox = await readOutboxEvidence(options.source);
  const slotMismatchCount = await readSlotMismatchCount(options.target);
  const openFailureCount = await readOpenFailureCount(options.target);
  const checkpoints = await readCheckpointEvidence(
    options.target,
    options.kafkaGroupId,
    options.kafkaTopic,
    options.expectedPartitions,
  );
  return {
    reconciliation,
    auditReceipts,
    slotMismatchCount,
    outbox,
    openFailureCount,
    checkpoints,
    expectedPartitionCount: options.expectedPartitions.length,
  };
}

export function evaluateLoyaltyCutoverEvidence(
  evidence: LoyaltyCutoverEvidence,
  capturedAt = new Date().toISOString(),
): LoyaltyCutoverReadinessReport {
  const reasons: LoyaltyCutoverReason[] = [];
  const mismatched = evidence.reconciliation.tables.filter(
    (table) => table.status === 'MISMATCH',
  );
  const inconclusive = evidence.reconciliation.tables.filter(
    (table) => table.status === 'INCONCLUSIVE',
  );
  if (mismatched.length > 0) reasons.push('PROJECTION_MISMATCH');
  if (inconclusive.length > 0) reasons.push('PROJECTION_INCONCLUSIVE');
  if (!evidence.auditReceipts.countMatches) {
    reasons.push('AUDIT_RECEIPT_COUNT_MISMATCH');
  }
  if (!evidence.auditReceipts.fingerprintMatches) {
    reasons.push('AUDIT_RECEIPT_FINGERPRINT_MISMATCH');
  }
  if (evidence.slotMismatchCount > 0) reasons.push('SLOT_MISMATCH');
  if (evidence.outbox.pending > 0) reasons.push('OUTBOX_PENDING');
  if (evidence.outbox.inFlight > 0) reasons.push('OUTBOX_IN_FLIGHT');
  if (evidence.outbox.expiredLease > 0) reasons.push('OUTBOX_EXPIRED_LEASE');
  if (evidence.outbox.deadLetter > 0) reasons.push('OUTBOX_DEAD_LETTER');
  if (evidence.openFailureCount > 0) reasons.push('DLQ_OPEN');
  if (evidence.checkpoints.missing > 0) reasons.push('CHECKPOINT_MISSING');
  if (evidence.checkpoints.unexpected > 0) {
    reasons.push('CHECKPOINT_UNEXPECTED');
  }
  if (evidence.checkpoints.missingWatermark > 0) {
    reasons.push('CHECKPOINT_WATERMARK_MISSING');
  }
  if (evidence.checkpoints.lagging > 0) reasons.push('CHECKPOINT_LAG');
  return {
    ...emptyLoyaltyCutoverReport(
      reasons.length === 0 ? 'READY' : 'NOT_READY',
      reasons,
      capturedAt,
    ),
    sourceRowCount: addCounts(
      evidence.reconciliation.tables.map((table) => table.sourceCount),
    ),
    targetRowCount: addCounts(
      evidence.reconciliation.tables.map((table) => table.projectionCount),
    ),
    mismatchedTableCount: String(mismatched.length),
    inconclusiveTableCount: String(inconclusive.length),
    auditReceiptParity:
      evidence.auditReceipts.countMatches &&
      evidence.auditReceipts.fingerprintMatches,
    slotMismatchCount: String(evidence.slotMismatchCount),
    blockingOutboxCount: String(
      evidence.outbox.pending + evidence.outbox.deadLetter,
    ),
    openFailureCount: String(evidence.openFailureCount),
    expectedPartitionCount: String(evidence.expectedPartitionCount),
    observedPartitionCount: String(evidence.checkpoints.observed),
    maxLag: evidence.checkpoints.maxLag,
  };
}

export const LOYALTY_CUTOVER_DATA_SOURCE_OPTIONS = {
  type: 'postgres',
  entities: [],
  migrations: [],
  migrationsRun: false,
  synchronize: false,
  logging: false,
  extra: {
    max: 1,
    connectionTimeoutMillis: LOYALTY_CUTOVER_CONNECT_TIMEOUT_MS,
    query_timeout: LOYALTY_CUTOVER_QUERY_TIMEOUT_MS,
    statement_timeout: LOYALTY_CUTOVER_QUERY_TIMEOUT_MS,
    lock_timeout: LOYALTY_CUTOVER_LOCK_TIMEOUT_MS,
    options:
      '-c default_transaction_read_only=on -c timezone=UTC -c statement_timeout=5000 -c lock_timeout=2000',
  },
} satisfies Omit<DataSourceOptions, 'url'>;

export function createLoyaltyCutoverDataSource(url: string): DataSource {
  return new DataSource({ ...LOYALTY_CUTOVER_DATA_SOURCE_OPTIONS, url });
}

export async function runLoyaltyCutoverReadinessCheck(
  options: {
    env?: NodeJS.ProcessEnv;
    createDataSource?: (url: string) => DataSource;
    capturedAt?: string;
  } = {},
): Promise<LoyaltyCutoverReadinessReport> {
  const config = loadLoyaltyCutoverCheckConfig(options.env);
  if (!config.enabled) {
    return emptyLoyaltyCutoverReport(
      'DISABLED',
      [],
      options.capturedAt ?? new Date().toISOString(),
    );
  }
  const databaseReasons = classifyLoyaltyCutoverDatabaseUrls(
    config.sourceUrl,
    config.targetUrl,
  );
  if (databaseReasons.length > 0) {
    return emptyLoyaltyCutoverReport(
      'NOT_READY',
      databaseReasons,
      options.capturedAt ?? new Date().toISOString(),
    );
  }
  const create = options.createDataSource ?? createLoyaltyCutoverDataSource;
  const source = create(config.sourceUrl);
  const target = create(config.targetUrl);
  try {
    await source.initialize();
    await target.initialize();
    const sourceRunner = source.createQueryRunner();
    const targetRunner = target.createQueryRunner();
    try {
      await sourceRunner.connect();
      await targetRunner.connect();
      await sourceRunner.startTransaction('REPEATABLE READ');
      await targetRunner.startTransaction('REPEATABLE READ');
      await sourceRunner.query('SET TRANSACTION READ ONLY');
      await targetRunner.query('SET TRANSACTION READ ONLY');
      await sourceRunner.query("SET LOCAL TIME ZONE 'UTC'");
      await targetRunner.query("SET LOCAL TIME ZONE 'UTC'");
      const evidence = await collectLoyaltyCutoverEvidence({
        source: sourceRunner.manager,
        target: targetRunner.manager,
        kafkaGroupId: config.kafkaGroupId,
        kafkaTopic: config.kafkaTopic,
        expectedPartitions: config.expectedPartitions,
        reconciliationLimit: config.reconciliationLimit,
      });
      await targetRunner.commitTransaction();
      await sourceRunner.commitTransaction();
      return evaluateLoyaltyCutoverEvidence(
        evidence,
        options.capturedAt ?? new Date().toISOString(),
      );
    } catch (error) {
      if (targetRunner.isTransactionActive) {
        await targetRunner.rollbackTransaction();
      }
      if (sourceRunner.isTransactionActive) {
        await sourceRunner.rollbackTransaction();
      }
      throw error;
    } finally {
      await Promise.all([sourceRunner.release(), targetRunner.release()]);
    }
  } finally {
    await Promise.all([
      source.isInitialized ? source.destroy() : Promise.resolve(),
      target.isInitialized ? target.destroy() : Promise.resolve(),
    ]);
  }
}

function exitCode(status: LoyaltyCutoverStatus): number {
  if (status === 'NOT_READY') return 2;
  if (status === 'UNAVAILABLE') return 1;
  return 0;
}

async function main(): Promise<void> {
  try {
    const report = await runLoyaltyCutoverReadinessCheck();
    process.stdout.write(`${serializeLoyaltyCutoverReport(report)}\n`);
    process.exitCode = exitCode(report.status);
  } catch {
    const report = emptyLoyaltyCutoverReport('UNAVAILABLE', ['UNAVAILABLE']);
    process.stdout.write(`${serializeLoyaltyCutoverReport(report)}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main();
}
