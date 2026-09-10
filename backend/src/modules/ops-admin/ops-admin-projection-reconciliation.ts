import type { DataSource } from 'typeorm';

const MAX_LIMIT = 10_000;

type ProjectionRow = {
  id: string;
  assigneeId: string;
  category: string;
  sourceType: string | null;
  sourceId: string | null;
  status: string;
  resolvedAt: Date | null;
  readAt: Date | null;
  createdAt: Date;
  taskVersion: number | null;
  auditId: string | null;
};

export type OpsAdminReconciliationReport = {
  status: 'MATCH' | 'MISMATCH' | 'INCONCLUSIVE';
  capturedAt: string;
  limit: number;
  sourceCount: string;
  projectionCount: string;
  scannedSource: number;
  scannedProjection: number;
  missing: number;
  unexpected: number;
  stale: number;
  divergent: number;
};

function positiveLimit(limit: number): void {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new Error(`Ops/Admin reconciliation limit must be 1-${MAX_LIMIT}`);
  }
}

function comparable(row: ProjectionRow): string {
  return JSON.stringify({
    assigneeId: row.assigneeId,
    category: row.category,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    status: row.status,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    auditId: row.auditId,
  });
}

async function count(dataSource: DataSource): Promise<bigint> {
  const rows = await dataSource.query<Array<{ count: string }>>(
    'SELECT COUNT(*)::text AS count FROM ops.cartable_tasks',
  );
  return BigInt(rows[0]?.count ?? '0');
}

async function sourceRows(
  dataSource: DataSource,
  limit: number,
): Promise<ProjectionRow[]> {
  return dataSource.query<ProjectionRow[]>(
    `SELECT task.id, task."assigneeId", task.category::text AS category,
       task."sourceType"::text AS "sourceType", task."sourceId",
       task.status::text AS status, task."resolvedAt", task."readAt",
       task."createdAt", task.version AS "taskVersion", audit.id AS "auditId"
     FROM ops.cartable_tasks task
     LEFT JOIN ops.cartable_projection_audits audit
       ON audit."taskId" = task.id AND audit."taskVersion" = task.version
     ORDER BY task.id ASC
     LIMIT $1`,
    [limit],
  );
}

async function projectionRows(
  dataSource: DataSource,
  limit: number,
): Promise<ProjectionRow[]> {
  return dataSource.query<ProjectionRow[]>(
    `SELECT id, "assigneeId", category::text AS category,
       "sourceType"::text AS "sourceType", "sourceId", status::text AS status,
       "resolvedAt", "readAt", "createdAt", "taskVersion", "auditId"
     FROM ops.cartable_tasks
     ORDER BY id ASC
     LIMIT $1`,
    [limit],
  );
}

export async function reconcileOpsAdminProjection(
  source: DataSource,
  projection: DataSource,
  limit: number,
): Promise<OpsAdminReconciliationReport> {
  positiveLimit(limit);
  const [sourceCount, projectionCount, sourceSample, projectionSample] =
    await Promise.all([
      count(source),
      count(projection),
      sourceRows(source, limit),
      projectionRows(projection, limit),
    ]);
  const sourceById = new Map(sourceSample.map((row) => [row.id, row]));
  const projectionById = new Map(projectionSample.map((row) => [row.id, row]));
  let missing = 0;
  let unexpected = 0;
  let stale = 0;
  let divergent = 0;
  for (const [id, expected] of sourceById) {
    const actual = projectionById.get(id);
    if (!actual) {
      missing += 1;
      continue;
    }
    if (
      actual.taskVersion === null ||
      (expected.taskVersion !== null &&
        actual.taskVersion < expected.taskVersion)
    ) {
      stale += 1;
      continue;
    }
    if (actual.taskVersion !== expected.taskVersion) {
      divergent += 1;
      continue;
    }
    if (comparable(actual) !== comparable(expected)) divergent += 1;
  }
  for (const id of projectionById.keys()) {
    if (!sourceById.has(id)) unexpected += 1;
  }
  const mismatch = missing + unexpected + stale + divergent > 0;
  const truncated =
    sourceCount > BigInt(limit) || projectionCount > BigInt(limit);
  return {
    status: mismatch ? 'MISMATCH' : truncated ? 'INCONCLUSIVE' : 'MATCH',
    capturedAt: new Date().toISOString(),
    limit,
    sourceCount: sourceCount.toString(),
    projectionCount: projectionCount.toString(),
    scannedSource: sourceSample.length,
    scannedProjection: projectionSample.length,
    missing,
    unexpected,
    stale,
    divergent,
  };
}
