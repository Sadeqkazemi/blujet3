import 'dotenv/config';
import { Client } from 'pg';
import {
  REPORTING_DATABASE_NAME_PATTERN,
  validateReportingDatabaseName,
} from './provision-reporting-projection-runtime-role';

export const REPORTING_CUTOVER_REPORT_VERSION = 1;
export const REPORTING_CUTOVER_DEFAULT_BATCH_SIZE = 100;
export const REPORTING_CUTOVER_MIN_BATCH_SIZE = 1;
export const REPORTING_CUTOVER_MAX_BATCH_SIZE = 1000;
export const REPORTING_CUTOVER_TERMINAL_FAILURE_STATUSES = [
  'RESOLVED',
  'SKIPPED',
] as const;

export const REPORTING_CUTOVER_REASONS = [
  'IDENTICAL_DATABASE',
  'INVALID_SOURCE_DATABASE',
  'INVALID_TARGET_DATABASE',
  'PROJECTION_COUNT_MISMATCH',
  'PROJECTION_MISSING',
  'PROJECTION_UNEXPECTED',
  'PROJECTION_MISMATCH',
  'RECEIPT_COUNT_MISMATCH',
  'RECEIPT_MISSING',
  'RECEIPT_UNEXPECTED',
  'RECEIPT_MISMATCH',
  'RECEIPT_PARITY_MISMATCH',
  'FAILURE_OPEN',
  'CHECKPOINT_MISSING',
  'CHECKPOINT_UNEXPECTED',
  'CHECKPOINT_WATERMARK_MISSING',
  'CHECKPOINT_LAG',
  'CHECKPOINT_MISMATCH',
  'UNAVAILABLE',
] as const;

export type ReportingCutoverReason = (typeof REPORTING_CUTOVER_REASONS)[number];
export type ReportingCutoverStatus =
  'DISABLED' | 'READY' | 'NOT_READY' | 'UNAVAILABLE';

export interface ReportingCutoverReadinessReport {
  reportVersion: typeof REPORTING_CUTOVER_REPORT_VERSION;
  capturedAt: string;
  status: ReportingCutoverStatus;
  reasons: ReportingCutoverReason[];
  sourceCount: string;
  targetCount: string;
  receiptSourceCount: string;
  receiptTargetCount: string;
  mismatchCount: string;
  parityMismatchCount: string;
  openFailureCount: string;
  expectedPartitionCount: string;
  observedPartitionCount: string;
  maxLag: string | null;
}

export interface ReportingCutoverCheckConfig {
  enabled: boolean;
  sourceUrl?: string;
  targetUrl?: string;
  kafkaGroupId?: string;
  kafkaTopic?: string;
  expectedPartitions?: number[];
  batchSize?: number;
}

export interface ReportingCutoverSqlClient {
  query(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: Array<Record<string, unknown>> }>;
  end?: () => Promise<void>;
}

type FingerprintPageRow = {
  id: string;
  fingerprint: string;
};

const REASON_SET = new Set<string>(REPORTING_CUTOVER_REASONS);
const READ_ONLY_SQL = /^(BEGIN\b|COMMIT\b|ROLLBACK\b|SET\b|SELECT\b|WITH\b)/i;

export class ReportingCutoverConfigError extends Error {
  constructor() {
    super('Reporting cutover readiness configuration is invalid');
    this.name = 'ReportingCutoverConfigError';
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
    throw new ReportingCutoverConfigError();
  }
  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new ReportingCutoverConfigError();
  }
  const databaseName = decodeURIComponent(
    parsed.pathname.replace(/^\//, ''),
  ).split('?')[0];
  if (!databaseName || databaseName.includes('/')) {
    throw new ReportingCutoverConfigError();
  }
  return { url: parsed, databaseName };
}

