import 'dotenv/config';
import { Client } from 'pg';
import { COMMERCE_OUTBOX_LEASE_MS } from '../modules/commerce-outbox/commerce-outbox.constants';
import {
  OPS_ADMIN_PROJECTION_DATABASE_NAME_PATTERN,
  parseOpsAdminProjectionOwnerUrl,
  validateOpsAdminProjectionDatabaseName,
} from './provision-ops-admin-projection-runtime-role';

export const OPS_ADMIN_CUTOVER_REPORT_VERSION = 1;
export const OPS_ADMIN_CUTOVER_DEFAULT_BATCH_SIZE = 100;
export const OPS_ADMIN_CUTOVER_MIN_BATCH_SIZE = 1;
export const OPS_ADMIN_CUTOVER_MAX_BATCH_SIZE = 1000;
export const OPS_ADMIN_CUTOVER_OUTBOX_PRODUCER = 'core-ops';
export const OPS_ADMIN_CUTOVER_TERMINAL_FAILURE_STATUSES = [
  'RESOLVED',
  'SKIPPED',
] as const;

export const OPS_ADMIN_CUTOVER_REASONS = [
  'IDENTICAL_DATABASE',
  'INVALID_SOURCE_DATABASE',
  'INVALID_TARGET_DATABASE',
  'CARTABLE_COUNT_MISMATCH',
  'CARTABLE_MISSING',
  'CARTABLE_UNEXPECTED',
  'CARTABLE_STALE',
  'CARTABLE_MISMATCH',
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

export type OpsAdminCutoverReason = (typeof OPS_ADMIN_CUTOVER_REASONS)[number];
export type OpsAdminCutoverStatus =
  'DISABLED' | 'READY' | 'NOT_READY' | 'UNAVAILABLE';

export interface OpsAdminCutoverReadinessReport {
  reportVersion: typeof OPS_ADMIN_CUTOVER_REPORT_VERSION;
  capturedAt: string;
  status: OpsAdminCutoverStatus;
  reasons: OpsAdminCutoverReason[];
  sourceCount: string;
  targetCount: string;
  mismatchCount: string;
  blockingOutboxCount: string;
  openFailureCount: string;
  expectedPartitionCount: string;
  observedPartitionCount: string;
  maxLag: string | null;
}

export interface OpsAdminCutoverCheckConfig {
  enabled: boolean;
  sourceUrl?: string;
  targetUrl?: string;
  kafkaGroupId?: string;
  kafkaTopic?: string;
  expectedPartitions?: number[];
  batchSize?: number;
}

export interface CutoverSqlClient {
  query(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: Array<Record<string, unknown>> }>;
  end?: () => Promise<void>;
}

type CartablePageRow = {
  id: string;
  fingerprint: string;
  taskVersion: number | null;
};

const REASON_SET = new Set<string>(OPS_ADMIN_CUTOVER_REASONS);
const READ_ONLY_SQL = /^(BEGIN\b|COMMIT\b|ROLLBACK\b|SET\b|SELECT\b|WITH\b)/i;

export class OpsAdminCutoverConfigError extends Error {
  constructor() {
    super('Ops/Admin cutover readiness configuration is invalid');
    this.name = 'OpsAdminCutoverConfigError';
  }
}

function databaseIdentity(url: URL): string {
  return `${url.hostname.toLowerCase()}:${url.port || '5432'}${url.pathname}`;
}

function parsePostgresUrl(value: string): { url: URL; databaseName: string } {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new OpsAdminCutoverConfigError();
  }
  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new OpsAdminCutoverConfigError();
  }
  const databaseName = decodeURIComponent(
    parsed.pathname.replace(/^\//, ''),
  ).split('?')[0];
  if (!databaseName || databaseName.includes('/')) {
    throw new OpsAdminCutoverConfigError();
  }
  return { url: parsed, databaseName };
}

export function parseOpsAdminCutoverPartitions(value: string): number[] {
  const parts = value.split(',').map((item) => item.trim());
  if (parts.length === 0 || parts.some((item) => item === '')) {
    throw new OpsAdminCutoverConfigError();
  }
  const partitions = parts.map((item) => {
    if (!/^(0|[1-9]\d{0,8})$/.test(item)) {
      throw new OpsAdminCutoverConfigError();
    }
    return Number(item);
  });
  if (new Set(partitions).size !== partitions.length) {
    throw new OpsAdminCutoverConfigError();
  }
  return partitions;
}

