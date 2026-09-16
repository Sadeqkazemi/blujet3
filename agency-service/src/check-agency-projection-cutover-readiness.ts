import 'dotenv/config';
import { Client } from 'pg';
import {
  AGENCY_BUSINESS_TABLES,
  agencyTableCountSql,
  agencyTableFingerprintSql,
  compareAgencyTableFingerprints,
  fingerprintAgencyBusinessTables,
} from './projection/agency-projection-reconciliation';

export const AGENCY_CUTOVER_REPORT_VERSION = 1;
export const AGENCY_CUTOVER_DEFAULT_BATCH_SIZE = 100;
export const AGENCY_CUTOVER_MIN_BATCH_SIZE = 1;
export const AGENCY_CUTOVER_MAX_BATCH_SIZE = 1000;
export const AGENCY_CUTOVER_OUTBOX_PRODUCER = 'core-agency';
export const AGENCY_CUTOVER_OUTBOX_LEASE_MS = 120_000;
export const AGENCY_CUTOVER_TERMINAL_FAILURE_STATUSES = [
  'RESOLVED',
  'SKIPPED',
] as const;
export const AGENCY_DATABASE_NAME_PATTERN =
  /^blujet_agency(?:_[A-Za-z0-9_]+)?$/;

export const AGENCY_CUTOVER_REASONS = [
  'IDENTICAL_DATABASE',
  'INVALID_SOURCE_DATABASE',
  'INVALID_TARGET_DATABASE',
  'PROJECTION_COUNT_MISMATCH',
  'PROJECTION_CHECKSUM_MISMATCH',
  'PROJECTION_INCONCLUSIVE',
  'OUTBOX_PENDING',
  'OUTBOX_IN_FLIGHT',
  'OUTBOX_EXPIRED_LEASE',
  'OUTBOX_DEAD_LETTER',
  'AUDIT_RECEIPT_COUNT_MISMATCH',
  'AUDIT_RECEIPT_FINGERPRINT_MISMATCH',
  'RECEIPT_SLOT_MISMATCH',
  'DLQ_OPEN',
  'CHECKPOINT_MISSING',
  'CHECKPOINT_UNEXPECTED',
  'CHECKPOINT_WATERMARK_MISSING',
  'CHECKPOINT_LAG',
  'UNAVAILABLE',
] as const;

export type AgencyCutoverReason = (typeof AGENCY_CUTOVER_REASONS)[number];
export type AgencyCutoverStatus =
  'DISABLED' | 'READY' | 'NOT_READY' | 'UNAVAILABLE';

export interface AgencyCutoverReadinessReport {
  reportVersion: typeof AGENCY_CUTOVER_REPORT_VERSION;
  checkedAt: string;
  status: AgencyCutoverStatus;
  reasons: AgencyCutoverReason[];
  sourceCount: string;
  targetCount: string;
  mismatchCount: string;
  checksumEqual: boolean;
  auditReceiptParity: boolean;
  blockingOutboxCount: string;
  openFailureCount: string;
  receiptSlotMismatchCount: string;
  expectedPartitionCount: string;
  observedPartitionCount: string;
  maxLag: string | null;
}

export interface AgencyCutoverCheckConfig {
  enabled: boolean;
  sourceUrl?: string;
  targetUrl?: string;
  kafkaGroupId?: string;
  kafkaTopic?: string;
  expectedPartitions?: number[];
  batchSize?: number;
}

export interface AgencyCutoverSqlClient {
  query(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: Array<Record<string, unknown>> }>;
  end?: () => Promise<void>;
}

const REASON_SET = new Set<string>(AGENCY_CUTOVER_REASONS);
const READ_ONLY_SQL = /^(BEGIN\b|COMMIT\b|ROLLBACK\b|SET\b|SELECT\b|WITH\b)/i;

export class AgencyCutoverConfigError extends Error {
  constructor() {
    super('Agency cutover readiness configuration is invalid');
    this.name = 'AgencyCutoverConfigError';
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
    throw new AgencyCutoverConfigError();
  }
  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new AgencyCutoverConfigError();
  }
  const databaseName = decodeURIComponent(
    parsed.pathname.replace(/^\//, ''),
  ).split('?')[0];
  if (!databaseName || databaseName.includes('/')) {
    throw new AgencyCutoverConfigError();
  }
  return { url: parsed, databaseName };
}

