import 'dotenv/config';
import { Client } from 'pg';
import type { IndependentDomain } from './provision-independent-domain-runtime-role';

export interface TransferDomainContract {
  domain: IndependentDomain;
  tables: readonly string[];
  sourceControlTables?: readonly string[];
  targetControlTables?: readonly string[];
  deferredSelfReference?: {
    table: string;
    keyColumn: string;
    referenceColumn: string;
  };
}

export interface TableFingerprint {
  table: string;
  count: string;
  hashA: string;
  hashB: string;
}

export interface DomainTransferReport {
  status: 'MATCH' | 'MISMATCH';
  mode: 'reconcile' | 'transfer';
  domain: IndependentDomain;
  tables: Array<{
    table: string;
    sourceCount: string;
    targetCount: string;
    sourceHashA: string;
    targetHashA: string;
    sourceHashB: string;
    targetHashB: string;
    status: 'MATCH' | 'MISMATCH';
  }>;
}

interface SqlClient {
  query(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: Array<Record<string, unknown>> }>;
}

const TRANSFER_CONTRACTS: Record<IndependentDomain, TransferDomainContract> = {
  notify: {
    domain: 'notify',
    tables: ['notifications', 'sms_logs'],
  },
  experience: {
    domain: 'experience',
    tables: [
      'contact_messages',
      'blog_posts',
      'stored_files',
      'site_content_blocks',
      'site_destination_highlights',
      'site_media_assets',
      'site_route_highlights',
      'careers_settings',
      'job_applications',
      'job_postings',
      'support_tickets',
      'survey_invites',
      'survey_questions',
      'survey_responses',
      'survey_settings',
    ],
  },
  identity: {
    domain: 'identity',
    tables: [
      'users',
      'refresh_tokens',
      'two_factor_challenges',
      'password_reset_events',
      'security_policy',
      'customer_identity_verifications',
    ],
    deferredSelfReference: {
      table: 'users',
      keyColumn: 'id',
      referenceColumn: 'createdById',
    },
  },
  loyalty: {
    domain: 'loyalty',
    tables: [
      'club_members',
      'club_points_entries',
      'club_card_requests',
      'club_tier_rules',
      'price_locks',
      'customer_referrals',
    ],
    sourceControlTables: ['loyalty_projection_audits'],
    targetControlTables: [
      'loyalty_projection_event_receipts',
      'loyalty_projection_slots',
    ],
  },
};

function identifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

export function transferDomainContract(
  value: string | undefined,
): TransferDomainContract {
  if (
    value !== 'notify' &&
    value !== 'experience' &&
    value !== 'identity' &&
    value !== 'loyalty'
  ) {
    throw new Error(
      'DOMAIN_TRANSFER_KIND must be notify, experience, identity or loyalty',
    );
  }
  return TRANSFER_CONTRACTS[value];
}

export function validateTransferDatabaseUrls(
  sourceUrl: string,
  targetUrl: string,
): void {
  const source = new URL(sourceUrl);
  const target = new URL(targetUrl);
  for (const url of [source, target]) {
    if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
      throw new Error('Domain transfer URLs must use PostgreSQL');
    }
  }
  const identity = (url: URL) =>
    `${url.hostname.toLowerCase()}:${url.port || '5432'}${url.pathname}`;
  if (identity(source) === identity(target)) {
    throw new Error(
      'Domain transfer source and target must be different databases',
    );
  }
}

export function validateTransferOptions(options: {
  apply: boolean;
  backupReference?: string;
  batchSize: number;
}): void {
  if (
    !Number.isInteger(options.batchSize) ||
    options.batchSize < 1 ||
    options.batchSize > 500
  ) {
    throw new Error(
      'DOMAIN_TRANSFER_BATCH_SIZE must be an integer from 1 to 500',
    );
  }
  if (!options.apply) return;
  if (
    !options.backupReference ||
    !/^[A-Za-z0-9][A-Za-z0-9._:/-]{7,255}$/.test(options.backupReference)
  ) {
    throw new Error(
      'DOMAIN_TRANSFER_BACKUP_REFERENCE is required in apply mode',
    );
  }
}

