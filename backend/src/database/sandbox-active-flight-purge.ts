import 'dotenv/config';
import 'reflect-metadata';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { DataSource } from 'typeorm';
import { dataSourceOptions } from './data-source.options';
import { AuditLog } from './entities/audit-log.entity';
import type { Role } from './enums';
import {
  SANDBOX_FLIGHT_PURGE_ALL_CONFIRMATION,
  SANDBOX_FLIGHT_PURGE_CONFIRMATION,
  SANDBOX_FLIGHT_PURGE_FLAG,
  SANDBOX_FLIGHT_PURGE_TABLE_ORDER,
  assertSandboxPurgeEnvironmentAllowed,
  parseSandboxFlightPurgeArgs,
} from './sandbox-active-flight-purge-policy';

type CountRow = { count: string };
type IdRow = { id: string };

export interface SandboxFlightPurgeReport {
  mode: 'DRY_RUN' | 'SANDBOX_PURGE_EXECUTED';
  target: { flightNos: string[]; all: boolean };
  counts: {
    flights: number;
    instances: number;
    reservations: number;
    inventory: number;
    seatLocks: number;
    commitments: number;
  };
  flightIds: string[];
  sentinelPath?: string;
}

export interface SandboxFlightPurgeOptions {
  flightNos: string[];
  all: boolean;
  execute: boolean;
  /** Required when execute=true and at least one flight matches — the
   * AuditLog row's actorId (a real, active User). */
  actorId?: string;
  /** Test hook only — defaults to ./sandbox-purge-logs under cwd. */
  sentinelDir?: string;
}

async function resolveTargetFlightIds(
  dataSource: DataSource,
  opts: { flightNos: string[]; all: boolean },
): Promise<string[]> {
  if (opts.all) {
    const rows = await dataSource.query<IdRow[]>('SELECT "id" FROM "flights"');
    return rows.map((r) => r.id);
  }
  if (opts.flightNos.length === 0) return [];
  const rows = await dataSource.query<IdRow[]>(
    `SELECT "id" FROM "flights" WHERE "flightNo" = ANY($1)`,
    [opts.flightNos],
  );
  return rows.map((r) => r.id);
}

async function countWhere(
  dataSource: DataSource,
  table: string,
  column: string,
  ids: string[],
): Promise<number> {
  if (ids.length === 0) return 0;
  const [row] = await dataSource.query<CountRow[]>(
    `SELECT COUNT(*)::text AS count FROM "${table}" WHERE "${column}" = ANY($1)`,
    [ids],
  );
  return Number(row?.count ?? 0);
}

/**
 * Core, DB-touching purge logic — exported so tests (and the CLI wrapper
 * below) can call it directly against any DataSource. Always computes and
 * returns the full report first (the "dry-run is mandatory" contract: a
 * dry run and an execute run compute the identical report, execute only
 * additionally acts on it) and only ever deletes rows when `execute: true`
 * AND at least one flight actually matched — an empty/unmatched target is
 * a safe, idempotent no-op (matches calling this twice on the same
 * already-purged flightNo: the second call reports zero counts and
 * deletes nothing).
 */
