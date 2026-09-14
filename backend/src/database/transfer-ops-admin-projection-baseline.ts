import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import 'dotenv/config';
import { Client } from 'pg';
import {
  OPS_ADMIN_PROJECTION_DATABASE_NAME_PATTERN,
  OPS_ADMIN_PROJECTION_MIN_SERVER_VERSION,
  parseOpsAdminProjectionOwnerUrl,
  validateOpsAdminProjectionDatabaseName,
} from './provision-ops-admin-projection-runtime-role';

export const OPS_ADMIN_BASELINE_BACKUP_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const OPS_ADMIN_BASELINE_SOURCE_MIGRATIONS_TABLE = 'migrations';
export const OPS_ADMIN_BASELINE_TARGET_MIGRATIONS_TABLE =
  'ops_admin_projection_migrations';
export const OPS_ADMIN_PROJECTION_CARTABLE_COLUMNS = [
  'id',
  'assigneeId',
  'category',
  'sourceType',
  'sourceId',
  'status',
  'resolvedAt',
  'readAt',
  'taskVersion',
  'auditId',
  'fingerprint',
  'createdAt',
] as const;
export const OPS_ADMIN_BASELINE_FORBIDDEN_SOURCE_COLUMNS = [
  'title',
  'description',
  'attachments',
  'senderId',
  'senderLabelFa',
  'resolutionNote',
  'conversationId',
  'transferredToId',
] as const;

const SOURCE_REQUIRED_COLUMNS = [
  'id',
  'assigneeId',
  'category',
  'sourceType',
  'sourceId',
  'status',
  'resolvedAt',
  'readAt',
  'version',
  'createdAt',
  ...OPS_ADMIN_BASELINE_FORBIDDEN_SOURCE_COLUMNS,
] as const;

export interface BaselineFingerprint {
  count: string;
  hashA: string;
  hashB: string;
}

export interface OpsAdminBaselineReport {
  status: 'PASS' | 'FAIL';
  mode: 'reconcile' | 'transfer';
  sourceCount: string;
  targetCount: string;
  sourceHashA: string;
  targetHashA: string;
  sourceHashB: string;
  targetHashB: string;
}

interface SqlClient {
  query(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: Array<Record<string, unknown>> }>;
}

type ProjectionRow = Record<
  (typeof OPS_ADMIN_PROJECTION_CARTABLE_COLUMNS)[number],
  unknown
>;

function identifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function databaseIdentity(url: URL): string {
  return `${url.hostname.toLowerCase()}:${url.port || '5432'}${url.pathname}`;
}