export function parseAgencyCutoverPartitions(value: string): number[] {
  const parts = value.split(',').map((item) => item.trim());
  if (parts.length === 0 || parts.some((item) => item === '')) {
    throw new AgencyCutoverConfigError();
  }
  const partitions = parts.map((item) => {
    if (!/^(0|[1-9]\d{0,8})$/.test(item)) {
      throw new AgencyCutoverConfigError();
    }
    return Number(item);
  });
  if (new Set(partitions).size !== partitions.length) {
    throw new AgencyCutoverConfigError();
  }
  return partitions;
}

export function parseAgencyCutoverBatchSize(value: string | undefined): number {
  const raw = value ?? String(AGENCY_CUTOVER_DEFAULT_BATCH_SIZE);
  if (!/^[1-9]\d{0,3}$/.test(raw)) {
    throw new AgencyCutoverConfigError();
  }
  const batchSize = Number(raw);
  if (
    batchSize < AGENCY_CUTOVER_MIN_BATCH_SIZE ||
    batchSize > AGENCY_CUTOVER_MAX_BATCH_SIZE
  ) {
    throw new AgencyCutoverConfigError();
  }
  return batchSize;
}

export function parseAgencyCutoverKafkaName(
  value: string,
  kind: 'group' | 'topic',
): string {
  const max = kind === 'group' ? 128 : 249;
  if (
    !/^[A-Za-z0-9._-]+$/.test(value) ||
    value.length < 1 ||
    value.length > max
  ) {
    throw new AgencyCutoverConfigError();
  }
  return value;
}

export function emptyAgencyCutoverReport(
  status: AgencyCutoverStatus,
  reasons: AgencyCutoverReason[] = [],
  checkedAt = new Date().toISOString(),
): AgencyCutoverReadinessReport {
  return {
    reportVersion: AGENCY_CUTOVER_REPORT_VERSION,
    checkedAt,
    status,
    reasons: reasons.filter((reason) => REASON_SET.has(reason)),
    sourceCount: '0',
    targetCount: '0',
    mismatchCount: '0',
    checksumEqual: false,
    auditReceiptParity: false,
    blockingOutboxCount: '0',
    openFailureCount: '0',
    receiptSlotMismatchCount: '0',
    expectedPartitionCount: '0',
    observedPartitionCount: '0',
    maxLag: null,
  };
}

export function serializeAgencyCutoverReport(
  report: AgencyCutoverReadinessReport,
): string {
  return JSON.stringify({
    reportVersion: report.reportVersion,
    checkedAt: report.checkedAt,
    status: report.status,
    reasons: report.reasons.filter((reason) => REASON_SET.has(reason)),
    sourceCount: report.sourceCount,
    targetCount: report.targetCount,
    mismatchCount: report.mismatchCount,
    checksumEqual: report.checksumEqual,
    auditReceiptParity: report.auditReceiptParity,
    blockingOutboxCount: report.blockingOutboxCount,
    openFailureCount: report.openFailureCount,
    receiptSlotMismatchCount: report.receiptSlotMismatchCount,
    expectedPartitionCount: report.expectedPartitionCount,
    observedPartitionCount: report.observedPartitionCount,
    maxLag: report.maxLag,
  });
}

export function assertReadOnlyAgencyCutoverSql(statement: string): void {
  const trimmed = statement.trim();
  if (!READ_ONLY_SQL.test(trimmed)) {
    throw new Error('Agency cutover readiness queries must be read-only');
  }
  if (
    /\b(INSERT|UPDATE|DELETE|MERGE|TRUNCATE|ALTER|CREATE|DROP|GRANT|REVOKE|COPY|LISTEN|NOTIFY|VACUUM)\b/i.test(
      trimmed,
    )
  ) {
    throw new Error('Agency cutover readiness queries must be read-only');
  }
}

