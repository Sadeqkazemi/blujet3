# Feature: temporary password-only panel access (Kavenegar recovery window)

This is a production UAT exception requested by the owner while Kavenegar
delivery is being repaired. It is deliberately account-scoped and expires
automatically; it does not disable staff 2FA globally.

## Addendum: one shared UAT password (`agent/shared-uat-panel-password`)

Originally every temporary account got its own independently-generated
16-character password (visible once in the bootstrap/rotation script's
stdout). This addendum replaces that with **one shared password**, read
from `UAT_PANEL_SHARED_PASSWORD`, and extends account coverage beyond the
original seven manager/admin roles. Nothing about expiry, session
revocation, real-account isolation, or the mock OTP changes. Revised
after a review pass — see "Review corrections" below for what changed
from the first version of this addendum.

- **Coverage**: `TEMPORARY_PANEL_ACCOUNTS` (username + password via
  `/auth/staff/login`) includes `uat.operations` (`OPERATIONS_MANAGER`) and
  `uat.employee` (`EMPLOYEE`, `dept: 'commercial'`) alongside the original
  manager/admin accounts. A new
  `TEMPORARY_PHONE_LOGIN_ACCOUNTS` covers `uat.agency` (`AGENCY`, phone
  `09000000001`, via `/auth/agency/login`) and `uat.customer` (`USER`,
  phone `09000000002`, via `/auth/customer/login-password`) — both
  password-based login surfaces, per scope. These are **identity/access
  infrastructure only** — no `AgencyProfile`, `AgencyCreditLine`, or any
  other business row is ever created for `uat.agency`; it stays a bare
  `User` row, and the existing `agency-portal.service.ts` already returns
  a clean `404 NOT_FOUND` ("پروفایل آژانس یافت نشد") for a profile-less
  agency on every portal endpoint — a real empty state, not fabricated
  data — so no code change was needed there.
- **One shared password, not one per account**: `backend/src/common/
  uat-shared-password.ts`'s `resolveUatSharedPassword()` is the only
  source. It refuses (clear `Error`, never including the password value)
  when: `AUTH_SANDBOX_ENABLED` isn't `true` (so a real production run
  without the sandbox flag is refused even if `NODE_ENV=production`
  matches, per the scripts' pre-existing check), the variable is
  unset/empty, or the value fails the existing `IsStrongPassword` policy
  (≥8 chars, upper+lower+digit+symbol — same policy already used for
  customer self-service passwords, not a new one).
- Bootstrap (`bootstrap-temporary-panel-accounts.ts`) and rotation
  (`rotate-temporary-panel-passwords.ts`) call `argon2.hash(sharedPassword)`
  **separately for every account** — same plaintext password, but each
  row gets its own salt/hash, so `passwordHash` values never match across
  accounts even though the password itself is intentionally identical.
  Bootstrap is idempotent per account (skips ones that already exist with
  `status: 'already_exists'`) so it can safely run again on a server that
  already has the original seven, to add the newly configured ones.
- **Neither script's stdout ever includes a password field** — only
  `username`, `role`, `fullName`/`expiresAt`/`status` per account. The
  shared password is the operator's own already-known secret; there is
  nothing to echo back.
- Rotation preserves each account's existing expiry independently. This is
  required when an idempotent bootstrap adds new UAT accounts after older
  temporary accounts already exist; a shared password does not imply a
  shared access deadline.
- `staffLogin()`'s pre-existing temp-account bypass branch, and the new
  matching branches added to `agencyLogin()`/`customerPasswordLogin()`
  (`auth.service.ts`), all now explicitly check `isSandboxAuthEnabled()`
  first and reject with `403 SANDBOX_AUTH_DISABLED` if it's off — a
  temporary account's password alone is never sufficient outside a
  sandbox-flagged environment. Keyed off `User.temporaryPasswordOnlyUntil`,
  which is `null` for every real staff/agency/customer, so this branch
  and its sandbox check never affect a real account's login.
- `employees.service.ts`'s `list()` and `customers.service.ts`'s
  `list()`/`countIncomplete()` now exclude `uat.*` usernames, so
  `uat.employee`/`uat.customer` never appear in the IT-manager employee
  roster or the SITE_ADMIN customer list/incomplete-count badge.
  `AdminsService.list()` and the staff directory already excluded `uat.*`
  before this change. The agency list/count endpoints
  (`agencies.service.ts`, `reporting.service.ts`) start from
  `AgencyProfile`, not `User`, so `uat.agency` — which has no profile row
  — was already excluded without any code change.
