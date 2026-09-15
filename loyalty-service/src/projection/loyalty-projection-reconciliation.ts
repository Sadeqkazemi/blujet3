import type { DataSource, EntityManager } from 'typeorm';

export const LOYALTY_RECONCILIATION_MAX_LIMIT = 1_000_000;
export const LOYALTY_BUSINESS_TABLES = [
  'club_members',
  'club_points_entries',
  'club_card_requests',
  'club_tier_rules',
  'price_locks',
  'customer_referrals',
] as const;

type Fingerprint = {
  table: (typeof LOYALTY_BUSINESS_TABLES)[number];
  count: string;
  hashA: string | null;
  hashB: string | null;
  bounded: boolean;
};

export type LoyaltyReconciliationReport = {
  status: 'MATCH' | 'MISMATCH' | 'INCONCLUSIVE';
  capturedAt: string;
  limit: number;
  tables: Array<{
    table: Fingerprint['table'];
    sourceCount: string;
    projectionCount: string;
    sourceHashA: string | null;
    projectionHashA: string | null;
    sourceHashB: string | null;
    projectionHashB: string | null;
    status: 'MATCH' | 'MISMATCH' | 'INCONCLUSIVE';
  }>;
};

function assertLimit(limit: number): void {
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > LOYALTY_RECONCILIATION_MAX_LIMIT
  ) {
    throw new Error(
      `Loyalty reconciliation limit must be 1-${LOYALTY_RECONCILIATION_MAX_LIMIT}`,
    );
  }
}

async function fingerprint(
  manager: EntityManager,
  table: Fingerprint['table'],
  limit: number,
): Promise<Fingerprint> {
  const counts = await manager.query<Array<{ count: string }>>(
    `SELECT COUNT(*)::text AS count FROM "loyalty"."${table}"`,
  );
  const count = counts[0]?.count;
  if (typeof count !== 'string') {
    throw new Error(`Loyalty ${table} count unavailable`);
  }
  if (BigInt(count) > BigInt(limit)) {
    return { table, count, hashA: null, hashB: null, bounded: false };
  }
  const rows = await manager.query<
    Array<{ hashA: string; hashB: string }>
  >(`SELECT
      COALESCE(bit_xor(hashtextextended(to_jsonb(row_value)::text, 0)), 0)::text AS "hashA",
      COALESCE(bit_xor(hashtextextended(to_jsonb(row_value)::text, 1)), 0)::text AS "hashB"
    FROM "loyalty"."${table}" AS row_value`);
  const row = rows[0];
  if (!row || typeof row.hashA !== 'string' || typeof row.hashB !== 'string') {
    throw new Error(`Loyalty ${table} fingerprint unavailable`);
  }
  return { table, count, hashA: row.hashA, hashB: row.hashB, bounded: true };
}

function databaseFingerprints(
  manager: EntityManager,
  limit: number,
): Promise<Fingerprint[]> {
  return (async () => {
    const rows: Fingerprint[] = [];
    for (const table of LOYALTY_BUSINESS_TABLES) {
      rows.push(await fingerprint(manager, table, limit));
    }
    return rows;
  })();
}

export async function reconcileLoyaltyProjectionManagers(
  source: EntityManager,
  projection: EntityManager,
  limit: number,
): Promise<LoyaltyReconciliationReport> {
  assertLimit(limit);
  const [sourceRows, projectionRows] = await Promise.all([
    databaseFingerprints(source, limit),
    databaseFingerprints(projection, limit),
  ]);
  const tables = sourceRows.map((sourceRow, index) => {
    const projectionRow = projectionRows[index];
    if (!projectionRow || projectionRow.table !== sourceRow.table) {
      throw new Error('Loyalty reconciliation table contract mismatch');
    }
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

export async function reconcileLoyaltyProjection(
  source: DataSource,
  projection: DataSource,
  limit: number,
): Promise<LoyaltyReconciliationReport> {
  assertLimit(limit);
  return source.transaction('REPEATABLE READ', async (sourceManager) => {
    await sourceManager.query('SET TRANSACTION READ ONLY');
    await sourceManager.query("SET LOCAL TIME ZONE 'UTC'");
    return projection.transaction('REPEATABLE READ', async (targetManager) => {
      await targetManager.query('SET TRANSACTION READ ONLY');
      await targetManager.query("SET LOCAL TIME ZONE 'UTC'");
      return reconcileLoyaltyProjectionManagers(
        sourceManager,
        targetManager,
        limit,
      );
    });
  });
}
