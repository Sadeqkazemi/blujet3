/**
 * Pure guard/parsing logic for the sandbox active-flight purge script
 * (src/database/sandbox-active-flight-purge.ts). Kept separate and
 * DB-free so it can be unit-tested without Postgres — same split as
 * uat-demo-data-purge-policy.ts.
 *
 * Deliberately the INVERSE safety gate of uat-demo-data-purge.ts /
 * uat-flight-catalog-cleanup.ts (which require NODE_ENV=production —
 * they reset a deployed UAT server). This script is for a local/CI
 * sandbox only: it must refuse to run anywhere NODE_ENV=production.
 */

export const SANDBOX_FLIGHT_PURGE_FLAG = '--execute-purge';
export const SANDBOX_FLIGHT_PURGE_ALL_FLAG = '--all-flights';
export const SANDBOX_FLIGHT_PURGE_CONFIRMATION =
  'PURGE_BLUJET_SANDBOX_ACTIVE_FLIGHTS';
export const SANDBOX_FLIGHT_PURGE_ALL_CONFIRMATION =
  'PURGE_ALL_BLUJET_SANDBOX_FLIGHTS';

export interface SandboxFlightPurgeArgs {
  flightNos: string[];
  all: boolean;
  actorUsername: string | null;
}

/** `--flight-no=IR101 --flight-no=IR102 --actor=it.admin` style parsing —
 * comma-separated values within one flag are also accepted. */
export function parseSandboxFlightPurgeArgs(
  argv: string[],
): SandboxFlightPurgeArgs {
  const flightNos = new Set<string>();
  let actorUsername: string | null = null;

  for (const arg of argv) {
    if (arg.startsWith('--flight-no=')) {
      const value = arg.slice('--flight-no='.length).trim();
      for (const code of value.split(',')) {
        const trimmed = code.trim();
        if (trimmed) flightNos.add(trimmed);
      }
    } else if (arg.startsWith('--actor=')) {
      actorUsername = arg.slice('--actor='.length).trim() || null;
    }
  }

  return {
    flightNos: [...flightNos],
    all: argv.includes(SANDBOX_FLIGHT_PURGE_ALL_FLAG),
    actorUsername,
  };
}

/** Throws with a specific, actionable message for the first violated
 * safety gate; returns silently when every environment gate passes.
 * Confirmation-phrase / actor / all-flights checks are the caller's
 * job (they need DB/args this module deliberately doesn't touch). */
export function assertSandboxPurgeEnvironmentAllowed(env: {
  NODE_ENV?: string;
  AUTH_SANDBOX_ENABLED?: string;
}): void {
  if (env.NODE_ENV === 'production') {
    throw new Error(
      'Sandbox active-flight purge refused: NODE_ENV must NOT equal production (this tool is for local/CI sandboxes only — see uat-demo-data-purge.ts for the production-server reset path).',
    );
  }
  if (env.AUTH_SANDBOX_ENABLED?.trim().toLowerCase() !== 'true') {
    throw new Error(
      'Sandbox active-flight purge refused: AUTH_SANDBOX_ENABLED must equal true.',
    );
  }
}

/** Tables deleted in this exact order, before flight_instances/flights
 * themselves — every RESTRICT-constrained dependent first, then the two
 * commitment tables that have NO DB-level FK at all (agency_seat_commitments/
 * charter_commitments — explicit deletion is the only thing that keeps them
 * from becoming silent orphans; see the FK audit in the PR's contract doc).
 * Ledger/wallet/club-points/customer-referral rows are intentionally never
 * deleted — CLAUDE.md requires the ledger stay immutable; their bookingId
 * FK is ON DELETE SET NULL, so they survive detached from the purged
 * booking, exactly like an already-cancelled booking's history today. */
export const SANDBOX_FLIGHT_PURGE_TABLE_ORDER = [
  'survey_responses',
  'survey_invites',
  'pay_idempotency_records',
  'payment_reconciliations',
  'promo_redemptions',
  'refund_requests',
  'seat_locks',
  'price_locks',
  'cabin_fares',
  'fare_rules',
  'fare_pricing_proposals',
  'agency_seat_commitments',
  'charter_commitments',
  'flight_reviews',
  'bookings',
  'agency_allotments',
  'flight_instances',
  'schedules',
  'flights',
] as const;