- `.github/workflows/deploy.yml`'s SSH step forwards
  `UAT_PANEL_SHARED_PASSWORD` via `appleboy/ssh-action`'s `env:`/`envs:`
  mechanism (not interpolated as literal text into the script string) and
  refuses with a clear message if the forwarded value is empty before
  running anything; existing historical sentinel blocks are untouched
  (already consumed on the live server), with a new one-time block
  (`.blujet-uat-shared-password-v1-complete`) that bootstraps any missing
  accounts and rotates every temporary account to the shared password.
  Deployments created after the flight-approval workflow also use the
  one-time `.blujet-uat-operations-account-v1-complete` block to rerun the
  idempotent bootstrap and create `uat.operations` on hosts where the v1
  sentinel was already consumed.

### Review corrections (kept for context, not re-litigated)

A first version of this addendum also gave `uat.agency` a real
`AgencyProfile` + zero-limit `AgencyCreditLine` ("same shape a freshly
approved agency starts with") and taught `uat-demo-data-purge-policy.ts` a
new `UAT_ROW_FILTERED_TABLES` mechanism to keep those two rows alive
across a UAT data purge. Review flagged this as still business data that
doesn't belong on a pure identity/access account and unnecessary
complexity in the purge policy — both were reverted. `uat-demo-data-purge.ts`
and `uat-demo-data-purge-policy.ts` are back to their pre-addendum state.

### Follow-up fix: real empty state for `uat.agency`'s own portal

Removing the `AgencyProfile` (above) fixed the data-fabrication concern but
left `uat.agency` unable to actually use `/agency-portal/*` — every
endpoint fell through to `AgencyPortalService.getOwnProfileOrThrow()`'s
`404 NOT_FOUND`, which the agency portal's `AgencyDashboardPage` surfaced
as a red "خطا در دریافت داشبورد" error instead of a working (empty) panel.

- **Central detection**: `isActiveUatSandboxAgency()` in
  `database/temporary-panel-accounts.ts` is the one place this is decided —
  true only when the actor is role `AGENCY`, `isSandboxAuthEnabled()`, and
  `getTemporaryPanelAccessState(user) === 'ACTIVE'`. Outside sandbox mode
  or once the account's 7-day window expires, it's always `false` and every
  endpoint falls straight back to the original `AgencyProfile`-based 404 —
  no new behavior for a real agency, ever.
- **Reads return real empty states, never fabricated rows**:
  `AgencyPortalService`'s guard (`isUatSandboxAgencyActor()` /
  `loadUatSandboxAgencyUser()`) short-circuits every GET method — dashboard
  (zero KPIs, zero credit, empty 6-month chart), allotments/ledger/
  invoices/credit-requests/inbox/documents/webservice-requests/api-keys
  (`[]`), sales (zeroed summary + empty arrays), profile (the account's own
  real `User` fields — `fullName`, `phone`, `email` — with the
  business-only fields `managerName`/`licenseNo`/`city`/`address`/`tier`
  explicitly `null`, not invented). The published seat-request catalogue is a
  read-only shared flight projection, and `seat-requests` returns only request
  rows whose `agencyId` is the temporary account's own user id. `credit()`/`dashboard()` no longer call
  `AgenciesService.getCredit()` for this account, since that call has its
  own independent `AgencyProfile` guard that would 404 regardless.
- **Writes are refused, not silently faked**: every unrelated mutating method
  (`payInvoice`, `requestCreditIncrease`, `postInboxMessage`,
  `requestWebservice`) throws `403
  UAT_TEMPORARY_ACCOUNT_READ_ONLY` via `assertAgencyPortalWritable()` before
  touching any repository — this account can look around the panel but
  can never create a booking or ledger entry. The deliberately scoped
  `POST /agency-portal/seat-requests` sandbox journey is the sole request-row
  exception: it records an agency demand for manager review but creates no
  allotment, invoice, booking, or financial entry by itself.
- **Agency-document exception**: `POST /agency-portal/documents` stores only
  the authenticated UAT agency's own PDF/image and `GET` lists those rows.
  `AgencyDocument.agencyId` references `User.id`, so this operational upload
  does not create an `AgencyProfile`, credit line, booking, or ledger row.
- **Frontend needed no production change**: `AgencyDashboardPage.tsx`
  already rendered zero-valued KPI cards and an empty chart whenever its
  API calls resolved (it only showed the red error on a rejected promise),
  so returning `200` with honest zero/empty data was sufficient — the
  existing UI *is* the empty state.

