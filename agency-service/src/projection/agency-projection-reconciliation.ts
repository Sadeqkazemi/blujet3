import type { DataSource, EntityManager } from 'typeorm';

const MAX_LIMIT = 1_000_000;
export const AGENCY_BUSINESS_TABLES = [
  'agency_profiles',
  'agency_invoices',
  'agency_credit_requests',
] as const;

export type AgencyBusinessTable = (typeof AGENCY_BUSINESS_TABLES)[number];

export type AgencyTableFingerprint = {
  table: AgencyBusinessTable;
  count: string;
  hashA: string | null;
  hashB: string | null;
  bounded: boolean;
};

export type AgencyReconciliationReport = {
  status: 'MATCH' | 'MISMATCH' | 'INCONCLUSIVE';
  capturedAt: string;
  limit: number;
  tables: Array<{
    table: AgencyBusinessTable;
    sourceCount: string;
    projectionCount: string;
    sourceHashA: string | null;
    projectionHashA: string | null;
    sourceHashB: string | null;
    projectionHashB: string | null;
    status: 'MATCH' | 'MISMATCH' | 'INCONCLUSIVE';
  }>;
};

export function agencyTableCountSql(table: AgencyBusinessTable): string {
  return `SELECT COUNT(*)::text AS count FROM "agency"."${table}"`;
}

export function agencyTableFingerprintSql(table: AgencyBusinessTable): string {
  return `SELECT
      COALESCE(bit_xor(hashtextextended(to_jsonb(row_value)::text, 0)), 0)::text AS "hashA",
      COALESCE(bit_xor(hashtextextended(to_jsonb(row_value)::text, 1)), 0)::text AS "hashB"
    FROM "agency"."${table}" AS row_value`;
}

export function assertAgencyReconciliationLimit(limit: number): void {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LIMIT)
    throw new Error(`Agency reconciliation limit must be 1-${MAX_LIMIT}`);
}

export async function fingerprintAgencyBusinessTable(
  queryRows: (text: string) => Promise<Array<Record<string, unknown>>>,
  table: AgencyBusinessTable,
  limit: number,
): Promise<AgencyTableFingerprint> {
  const counts = await queryRows(agencyTableCountSql(table));
  const count = counts[0]?.count;
  if (typeof count !== 'string')
    throw new Error(`Agency ${table} count unavailable`);
  if (BigInt(count) > BigInt(limit))
    return { table, count, hashA: null, hashB: null, bounded: false };
  const rows = await queryRows(agencyTableFingerprintSql(table));
  const row = rows[0];
  if (!row || typeof row.hashA !== 'string' || typeof row.hashB !== 'string')
    throw new Error(`Agency ${table} fingerprint unavailable`);
  return { table, count, hashA: row.hashA, hashB: row.hashB, bounded: true };
}

export async function fingerprintAgencyBusinessTables(
  queryRows: (text: string) => Promise<Array<Record<string, unknown>>>,
  limit: number,
): Promise<AgencyTableFingerprint[]> {
  const fingerprints: AgencyTableFingerprint[] = [];
  for (const table of AGENCY_BUSINESS_TABLES)
    fingerprints.push(
      await fingerprintAgencyBusinessTable(queryRows, table, limit),
    );
  return fingerprints;
}

export function compareAgencyTableFingerprints(
  sourceRows: readonly AgencyTableFingerprint[],
  projectionRows: readonly AgencyTableFingerprint[],
): AgencyReconciliationReport['tables'] {
  return sourceRows.map((sourceRow, index) => {
    const projectionRow = projectionRows[index];
    if (!projectionRow || projectionRow.table !== sourceRow.table)
      throw new Error('Agency reconciliation table contract mismatch');
    const bounded = sourceRow.bounded && projectionRow.bounded;
    const matches =
      bounded &&
      sourceRow.count === projectionRow.count &&
      sourceRow.hashA === projectionRow.hashA &&
      sourceRow.hashB === projectionRow.hashB;
    return {
      table: sourceRow.table,
      sourceCount: sourceRow.count,
      projectionCount: projectionRow.count,
      sourceHashA: sourceRow.hashA,
      projectionHashA: projectionRow.hashA,
      sourceHashB: sourceRow.hashB,
      projectionHashB: projectionRow.hashB,
      status: bounded
        ? matches
          ? ('MATCH' as const)
          : ('MISMATCH' as const)
        : ('INCONCLUSIVE' as const),
    };
  });
}

function databaseFingerprints(
  dataSource: DataSource,
  limit: number,
): Promise<AgencyTableFingerprint[]> {
  return dataSource.transaction('REPEATABLE READ', async (manager) => {
    await manager.query('SET TRANSACTION READ ONLY');
    await manager.query("SET LOCAL TIME ZONE 'UTC'");
    return fingerprintAgencyBusinessTables(
      (text) => queryTypeormRows(manager, text),
      limit,
    );
  });
}

async function queryTypeormRows(
  manager: EntityManager,
  text: string,
): Promise<Array<Record<string, unknown>>> {
  const rows: unknown = await manager.query(text);
  if (!Array.isArray(rows))
    throw new Error('Agency reconciliation query is invalid');
  return rows as Array<Record<string, unknown>>;
}

export async function reconcileAgencyProjection(
  source: DataSource,
  projection: DataSource,
  limit: number,
): Promise<AgencyReconciliationReport> {
  assertAgencyReconciliationLimit(limit);
  const [sourceRows, projectionRows] = await Promise.all([
    databaseFingerprints(source, limit),
    databaseFingerprints(projection, limit),
  ]);
  const tables = compareAgencyTableFingerprints(sourceRows, projectionRows);
  const status = tables.some((table) => table.status === 'MISMATCH')
    ? 'MISMATCH'
    : tables.some((table) => table.status === 'INCONCLUSIVE')
      ? 'INCONCLUSIVE'
      : 'MATCH';
  return {
    status,
    capturedAt: new Date().toISOString(),
    limit,
    tables,
  };
}