export function parseReportingCutoverPartitions(value: string): number[] {
  const parts = value.split(',').map((item) => item.trim());
  if (parts.length === 0 || parts.some((item) => item === '')) {
    throw new ReportingCutoverConfigError();
  }
  const partitions = parts.map((item) => {
    if (!/^(0|[1-9]\d{0,8})$/.test(item)) {
      throw new ReportingCutoverConfigError();
    }
    return Number(item);
  });
  if (new Set(partitions).size !== partitions.length) {
    throw new ReportingCutoverConfigError();
  }
  return partitions;
}

export function parseReportingCutoverBatchSize(
  value: string | undefined,
): number {
  const raw = value ?? String(REPORTING_CUTOVER_DEFAULT_BATCH_SIZE);
  if (!/^[1-9]\d{0,3}$/.test(raw)) {
    throw new ReportingCutoverConfigError();
  }
  const batchSize = Number(raw);
  if (
    batchSize < REPORTING_CUTOVER_MIN_BATCH_SIZE ||
    batchSize > REPORTING_CUTOVER_MAX_BATCH_SIZE
  ) {
    throw new ReportingCutoverConfigError();
  }
  return batchSize;
}

export function parseReportingCutoverKafkaName(
  value: string,
  kind: 'group' | 'topic',
): string {
  const max = kind === 'group' ? 128 : 249;
  if (
    !/^[A-Za-z0-9._-]+$/.test(value) ||
    value.length < 1 ||
    value.length > max
  ) {
    throw new ReportingCutoverConfigError();
  }
  return value;
}

export function emptyReportingCutoverReport(
  status: ReportingCutoverStatus,
  reasons: ReportingCutoverReason[] = [],
  capturedAt = new Date().toISOString(),
): ReportingCutoverReadinessReport {
  return {
    reportVersion: REPORTING_CUTOVER_REPORT_VERSION,
    capturedAt,
    status,
    reasons: reasons.filter((reason) => REASON_SET.has(reason)),
    sourceCount: '0',
    targetCount: '0',
    receiptSourceCount: '0',
    receiptTargetCount: '0',
    mismatchCount: '0',
    parityMismatchCount: '0',
    openFailureCount: '0',
    expectedPartitionCount: '0',
    observedPartitionCount: '0',
    maxLag: null,
  };
}

export function serializeReportingCutoverReport(
  report: ReportingCutoverReadinessReport,
): string {
  return JSON.stringify({
    reportVersion: report.reportVersion,
    capturedAt: report.capturedAt,
    status: report.status,
    reasons: report.reasons.filter((reason) => REASON_SET.has(reason)),
    sourceCount: report.sourceCount,
    targetCount: report.targetCount,
    receiptSourceCount: report.receiptSourceCount,
    receiptTargetCount: report.receiptTargetCount,
    mismatchCount: report.mismatchCount,
    parityMismatchCount: report.parityMismatchCount,
    openFailureCount: report.openFailureCount,
    expectedPartitionCount: report.expectedPartitionCount,
    observedPartitionCount: report.observedPartitionCount,
    maxLag: report.maxLag,
  });
}

export function assertReadOnlyReportingCutoverSql(statement: string): void {
  const trimmed = statement.trim();
  if (!READ_ONLY_SQL.test(trimmed)) {
    throw new Error('Reporting cutover readiness queries must be read-only');
  }
  if (
    /\b(INSERT|UPDATE|DELETE|MERGE|TRUNCATE|ALTER|CREATE|DROP|GRANT|REVOKE|COPY|LISTEN|NOTIFY|VACUUM)\b/i.test(
      trimmed,
    )
  ) {
    throw new Error('Reporting cutover readiness queries must be read-only');
  }
}

export function classifyReportingCutoverDatabaseUrls(
  sourceUrl: string,
  targetUrl: string,
): ReportingCutoverReason[] {
  const source = parsePostgresUrl(sourceUrl);
  const target = parsePostgresUrl(targetUrl);
  if (databaseIdentity(source.url) === databaseIdentity(target.url)) {
    return ['IDENTICAL_DATABASE'];
  }
  const reasons: ReportingCutoverReason[] = [];
  if (REPORTING_DATABASE_NAME_PATTERN.test(source.databaseName)) {
    reasons.push('INVALID_SOURCE_DATABASE');
  }
  try {
    validateReportingDatabaseName(target.databaseName);
  } catch {
    reasons.push('INVALID_TARGET_DATABASE');
  }
  return reasons;
}