Acceptance:

- [x] No `AgencyProfile`/`AgencyCreditLine`/booking/ledger row is ever
  created by logging in as `uat.agency` or browsing its portal —
  `uat-shared-password.e2e-spec.ts`.
- [x] `dashboard`/`allotments` and every other read endpoint return `200`
  with real zero/empty data for `uat.agency` — `uat-shared-password.e2e-spec.ts`.
- [x] Every unrelated mutating agency-portal endpoint returns `403
  UAT_TEMPORARY_ACCOUNT_READ_ONLY` for `uat.agency` —
  `uat-shared-password.e2e-spec.ts`.
- [x] The scoped seat-request exception can read back only its own persisted
  requests — `uat-shared-password.e2e-spec.ts`.
- [x] The UAT agency can upload/list only its own document without fabricating
  an agency profile — `uat-shared-password.e2e-spec.ts`.
- [x] The exception never activates with `AUTH_SANDBOX_ENABLED=false` or
  once the account's temporary-access window has expired (falls back to
  the normal `404`) — `uat-shared-password.e2e-spec.ts`.
- [x] `AgencyDashboardPage` renders the empty state, not the red error
  message, when the API returns zero/empty data —
  `AgencyDashboardPage.test.tsx`.

### Acceptance checklist (addendum)

- [x] Every temporary account (all 10, across both login surfaces) hashes
  to the identical shared password — `uat-shared-password.e2e-spec.ts`.
- [x] Bootstrap/rotation refuse without `AUTH_SANDBOX_ENABLED=true`, even
  with `NODE_ENV=production` — `uat-shared-password.spec.ts`,
  `uat-shared-password.e2e-spec.ts`.
- [x] Bootstrap/rotation refuse an empty or weak
  `UAT_PANEL_SHARED_PASSWORD` with a clear error that never echoes the
  value — `uat-shared-password.spec.ts`, `uat-shared-password.e2e-spec.ts`.
- [x] A real staff account's password/state is untouched by either script
  — `uat-shared-password.e2e-spec.ts`.
- [x] Rotation revokes every active refresh token for the temporary
  accounts — `uat-shared-password.e2e-spec.ts`.
- [x] The password never appears in either script's stdout JSON, nor in
  any thrown error message — `uat-shared-password.spec.ts`,
  `uat-shared-password.e2e-spec.ts`.
- [x] The sandbox mock OTP default (`123456`) is unchanged —
  `uat-shared-password.e2e-spec.ts`.
- [x] A temp EMPLOYEE/AGENCY/USER account logs in with the shared
  password on its real endpoint and an expired one is rejected —
  `uat-shared-password.e2e-spec.ts`.
- [x] Each account's `passwordHash` differs from every other account's,
  even though the plaintext password is shared, both at bootstrap and
  after rotation — `uat-shared-password.e2e-spec.ts`.
- [x] A temp staff/agency/customer login is rejected with
  `SANDBOX_AUTH_DISABLED` when `AUTH_SANDBOX_ENABLED` is off, even with
  the correct shared password — `uat-shared-password.e2e-spec.ts`.
- [x] Bootstrap never creates an `AgencyProfile`, `AgencyCreditLine`, or
  any operational/business row for `uat.agency` —
  `uat-shared-password.e2e-spec.ts`.

### UAT shared-password reconciliation after identity recovery

The August 29 UAT login incident showed that a reserved identity could remain
active and correctly normalized while its persisted Argon2 hash no longer
matched the configured `UAT_PANEL_SHARED_PASSWORD`. The original shared
password migration was protected by a consumed v1 sentinel, so later deploys
could not repair this drift and `/auth/agency/login` returned the ordinary
`401 UNAUTHORIZED` response before reaching the temporary-access check.

The deploy now performs one additional, controlled reconciliation after the
v3 identity/access recovery. It reuses the fail-closed rotation command, which:

- accepts only the exact reserved, active, unexpired `uat.*` identities;
- reads the current shared password from the protected deployment secret and
  never prints it;
- writes a fresh independently salted Argon2 hash for each identity while
  preserving every access deadline;
- revokes existing refresh sessions; and
- writes only non-secret output to a root-only audit artifact.

`/root/.blujet-uat-shared-password-reconciliation-v2-complete` makes the
reconciliation one-time. Its audit output is stored at
`/root/blujet-uat-shared-password-reconciliation-v2.json`. Ordinary agency,
customer, employee and manager accounts are outside the reserved username set
and cannot enter this operation.