export function parseOpsAdminCutoverBatchSize(
  value: string | undefined,
): number {
  const raw = value ?? String(OPS_ADMIN_CUTOVER_DEFAULT_BATCH_SIZE);
  if (!/^[1-9]\d{0,3}$/.test(raw)) {
    throw new OpsAdminCutoverConfigError();
  }
  const batchSize = Number(raw);
  if (
    batchSize < OPS_ADMIN_CUTOVER_MIN_BATCH_SIZE ||
    batchSize > OPS_ADMIN_CUTOVER_MAX_BATCH_SIZE
  ) {
    throw new OpsAdminCutoverConfigError();
  }
  return batchSize;
}

export function parseOpsAdminCutoverKafkaName(
  value: string,
  kind: 'group' | 'topic',
): string {
  const max = kind === 'group' ? 128 : 249;
  if (
    !/^[A-Za-z0-9._-]+$/.test(value) ||
    value.length < 1 ||
    value.length > max
  ) {
    throw new OpsAdminCutoverConfigError();
  }
  return value;
}

export function emptyOpsAdminCutoverReport(
  status: OpsAdminCutoverStatus,
  reasons: OpsAdminCutoverReason[] = [],
  capturedAt = new Date().toISOString(),
): OpsAdminCutoverReadinessReport {
  return {
    reportVersion: OPS_ADMIN_CUTOVER_REPORT_VERSION,
    capturedAt,
    status,
    reasons: reasons.filter((reason) => REASON_SET.has(reason)),
    sourceCount: '0',
    targetCount: '0',
    mismatchCount: '0',
    blockingOutboxCount: '0',
    openFailureCount: '0',
    expectedPartitionCount: '0',
    observedPartitionCount: '0',
    maxLag: null,
  };
}

export function serializeOpsAdminCutoverReport(
  report: OpsAdminCutoverReadinessReport,
): string {
  return JSON.stringify({
    reportVersion: report.reportVersion,
    capturedAt: report.capturedAt,
    status: report.status,
    reasons: report.reasons.filter((reason) => REASON_SET.has(reason)),
    sourceCount: report.sourceCount,
    targetCount: report.targetCount,
    mismatchCount: report.mismatchCount,
    blockingOutboxCount: report.blockingOutboxCount,
    openFailureCount: report.openFailureCount,
    expectedPartitionCount: report.expectedPartitionCount,
    observedPartitionCount: report.observedPartitionCount,
    maxLag: report.maxLag,
  });
}

export function assertReadOnlyCutoverSql(statement: string): void {
  const trimmed = statement.trim();
  if (!READ_ONLY_SQL.test(trimmed)) {
    throw new Error('Ops/Admin cutover readiness queries must be read-only');
  }
  if (
    /\b(INSERT|UPDATE|DELETE|MERGE|TRUNCATE|ALTER|CREATE|DROP|GRANT|REVOKE|COPY|LISTEN|NOTIFY|VACUUM)\b/i.test(
      trimmed,
    )
  ) {
    throw new Error('Ops/Admin cutover readiness queries must be read-only');
  }
}

export function classifyOpsAdminCutoverDatabaseUrls(
  sourceUrl: string,
  targetUrl: string,
): OpsAdminCutoverReason[] {
  const source = parsePostgresUrl(sourceUrl);
  const target = parsePostgresUrl(targetUrl);
  if (databaseIdentity(source.url) === databaseIdentity(target.url)) {
    return ['IDENTICAL_DATABASE'];
  }
  const reasons: OpsAdminCutoverReason[] = [];
  if (OPS_ADMIN_PROJECTION_DATABASE_NAME_PATTERN.test(source.databaseName)) {
    reasons.push('INVALID_SOURCE_DATABASE');
  }
  try {
    parseOpsAdminProjectionOwnerUrl(targetUrl);
    validateOpsAdminProjectionDatabaseName(target.databaseName);
  } catch {
    reasons.push('INVALID_TARGET_DATABASE');
  }
  return reasons;
}