export function classifyAgencyCutoverDatabaseUrls(
  sourceUrl: string,
  targetUrl: string,
): AgencyCutoverReason[] {
  const source = parsePostgresUrl(sourceUrl);
  const target = parsePostgresUrl(targetUrl);
  if (databaseIdentity(source.url) === databaseIdentity(target.url)) {
    return ['IDENTICAL_DATABASE'];
  }
  const reasons: AgencyCutoverReason[] = [];
  if (AGENCY_DATABASE_NAME_PATTERN.test(source.databaseName)) {
    reasons.push('INVALID_SOURCE_DATABASE');
  }
  if (!AGENCY_DATABASE_NAME_PATTERN.test(target.databaseName)) {
    reasons.push('INVALID_TARGET_DATABASE');
  }
  return reasons;
}

export function loadAgencyCutoverCheckConfig(
  env: NodeJS.ProcessEnv = process.env,
): AgencyCutoverCheckConfig {
  const flag = env.AGENCY_CUTOVER_CHECK_ENABLED ?? 'false';
  if (flag === 'false') {
    return { enabled: false };
  }
  if (flag !== 'true' || env.TZ !== 'UTC') {
    throw new AgencyCutoverConfigError();
  }
  const sourceUrl = env.AGENCY_CUTOVER_SOURCE_DATABASE_URL;
  const targetUrl = env.AGENCY_CUTOVER_TARGET_DATABASE_URL;
  const kafkaGroupId = env.AGENCY_CUTOVER_KAFKA_GROUP_ID;
  const kafkaTopic = env.AGENCY_CUTOVER_KAFKA_TOPIC;
  const partitions = env.AGENCY_CUTOVER_EXPECTED_PARTITIONS;
  if (!sourceUrl || !targetUrl || !kafkaGroupId || !kafkaTopic || !partitions) {
    throw new AgencyCutoverConfigError();
  }
  parsePostgresUrl(sourceUrl);
  parsePostgresUrl(targetUrl);
  return {
    enabled: true,
    sourceUrl,
    targetUrl,
    kafkaGroupId: parseAgencyCutoverKafkaName(kafkaGroupId, 'group'),
    kafkaTopic: parseAgencyCutoverKafkaName(kafkaTopic, 'topic'),
    expectedPartitions: parseAgencyCutoverPartitions(partitions),
    batchSize: parseAgencyCutoverBatchSize(env.AGENCY_CUTOVER_BATCH_SIZE),
  };
}

function asCount(value: unknown): string {
  if (typeof value === 'string' && /^(0|[1-9]\d{0,19})$/.test(value)) {
    return value;
  }
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return String(value);
  }
  throw new Error('Agency cutover readiness count is invalid');
}

function sumCounts(values: readonly string[]): string {
  return values
    .reduce((total, value) => total + BigInt(asCount(value)), 0n)
    .toString();
}

async function queryRows(
  client: AgencyCutoverSqlClient,
  sql: string,
  values?: readonly unknown[],
): Promise<Array<Record<string, unknown>>> {
  assertReadOnlyAgencyCutoverSql(sql);
  const result = await client.query(sql, values);
  return result.rows;
}

async function compareProjections(
  source: AgencyCutoverSqlClient,
  target: AgencyCutoverSqlClient,
  batchSize: number,
): Promise<{
  sourceCount: string;
  targetCount: string;
  checksumEqual: boolean;
  mismatchCount: number;
  reasons: AgencyCutoverReason[];
}> {
  for (const table of AGENCY_BUSINESS_TABLES) {
    assertReadOnlyAgencyCutoverSql(agencyTableCountSql(table));
    assertReadOnlyAgencyCutoverSql(agencyTableFingerprintSql(table));
  }
  const [sourceRows, targetRows] = await Promise.all([
    fingerprintAgencyBusinessTables(
      (text) => queryRows(source, text),
      batchSize,
    ),
    fingerprintAgencyBusinessTables(
      (text) => queryRows(target, text),
      batchSize,
    ),
  ]);
  const tables = compareAgencyTableFingerprints(sourceRows, targetRows);
  const reasons: AgencyCutoverReason[] = [];
  let mismatchCount = 0;
  for (const table of tables) {
    if (table.status === 'INCONCLUSIVE') {
      reasons.push('PROJECTION_INCONCLUSIVE');
    } else if (table.sourceCount !== table.projectionCount) {
      reasons.push('PROJECTION_COUNT_MISMATCH');
      mismatchCount += 1;
    } else if (table.status === 'MISMATCH') {
      reasons.push('PROJECTION_CHECKSUM_MISMATCH');
      mismatchCount += 1;
    }
  }
  return {
    sourceCount: sumCounts(tables.map((table) => table.sourceCount)),
    targetCount: sumCounts(tables.map((table) => table.projectionCount)),
    checksumEqual: tables.every((table) => table.status === 'MATCH'),
    mismatchCount,
    reasons: [...new Set(reasons)],
  };
}