function parsePostgresUrl(
  value: string,
  label: 'source' | 'target',
): { url: URL; databaseName: string } {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Ops/Admin baseline ${label} URL must be PostgreSQL`);
  }
  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new Error(`Ops/Admin baseline ${label} URL must be PostgreSQL`);
  }
  const databaseName = decodeURIComponent(
    parsed.pathname.replace(/^\//, ''),
  ).split('?')[0];
  if (!databaseName || databaseName.includes('/')) {
    throw new Error(`Ops/Admin baseline ${label} URL must be PostgreSQL`);
  }
  return { url: parsed, databaseName };
}

export function validateOpsAdminBaselineDatabaseUrls(
  sourceUrl: string,
  targetUrl: string,
): { sourceDatabaseName: string; targetDatabaseName: string } {
  const source = parsePostgresUrl(sourceUrl, 'source');
  const target = parsePostgresUrl(targetUrl, 'target');
  if (databaseIdentity(source.url) === databaseIdentity(target.url)) {
    throw new Error(
      'Ops/Admin baseline source and target must be different databases',
    );
  }
  if (OPS_ADMIN_PROJECTION_DATABASE_NAME_PATTERN.test(source.databaseName)) {
    throw new Error(
      'Ops/Admin baseline source must be the Core cartable database',
    );
  }
  parseOpsAdminProjectionOwnerUrl(targetUrl);
  validateOpsAdminProjectionDatabaseName(target.databaseName);
  return {
    sourceDatabaseName: source.databaseName,
    targetDatabaseName: target.databaseName,
  };
}

export function validateOpsAdminBaselineBackupSha256(value: string): void {
  if (!/^[a-f0-9]{64}$/.test(value)) {
    throw new Error('Ops/Admin baseline backup checksum is invalid');
  }
}

export function validateOpsAdminBaselineBackupArtifact(options: {
  backupPath: string;
  expectedSha256: string;
  nowMs?: number;
  maxAgeMs?: number;
}): void {
  validateOpsAdminBaselineBackupSha256(options.expectedSha256);
  let stats: ReturnType<typeof lstatSync>;
  try {
    stats = lstatSync(options.backupPath);
  } catch {
    throw new Error('Ops/Admin baseline backup artifact is missing');
  }
  if (stats.isSymbolicLink() || !stats.isFile()) {
    throw new Error('Ops/Admin baseline backup artifact is invalid');
  }
  if (stats.size <= 0) {
    throw new Error('Ops/Admin baseline backup artifact is empty');
  }
  const ageMs = (options.nowMs ?? Date.now()) - stats.mtimeMs;
  const maxAgeMs = options.maxAgeMs ?? OPS_ADMIN_BASELINE_BACKUP_MAX_AGE_MS;
  if (ageMs > maxAgeMs) {
    throw new Error('Ops/Admin baseline backup artifact is stale');
  }
  const digest = createHash('sha256')
    .update(readFileSync(options.backupPath))
    .digest('hex');
  if (digest !== options.expectedSha256) {
    throw new Error('Ops/Admin baseline backup checksum does not match');
  }
}

export function validateOpsAdminBaselineOptions(options: {
  apply: boolean;
  batchSize: number;
  backupPath?: string;
  backupSha256?: string;
}): void {
  if (
    !Number.isInteger(options.batchSize) ||
    options.batchSize < 1 ||
    options.batchSize > 500
  ) {
    throw new Error(
      'OPS_ADMIN_BASELINE_BATCH_SIZE must be an integer from 1 to 500',
    );
  }
  if (!options.apply) return;
  if (!options.backupPath || !options.backupSha256) {
    throw new Error(
      'Ops/Admin baseline apply mode requires a verified backup artifact',
    );
  }
  validateOpsAdminBaselineBackupArtifact({
    backupPath: options.backupPath,
    expectedSha256: options.backupSha256,
  });
}

export function canonicalProjectionValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === 'string') {
    const asDate = new Date(value);
    if (
      /^\d{4}-\d{2}-\d{2}T|\d{4}-\d{2}-\d{2} /.test(value) &&
      !Number.isNaN(asDate.getTime())
    ) {
      return asDate.toISOString();
    }
    return value;
  }
  throw new Error('Ops/Admin baseline fingerprint failed');
}

export function encodeProjectionRow(row: ProjectionRow): string {
  return OPS_ADMIN_PROJECTION_CARTABLE_COLUMNS.map((column) =>
    canonicalProjectionValue(row[column]),
  ).join('\u001f');
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function fingerprintProjectionRows(
  rows: readonly ProjectionRow[],
): BaselineFingerprint {
  const byId = [...rows].sort((left, right) =>
    canonicalProjectionValue(left.id).localeCompare(
      canonicalProjectionValue(right.id),
    ),
  );
  const byCreated = [...rows].sort((left, right) => {
    const created = canonicalProjectionValue(left.createdAt).localeCompare(
      canonicalProjectionValue(right.createdAt),
    );
    if (created !== 0) return created;
    return canonicalProjectionValue(left.id).localeCompare(
      canonicalProjectionValue(right.id),
    );
  });
  return {
    count: String(rows.length),
    hashA: sha256Hex(byId.map(encodeProjectionRow).join('\n')),
    hashB: sha256Hex(byCreated.map(encodeProjectionRow).join('\n')),
  };
}

export function buildOpsAdminBaselineReport(
  mode: 'reconcile' | 'transfer',
  source: BaselineFingerprint,
  target: BaselineFingerprint,
): OpsAdminBaselineReport {
  const matches =
    source.count === target.count &&
    source.hashA === target.hashA &&
    source.hashB === target.hashB;
  return {
    status: matches ? 'PASS' : 'FAIL',
    mode,
    sourceCount: source.count,
    targetCount: target.count,
    sourceHashA: source.hashA,
    targetHashA: target.hashA,
    sourceHashB: source.hashB,
    targetHashB: target.hashB,
  };
}

export function serializeOpsAdminBaselineReport(
  report: OpsAdminBaselineReport,
): string {
  return JSON.stringify({
    status: report.status,
    mode: report.mode,
    sourceCount: report.sourceCount,
    targetCount: report.targetCount,
    sourceHashA: report.sourceHashA,
    targetHashA: report.targetHashA,
    sourceHashB: report.sourceHashB,
    targetHashB: report.targetHashB,
  });
}

function asProjectionRows(
  rows: Array<Record<string, unknown>>,
): ProjectionRow[] {
  return rows.map((row) => {
    const projected = {} as ProjectionRow;
    for (const column of OPS_ADMIN_PROJECTION_CARTABLE_COLUMNS) {
      projected[column] = row[column] ?? null;
    }
    return projected;
  });
}

async function tableColumns(
  client: SqlClient,
  tableName: string,
): Promise<string[]> {
  const result = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'ops' AND table_name = $1
     ORDER BY ordinal_position`,
    [tableName],
  );
  const columns = result.rows.map((row) => row.column_name);
  if (
    columns.length === 0 ||
    columns.some((value) => typeof value !== 'string')
  ) {
    throw new Error('Ops/Admin baseline cartable column contract is empty');
  }
  return columns as string[];
}