export async function runSandboxActiveFlightPurge(
  dataSource: DataSource,
  opts: SandboxFlightPurgeOptions,
): Promise<SandboxFlightPurgeReport> {
  const flightIds = await resolveTargetFlightIds(dataSource, opts);
  const instanceRows = flightIds.length
    ? await dataSource.query<IdRow[]>(
        `SELECT "id" FROM "flight_instances" WHERE "flightId" = ANY($1)`,
        [flightIds],
      )
    : [];
  const instanceIds = instanceRows.map((r) => r.id);

  const [
    reservations,
    inventory,
    seatLocks,
    agencyCommitments,
    charterCommitments,
  ] = await Promise.all([
    countWhere(dataSource, 'bookings', 'flightInstanceId', instanceIds),
    countWhere(dataSource, 'cabin_fares', 'flightInstanceId', instanceIds),
    countWhere(dataSource, 'seat_locks', 'flightInstanceId', instanceIds),
    countWhere(
      dataSource,
      'agency_seat_commitments',
      'flightInstanceId',
      instanceIds,
    ),
    countWhere(
      dataSource,
      'charter_commitments',
      'flightInstanceId',
      instanceIds,
    ),
  ]);

  const report: SandboxFlightPurgeReport = {
    mode: opts.execute ? 'SANDBOX_PURGE_EXECUTED' : 'DRY_RUN',
    target: { flightNos: opts.flightNos, all: opts.all },
    counts: {
      flights: flightIds.length,
      instances: instanceIds.length,
      reservations,
      inventory,
      seatLocks,
      commitments: agencyCommitments + charterCommitments,
    },
    flightIds,
  };

  if (!opts.execute || flightIds.length === 0) {
    return report;
  }
  // Enforced here (not only in main()'s CLI wrapper) so any future caller
  // of this function — a script, a test, an admin endpoint — gets the same
  // safety guarantee regardless of whether it remembered to check first.
  assertSandboxPurgeEnvironmentAllowed(process.env);
  if (!opts.actorId) {
    throw new Error(
      'Sandbox active-flight purge refused: an actorId is required to execute (needed for the audit-log entry).',
    );
  }
  const [actorRow] = await dataSource.query<{ role: Role }[]>(
    `SELECT "role" FROM "users" WHERE "id" = $1`,
    [opts.actorId],
  );
  if (!actorRow) {
    throw new Error(
      `Sandbox active-flight purge refused: actorId "${opts.actorId}" does not match a real user.`,
    );
  }

  // Bound to bookings for the SET-NULL-only tables (ledger/wallet/club
  // points/customer-referrals) is deliberately never queried — those rows
  // are never deleted, only detached, so their ids don't matter here.
  const bookingRows = instanceIds.length
    ? await dataSource.query<IdRow[]>(
        `SELECT "id" FROM "bookings" WHERE "flightInstanceId" = ANY($1)`,
        [instanceIds],
      )
    : [];
  const bookingIds = bookingRows.map((r) => r.id);

  const runner = dataSource.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  try {
    for (const table of SANDBOX_FLIGHT_PURGE_TABLE_ORDER) {
      switch (table) {
        case 'survey_responses':
          if (bookingIds.length || instanceIds.length) {
            await runner.query(
              `DELETE FROM "survey_responses" WHERE "inviteId" IN (
                 SELECT "id" FROM "survey_invites"
                 WHERE "bookingId" = ANY($1) OR "flightInstanceId" = ANY($2)
               )`,
              [bookingIds, instanceIds],
            );
          }
          break;
        case 'survey_invites':
          if (bookingIds.length || instanceIds.length) {
            await runner.query(
              `DELETE FROM "survey_invites" WHERE "bookingId" = ANY($1) OR "flightInstanceId" = ANY($2)`,
              [bookingIds, instanceIds],
            );
          }
          break;
        case 'pay_idempotency_records':
        case 'payment_reconciliations':
        case 'promo_redemptions':
        case 'refund_requests':
          if (bookingIds.length) {
            await runner.query(
              `DELETE FROM "${table}" WHERE "bookingId" = ANY($1)`,
              [bookingIds],
            );
          }
          break;
        case 'seat_locks':
        case 'price_locks':
        case 'cabin_fares':
        case 'fare_rules':
        case 'fare_pricing_proposals':
        case 'flight_reviews':
        case 'agency_seat_commitments':
        case 'charter_commitments':
        case 'agency_allotments':
          if (instanceIds.length) {
            await runner.query(
              `DELETE FROM "${table}" WHERE "flightInstanceId" = ANY($1)`,
              [instanceIds],
            );
          }
          break;
        case 'bookings':
          if (instanceIds.length) {
            await runner.query(
              `DELETE FROM "bookings" WHERE "flightInstanceId" = ANY($1)`,
              [instanceIds],
            );
          }
          break;
        case 'flight_instances':
          if (instanceIds.length) {
            await runner.query(
              `DELETE FROM "flight_instances" WHERE "id" = ANY($1)`,
              [instanceIds],
            );
          }
          break;
        case 'schedules':
          await runner.query(
            `DELETE FROM "schedules" WHERE "flightId" = ANY($1)`,
            [flightIds],
          );
          break;
        case 'flights':
          await runner.query(`DELETE FROM "flights" WHERE "id" = ANY($1)`, [
            flightIds,
          ]);
          break;
      }
    }
    await runner.commitTransaction();
  } catch (error) {
    await runner.rollbackTransaction();
    throw error;
  } finally {
    await runner.release();
  }

  await dataSource.getRepository(AuditLog).save(
    dataSource.getRepository(AuditLog).create({
      actorId: opts.actorId,
      actorRole: actorRow.role,
      category: 'SYSTEM',
      action: 'پاکسازی داده‌های sandbox پروازهای فعال',
      detail: `پاکسازی ${report.counts.flights} پرواز و ${report.counts.instances} نمونهٔ پرواز در محیط sandbox — رزرو: ${report.counts.reservations}، اینونتوری: ${report.counts.inventory}، قفل صندلی: ${report.counts.seatLocks}، تعهد: ${report.counts.commitments}.`,
      entityType: 'Flight',
      entityId: flightIds[0] ?? null,
      metadata: {
        flightIds,
        target: report.target,
        counts: report.counts,
      },
    }),
  );

  const sentinelDir =
    opts.sentinelDir ?? path.join(process.cwd(), 'sandbox-purge-logs');
  fs.mkdirSync(sentinelDir, { recursive: true });
  const sentinelPath = path.join(
    sentinelDir,
    `sandbox-flight-purge-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  );
  fs.writeFileSync(
    sentinelPath,
    JSON.stringify(
      {
        ...report,
        actorId: opts.actorId,
        completedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  report.sentinelPath = sentinelPath;

  return report;
}

async function main() {
  const argv = process.argv.slice(2);
  const { flightNos, all, actorUsername } = parseSandboxFlightPurgeArgs(argv);
  const execute = argv.includes(SANDBOX_FLIGHT_PURGE_FLAG);

  if (!all && flightNos.length === 0) {
    throw new Error(
      'Sandbox active-flight purge refused: pass --flight-no=<CODE> (repeatable/comma-separated) or --all-flights.',
    );
  }

  const dataSource = new DataSource(dataSourceOptions);
  await dataSource.initialize();

  try {
    let actorId: string | undefined;
    if (execute) {
      assertSandboxPurgeEnvironmentAllowed(process.env);
      if (
        process.env.SANDBOX_FLIGHT_PURGE_CONFIRM !==
        SANDBOX_FLIGHT_PURGE_CONFIRMATION
      ) {
        throw new Error(
          `Sandbox active-flight purge refused: SANDBOX_FLIGHT_PURGE_CONFIRM must equal ${SANDBOX_FLIGHT_PURGE_CONFIRMATION}.`,
        );
      }
      if (
        all &&
        process.env.SANDBOX_FLIGHT_PURGE_ALL_CONFIRM !==
          SANDBOX_FLIGHT_PURGE_ALL_CONFIRMATION
      ) {
        throw new Error(
          `Sandbox active-flight purge refused: purging ALL flights additionally requires SANDBOX_FLIGHT_PURGE_ALL_CONFIRM to equal ${SANDBOX_FLIGHT_PURGE_ALL_CONFIRMATION}.`,
        );
      }
      if (!actorUsername) {
        throw new Error(
          'Sandbox active-flight purge refused: --actor=<username> is required to execute.',
        );
      }
      const [actorRow] = await dataSource.query<{ id: string }[]>(
        `SELECT "id" FROM "users" WHERE "username" = $1 AND "isActive" = true`,
        [actorUsername],
      );
      if (!actorRow) {
        throw new Error(
          `Sandbox active-flight purge refused: no active user found with username "${actorUsername}".`,
        );
      }
      actorId = actorRow.id;
    }

    const report = await runSandboxActiveFlightPurge(dataSource, {
      flightNos,
      all,
      execute,
      actorId,
    });
    console.log(JSON.stringify(report, null, 2));
    if (!execute) {
      console.log(
        `Dry run only. Use ${SANDBOX_FLIGHT_PURGE_FLAG} with every required safeguard to execute.`,
      );
    }
  } finally {
    await dataSource.destroy();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
