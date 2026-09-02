# Production panel accounts

## Scope

Provide an audited, one-time operational bootstrap for the initial named
management-panel accounts. This is not seed data and does not create business
records. It exists only to establish access after a clean production database
has been migrated.

## Acceptance checklist

- [x] The operator supplies a JSON array on standard input; no username,
  password, phone number, or email is committed to the repository.
- [x] Only management-panel roles are accepted: `IT_MANAGER`,
  `COMMERCIAL_MANAGER`, `FINANCE_MANAGER`, `SENIOR_MANAGER`, `CEO`,
  `BOARD_CHAIR`, and `SITE_ADMIN`.
- [x] Every account requires a named owner, a unique username, and a unique,
  valid Iranian mobile number for mandatory staff 2FA.
- [x] A dry run validates input and reports only username/role pairs without
  connecting to or mutating the database.
- [x] Execution is refused unless `NODE_ENV=production`, `--execute`, and an
  explicit confirmation value are all present.
- [x] Existing username, phone, or email conflicts abort the entire operation;
  existing accounts are never silently overwritten or password-rotated.
- [x] Accounts are inserted atomically with Argon2 password hashes, mandatory
  2FA, active status, and `mustChangePassword=true`.
- [x] Execution refuses to create unusable accounts when Kavenegar is not
  active; an operator-supplied initial API key may be encrypted and configured
  atomically to break the first-login/IT-panel bootstrap dependency.
- [x] A cryptographically random temporary password is returned exactly once
  after commit and is never written to application logs or the repository.
- [x] Unit tests cover validation, duplicate rejection, password strength, and
  redacted dry-run output.
- [x] The production runbook documents a permission-`600` credentials handoff
  and the requirement to configure real SMS delivery before login.

Proof: `production-panel-accounts.spec.ts` (7 tests), the full backend unit
suite (90 tests), backend production build, and ESLint (0 errors) passed on
2026-08-05. A built-artifact dry run returned only username/role, and the
production execution guard rejected an unconfirmed non-production run.

## API and schema impact

None. This is an offline production operation that uses the existing `User`
entity and does not add an HTTP endpoint or database migration.