async function assertSourceCartable(client: SqlClient): Promise<void> {
  const columns = await tableColumns(client, 'cartable_tasks');
  for (const required of SOURCE_REQUIRED_COLUMNS) {
    if (!columns.includes(required)) {
      throw new Error(
        'Ops/Admin baseline source must be the Core cartable table',
      );
    }
  }
  if (columns.includes('taskVersion')) {
    throw new Error(
      'Ops/Admin baseline source must be the Core cartable table',
    );
  }
}

async function assertTargetCartable(client: SqlClient): Promise<void> {
  const columns = await tableColumns(client, 'cartable_tasks');
  const expected = new Set<string>(OPS_ADMIN_PROJECTION_CARTABLE_COLUMNS);
  if (
    columns.length !== expected.size ||
    columns.some((column) => !expected.has(column))
  ) {
    throw new Error('Ops/Admin baseline target column contract mismatch');
  }
  if (
    OPS_ADMIN_BASELINE_FORBIDDEN_SOURCE_COLUMNS.some((column) =>
      columns.includes(column),
    )
  ) {
    throw new Error('Ops/Admin baseline target column contract mismatch');
  }
}

async function assertPostgres16(client: SqlClient): Promise<void> {
  const result = await client.query(
    `SELECT current_setting('server_version_num')::int AS version`,
  );
  const version = result.rows[0]?.version;
  if (
    typeof version !== 'number' ||
    version < OPS_ADMIN_PROJECTION_MIN_SERVER_VERSION
  ) {
    throw new Error('Ops/Admin baseline requires PostgreSQL 16');
  }
}

async function assertAppliedMigrations(
  client: SqlClient,
  tableName: string,
): Promise<void> {
  const present = await client.query(
    `SELECT 1
     FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1`,
    [tableName],
  );
  if (present.rows.length === 0) {
    throw new Error('Ops/Admin baseline migrations are not applied');
  }
  const counted = await client.query(
    `SELECT count(*)::int AS count FROM ${identifier(tableName)}`,
  );
  if (typeof counted.rows[0]?.count !== 'number' || counted.rows[0].count < 1) {
    throw new Error('Ops/Admin baseline migrations are not applied');
  }
}

const SOURCE_SELECT = `SELECT
  id,
  "assigneeId",
  category::text AS category,
  "sourceType"::text AS "sourceType",
  "sourceId",
  status::text AS status,
  "resolvedAt",
  "readAt",
  version AS "taskVersion",
  NULL::text AS "auditId",
  NULL::text AS "fingerprint",
  "createdAt"
FROM ops.cartable_tasks`;

const TARGET_SELECT = `SELECT
  id,
  "assigneeId",
  category::text AS category,
  "sourceType"::text AS "sourceType",
  "sourceId",
  status::text AS status,
  "resolvedAt",
  "readAt",
  "taskVersion",
  "auditId",
  "fingerprint",
  "createdAt"
FROM ops.cartable_tasks`;

async function fingerprintSide(
  client: SqlClient,
  side: 'source' | 'target',
): Promise<BaselineFingerprint> {
  const result = await client.query(
    side === 'source' ? SOURCE_SELECT : TARGET_SELECT,
  );
  return fingerprintProjectionRows(asProjectionRows(result.rows));
}