async function assertExactTables(
  client: SqlClient,
  contract: TransferDomainContract,
  side: 'source' | 'target',
): Promise<void> {
  const result = await client.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = $1 AND table_type = 'BASE TABLE'
     ORDER BY table_name`,
    [contract.domain],
  );
  const actual = result.rows.map((row) => row.table_name);
  validateDomainTableContract(contract, side, actual);
}

export function validateDomainTableContract(
  contract: TransferDomainContract,
  side: 'source' | 'target',
  actual: readonly unknown[],
): void {
  if (actual.some((value) => typeof value !== 'string')) {
    throw new Error(`${contract.domain} database table contract mismatch`);
  }
  const actualNames = actual as string[];
  const allowed = new Set([
    ...contract.tables,
    ...(side === 'source' ? (contract.sourceControlTables ?? []) : []),
    ...(side === 'target' ? (contract.targetControlTables ?? []) : []),
  ]);
  if (
    contract.tables.some((table) => !actualNames.includes(table)) ||
    actualNames.some((table) => !allowed.has(table))
  ) {
    throw new Error(`${contract.domain} database table contract mismatch`);
  }
}

async function fingerprintTable(
  client: SqlClient,
  contract: TransferDomainContract,
  table: string,
): Promise<TableFingerprint> {
  if (!contract.tables.includes(table)) {
    throw new Error('Table is outside the approved transfer contract');
  }
  const relation = `${identifier(contract.domain)}.${identifier(table)}`;
  const result = await client.query(`SELECT
      count(*)::text AS count,
      COALESCE(bit_xor(hashtextextended(row_to_json(row_value)::text, 0)), 0)::text AS "hashA",
      COALESCE(bit_xor(hashtextextended(row_to_json(row_value)::text, 1)), 0)::text AS "hashB"
    FROM ${relation} AS row_value`);
  const row = result.rows[0];
  if (
    !row ||
    typeof row.count !== 'string' ||
    typeof row.hashA !== 'string' ||
    typeof row.hashB !== 'string'
  ) {
    throw new Error(`${contract.domain}.${table} fingerprint failed`);
  }
  return { table, count: row.count, hashA: row.hashA, hashB: row.hashB };
}

async function fingerprintDomain(
  client: SqlClient,
  contract: TransferDomainContract,
): Promise<TableFingerprint[]> {
  const rows: TableFingerprint[] = [];
  for (const table of contract.tables) {
    rows.push(await fingerprintTable(client, contract, table));
  }
  return rows;
}

async function tableColumns(
  client: SqlClient,
  contract: TransferDomainContract,
  table: string,
): Promise<string[]> {
  const result = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position`,
    [contract.domain, table],
  );
  const columns = result.rows.map((row) => row.column_name);
  if (
    columns.length === 0 ||
    columns.some((value) => typeof value !== 'string')
  ) {
    throw new Error(`${contract.domain}.${table} column contract is empty`);
  }
  return columns as string[];
}

async function primaryKeyColumns(
  client: SqlClient,
  contract: TransferDomainContract,
  table: string,
): Promise<string[]> {
  const result = await client.query(
    `SELECT attribute.attname AS column_name
     FROM pg_index index_definition
     JOIN pg_class relation ON relation.oid = index_definition.indrelid
     JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
     JOIN unnest(index_definition.indkey) WITH ORDINALITY AS key(attnum, position) ON true
     JOIN pg_attribute attribute ON attribute.attrelid = relation.oid
       AND attribute.attnum = key.attnum
     WHERE namespace.nspname = $1 AND relation.relname = $2
       AND index_definition.indisprimary
     ORDER BY key.position`,
    [contract.domain, table],
  );
  const columns = result.rows.map((row) => row.column_name);
  if (
    columns.length === 0 ||
    columns.some((value) => typeof value !== 'string')
  ) {
    throw new Error(`${contract.domain}.${table} requires a primary key`);
  }
  return columns as string[];
}

