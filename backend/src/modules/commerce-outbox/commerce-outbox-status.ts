import { DataSource } from 'typeorm';
import { COMMERCE_OUTBOX_LEASE_MS } from './commerce-outbox.constants';

export interface CommerceOutboxStatus {
  reportVersion: 1;
  capturedAt: string;
  dispatchConfiguredEnabled: boolean;
  status: 'IDLE' | 'PENDING' | 'PAUSED' | 'ATTENTION';
  counts: Record<
    | 'pending'
    | 'ready'
    | 'scheduled'
    | 'inFlight'
    | 'expiredLease'
    | 'quarantined',
    string
  >;
  oldestPendingAgeSeconds: string | null;
}

// Read only metadata: no entity hydration or encrypted-envelope access.
const STATUS_SQL = `WITH snapshot AS (
  SELECT transaction_timestamp() AT TIME ZONE 'UTC' AS now
), active AS (
  SELECT "createdAt", "nextAttemptAt", "claimedAt", "deadLetterAt"
  FROM orders.commerce_outbox_events WHERE "deliveredAt" IS NULL
), counts AS (
  SELECT
    (count(*) FILTER (WHERE "deadLetterAt" IS NULL))::text AS pending,
    (count(*) FILTER (WHERE "deadLetterAt" IS NULL AND "claimedAt" IS NULL AND "nextAttemptAt" <= snapshot.now))::text AS ready,
    (count(*) FILTER (WHERE "deadLetterAt" IS NULL AND "claimedAt" IS NULL AND "nextAttemptAt" > snapshot.now))::text AS scheduled,
    (count(*) FILTER (WHERE "deadLetterAt" IS NULL AND "claimedAt" >= snapshot.now - $1 * interval '1 millisecond'))::text AS "inFlight",
    (count(*) FILTER (WHERE "deadLetterAt" IS NULL AND "claimedAt" < snapshot.now - $1 * interval '1 millisecond'))::text AS "expiredLease",
    (count(*) FILTER (WHERE "deadLetterAt" IS NOT NULL))::text AS quarantined,
    min("createdAt") FILTER (WHERE "deadLetterAt" IS NULL) AS oldest
  FROM active CROSS JOIN snapshot
)
SELECT to_char(snapshot.now, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "capturedAt",
  pending, ready, scheduled, "inFlight", "expiredLease", quarantined,
  CASE WHEN oldest IS NULL THEN NULL ELSE
    floor(greatest(0, extract(epoch FROM snapshot.now - oldest)))::text END AS "oldestPendingAgeSeconds"
FROM counts CROSS JOIN snapshot`;

export async function readCommerceOutboxStatus(
  db: DataSource,
  dispatchConfiguredEnabled: boolean,
): Promise<CommerceOutboxStatus> {
  const runner = db.createQueryRunner();
  try {
    await runner.connect();
    await runner.startTransaction();
    await runner.query('SET TRANSACTION READ ONLY');
    await runner.query("SET LOCAL statement_timeout = '2000ms'");
    await runner.query("SET LOCAL lock_timeout = '2000ms'");
    const rows: unknown = await runner.query(STATUS_SQL, [
      COMMERCE_OUTBOX_LEASE_MS,
    ]);
    const report = parseSnapshot(rows, dispatchConfiguredEnabled);
    await runner.commitTransaction();
    return report;
  } catch (error) {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    throw error;
  } finally {
    await runner.release();
  }
}

function parseSnapshot(
  rows: unknown,
  dispatchConfiguredEnabled: boolean,
): CommerceOutboxStatus {
  if (
    !Array.isArray(rows) ||
    rows.length !== 1 ||
    !rows[0] ||
    typeof rows[0] !== 'object'
  )
    throw new Error('Invalid outbox snapshot');
  const row = rows[0] as Record<string, unknown>;
  const count = (key: string): string => {
    const value = row[key];
    if (typeof value !== 'string' || !/^(0|[1-9]\d{0,19})$/.test(value))
      throw new Error('Invalid outbox count');
    return value;
  };
  const counts = {
    pending: count('pending'),
    ready: count('ready'),
    scheduled: count('scheduled'),
    inFlight: count('inFlight'),
    expiredLease: count('expiredLease'),
    quarantined: count('quarantined'),
  };
  if (
    BigInt(counts.pending) !==
    BigInt(counts.ready) +
      BigInt(counts.scheduled) +
      BigInt(counts.inFlight) +
      BigInt(counts.expiredLease)
  )
    throw new Error('Inconsistent outbox counts');
  const capturedAt = row.capturedAt;
  if (
    typeof capturedAt !== 'string' ||
    Number.isNaN(Date.parse(capturedAt)) ||
    new Date(capturedAt).toISOString() !== capturedAt
  )
    throw new Error('Invalid outbox time');
  const oldestPendingAgeSeconds =
    row.oldestPendingAgeSeconds === null
      ? null
      : count('oldestPendingAgeSeconds');
  if ((counts.pending === '0') !== (oldestPendingAgeSeconds === null))
    throw new Error('Inconsistent outbox age');
  const status =
    counts.quarantined !== '0' || counts.expiredLease !== '0'
      ? 'ATTENTION'
      : counts.pending === '0'
        ? 'IDLE'
        : dispatchConfiguredEnabled
          ? 'PENDING'
          : 'PAUSED';
  return {
    reportVersion: 1,
    capturedAt,
    dispatchConfiguredEnabled,
    status,
    counts,
    oldestPendingAgeSeconds,
  };
}