async function copyCartable(
  source: SqlClient,
  target: SqlClient,
  batchSize: number,
): Promise<void> {
  const inserted = [
    'id',
    'assigneeId',
    'category',
    'sourceType',
    'sourceId',
    'status',
    'resolvedAt',
    'readAt',
    'taskVersion',
    'auditId',
    'fingerprint',
    'createdAt',
  ];
  const columnList = inserted.map(identifier).join(', ');
  for (let offset = 0; ; offset += batchSize) {
    const result = await source.query(
      `${SOURCE_SELECT} ORDER BY id LIMIT $1 OFFSET $2`,
      [batchSize, offset],
    );
    if (result.rows.length === 0) return;
    const values: unknown[] = [];
    const tuples = result.rows.map((row) => {
      const placeholders = inserted.map((column) => {
        values.push(row[column]);
        if (column === 'category') {
          return `$${values.length}::ops."CartableCategory"`;
        }
        if (column === 'sourceType') {
          return `$${values.length}::ops."CartableSourceType"`;
        }
        if (column === 'status') {
          return `$${values.length}::ops."CartableStatus"`;
        }
        return `$${values.length}`;
      });
      return `(${placeholders.join(', ')})`;
    });
    await target.query(
      `INSERT INTO ops.cartable_tasks (${columnList}) VALUES ${tuples.join(', ')}`,
      values,
    );
  }
}

export async function transferOpsAdminProjectionBaseline(options: {
  source: SqlClient;
  target: SqlClient;
  apply: boolean;
  batchSize: number;
  backupPath?: string;
  backupSha256?: string;
}): Promise<OpsAdminBaselineReport> {
  validateOpsAdminBaselineOptions(options);
  await options.source.query(
    'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY',
  );
  await options.target.query(
    options.apply ? 'BEGIN' : 'BEGIN TRANSACTION READ ONLY',
  );
  try {
    await assertPostgres16(options.source);
    await assertPostgres16(options.target);
    await assertAppliedMigrations(
      options.source,
      OPS_ADMIN_BASELINE_SOURCE_MIGRATIONS_TABLE,
    );
    await assertAppliedMigrations(
      options.target,
      OPS_ADMIN_BASELINE_TARGET_MIGRATIONS_TABLE,
    );
    await assertSourceCartable(options.source);
    await assertTargetCartable(options.target);
    const sourceFingerprint = await fingerprintSide(options.source, 'source');
    const targetBefore = await fingerprintSide(options.target, 'target');
    if (!options.apply) {
      const report = buildOpsAdminBaselineReport(
        'reconcile',
        sourceFingerprint,
        targetBefore,
      );
      await options.target.query('ROLLBACK');
      await options.source.query('ROLLBACK');
      return report;
    }
    if (targetBefore.count !== '0') {
      throw new Error('Ops/Admin baseline target must be empty');
    }
    await copyCartable(options.source, options.target, options.batchSize);
    const targetAfter = await fingerprintSide(options.target, 'target');
    const report = buildOpsAdminBaselineReport(
      'transfer',
      sourceFingerprint,
      targetAfter,
    );
    if (report.status !== 'PASS') {
      throw new Error('Ops/Admin baseline checksum mismatch');
    }
    await options.target.query('COMMIT');
    await options.source.query('ROLLBACK');
    return report;
  } catch (error) {
    await Promise.allSettled([
      options.target.query('ROLLBACK'),
      options.source.query('ROLLBACK'),
    ]);
    throw error;
  }
}

async function main(): Promise<void> {
  const sourceUrl = process.env.OPS_ADMIN_BASELINE_SOURCE_DATABASE_URL;
  const targetUrl = process.env.OPS_ADMIN_BASELINE_TARGET_DATABASE_URL;
  if (!sourceUrl || !targetUrl) {
    throw new Error('Ops/Admin baseline source and target URLs are required');
  }
  validateOpsAdminBaselineDatabaseUrls(sourceUrl, targetUrl);
  const apply = process.env.OPS_ADMIN_BASELINE_APPLY === 'true';
  const batchSize = Number(process.env.OPS_ADMIN_BASELINE_BATCH_SIZE ?? '100');
  const backupPath = process.env.OPS_ADMIN_BASELINE_BACKUP_PATH;
  const backupSha256 = process.env.OPS_ADMIN_BASELINE_BACKUP_SHA256;
  validateOpsAdminBaselineOptions({
    apply,
    batchSize,
    backupPath,
    backupSha256,
  });
  const source = new Client({ connectionString: sourceUrl });
  const target = new Client({ connectionString: targetUrl });
  await Promise.all([source.connect(), target.connect()]);
  try {
    const report = await transferOpsAdminProjectionBaseline({
      source,
      target,
      apply,
      batchSize,
      backupPath,
      backupSha256,
    });
    process.stdout.write(`${serializeOpsAdminBaselineReport(report)}\n`);
    if (report.status !== 'PASS') process.exitCode = 2;
  } finally {
    await Promise.allSettled([source.end(), target.end()]);
  }
}

if (require.main === module) {
  void main().catch(() => {
    process.stderr.write('Ops/Admin projection baseline transfer failed\n');
    process.exitCode = 1;
  });
}