export function loadOpsAdminCutoverCheckConfig(
  env: NodeJS.ProcessEnv = process.env,
): OpsAdminCutoverCheckConfig {
  if (env.OPS_ADMIN_CUTOVER_CHECK_ENABLED !== 'true') {
    return { enabled: false };
  }
  const sourceUrl = env.OPS_ADMIN_CUTOVER_SOURCE_DATABASE_URL;
  const targetUrl = env.OPS_ADMIN_CUTOVER_TARGET_DATABASE_URL;
  const kafkaGroupId = env.OPS_ADMIN_CUTOVER_KAFKA_GROUP_ID;
  const kafkaTopic = env.OPS_ADMIN_CUTOVER_KAFKA_TOPIC;
  const partitions = env.OPS_ADMIN_CUTOVER_EXPECTED_PARTITIONS;
  if (!sourceUrl || !targetUrl || !kafkaGroupId || !kafkaTopic || !partitions) {
    throw new OpsAdminCutoverConfigError();
  }
  parsePostgresUrl(sourceUrl);
  parsePostgresUrl(targetUrl);
  return {
    enabled: true,
    sourceUrl,
    targetUrl,
    kafkaGroupId: parseOpsAdminCutoverKafkaName(kafkaGroupId, 'group'),
    kafkaTopic: parseOpsAdminCutoverKafkaName(kafkaTopic, 'topic'),
    expectedPartitions: parseOpsAdminCutoverPartitions(partitions),
    batchSize: parseOpsAdminCutoverBatchSize(env.OPS_ADMIN_CUTOVER_BATCH_SIZE),
  };
}

function asCount(value: unknown): string {
  if (typeof value === 'string' && /^(0|[1-9]\d{0,19})$/.test(value)) {
    return value;
  }
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return String(value);
  }
  throw new Error('Ops/Admin cutover readiness count is invalid');
}

function asId(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('Ops/Admin cutover readiness row is invalid');
  }
  return value;
}

function asVersion(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(numeric)) {
    throw new Error('Ops/Admin cutover readiness row is invalid');
  }
  return numeric;
}

function instant(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    return value;
  }
  throw new Error('Ops/Admin cutover readiness row is invalid');
}

function cartableFingerprint(row: Record<string, unknown>): CartablePageRow {
  const taskVersion = asVersion(row.taskVersion);
  return {
    id: asId(row.id),
    taskVersion,
    fingerprint: [
      instant(row.assigneeId),
      instant(row.category),
      instant(row.sourceType),
      instant(row.sourceId),
      instant(row.status),
      instant(row.resolvedAt),
      instant(row.readAt),
      taskVersion === null ? '' : String(taskVersion),
      instant(row.createdAt),
    ].join('\u001f'),
  };
}

const SOURCE_PAGE_SQL = `SELECT id, "assigneeId"::text AS "assigneeId",
  category::text AS category, "sourceType"::text AS "sourceType",
  "sourceId", status::text AS status, "resolvedAt", "readAt",
  version AS "taskVersion", "createdAt"
FROM ops.cartable_tasks
WHERE id > $1
ORDER BY id
LIMIT $2`;

const TARGET_PAGE_SQL = `SELECT id, "assigneeId"::text AS "assigneeId",
  category::text AS category, "sourceType"::text AS "sourceType",
  "sourceId", status::text AS status, "resolvedAt", "readAt",
  "taskVersion", "createdAt"
FROM ops.cartable_tasks
WHERE id > $1
ORDER BY id
LIMIT $2`;

async function pageCartable(
  client: CutoverSqlClient,
  sql: string,
  afterId: string,
  batchSize: number,
): Promise<CartablePageRow[]> {
  assertReadOnlyCutoverSql(sql);
  const result = await client.query(sql, [afterId, batchSize]);
  return result.rows.map(cartableFingerprint);
}

