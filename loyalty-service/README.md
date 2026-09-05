# BluJet Loyalty — A6.1 read boundary

NestJS / TypeORM, existing PostgreSQL `loyalty` schema. No new database,
migration, seed, event writer, public route or purchase integration.
The backend remains the **only writer**; these projections never authorize
a sale, redeem points, debit a wallet or claim a price lock.

## Local validation

Use Node 22 and the lockfile. Prepare an isolated database whose name ends
in `_test` with the existing backend migrations and seed. Build `backend/`
first (`npm run build` there) for the cross-service CLI contract tests.
Do not rebuild backend concurrently with tests that execute its `dist` files.
E2E creates and
cleans only its own synthetic users, memberships, points and locks. It never
runs migrations or resets existing data.

```sh
npm ci
npm run lint:check
npm run typecheck
npm run build
npm test
# LOYALTY_DATABASE_URL must refer to the migrated/seeded _test database.
npm run test:e2e
```

E2E defaults to the repository's local `blujet_test` credentials, never to
a production URL or a developer's `.env`. Its fixture connection needs write
access; the **application connection** defaults to read-only and every
application query is enclosed in a read-only transaction. The fixture writer
is not included in the built service.

For manual execution, copy `.env.example` to `.env`, provide the real local
reader credential and internal token, then run `npm run start:prod`.
The optional `docker-compose.loyalty.yml` overrides local Compose only;
it is not part of default startup or the production manifest. No host port
or nginx location exposes this service.

## Internal API

See `docs/API.md` and DTO Swagger annotations for the complete contract.
Both data routes require `X-Internal-Token` (minimum 32-character random
secret), `X-Loyalty-User-Id` equal to the path UUID, and a request correlation
ID (generated if omitted).

The owner header is an assertion from a trusted backend caller, **not**
proof of an end user's identity by itself. Never proxy this header from a
browser or give the service token to an agency. A future gateway integration
must derive the owner from its authenticated session.

- `GET /internal/v1/loyalty/members/:userId`: active member only; points are
  the decimal-string sum of the points ledger, not the cached member field.
- `GET /internal/v1/loyalty/price-locks/:userId?at=<ISO-UTC>`: owned ACTIVE
  locks with expiry strictly after the comparison instant; sorted by ID.
  Includes already-associated booking IDs for comparison only. At most 1000
  rows, otherwise 409; no silent truncation.
- `GET /internal/v1/loyalty/price-lock-history/:userId`: every owned price-lock
  status, newest first, at most 1000 rows, otherwise 409. The response wraps
  the list with the asserted `userId`; it still contains no inventory join or
  wallet/payment data.
- `GET /health`: liveness, version, commit.
- `GET /ready`: required schema/column access, safe 503 on failure.

IRR and points are decimal strings. UTC timestamp formatting happens in SQL
because the legacy schema uses UTC values in timestamp-without-time-zone
columns. No PII, member cached points, wallet balance, bank account or ledger
payment data is selected. Request logs omit headers, URL and body.

## Reader role deployment gate (not executed automatically)

Before any production start, provision a dedicated non-superuser, non-owner,
non-inheriting role with CONNECT and USAGE on `loyalty` only. Give SELECT
only on these columns; no table-wide SELECT, write, ownership, other-schema
or role-switch permissions:

- `club_members`: id, userId, level, cardStatus, deactivatedAt
- `club_points_entries`: clubMemberId, signedPoints
- `price_locks`: id, userId, flightInstanceId, cabin, lockedPriceIrr, feeIrr,
  status, expiresAt, createdAt, bookingId

Set role-level `default_transaction_read_only=on`. The application also
sets it for every connection and transaction, with a 2-second statement and
connection timeout and a four-connection pool. These application settings
are defense-in-depth, not a replacement for database grants. Credential
provisioning and production privilege verification require separate approval;
no grants are applied by this package or by migrations.

## A6.2 credential verification

With `LOYALTY_DATABASE_URL` set to the reader credential, run:

```sh
npm run build
npm run verify:reader
```

No internal HTTP token is needed. The command inspects PostgreSQL catalogs in
a read-only transaction; it does not change privileges or business data.
Output contains only status and named boolean checks. Exit codes are 0 for
PASS, 2 for FAIL, and 1 for UNAVAILABLE (configuration/connection/query failure).
No credentials, role names, SQL or customer data are printed.

Checks cover restricted role flags, no memberships, no relation/schema/database
ownership, no schema/database CREATE, required projection reads, no extra
user-relation column reads, no writes, no sequence privileges, and no executable
user-schema SECURITY DEFINER routines. System catalogs and database TEMP
permission are excluded. This checks current grants in the connected database,
not network access, authentication, other databases, or future privilege changes.
It is an offline operational gate, not an automatic readiness or public cutover.

Permission E2E tests need a local/CI fixture administrator able to create roles.
They generate a LOGIN reader, an empty parent role, and synthetic sequence and
function fixtures, then clean up those exact objects and grants. The reader is
tested with session read-only disabled to prove its grants still deny writes
and protected PII reads. No production role is provisioned. Build before E2E:
CLI acceptance tests execute `dist/verify-reader.js`; CI already builds first.

## A6.3 cross-service contract evidence

`test/shadow-contract.e2e-spec.ts` starts the real Loyalty Nest application on
an ephemeral loopback port with a generated restricted reader. The built
backend shadow CLI runs as a separate process with the same restricted DB
credential, reading independently via ORM and comparing with real HTTP/SQL
projections. No service response or database is mocked.

Fixtures cover ledger-derived points (different from cached points), exact IRR
above the JS safe-integer limit, foreign-owner/expired locks, absent/deactivated
members, invalid service credentials, a stopped HTTP listener, and disabling
comparison without usable configuration. Each comparison must leave fixture
rows unchanged, and only status/request ID may reach CLI output. The suite
cleans its exact synthetic rows and role. The existing Loyalty CI job builds
backend first and runs this suite automatically on PostgreSQL 16.

This synthetic rehearsal is not a production comparison window. Real reader
provisioning, representative parity sampling and owner approval still precede
any public read switch. No deployment or automatic rollout is introduced.

## Offline comparison and rollback

Run in `backend/` with an explicitly selected user UUID:

```sh
LOYALTY_SHADOW_ENABLED=true \
LOYALTY_SERVICE_URL=http://localhost:3500 \
LOYALTY_INTERNAL_TOKEN=<service-token> \
npm run loyalty:compare:shadow -- <user-uuid>
```

The backend DATABASE_URL supplies its local read connection. The command
adds read-only session and transaction settings and does not bootstrap the
backend app or scheduled jobs. The independent ORM projection reads
local-before, then remote, then local-after at one fixed expiry instant.
Stable equal projections are MATCH; stable differences MISMATCH; changing
local data INCONCLUSIVE; malformed, oversized, unauthorized or unavailable
responses UNAVAILABLE. Only status and request ID are printed. No projection
or owner IDs are logged. Remote reads share a two-second deadline, reject
redirects, and bound each response to 512 KiB.

Exit codes: 0 for MATCH/DISABLED, 2 for comparison failure/inconclusive/
unavailable, 1 for invalid configuration or startup failure. Unset the flag
or set it to `false` to disable all DB/network work.

This is a diagnostic sample, not proof of global consistency or an automatic
cutover gate. Repeat representative samples during a separately approved
window; before/after sampling cannot rule out all concurrent ABA changes.
There is **no public read switch yet**, so rollback in this slice merely
disables the offline command. A real HTTP read cutover is a later approved
slice after parity evidence. No production deployment has been performed.
