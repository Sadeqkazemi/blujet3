import type { BankLoanStatus } from '../../database/enums';

/** Terminal statuses that must not be rolled back by older events. */
const TERMINAL: ReadonlySet<BankLoanStatus> = new Set([
  'DISBURSED',
  'REJECTED',
  'CANCELLED',
]);

const RANK: Record<BankLoanStatus, number> = {
  INITIATING: 5,
  SUBMITTED: 10,
  PENDING: 20,
  UNDER_REVIEW: 30,
  APPROVED: 40,
  DISBURSED: 50,
  REJECTED: 50,
  CANCELLED: 50,
  FAILED: 45,
  UNKNOWN: 0,
};

/**
 * Returns true when applying `next` over `current` is allowed.
 * Same status is always allowed (idempotent refresh).
 */
export function canTransitionBankStatus(
  current: BankLoanStatus,
  next: BankLoanStatus,
): boolean {
  if (current === next) return true;
  if (TERMINAL.has(current) && next !== current) return false;
  // Do not move from a higher-ranked non-terminal to a lower one
  // (except UNKNOWN which never overwrites a known state).
  if (next === 'UNKNOWN') return false;
  if (current === 'UNKNOWN') return true;
  return RANK[next] >= RANK[current];
}