async function readOutboxCounts(source: AgencyCutoverSqlClient): Promise<{
  pending: number;
  inFlight: number;
  expiredLease: number;
  deadLetter: number;
}> {
  const sql = `SELECT
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
    (count(producer) FILTER (
      WHERE "deadLetterAt" IS NOT NULL
    ))::text AS "deadLetter"
  FROM orders.commerce_outbox_events
  WHERE producer = $2`;
  const rows = await queryRows(source, sql, [
    AGENCY_CUTOVER_OUTBOX_LEASE_MS,
    AGENCY_CUTOVER_OUTBOX_PRODUCER,
  ]);
  const row = rows[0] ?? {};
  return {
    pending: Number(asCount(row.pending)),
    inFlight: Number(asCount(row.inFlight)),
    expiredLease: Number(asCount(row.expiredLease)),
    deadLetter: Number(asCount(row.deadLetter)),
  };
}

async function fingerprintAuditOrReceipt(
  client: AgencyCutoverSqlClient,
  source: boolean,
): Promise<{ count: string; hashA: string; hashB: string }> {
  const table = source
    ? 'agency.agency_projection_audits'
    : 'agency.agency_projection_event_receipts';
  const id = source ? 'id' : '"auditId"';
  const sql = `SELECT
      count(*)::text AS count,
      COALESCE(bit_xor(hashtextextended(
        concat_ws(E'\\x1f', ${id}::text, "aggregateType"::text,
          "aggregateId"::text, "recordVersion"::text), 0
      )), 0)::text AS "hashA",
      COALESCE(bit_xor(hashtextextended(
        concat_ws(E'\\x1f', ${id}::text, "aggregateType"::text,
          "aggregateId"::text, "recordVersion"::text), 1
      )), 0)::text AS "hashB"
    FROM ${table}`;
  const rows = await queryRows(client, sql);
  const row = rows[0] ?? {};
  const hashA = row.hashA;
  const hashB = row.hashB;
  if (typeof hashA !== 'string' || typeof hashB !== 'string') {
    throw new Error('Agency cutover audit/receipt fingerprint is invalid');
  }
  return { count: asCount(row.count), hashA, hashB };
}

async function readAuditReceiptParity(
  source: AgencyCutoverSqlClient,
  target: AgencyCutoverSqlClient,
): Promise<{
  countMatches: boolean;
  fingerprintMatches: boolean;
}> {
  const [audits, receipts] = await Promise.all([
    fingerprintAuditOrReceipt(source, true),
    fingerprintAuditOrReceipt(target, false),
  ]);
  return {
    countMatches: audits.count === receipts.count,
    fingerprintMatches:
      audits.hashA === receipts.hashA && audits.hashB === receipts.hashB,
  };
}

const RECEIPT_SLOT_SQL = `SELECT (
    (
      SELECT count(*) FROM agency.agency_profiles profile
      FULL OUTER JOIN (
        SELECT "aggregateType", "aggregateId", "recordVersion",
               "semanticFingerprint"
        FROM agency.agency_projection_slots
        WHERE "aggregateType" = 'AgencyProfile'
      ) slot ON slot."aggregateId" = profile."userId"
      WHERE profile."userId" IS NULL
         OR slot."aggregateId" IS NULL
         OR slot."recordVersion" IS DISTINCT FROM profile.version
    ) + (
      SELECT count(*) FROM agency.agency_invoices invoice
      FULL OUTER JOIN (
        SELECT "aggregateType", "aggregateId", "recordVersion",
               "semanticFingerprint"
        FROM agency.agency_projection_slots
        WHERE "aggregateType" = 'AgencyInvoice'
      ) slot ON slot."aggregateId" = invoice.id
      WHERE invoice.id IS NULL
         OR slot."aggregateId" IS NULL
         OR slot."recordVersion" IS DISTINCT FROM invoice.version
    ) + (
      SELECT count(*) FROM agency.agency_credit_requests request
      FULL OUTER JOIN (
        SELECT "aggregateType", "aggregateId", "recordVersion",
               "semanticFingerprint"
        FROM agency.agency_projection_slots
        WHERE "aggregateType" = 'AgencyCreditRequest'
      ) slot ON slot."aggregateId" = request.id
      WHERE request.id IS NULL
         OR slot."aggregateId" IS NULL
         OR slot."recordVersion" IS DISTINCT FROM request.version
    ) + (
      SELECT count(*) FROM agency.agency_projection_slots slot
      LEFT JOIN agency.agency_projection_event_receipts receipt
        ON receipt."aggregateType" = slot."aggregateType"
       AND receipt."aggregateId" = slot."aggregateId"
       AND receipt."recordVersion" = slot."recordVersion"
       AND receipt."semanticFingerprint" = slot."semanticFingerprint"
      WHERE receipt."eventId" IS NULL
    )
  )::text AS count`;