export function loadReportingCutoverCheckConfig(
  env: NodeJS.ProcessEnv = process.env,
): ReportingCutoverCheckConfig {
  if (env.REPORTING_CUTOVER_CHECK_ENABLED !== 'true') {
    return { enabled: false };
  }
  const sourceUrl = env.REPORTING_CUTOVER_SOURCE_DATABASE_URL;
  const targetUrl = env.REPORTING_CUTOVER_TARGET_DATABASE_URL;
  const kafkaGroupId = env.REPORTING_CUTOVER_KAFKA_GROUP_ID;
  const kafkaTopic = env.REPORTING_CUTOVER_KAFKA_TOPIC;
  const partitions = env.REPORTING_CUTOVER_EXPECTED_PARTITIONS;
  if (!sourceUrl || !targetUrl || !kafkaGroupId || !kafkaTopic || !partitions) {
    throw new ReportingCutoverConfigError();
  }
  parsePostgresUrl(sourceUrl);
  parsePostgresUrl(targetUrl);
  return {
    enabled: true,
    sourceUrl,
    targetUrl,
    kafkaGroupId: parseReportingCutoverKafkaName(kafkaGroupId, 'group'),
    kafkaTopic: parseReportingCutoverKafkaName(kafkaTopic, 'topic'),
    expectedPartitions: parseReportingCutoverPartitions(partitions),
    batchSize: parseReportingCutoverBatchSize(env.REPORTING_CUTOVER_BATCH_SIZE),
  };
}

function asCount(value: unknown): string {
  if (typeof value === 'string' && /^(0|[1-9]\d{0,19})$/.test(value)) {
    return value;
  }
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return String(value);
  }
  throw new Error('Reporting cutover readiness count is invalid');
}

function asId(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('Reporting cutover readiness row is invalid');
  }
  return value;
}

function textField(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'string') {
    throw new Error('Reporting cutover readiness row is invalid');
  }
  return value;
}

function timestampField(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error('Reporting cutover readiness row is invalid');
    }
    return parsed.toISOString();
  }
  throw new Error('Reporting cutover readiness row is invalid');
}

function versionField(value: unknown): string {
  if (value === null || value === undefined) return '';
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(numeric)) {
    throw new Error('Reporting cutover readiness row is invalid');
  }
  return String(numeric);
}

function projectionFingerprint(
  row: Record<string, unknown>,
): FingerprintPageRow {
  return {
    id: `${asId(row.orderId)}\u001f${asId(row.eventType)}`,
    fingerprint: [
      textField(row.eventId),
      textField(row.fingerprint),
      versionField(row.orderVersion),
      textField(row.currency),
      timestampField(row.occurredAt),
      timestampField(row.createdAt),
      timestampField(row.updatedAt),
    ].join('\u001f'),
  };
}

function receiptFingerprint(row: Record<string, unknown>): FingerprintPageRow {
  return {
    id: asId(row.eventId),
    fingerprint: [
      textField(row.fingerprint),
      textField(row.orderId),
      textField(row.eventType),
      versionField(row.orderVersion),
      timestampField(row.receivedAt),
    ].join('\u001f'),
  };
}

const PROJECTION_PAGE_SQL = `SELECT "orderId", "eventType"::text AS "eventType",
  "eventId"::text AS "eventId", fingerprint::text AS fingerprint,
  "orderVersion", currency::text AS currency, "occurredAt", "createdAt",
  "updatedAt"
FROM reporting.core_itinerary_event_projections
WHERE ("orderId", "eventType") > ($1, $2)
ORDER BY "orderId", "eventType"
LIMIT $3`;

const RECEIPT_PAGE_SQL = `SELECT "eventId"::text AS "eventId",
  fingerprint::text AS fingerprint, "orderId", "eventType"::text AS "eventType",
  "orderVersion", "receivedAt"
FROM reporting.core_itinerary_event_receipts
WHERE "eventId"::text > $1
ORDER BY "eventId"::text
LIMIT $2`;