async function copyTable(
  source: SqlClient,
  target: SqlClient,
  contract: TransferDomainContract,
  table: string,
  batchSize: number,
): Promise<void> {
  const columns = await tableColumns(source, contract, table);
  const targetColumns = await tableColumns(target, contract, table);
  if (JSON.stringify(columns) !== JSON.stringify(targetColumns)) {
    throw new Error(`${contract.domain}.${table} column contract mismatch`);
  }
  const primaryKey = await primaryKeyColumns(source, contract, table);
  const relation = `${identifier(contract.domain)}.${identifier(table)}`;
  const deferredReference =
    contract.deferredSelfReference?.table === table
      ? contract.deferredSelfReference
      : undefined;
  const insertedColumns = deferredReference
    ? columns.filter((column) => column !== deferredReference.referenceColumn)
    : columns;
  const selectedColumns = insertedColumns.map(identifier).join(', ');
  const order = primaryKey.map(identifier).join(', ');

  for (let offset = 0; ; offset += batchSize) {
    const result = await source.query(
      `SELECT ${selectedColumns} FROM ${relation}
       ORDER BY ${order} LIMIT $1 OFFSET $2`,
      [batchSize, offset],
    );
    if (result.rows.length === 0) return;

    const values: unknown[] = [];
    const tuples = result.rows.map((row) => {
      const placeholders = insertedColumns.map((column) => {
        values.push(row[column]);
        return `$${values.length}`;
      });
      return `(${placeholders.join(', ')})`;
    });
    await target.query(
      `INSERT INTO ${relation} (${selectedColumns}) VALUES ${tuples.join(', ')}`,
      values,
    );
  }
}

async function restoreDeferredSelfReference(
  source: SqlClient,
  target: SqlClient,
  contract: TransferDomainContract,
  batchSize: number,
): Promise<void> {
  const deferred = contract.deferredSelfReference;
  if (!deferred) return;
  if (!contract.tables.includes(deferred.table)) {
    throw new Error(
      'Deferred relation is outside the approved transfer contract',
    );
  }
  const relation = `${identifier(contract.domain)}.${identifier(deferred.table)}`;
  const key = identifier(deferred.keyColumn);
  const reference = identifier(deferred.referenceColumn);

  for (let offset = 0; ; offset += batchSize) {
    const result = await source.query(
      `SELECT ${key}, ${reference} FROM ${relation}
       WHERE ${reference} IS NOT NULL
       ORDER BY ${key} LIMIT $1 OFFSET $2`,
      [batchSize, offset],
    );
    if (result.rows.length === 0) return;

    const values: unknown[] = [];
    const tuples = result.rows.map((row) => {
      values.push(row[deferred.keyColumn], row[deferred.referenceColumn]);
      return `($${values.length - 1}::text, $${values.length}::text)`;
    });
    await target.query(
      `UPDATE ${relation} AS target
       SET ${reference} = deferred.${reference}
       FROM (VALUES ${tuples.join(', ')}) AS deferred(${key}, ${reference})
       WHERE target.${key} = deferred.${key}`,
      values,
    );
  }
}