async function readReceiptSlotMismatchCount(
  target: AgencyCutoverSqlClient,
): Promise<number> {
  const rows = await queryRows(target, RECEIPT_SLOT_SQL);
  return Number(asCount(rows[0]?.count));
}

async function readOpenFailureCount(
  target: AgencyCutoverSqlClient,
): Promise<number> {
  const sql = `SELECT count(status)::text AS count
    FROM agency.kafka_processing_failures
    WHERE status NOT IN ('RESOLVED', 'SKIPPED')`;
  const rows = await queryRows(target, sql);
  return Number(asCount(rows[0]?.count));
}

async function readCheckpoints(
  target: AgencyCutoverSqlClient,
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
    FROM agency.kafka_consumer_checkpoints
    WHERE "consumerGroup" = $1 AND topic = $2`;
  const rows = await queryRows(target, sql, [groupId, topic]);
  const observed = new Map<
    number,
    { nextOffset: bigint; highWatermark: bigint | null }
  >();
  for (const row of rows) {
    const partition = Number(row.partition);
    if (!Number.isInteger(partition) || partition < 0) {
      throw new Error('Agency cutover readiness checkpoint is invalid');
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

export async function evaluateAgencyCutoverReadiness(options: {
  source: AgencyCutoverSqlClient;
  target: AgencyCutoverSqlClient;
  kafkaGroupId: string;
  kafkaTopic: string;
  expectedPartitions: readonly number[];
  batchSize: number;
  checkedAt?: string;
}): Promise<AgencyCutoverReadinessReport> {
  const reasons: AgencyCutoverReason[] = [];
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
    const outbox = await readOutboxCounts(options.source);
    const auditReceipts = await readAuditReceiptParity(
      options.source,
      options.target,
    );
    const receiptSlotMismatch = await readReceiptSlotMismatchCount(
      options.target,
    );
    const openFailures = await readOpenFailureCount(options.target);
    const checkpoints = await readCheckpoints(
      options.target,
      options.kafkaGroupId,
      options.kafkaTopic,
      options.expectedPartitions,
    );
    reasons.push(...projections.reasons);
    if (outbox.pending > 0) reasons.push('OUTBOX_PENDING');
    if (outbox.inFlight > 0) reasons.push('OUTBOX_IN_FLIGHT');
    if (outbox.expiredLease > 0) reasons.push('OUTBOX_EXPIRED_LEASE');
    if (outbox.deadLetter > 0) reasons.push('OUTBOX_DEAD_LETTER');
    if (!auditReceipts.countMatches) {
      reasons.push('AUDIT_RECEIPT_COUNT_MISMATCH');
    }
    if (!auditReceipts.fingerprintMatches) {
      reasons.push('AUDIT_RECEIPT_FINGERPRINT_MISMATCH');
    }
    if (receiptSlotMismatch > 0) reasons.push('RECEIPT_SLOT_MISMATCH');
    if (openFailures > 0) reasons.push('DLQ_OPEN');
    if (checkpoints.missing > 0) reasons.push('CHECKPOINT_MISSING');
    if (checkpoints.unexpected > 0) reasons.push('CHECKPOINT_UNEXPECTED');
    if (checkpoints.missingWatermark > 0) {
      reasons.push('CHECKPOINT_WATERMARK_MISSING');
    }
    if (checkpoints.lagging > 0) reasons.push('CHECKPOINT_LAG');

    await options.source.query('COMMIT');
    await options.target.query('COMMIT');
    return {
      reportVersion: AGENCY_CUTOVER_REPORT_VERSION,
      checkedAt: options.checkedAt ?? new Date().toISOString(),
      status: reasons.length === 0 ? 'READY' : 'NOT_READY',
      reasons,
      sourceCount: projections.sourceCount,
      targetCount: projections.targetCount,
      mismatchCount: String(projections.mismatchCount),
      checksumEqual: projections.checksumEqual,
      auditReceiptParity:
        auditReceipts.countMatches && auditReceipts.fingerprintMatches,
      blockingOutboxCount: String(outbox.pending + outbox.deadLetter),
      openFailureCount: String(openFailures),
      receiptSlotMismatchCount: String(receiptSlotMismatch),
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

export const AGENCY_CUTOVER_CONNECT_TIMEOUT_MS = 2000;
export const AGENCY_CUTOVER_QUERY_TIMEOUT_MS = 5000;
export const AGENCY_CUTOVER_LOCK_TIMEOUT_MS = 2000;
export const AGENCY_CUTOVER_CLIENT_OPTIONS = {
  connectionTimeoutMillis: AGENCY_CUTOVER_CONNECT_TIMEOUT_MS,
  query_timeout: AGENCY_CUTOVER_QUERY_TIMEOUT_MS,
  statement_timeout: AGENCY_CUTOVER_QUERY_TIMEOUT_MS,
  options:
    '-c default_transaction_read_only=on -c timezone=UTC -c statement_timeout=5000',
} as const;

export function createAgencyCutoverReadClient(url: string): Client {
  return new Client({
    connectionString: url,
    ...AGENCY_CUTOVER_CLIENT_OPTIONS,
  });
}

export async function connectAgencyCutoverReadClient(
  url: string,
): Promise<Client> {
  const client = createAgencyCutoverReadClient(url);
  await client.connect();
  try {
    await client.query('SET default_transaction_read_only = on');
    await client.query("SET TIME ZONE 'UTC'");
    await client.query(
      `SET statement_timeout = '${AGENCY_CUTOVER_QUERY_TIMEOUT_MS}ms'`,
    );
    await client.query(
      `SET lock_timeout = '${AGENCY_CUTOVER_LOCK_TIMEOUT_MS}ms'`,
    );
    return client;
  } catch (error) {
    await client.end().catch(() => undefined);
    throw error;
  }
}

export async function runAgencyCutoverReadinessCheck(options: {
  env?: NodeJS.ProcessEnv;
  connect?: (url: string) => Promise<AgencyCutoverSqlClient>;
}): Promise<{ report: AgencyCutoverReadinessReport; exitCode: number }> {
  const config = loadAgencyCutoverCheckConfig(options.env);
  if (!config.enabled) {
    return {
      report: emptyAgencyCutoverReport('DISABLED'),
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
    throw new AgencyCutoverConfigError();
  }
  const urlReasons = classifyAgencyCutoverDatabaseUrls(sourceUrl, targetUrl);
  if (urlReasons.length > 0) {
    return {
      report: {
        ...emptyAgencyCutoverReport('NOT_READY', urlReasons),
        expectedPartitionCount: String(config.expectedPartitions.length),
      },
      exitCode: 2,
    };
  }
  if (!options.connect) {
    throw new AgencyCutoverConfigError();
  }
  let source: AgencyCutoverSqlClient | undefined;
  let target: AgencyCutoverSqlClient | undefined;
  try {
    source = await options.connect(sourceUrl);
    target = await options.connect(targetUrl);
    const report = await evaluateAgencyCutoverReadiness({
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
    const result = await runAgencyCutoverReadinessCheck({
      connect: connectAgencyCutoverReadClient,
    });
    process.stdout.write(`${serializeAgencyCutoverReport(result.report)}\n`);
    process.exitCode = result.exitCode;
  } catch {
    process.stdout.write(
      `${serializeAgencyCutoverReport(emptyAgencyCutoverReport('UNAVAILABLE', ['UNAVAILABLE']))}\n`,
    );
    process.stderr.write('Agency cutover readiness check failed\n');
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main();
}