const PROJECTION_COUNT_SQL =
  'SELECT count("eventId")::text AS count FROM reporting.core_itinerary_event_projections';
const RECEIPT_COUNT_SQL =
  'SELECT count("eventId")::text AS count FROM reporting.core_itinerary_event_receipts';
const PARITY_SQL = `SELECT count(p."eventId")::text AS count
FROM reporting.core_itinerary_event_projections p
LEFT JOIN reporting.core_itinerary_event_receipts r
  ON r."eventId" = p."eventId"
 AND r.fingerprint = p.fingerprint
 AND r."orderId" = p."orderId"
 AND r."eventType" = p."eventType"
 AND r."orderVersion" = p."orderVersion"
WHERE r."eventId" IS NULL`;

async function pageMapped(
  client: ReportingCutoverSqlClient,
  sql: string,
  values: readonly unknown[],
  mapRow: (row: Record<string, unknown>) => FingerprintPageRow,
): Promise<FingerprintPageRow[]> {
  assertReadOnlyReportingCutoverSql(sql);
  const result = await client.query(sql, values);
  return result.rows.map(mapRow);
}

async function comparePages(options: {
  source: ReportingCutoverSqlClient;
  target: ReportingCutoverSqlClient;
  batchSize: number;
  countSql: string;
  pageSource: (
    after: FingerprintPageRow | undefined,
  ) => Promise<FingerprintPageRow[]>;
  pageTarget: (
    after: FingerprintPageRow | undefined,
  ) => Promise<FingerprintPageRow[]>;
}): Promise<{
  sourceCount: string;
  targetCount: string;
  missing: number;
  unexpected: number;
  mismatch: number;
}> {
  assertReadOnlyReportingCutoverSql(options.countSql);
  const [sourceCountRow, targetCountRow] = await Promise.all([
    options.source.query(options.countSql),
    options.target.query(options.countSql),
  ]);
  const sourceCount = asCount(sourceCountRow.rows[0]?.count);
  const targetCount = asCount(targetCountRow.rows[0]?.count);
  let sourcePage = await options.pageSource(undefined);
  let targetPage = await options.pageTarget(undefined);
  let sourceIndex = 0;
  let targetIndex = 0;
  let missing = 0;
  let unexpected = 0;
  let mismatch = 0;

  const refillSource = async (): Promise<boolean> => {
    if (sourceIndex < sourcePage.length) return true;
    if (sourcePage.length < options.batchSize) return false;
    sourcePage = await options.pageSource(sourcePage[sourcePage.length - 1]);
    sourceIndex = 0;
    return sourcePage.length > 0;
  };
  const refillTarget = async (): Promise<boolean> => {
    if (targetIndex < targetPage.length) return true;
    if (targetPage.length < options.batchSize) return false;
    targetPage = await options.pageTarget(targetPage[targetPage.length - 1]);
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
    if (left.fingerprint !== right.fingerprint) mismatch += 1;
    sourceIndex += 1;
    targetIndex += 1;
  }

  return { sourceCount, targetCount, missing, unexpected, mismatch };
}

async function compareProjections(
  source: ReportingCutoverSqlClient,
  target: ReportingCutoverSqlClient,
  batchSize: number,
): Promise<{
  sourceCount: string;
  targetCount: string;
  missing: number;
  unexpected: number;
  mismatch: number;
}> {
  const page = (
    client: ReportingCutoverSqlClient,
    after: FingerprintPageRow | undefined,
  ) => {
    const [orderId, eventType] = after ? after.id.split('\u001f') : ['', ''];
    return pageMapped(
      client,
      PROJECTION_PAGE_SQL,
      [orderId, eventType, batchSize],
      projectionFingerprint,
    );
  };
  return comparePages({
    source,
    target,
    batchSize,
    countSql: PROJECTION_COUNT_SQL,
    pageSource: (after) => page(source, after),
    pageTarget: (after) => page(target, after),
  });
}