function buildReport(
  contract: TransferDomainContract,
  mode: 'reconcile' | 'transfer',
  source: TableFingerprint[],
  target: TableFingerprint[],
): DomainTransferReport {
  const tables = source.map((sourceRow) => {
    const targetRow = target.find(
      (candidate) => candidate.table === sourceRow.table,
    );
    if (!targetRow) {
      throw new Error(`${contract.domain} reconciliation table is missing`);
    }
    const matches =
      sourceRow.count === targetRow.count &&
      sourceRow.hashA === targetRow.hashA &&
      sourceRow.hashB === targetRow.hashB;
    return {
      table: sourceRow.table,
      sourceCount: sourceRow.count,
      targetCount: targetRow.count,
      sourceHashA: sourceRow.hashA,
      targetHashA: targetRow.hashA,
      sourceHashB: sourceRow.hashB,
      targetHashB: targetRow.hashB,
      status: matches ? ('MATCH' as const) : ('MISMATCH' as const),
    };
  });
  return {
    status: tables.every((table) => table.status === 'MATCH')
      ? 'MATCH'
      : 'MISMATCH',
    mode,
    domain: contract.domain,
    tables,
  };
}

export async function transferIndependentDomainData(options: {
  source: SqlClient;
  target: SqlClient;
  contract: TransferDomainContract;
  apply: boolean;
  backupReference?: string;
  batchSize: number;
}): Promise<DomainTransferReport> {
  validateTransferOptions(options);
  await options.source.query(
    'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY',
  );
  await options.target.query(
    options.apply ? 'BEGIN' : 'BEGIN TRANSACTION READ ONLY',
  );
  try {
    await assertExactTables(options.source, options.contract, 'source');
    await assertExactTables(options.target, options.contract, 'target');
    const sourceBefore = await fingerprintDomain(
      options.source,
      options.contract,
    );
    const targetBefore = await fingerprintDomain(
      options.target,
      options.contract,
    );

    if (!options.apply) {
      const report = buildReport(
        options.contract,
        'reconcile',
        sourceBefore,
        targetBefore,
      );
      await options.target.query('ROLLBACK');
      await options.source.query('ROLLBACK');
      return report;
    }
    if (targetBefore.some((table) => table.count !== '0')) {
      throw new Error('Domain transfer target must be empty');
    }

    for (const table of options.contract.tables) {
      await copyTable(
        options.source,
        options.target,
        options.contract,
        table,
        options.batchSize,
      );
    }
    await restoreDeferredSelfReference(
      options.source,
      options.target,
      options.contract,
      options.batchSize,
    );
    const targetAfter = await fingerprintDomain(
      options.target,
      options.contract,
    );
    const report = buildReport(
      options.contract,
      'transfer',
      sourceBefore,
      targetAfter,
    );
    if (report.status !== 'MATCH') {
      throw new Error('Domain transfer reconciliation mismatch');
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
  const contract = transferDomainContract(process.env.DOMAIN_TRANSFER_KIND);
  const sourceUrl = process.env.DOMAIN_TRANSFER_SOURCE_DATABASE_URL;
  const targetUrl = process.env.DOMAIN_TRANSFER_TARGET_DATABASE_URL;
  if (!sourceUrl || !targetUrl) {
    throw new Error('Domain transfer source and target URLs are required');
  }
  validateTransferDatabaseUrls(sourceUrl, targetUrl);
  const apply = process.env.DOMAIN_TRANSFER_APPLY === 'true';
  const batchSize = Number(process.env.DOMAIN_TRANSFER_BATCH_SIZE ?? '100');
  const backupReference = process.env.DOMAIN_TRANSFER_BACKUP_REFERENCE;
  validateTransferOptions({ apply, backupReference, batchSize });

  const source = new Client({ connectionString: sourceUrl });
  const target = new Client({ connectionString: targetUrl });
  await Promise.all([source.connect(), target.connect()]);
  try {
    const report = await transferIndependentDomainData({
      source,
      target,
      contract,
      apply,
      backupReference,
      batchSize,
    });
    process.stdout.write(`${JSON.stringify(report)}\n`);
    if (report.status !== 'MATCH') process.exitCode = 2;
  } finally {
    await Promise.allSettled([source.end(), target.end()]);
  }
}

if (require.main === module) {
  void main().catch(() => {
    process.stderr.write('Independent domain transfer failed\n');
    process.exitCode = 1;
  });
}