When the protected GitHub secret was subsequently aligned with the
owner-provided UAT credential, a follow-up v3 reconciliation was required
because the v2 sentinel had already been consumed. It uses
`/root/.blujet-uat-shared-password-reconciliation-v3-complete` and writes only
non-secret results to
`/root/blujet-uat-shared-password-reconciliation-v3.json`. It retains the same
fail-closed identity, expiry, and session-revocation guarantees as v2.

### UAT phone-login identity normalization repair

The same incident exposed a separate identity-storage defect: access extension
v3 restored the configured `09...` display/login value directly into
`User.phone`, while agency and customer authentication always normalizes the
submitted value to canonical `+98...` before querying. The password was valid,
but the canonical lookup could not find either phone-login identity.

- [x] Extension v3 always persists phone-login identities in the canonical
  `+98...` form used by authentication —
  `uat-shared-password.e2e-spec.ts` and source inspection.
- [x] A guarded, one-time reconciliation repairs only the exact reserved
  `uat.agency` and `uat.customer` identities, refuses role/lifecycle/provenance
  mismatches or phone conflicts, and changes no password hash or deadline —
  `uat-shared-password.e2e-spec.ts`.
- [x] Reconciliation revokes existing refresh sessions, records a non-secret
  security audit, and leaves ordinary users untouched —
  `uat-shared-password.e2e-spec.ts`.
- [x] After repair, the real agency and customer password-login endpoints both
  return an access token for their `09...` login input —
  `uat-shared-password.e2e-spec.ts`.
- [x] Deployment runs the repair exactly once after the consumed v3 recovery
  steps and stores root-only audit/sentinel files —
  `production-artifacts.spec.ts`.

## Acceptance checklist

- [ ] A controlled production bootstrap creates exactly one temporary account
  for each management panel role: `SITE_ADMIN`, `IT_MANAGER`,
  `COMMERCIAL_MANAGER`, `FINANCE_MANAGER`, `SENIOR_MANAGER`, `CEO`, and
  `BOARD_CHAIR` — `temporary-panel-accounts.spec.ts`.
- [ ] Bootstrap usernames are restricted to the reserved `uat.` namespace,
  passwords are cryptographically random 16-character values made only from
  English letters and digits, and are never committed or printed to
  GitHub Actions logs, and the one-time credential file is mode `0600` on the
  server — workflow/script inspection plus `temporary-panel-accounts.spec.ts`.
- [ ] The owner-approved password-format migration rotates all seven existing
  active and unexpired temporary accounts atomically, preserves their original
  expiry, revokes their active refresh sessions, replaces the root-only
  credential file atomically, and runs at most once — rotation script/workflow
  inspection plus `temporary-panel-accounts.spec.ts`.
- [ ] The seven passwords remain unchanged for the lifetime of the accounts;
  repeated deploys cannot recreate or rotate them — deploy sentinel check.
- [ ] A valid, unexpired temporary account can complete `/auth/staff/login`
  with username/password and receives a normal access token + refresh cookie
  without an OTP challenge — `auth.e2e-spec.ts`.
- [ ] Every ordinary staff account still receives a 2FA challenge, even while
  temporary access exists — `auth.e2e-spec.ts`.
- [ ] An expired temporary account is rejected even with the correct password,
  and no OTP fallback or token is issued — `auth.e2e-spec.ts`.
- [ ] Access and refresh tokens for a temporary account never outlive that
  account's `temporaryPasswordOnlyUntil` timestamp; refresh after expiry is
  rejected and the token family is revoked — `auth.e2e-spec.ts`.
- [ ] Every password-only login writes a security audit event without password,
  token, or credential material — `auth.e2e-spec.ts`.
- [ ] The staff login UI accepts both the ordinary 2FA response and the
  temporary direct-login response, navigating to the panel only for the latter
  — `LoginPage.test.tsx`.
- [ ] A controlled cleanup command immediately deactivates only the reserved
  temporary accounts, clears their password hashes, and revokes their sessions
  without deleting referenced business/audit history —
  `temporary-panel-accounts.spec.ts`.
- [ ] The exception starts with seven days. Owner-approved extension v1 adds
  seven days to the original deadline; owner-approved extension v2 adds seven
  days to an active deadline or grants seven days from execution after expiry.
  Separate confirmation phrases, audit files and root sentinels make both
  grants one-time, with a v2 safety ceiling of 28 days from creation. Access can
  be removed earlier when Kavenegar is operational —
  `temporary-panel-accounts.spec.ts`.