async function compareReceipts(
  source: ReportingCutoverSqlClient,
  target: ReportingCutoverSqlClient,
  batchSize: number,
): Promise<{
  sourceCount: string;
  targetCount: string;
  missing: number;
  unexpected: number;
  mismatch: number;
}> {
  const page = (
    client: ReportingCutoverSqlClient,
    after: FingerprintPageRow | undefined,
  ) =>
    pageMapped(
      client,
      RECEIPT_PAGE_SQL,
      [after?.id ?? '', batchSize],
      receiptFingerprint,
    );
  return comparePages({
    source,
    target,
    batchSize,
    countSql: RECEIPT_COUNT_SQL,
    pageSource: (after) => page(source, after),
    pageTarget: (after) => page(target, after),
  });
}

async function readParityMismatchCount(
  client: ReportingCutoverSqlClient,
): Promise<number> {
  assertReadOnlyReportingCutoverSql(PARITY_SQL);
  const result = await client.query(PARITY_SQL);
  return Number(asCount(result.rows[0]?.count));
}

async function readOpenFailureCount(
  client: ReportingCutoverSqlClient,
): Promise<number> {
  const sql = `SELECT count(status)::text AS count
    FROM reporting.kafka_processing_failures
    WHERE status NOT IN ('RESOLVED', 'SKIPPED')`;
  assertReadOnlyReportingCutoverSql(sql);
  const result = await client.query(sql);
  return Number(asCount(result.rows[0]?.count));
}

type CheckpointRow = {
  nextOffset: bigint;
  highWatermark: bigint | null;
  fingerprint: string;
};

async function readCheckpoints(
  client: ReportingCutoverSqlClient,
  groupId: string,
  topic: string,
): Promise<Map<number, CheckpointRow>> {
  const sql = `SELECT "partition"::int AS partition,
      "nextOffset"::text AS "nextOffset",
      "highWatermark"::text AS "highWatermark"
    FROM reporting.kafka_consumer_checkpoints
    WHERE "consumerGroup" = $1 AND topic = $2`;
  assertReadOnlyReportingCutoverSql(sql);
  const result = await client.query(sql, [groupId, topic]);
  const observed = new Map<number, CheckpointRow>();
  for (const row of result.rows) {
    const partition = Number(row.partition);
    if (!Number.isInteger(partition) || partition < 0) {
      throw new Error('Reporting cutover readiness checkpoint is invalid');
    }
    const nextRaw = asCount(row.nextOffset);
    const highRaw = row.highWatermark;
    const highWatermark =
      highRaw === null || highRaw === undefined ? null : asCount(highRaw);
    observed.set(partition, {
      nextOffset: BigInt(nextRaw),
      highWatermark: highWatermark === null ? null : BigInt(highWatermark),
      fingerprint: `${textField(nextRaw)}\u001f${textField(highWatermark)}`,
    });
  }
  return observed;
}

function evaluateCheckpoints(
  source: Map<number, CheckpointRow>,
  target: Map<number, CheckpointRow>,
  expectedPartitions: readonly number[],
): {
  observed: number;
  missing: number;
  unexpected: number;
  missingWatermark: number;
  lagging: number;
  mismatch: number;
  maxLag: string | null;
} {
  const expected = new Set(expectedPartitions);
  const observedKeys = new Set([...source.keys(), ...target.keys()]);
  let missing = 0;
  let unexpected = 0;
  let missingWatermark = 0;
  let lagging = 0;
  let mismatch = 0;
  let maxLag: bigint | null = 0n;

  const lagOf = (row: CheckpointRow): bigint | null => {
    if (row.highWatermark === null) return null;
    return row.highWatermark > row.nextOffset
      ? row.highWatermark - row.nextOffset
      : 0n;
  };

  for (const partition of expected) {
    const left = source.get(partition);
    const right = target.get(partition);
    if (!left || !right) {
      missing += 1;
      continue;
    }
    if (left.fingerprint !== right.fingerprint) mismatch += 1;
    if (left.highWatermark === null || right.highWatermark === null) {
      missingWatermark += 1;
      maxLag = null;
      continue;
    }
    const leftLag = lagOf(left);
    const rightLag = lagOf(right);
    if (leftLag === null || rightLag === null) {
      missingWatermark += 1;
      maxLag = null;
      continue;
    }
    if (leftLag > 0n || rightLag > 0n) lagging += 1;
    if (maxLag !== null) {
      const larger = leftLag > rightLag ? leftLag : rightLag;
      if (larger > maxLag) maxLag = larger;
    }
  }
  for (const partition of observedKeys) {
    if (!expected.has(partition)) unexpected += 1;
  }
  return {
    observed: observedKeys.size,
    missing,
    unexpected,
    missingWatermark,
    lagging,
    mismatch,
    maxLag: maxLag === null ? null : maxLag.toString(),
  };
}