async function compareCartablePages(
  source: CutoverSqlClient,
  target: CutoverSqlClient,
  batchSize: number,
): Promise<{
  sourceCount: string;
  targetCount: string;
  missing: number;
  unexpected: number;
  stale: number;
  mismatch: number;
}> {
  const countSql = 'SELECT count(*)::text AS count FROM ops.cartable_tasks';
  assertReadOnlyCutoverSql(countSql);
  const [sourceCountRow, targetCountRow] = await Promise.all([
    source.query(countSql),
    target.query(countSql),
  ]);
  const sourceCount = asCount(sourceCountRow.rows[0]?.count);
  const targetCount = asCount(targetCountRow.rows[0]?.count);
  let sourcePage = await pageCartable(source, SOURCE_PAGE_SQL, '', batchSize);
  let targetPage = await pageCartable(target, TARGET_PAGE_SQL, '', batchSize);
  let sourceIndex = 0;
  let targetIndex = 0;
  let missing = 0;
  let unexpected = 0;
  let stale = 0;
  let mismatch = 0;

  const refillSource = async (): Promise<boolean> => {
    if (sourceIndex < sourcePage.length) return true;
    if (sourcePage.length < batchSize) return false;
    const afterId = sourcePage[sourcePage.length - 1]?.id ?? '';
    sourcePage = await pageCartable(
      source,
      SOURCE_PAGE_SQL,
      afterId,
      batchSize,
    );
    sourceIndex = 0;
    return sourcePage.length > 0;
  };
  const refillTarget = async (): Promise<boolean> => {
    if (targetIndex < targetPage.length) return true;
    if (targetPage.length < batchSize) return false;
    const afterId = targetPage[targetPage.length - 1]?.id ?? '';
    targetPage = await pageCartable(
      target,
      TARGET_PAGE_SQL,
      afterId,
      batchSize,
    );
    targetIndex = 0;
    return targetPage.length > 0;
  };

  while (true) {
    const hasSource = await refillSource();
    const hasTarget = await refillTarget();
    if (!hasSource && !hasTarget) break;
    if (!hasSource) {
      unexpected += 1;
      targetIndex += 1;
      continue;
    }
    if (!hasTarget) {
      missing += 1;
      sourceIndex += 1;
      continue;
    }
    const left = sourcePage[sourceIndex];
    const right = targetPage[targetIndex];
    if (left.id < right.id) {
      missing += 1;
      sourceIndex += 1;
      continue;
    }
    if (left.id > right.id) {
      unexpected += 1;
      targetIndex += 1;
      continue;
    }
    if (
      right.taskVersion === null ||
      (left.taskVersion !== null && right.taskVersion < left.taskVersion)
    ) {
      stale += 1;
    } else if (left.fingerprint !== right.fingerprint) {
      mismatch += 1;
    }
    sourceIndex += 1;
    targetIndex += 1;
  }

  return { sourceCount, targetCount, missing, unexpected, stale, mismatch };
}

async function readOutboxCounts(source: CutoverSqlClient): Promise<{
  pending: number;
  inFlight: number;
  expiredLease: number;
  deadLetter: number;
}> {
  const sql = `SELECT
    (count(*) FILTER (
      WHERE "deliveredAt" IS NULL AND "deadLetterAt" IS NULL
    ))::text AS pending,
    (count(*) FILTER (
      WHERE "deliveredAt" IS NULL AND "deadLetterAt" IS NULL
        AND "claimedAt" IS NOT NULL
        AND "claimedAt" >= (transaction_timestamp() AT TIME ZONE 'UTC')
          - $1 * interval '1 millisecond'
    ))::text AS "inFlight",
    (count(*) FILTER (
      WHERE "deliveredAt" IS NULL AND "deadLetterAt" IS NULL
        AND "claimedAt" IS NOT NULL
        AND "claimedAt" < (transaction_timestamp() AT TIME ZONE 'UTC')
          - $1 * interval '1 millisecond'
    ))::text AS "expiredLease",
    (count(*) FILTER (
      WHERE "deadLetterAt" IS NOT NULL
    ))::text AS "deadLetter"
  FROM orders.commerce_outbox_events
  WHERE producer = $2`;
  assertReadOnlyCutoverSql(sql);
  const result = await source.query(sql, [
    COMMERCE_OUTBOX_LEASE_MS,
    OPS_ADMIN_CUTOVER_OUTBOX_PRODUCER,
  ]);
  const row = result.rows[0] ?? {};
  return {
    pending: Number(asCount(row.pending)),
    inFlight: Number(asCount(row.inFlight)),
    expiredLease: Number(asCount(row.expiredLease)),
    deadLetter: Number(asCount(row.deadLetter)),
  };
}

