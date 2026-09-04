# BluJet Loyalty — A6.1 read boundary

NestJS / TypeORM, existing PostgreSQL `loyalty` schema. No new database,
migration, seed, event writer, public route or purchase integration.
The backend remains the **only writer**; these projections never authorize
a sale, redeem points, debit a wallet or claim a price lock.

## Local validation

Use Node 22 and the lockfile. Prepare an isolated database whose name ends
in `_test` with the existing backend migrations and seed. E2E creates and
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
