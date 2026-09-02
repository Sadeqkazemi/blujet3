import { randomInt } from 'node:crypto';
import { isSandboxAuthEnabled } from '../common/sandbox-auth';
import type { Role } from './enums';

export const TEMPORARY_PANEL_INITIAL_ACCESS_MS = 7 * 24 * 60 * 60 * 1000;
export const TEMPORARY_PANEL_EXTENSION_MS = 7 * 24 * 60 * 60 * 1000;
/** Owner-approved UAT ceiling after extension v3. This is deliberately wider
 * than the requested deadline so accounts created on different rollout dates
 * can all receive the same controlled seven-day continuation. Ordinary
 * accounts never use this path. */
export const TEMPORARY_PANEL_ACCESS_MAX_MS =
  TEMPORARY_PANEL_INITIAL_ACCESS_MS + 4 * TEMPORARY_PANEL_EXTENSION_MS;
export const TEMPORARY_PANEL_USERNAME_PREFIX = 'uat.';
export const TEMPORARY_PANEL_PASSWORD_LENGTH = 16;
const TEMPORARY_PANEL_PASSWORD_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** Username-login temporary accounts — every role that authenticates via
 * `/auth/staff/login` (username + password). */
export const TEMPORARY_PANEL_ACCOUNTS = [
  { username: 'uat.siteadmin', role: 'SITE_ADMIN', fullName: 'UAT Site Admin' },
  { username: 'uat.it', role: 'IT_MANAGER', fullName: 'UAT IT Manager' },
  {
    username: 'uat.commercial',
    role: 'COMMERCIAL_MANAGER',
    fullName: 'UAT Commercial Manager',
  },
  {
    username: 'uat.operations',
    role: 'OPERATIONS_MANAGER',
    fullName: 'UAT Operations Manager',
  },
  {
    username: 'uat.finance',
    role: 'FINANCE_MANAGER',
    fullName: 'UAT Finance Manager',
  },
  {
    username: 'uat.senior',
    role: 'SENIOR_MANAGER',
    fullName: 'UAT Senior Manager',
  },
  { username: 'uat.ceo', role: 'CEO', fullName: 'UAT CEO' },
  {
    username: 'uat.chair',
    role: 'BOARD_CHAIR',
    fullName: 'UAT Board Chair',
  },
  {
    username: 'uat.employee',
    role: 'EMPLOYEE',
    fullName: 'UAT Employee',
    // A real catalog dept so panel nav/permission-scoping code paths behave
    // exactly like a real employee account instead of hitting a null-dept
    // edge case that only a synthetic UAT row could ever produce.
    dept: 'commercial',
  },
] as const satisfies ReadonlyArray<{
  username: string;
  role: Role;
  fullName: string;
  dept?: string;
}>;

/** Phone-login temporary accounts — AGENCY (`/auth/agency/login`) and USER
 * (`/auth/customer/login-password`) authenticate by phone, not username;
 * `username` is kept only for audit/display and UAT-purge-policy matching.
 * The `09000000xxx` block is a reserved, obviously-synthetic range, but
 * bootstrap still refuses if either number is already a real account's
 * phone — see `bootstrap-temporary-panel-accounts.ts`. */
export const TEMPORARY_PHONE_LOGIN_ACCOUNTS = [
  {
    username: 'uat.agency',
    role: 'AGENCY',
    fullName: 'UAT Agency',
    phone: '09000000001',
  },
  {
    username: 'uat.customer',
    role: 'USER',
    fullName: 'UAT Customer',
    phone: '09000000002',
  },
] as const satisfies ReadonlyArray<{
  username: string;
  role: Role;
  fullName: string;
  phone: string;
}>;

const temporaryUsernames = new Set<string>([
  ...TEMPORARY_PANEL_ACCOUNTS.map(({ username }) => username),
  ...TEMPORARY_PHONE_LOGIN_ACCOUNTS.map(({ username }) => username),
]);

export function isTemporaryPanelUsername(username: string | null): boolean {
  return username !== null && temporaryUsernames.has(username.toLowerCase());
}

export interface TemporaryPanelAccessUser {
  username: string | null;
  twoFactorEnabled: boolean;
  createdAt: Date;
  temporaryPasswordOnlyUntil: Date | null;
}

export type TemporaryPanelAccessState =
  'NONE' | 'ACTIVE' | 'EXPIRED' | 'INVALID';

export function getTemporaryPanelAccessState(
  user: TemporaryPanelAccessUser,
  now = new Date(),
): TemporaryPanelAccessState {
  const deadline = user.temporaryPasswordOnlyUntil;
  if (deadline === null) return 'NONE';
  if (
    user.username === null ||
    !isTemporaryPanelUsername(user.username) ||
    user.twoFactorEnabled ||
    deadline.getTime() >
      user.createdAt.getTime() + TEMPORARY_PANEL_ACCESS_MAX_MS
  ) {
    return 'INVALID';
  }
  return deadline.getTime() > now.getTime() ? 'ACTIVE' : 'EXPIRED';
}

export function createTemporaryPanelExpiry(now = new Date()): Date {
  return new Date(now.getTime() + TEMPORARY_PANEL_INITIAL_ACCESS_MS);
}

/** Extension v2 adds seven days to an active deadline. If the account has
 * already expired, it grants a fresh seven-day window from execution time.
 * The absolute ceiling keeps malformed/manual deadlines fail-closed. */
export function createTemporaryPanelV2ExtensionExpiry(
  createdAt: Date,
  previousExpiresAt: Date,
  now = new Date(),
): Date {
  const extensionBase =
    previousExpiresAt.getTime() > now.getTime() ? previousExpiresAt : now;
  const requestedDeadline = new Date(
    extensionBase.getTime() + TEMPORARY_PANEL_EXTENSION_MS,
  );
  const absoluteCeiling = new Date(
    createdAt.getTime() + TEMPORARY_PANEL_ACCESS_MAX_MS,
  );
  return requestedDeadline < absoluteCeiling
    ? requestedDeadline
    : absoluteCeiling;
}

export interface UatSandboxAgencyCandidate extends TemporaryPanelAccessUser {
  role: Role;
}

/** Centralized detection for an active UAT sandbox AGENCY identity. The
 * agency portal additionally checks whether the audited commerce provisioner
 * has created its synthetic AgencyProfile; until then it stays read-only.
 * Never true outside AUTH_SANDBOX_ENABLED or after temporary access expires. */
export function isActiveUatSandboxAgency(
  user: UatSandboxAgencyCandidate,
  now = new Date(),
): boolean {
  return (
    user.role === 'AGENCY' &&
    isSandboxAuthEnabled() &&
    getTemporaryPanelAccessState(user, now) === 'ACTIVE'
  );
}

/** Still used by `bootstrap-owner-super-admin.ts` for the real owner
 * account's one-time password — that script is out of scope for the UAT
 * shared-password feature and keeps generating its own random value. Not
 * used by the temporary-panel bootstrap/rotation scripts anymore; those now
 * read one shared password from `UAT_PANEL_SHARED_PASSWORD` instead. */
export function generateTemporaryPanelPassword(): string {
  return Array.from(
    { length: TEMPORARY_PANEL_PASSWORD_LENGTH },
    () =>
      TEMPORARY_PANEL_PASSWORD_ALPHABET[
        randomInt(TEMPORARY_PANEL_PASSWORD_ALPHABET.length)
      ],
  ).join('');
}