export async function evaluateReportingCutoverReadiness(options: {
  source: ReportingCutoverSqlClient;
  target: ReportingCutoverSqlClient;
  kafkaGroupId: string;
  kafkaTopic: string;
  expectedPartitions: readonly number[];
  batchSize: number;
  capturedAt?: string;
}): Promise<ReportingCutoverReadinessReport> {
  const reasons: ReportingCutoverReason[] = [];
  await options.source.query(
    'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY',
  );
  await options.target.query(
    'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY',
  );
  try {
    const projections = await compareProjections(
      options.source,
      options.target,
      options.batchSize,
    );
    const receipts = await compareReceipts(
      options.source,
      options.target,
      options.batchSize,
    );
    const [sourceParity, targetParity, sourceFailures, targetFailures] =
      await Promise.all([
        readParityMismatchCount(options.source),
        readParityMismatchCount(options.target),
        readOpenFailureCount(options.source),
        readOpenFailureCount(options.target),
      ]);
    const checkpoints = evaluateCheckpoints(
      await readCheckpoints(
        options.source,
        options.kafkaGroupId,
        options.kafkaTopic,
      ),
      await readCheckpoints(
        options.target,
        options.kafkaGroupId,
        options.kafkaTopic,
      ),
      options.expectedPartitions,
    );
    if (projections.sourceCount !== projections.targetCount) {
      reasons.push('PROJECTION_COUNT_MISMATCH');
    }
    if (projections.missing > 0) reasons.push('PROJECTION_MISSING');
    if (projections.unexpected > 0) reasons.push('PROJECTION_UNEXPECTED');
    if (projections.mismatch > 0) reasons.push('PROJECTION_MISMATCH');
    if (receipts.sourceCount !== receipts.targetCount) {
      reasons.push('RECEIPT_COUNT_MISMATCH');
    }
    if (receipts.missing > 0) reasons.push('RECEIPT_MISSING');
    if (receipts.unexpected > 0) reasons.push('RECEIPT_UNEXPECTED');
    if (receipts.mismatch > 0) reasons.push('RECEIPT_MISMATCH');
    const parityMismatchCount = sourceParity + targetParity;
    if (parityMismatchCount > 0) reasons.push('RECEIPT_PARITY_MISMATCH');
    const openFailures = sourceFailures + targetFailures;
    if (openFailures > 0) reasons.push('FAILURE_OPEN');
    if (checkpoints.missing > 0) reasons.push('CHECKPOINT_MISSING');
    if (checkpoints.unexpected > 0) reasons.push('CHECKPOINT_UNEXPECTED');
    if (checkpoints.missingWatermark > 0) {
      reasons.push('CHECKPOINT_WATERMARK_MISSING');
    }
    if (checkpoints.lagging > 0) reasons.push('CHECKPOINT_LAG');
    if (checkpoints.mismatch > 0) reasons.push('CHECKPOINT_MISMATCH');

    const mismatchCount =
      projections.missing +
      projections.unexpected +
      projections.mismatch +
      receipts.missing +
      receipts.unexpected +
      receipts.mismatch;
    await options.source.query('COMMIT');
    await options.target.query('COMMIT');
    return {
      reportVersion: REPORTING_CUTOVER_REPORT_VERSION,
      capturedAt: options.capturedAt ?? new Date().toISOString(),
      status: reasons.length === 0 ? 'READY' : 'NOT_READY',
      reasons,
      sourceCount: projections.sourceCount,
      targetCount: projections.targetCount,
      receiptSourceCount: receipts.sourceCount,
      receiptTargetCount: receipts.targetCount,
      mismatchCount: String(mismatchCount),
      parityMismatchCount: String(parityMismatchCount),
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

export const REPORTING_CUTOVER_CONNECT_TIMEOUT_MS = 2000;
export const REPORTING_CUTOVER_QUERY_TIMEOUT_MS = 5000;
export const REPORTING_CUTOVER_LOCK_TIMEOUT_MS = 2000;
export const REPORTING_CUTOVER_CLIENT_OPTIONS = {
  connectionTimeoutMillis: REPORTING_CUTOVER_CONNECT_TIMEOUT_MS,
  query_timeout: REPORTING_CUTOVER_QUERY_TIMEOUT_MS,
  statement_timeout: REPORTING_CUTOVER_QUERY_TIMEOUT_MS,
  options:
    '-c default_transaction_read_only=on -c timezone=UTC -c statement_timeout=5000',
} as const;

export function createReportingCutoverReadClient(url: string): Client {
  return new Client({
    connectionString: url,
    ...REPORTING_CUTOVER_CLIENT_OPTIONS,
  });
}

export async function connectReportingCutoverReadClient(
  url: string,
): Promise<Client> {
  const client = createReportingCutoverReadClient(url);
  await client.connect();
  try {
    await client.query('SET default_transaction_read_only = on');
    await client.query("SET TIME ZONE 'UTC'");
    await client.query(
      `SET statement_timeout = '${REPORTING_CUTOVER_QUERY_TIMEOUT_MS}ms'`,
    );
    await client.query(
      `SET lock_timeout = '${REPORTING_CUTOVER_LOCK_TIMEOUT_MS}ms'`,
    );
    return client;
  } catch (error) {
    await client.end().catch(() => undefined);
    throw error;
  }
}

export async function runReportingCutoverReadinessCheck(options: {
  env?: NodeJS.ProcessEnv;
  connect?: (url: string) => Promise<ReportingCutoverSqlClient>;
}): Promise<{ report: ReportingCutoverReadinessReport; exitCode: number }> {
  const config = loadReportingCutoverCheckConfig(options.env);
  if (!config.enabled) {
    return {
      report: emptyReportingCutoverReport('DISABLED'),
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
    throw new ReportingCutoverConfigError();
  }
  const urlReasons = classifyReportingCutoverDatabaseUrls(sourceUrl, targetUrl);
  if (urlReasons.length > 0) {
    return {
      report: {
        ...emptyReportingCutoverReport('NOT_READY', urlReasons),
        expectedPartitionCount: String(config.expectedPartitions.length),
      },
      exitCode: 2,
    };
  }
  if (!options.connect) {
    throw new ReportingCutoverConfigError();
  }
  let source: ReportingCutoverSqlClient | undefined;
  let target: ReportingCutoverSqlClient | undefined;
  try {
    source = await options.connect(sourceUrl);
    target = await options.connect(targetUrl);
    const report = await evaluateReportingCutoverReadiness({
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
    await Promise.allSettled([
      source?.end ? source.end() : Promise.resolve(),
      target?.end ? target.end() : Promise.resolve(),
    ]);
  }
}

async function main(): Promise<void> {
  try {
    const result = await runReportingCutoverReadinessCheck({
      connect: connectReportingCutoverReadClient,
    });
    process.stdout.write(`${serializeReportingCutoverReport(result.report)}\n`);
    process.exitCode = result.exitCode;
  } catch {
    process.stdout.write(
      `${serializeReportingCutoverReport(emptyReportingCutoverReport('UNAVAILABLE', ['UNAVAILABLE']))}\n`,
    );
    process.stderr.write('Reporting cutover readiness check failed\n');
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main();
}
