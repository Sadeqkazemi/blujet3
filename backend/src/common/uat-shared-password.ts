import { isSandboxAuthEnabled } from './sandbox-auth';
import {
  STRONG_PASSWORD_MESSAGE,
  isStrongPassword,
} from './validators/strong-password.validator';

export const UAT_PANEL_SHARED_PASSWORD_ENV_VAR = 'UAT_PANEL_SHARED_PASSWORD';

/** Every UAT temporary-account bootstrap/rotation entry point must call this
 * before touching the database. Refuses outside a sandbox-flagged
 * environment so the shared password can never be provisioned against a real
 * production deployment by accident (CLAUDE.md ⚑ non-negotiable). */
export function assertUatSandboxWriteAllowed(): void {
  if (!isSandboxAuthEnabled()) {
    throw new Error(
      'Refused: AUTH_SANDBOX_ENABLED must be true to bootstrap or rotate UAT shared-password accounts.',
    );
  }
}

/** Resolves and validates the one shared password every UAT temporary
 * account is hashed with. Never returns a fallback/default — an unset,
 * empty, or weak value always throws. The returned value must only ever be
 * passed to argon2.hash(); it must never be logged, included in an audit
 * detail string, an error message, or a script's stdout JSON. */
export function resolveUatSharedPassword(): string {
  assertUatSandboxWriteAllowed();

  const raw = process.env[UAT_PANEL_SHARED_PASSWORD_ENV_VAR];
  if (!raw || !raw.trim()) {
    throw new Error(
      `Refused: ${UAT_PANEL_SHARED_PASSWORD_ENV_VAR} is not set or empty.`,
    );
  }
  const password = raw.trim();
  if (!isStrongPassword(password)) {
    throw new Error(
      `Refused: ${UAT_PANEL_SHARED_PASSWORD_ENV_VAR} does not meet the required strength. ${STRONG_PASSWORD_MESSAGE}`,
    );
  }
  return password;
}