async function readOpenFailureCount(target: CutoverSqlClient): Promise<number> {
  const sql = `SELECT count(*)::text AS count
    FROM ops.kafka_processing_failures
    WHERE status NOT IN ('RESOLVED', 'SKIPPED')`;
  assertReadOnlyCutoverSql(sql);
  const result = await target.query(sql);
  return Number(asCount(result.rows[0]?.count));
}

async function readCheckpoints(
  target: CutoverSqlClient,
  groupId: string,
  topic: string,
  expectedPartitions: readonly number[],
): Promise<{
  observed: number;
  missing: number;
  unexpected: number;
  missingWatermark: number;
  lagging: number;
  maxLag: string | null;
}> {
  const sql = `SELECT "partition"::int AS partition,
      "nextOffset"::text AS "nextOffset",
      "highWatermark"::text AS "highWatermark"
    FROM ops.kafka_consumer_checkpoints
    WHERE "consumerGroup" = $1 AND topic = $2`;
  assertReadOnlyCutoverSql(sql);
  const result = await target.query(sql, [groupId, topic]);
  const observed = new Map<
    number,
    { nextOffset: bigint; highWatermark: bigint | null }
  >();
  for (const row of result.rows) {
    const partition = Number(row.partition);
    if (!Number.isInteger(partition) || partition < 0) {
      throw new Error('Ops/Admin cutover readiness checkpoint is invalid');
    }
    const nextRaw = asCount(row.nextOffset);
    const highRaw = row.highWatermark;
    observed.set(partition, {
      nextOffset: BigInt(nextRaw),
      highWatermark:
        highRaw === null || highRaw === undefined
          ? null
          : BigInt(asCount(highRaw)),
    });
  }
  const expected = new Set(expectedPartitions);
  let missing = 0;
  let unexpected = 0;
  let missingWatermark = 0;
  let lagging = 0;
  let maxLag: bigint | null = 0n;
  for (const partition of expected) {
    const row = observed.get(partition);
    if (!row) {
      missing += 1;
      continue;
    }
    if (row.highWatermark === null) {
      missingWatermark += 1;
      maxLag = null;
      continue;
    }
    const lag =
      row.highWatermark > row.nextOffset
        ? row.highWatermark - row.nextOffset
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

export async function evaluateOpsAdminCutoverReadiness(options: {
  source: CutoverSqlClient;
  target: CutoverSqlClient;
  kafkaGroupId: string;
  kafkaTopic: string;
  expectedPartitions: readonly number[];
  batchSize: number;
  capturedAt?: string;
}): Promise<OpsAdminCutoverReadinessReport> {
  const reasons: OpsAdminCutoverReason[] = [];
  await options.source.query(
    'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY',
  );
  await options.target.query(
    'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY',
  );
  try {
    const cartable = await compareCartablePages(
      options.source,
      options.target,
      options.batchSize,
    );
    const outbox = await readOutboxCounts(options.source);
    const openFailures = await readOpenFailureCount(options.target);
    const checkpoints = await readCheckpoints(
      options.target,
      options.kafkaGroupId,
      options.kafkaTopic,
      options.expectedPartitions,
    );
    if (cartable.sourceCount !== cartable.targetCount) {
      reasons.push('CARTABLE_COUNT_MISMATCH');
    }
    if (cartable.missing > 0) reasons.push('CARTABLE_MISSING');
    if (cartable.unexpected > 0) reasons.push('CARTABLE_UNEXPECTED');
    if (cartable.stale > 0) reasons.push('CARTABLE_STALE');
    if (cartable.mismatch > 0) reasons.push('CARTABLE_MISMATCH');
    if (outbox.pending > 0) reasons.push('OUTBOX_PENDING');
    if (outbox.inFlight > 0) reasons.push('OUTBOX_IN_FLIGHT');
    if (outbox.expiredLease > 0) reasons.push('OUTBOX_EXPIRED_LEASE');
    if (outbox.deadLetter > 0) reasons.push('OUTBOX_DEAD_LETTER');
    if (openFailures > 0) reasons.push('DLQ_OPEN');
    if (checkpoints.missing > 0) reasons.push('CHECKPOINT_MISSING');
    if (checkpoints.unexpected > 0) reasons.push('CHECKPOINT_UNEXPECTED');
    if (checkpoints.missingWatermark > 0) {
      reasons.push('CHECKPOINT_WATERMARK_MISSING');
    }
    if (checkpoints.lagging > 0) reasons.push('CHECKPOINT_LAG');

    const mismatchCount =
      cartable.missing +
      cartable.unexpected +
      cartable.stale +
      cartable.mismatch;
    await options.source.query('COMMIT');
    await options.target.query('COMMIT');
    return {
      reportVersion: OPS_ADMIN_CUTOVER_REPORT_VERSION,
      capturedAt: options.capturedAt ?? new Date().toISOString(),
      status: reasons.length === 0 ? 'READY' : 'NOT_READY',
      reasons,
      sourceCount: cartable.sourceCount,
      targetCount: cartable.targetCount,
      mismatchCount: String(mismatchCount),
      blockingOutboxCount: String(outbox.pending + outbox.deadLetter),
      openFailureCount: String(openFailures),
      expectedPartitionCount: String(options.expectedPartitions.length),
      observedPartitionCount: String(checkpoints.observed),
      maxLag: checkpoints.maxLag,
    };
  } catch (error) {
    await Promise.allSettled([
      options.source.query('ROLLBACK'),
      options.target.query('ROLLBACK'),
    ]);
    throw error;
  }
}

export async function runOpsAdminCutoverReadinessCheck(options: {
  env?: NodeJS.ProcessEnv;
  connect?: (url: string) => Promise<CutoverSqlClient>;
}): Promise<{ report: OpsAdminCutoverReadinessReport; exitCode: number }> {
  const config = loadOpsAdminCutoverCheckConfig(options.env);
  if (!config.enabled) {
    return {
      report: emptyOpsAdminCutoverReport('DISABLED'),
      exitCode: 0,
    };
  }
  const sourceUrl = config.sourceUrl;
  const targetUrl = config.targetUrl;
  if (
    !sourceUrl ||
    !targetUrl ||
    !config.kafkaGroupId ||
    !config.kafkaTopic ||
    !config.expectedPartitions ||
    config.batchSize === undefined
  ) {
    throw new OpsAdminCutoverConfigError();
  }
  const urlReasons = classifyOpsAdminCutoverDatabaseUrls(sourceUrl, targetUrl);
  if (urlReasons.length > 0) {
    return {
      report: {
        ...emptyOpsAdminCutoverReport('NOT_READY', urlReasons),
        expectedPartitionCount: String(config.expectedPartitions.length),
      },
      exitCode: 2,
    };
  }
  if (!options.connect) {
    throw new OpsAdminCutoverConfigError();
  }
  const source = await options.connect(sourceUrl);
  const target = await options.connect(targetUrl);
  try {
    const report = await evaluateOpsAdminCutoverReadiness({
      source,
      target,
      kafkaGroupId: config.kafkaGroupId,
      kafkaTopic: config.kafkaTopic,
      expectedPartitions: config.expectedPartitions,
      batchSize: config.batchSize,
    });
    return {
      report,
      exitCode: report.status === 'READY' ? 0 : 2,
    };
  } finally {
    await Promise.allSettled(
      [source, target].map((client) =>
        client.end ? client.end() : Promise.resolve(),
      ),
    );
  }
}

async function main(): Promise<void> {
  try {
    const result = await runOpsAdminCutoverReadinessCheck({
      connect: async (url) => {
        const client = new Client({ connectionString: url });
        await client.connect();
        return client;
      },
    });
    process.stdout.write(`${serializeOpsAdminCutoverReport(result.report)}\n`);
    process.exitCode = result.exitCode;
  } catch {
    process.stdout.write(
      `${serializeOpsAdminCutoverReport(emptyOpsAdminCutoverReport('UNAVAILABLE', ['UNAVAILABLE']))}\n`,
    );
    process.stderr.write('Ops/Admin cutover readiness check failed\n');
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main();
}
