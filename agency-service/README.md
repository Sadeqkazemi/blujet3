# BluJet Agency — read boundary and optional invoice compatibility

## Shared canonical topic routing (not activated)

The worker owns only `core-agency` events but may consume the shared
`blujet.events.v1` topic. Routing-valid v1 deliveries from the currently
approved `core-commerce`, `core-loyalty` and `core-ops` producers advance only
the Agency consumer checkpoint and are then acknowledged; they never invoke an
Agency projection or create Agency receipt/DLQ state. Legacy deliveries without
the schema header are admitted only while
`AGENCY_EVENT_SCHEMA_HEADER_REQUIRED=false`.

Unknown producers, malformed envelopes, transport metadata mismatches,
cross-labeled schemas and invalid `core-agency` payloads remain fail-closed and
unacknowledged. The checkpoint transaction commits before Kafka ACK. This makes
shared-topic baseline catch-up possible but does not activate the worker or
authorize read cutover. See
`docs/features/microservices-phase-6-agency-shared-topic-routing.md`.

## Standalone projection worker (not activated)

`npm run start:worker:prod` starts the dedicated Kafka projection process after
build. It requires `AGENCY_KAFKA_CONSUMER_ENABLED=true`, an independent
`AGENCY_PROJECTION_DATABASE_URL` writer credential and valid Kafka settings.
Production also requires Agency-specific TLS/SCRAM credentials. The HTTP
service must not receive the writer URL, while the worker does not need
`AGENCY_DATABASE_URL` or `AGENCY_INTERNAL_TOKEN`.

Use `.env.worker.example` as the worker-only template in a separate process or
container environment. Do not combine it with the HTTP `.env.example`.

The worker exposes `/health`, `/ready` and the default-off internal quarantine
control routes described below. It runs the strict sequential manual-ACK adapter
and acknowledges after the existing transactional projection commit.
Per-group/topic/partition progress is recorded in the Agency database in that
same transaction and readiness exposes only aggregate checkpoint evidence:
partition count, maximum observed lag and last checkpoint time. It is not
included in Compose or deployment manifests and remains disabled until
baseline/delta, broker UAT and cutover gates are separately approved.

## Poison-message quarantine (not activated)

`AGENCY_DLQ_ENABLED=false` is the default. When enabled with a dedicated
`AGENCY_DLQ_OPERATOR_TOKEN`, transport and projection failures remain
unacknowledged and are quarantined after `AGENCY_DLQ_MAX_ATTEMPTS` (default 3,
allowed 2..10). The registry stores no payload, headers, raw error or Agency
business fields. A quarantined delivery blocks its partition until an operator
approves retry or skip; there is no automatic skip.

- `GET /internal/v1/agency/dlq?status=QUARANTINED&limit=50`
- `POST /internal/v1/agency/dlq/:id/retry`
- `POST /internal/v1/agency/dlq/:id/skip`

Retry reprocesses the retained source delivery. Skip marks the audit row and
advances the durable checkpoint in one Agency database transaction, then the
handler acknowledges Kafka. The API returns only sanitized metadata and all
routes require `X-Internal-Token`. `/ready` returns only whether quarantine is
disabled or its current quarantined count. Historical payload republishing,
activation and deployment remain out of scope.

## Version-aware projection foundation

The package contains an internal `AgencyProjectionConsumer` for the approved
`AgencyProfileProjected`, `AgencyInvoiceProjected` and
`AgencyCreditRequestProjected` v1 full snapshots. It is deliberately not
registered in the read-only HTTP `AppModule`; only the separately started
worker can reach it. Applying an event writes the business projection,
immutable receipt and aggregate-version slot in one transaction. Exact replay
is idempotent; stale versions do not overwrite current state; reused event IDs,
divergent same-version snapshots and missing local profile dependencies fail
closed.

After building, `npm run reconcile:projection:prod -- 10000` compares distinct
source and target databases supplied through
`AGENCY_RECONCILIATION_SOURCE_DATABASE_URL` and
`AGENCY_RECONCILIATION_TARGET_DATABASE_URL`. Both credentials must be
restricted read-only logins. Output contains only table names, counts, two
order-independent hashes and MATCH/MISMATCH/INCONCLUSIVE status. It never
prints Agency fields, identifiers, amounts, URLs or credentials.

Baseline transfer, read cutover, writer freeze and deployment remain disabled
and require separately reviewed phases.

## Physical projection baseline tooling (not activated)

The repository's offline independent-domain tool now accepts
`DOMAIN_TRANSFER_KIND=agency`. It copies only `agency_profiles`,
`agency_invoices` and `agency_credit_requests`, in dependency-safe order, from
a complete Core database snapshot into an empty database migrated by this
package. Apply mode requires a reviewed backup reference and commits only when
row counts and two full-row hashes match. Output contains metadata only.

The opt-in `docker-compose.domain-db.yml` topology can create `agency-db`, run
these standalone migrations, provision the column-scoped SELECT-only
`blujet_agency_runtime` login and invoke the transfer. That HTTP credential has
no access to projection versions, receipts, slots, Kafka checkpoints or
failure quarantine. The separately disabled Kafka worker must use a different
writable `AGENCY_PROJECTION_DATABASE_URL`; owner credentials must not be passed
to either long-running process.

Baseline parity does not switch reads. Keep all Agency flags and Kafka/DLQ
runtime disabled until ordered delta catch-up, source-outbox drain and final
reconciliation pass UAT under separate approval. See
`docs/features/microservices-phase-6-agency-baseline-tooling.md` and
`docs/RUNBOOK.md`.

## Optional credit-request history (A6.19)

Core `AGENCY_CREDIT_REQUESTS_READ_ENABLED=false` and Agency
`AGENCY_PORTAL_CREDIT_REQUESTS_ENABLED=false` independently gate the existing
public credit-request history integration. The internal read-only route is
`GET /internal/v1/agencies/:agencyId/portal-credit-requests`, protected by
service identity and a trusted owner assertion. No request creation, decision,
credit-limit or ledger writer moves out of Core.

In addition to base grants, a separately reviewed reader requires column
SELECT on `agency.agency_credit_requests`: id, agencyId, requestedLimitIrr,
note, status, decidedById, decidedAt, createdAt. Run `verify:reader` with the
same service flag; readiness checks the extra columns only when enabled.
The verifier rejects the extra grants in default/minimal mode. This package
never provisions production grants.

The full owner list is newest-first, max 1000 rows/1 MiB, with exact IRR strings
and UTC timestamps. Oversize/disabled responses are 503 so Core can fall back
without returning a partial list. Invalid identity/owner/successful payloads
fail closed. Rollback turns off the Core flag before the service flag/grants.
Production activation/deployment requires separate approval; see
`docs/features/agency-credit-requests-read-cutover.md` in the repository.

Independent NestJS/TypeORM service over the existing PostgreSQL `agency` schema.
This slice returns minimized profile and invoice projections, not the complete
portal. The current backend remains the only business writer and public request handler.
Public invoice reads can opt into the A6.8 compatibility route below, but remain
disabled by default. No migration or production grant is applied, and no
invoice/credit/reservation/payment command exists here.

## Internal contract

All data routes require `X-Internal-Token` and `X-Agency-Id` equal to the path
agency UUID. The tenant assertion must originate from an authenticated AGENCY
session in the trusted backend, never a browser-selectable header. It is not a
cryptographic proof of an end-user session. Compromise of the trusted caller
or its service credential is outside this header-matching isolation guarantee.
Only internal network callers may reach the service; never add a public proxy.

- `GET /internal/v1/agencies/:agencyId/profile`: agencyId, city, tier, joinedAt,
  suspendedAt. No manager name, address, contacts, license or suspension reason.
- `GET /internal/v1/agencies/:agencyId/invoices?page=1`: `{items,total,page,pageSize}`,
  ten rows per page, page 1..1000, issuedAt DESC/id DESC. Total is a decimal
  string scoped to the same tenant and snapshot as the returned items.
- `GET /internal/v1/agencies/:agencyId/invoices/:invoiceId`: owned invoice only.
  Fields: id, invoiceNo, amountIrr, status, issuedAt, dueAt, paidAt. No free text,
  issuer identity, booking data, passenger data or payment ledger is selected.
- `GET /health` and `/ready`: safe service/version/commit and column-readiness.

Agency identity remains `agency_profiles.userId` (one account per agency).
All data routes check the owner assertion before DB access. Missing profiles
return 404; foreign and absent invoice IDs use the same 404. Existing empty
profiles yield empty pages. Invalid input: 400; service token: 401; owner: 403;
safe driver failures: 500; readiness: 503. Data responses are `no-store` with
the standard success/error envelope and X-Request-Id.

Money remains exact integer IRR strings, including beyond JS safe integer.
UTC timestamps are formatted from the existing timestamp-without-time-zone
columns. Suspension metadata does not authorize login/sales/Partner API use.
Temporary UAT accounts without profiles return 404; the existing public backend
retains its own UAT compatibility behavior. This is not a drop-in public API.

## Local validation

The A6.6 HTTP contract tests invoke the built backend CLI: first install the
backend's locked dependencies and run `npm run build` in `backend/`. The Agency
CI job performs this step automatically before E2E; a missing built CLI is a
test failure, not a skipped contract. No backend HTTP server or seed is needed.

Use Node 22 and the lockfile; dependencies match the existing Loyalty service.
Prepare an isolated `_test` database with the backend's existing migrations.
No seed is required: tests create and clean only their own fixture rows and
an ephemeral restricted LOGIN role. The fixture writer needs role-creation
privileges; the real application test connection receives only column SELECT.
Tests never run migrations or change production data themselves.

```sh
npm ci
npm run lint:check
npm run typecheck
npm run build
npm run openapi:export
npm test
npm run test:e2e
```

E2E defaults to the repository's local `blujet_test` credentials. Set
`AGENCY_DATABASE_URL` to another explicitly named `_test` database if needed.
`openapi:export` creates `docs/openapi.json` from the built module without any
DB/network connection; the placeholder data source exists only in this dev
schema-generation script, not in runtime code. No Swagger UI is published.

For manual runtime, copy `.env.example` to `.env`, supply a separately approved
reader credential and random service token, build and run `npm run start:prod`.
The optional `docker-compose.agency.yml` is local-only, opt-in and exposes no
host ports. It is not included by default startup or production deployment.

## Reader provisioning gate

Before a separately approved deployment, provision a dedicated non-superuser,
non-owner, non-inheriting role with no memberships, CREATE, write or other-domain
privileges. Audit effective PUBLIC privileges and executable SECURITY DEFINER
routines as well; column grants alone are not a complete cluster security audit.
Give only schema USAGE on `agency` and SELECT on:

- `agency_profiles`: userId, city, tier, joinedAt, suspendedAt.
- `agency_invoices`: id, agencyId, invoiceNo, amountIrr, status, issuedAt, dueAt,
  paidAt.

Set `default_transaction_read_only=on`. The service also sets read-only mode
and UTC per connection, with two-second statement/connection timeouts and a
four-connection pool. Every data read uses a READ ONLY / REPEATABLE READ
transaction; schema sync and automatic migrations are disabled. This does not
replace proper ACLs. E2E proves forbidden writes/PII reads still fail even when
session read-only is off. Shared-reader tenant isolation is enforced by SQL
predicates, not PostgreSQL RLS. Grant provisioning is not automated by this code.

### Offline permission verifier (A6.5)

After `npm run build`, run `npm run verify:reader` with `AGENCY_DATABASE_URL`
provided securely by the environment. It uses that exact login, without an
internal HTTP token, business reads, listener, migrations or grant changes.
The underlying `node dist/verify-reader.js` emits one JSON line; npm itself
may add its normal script banner. Reports contain only status and boolean checks:

- `PASS` / exit 0: every catalog check passed.
- `FAIL` / exit 2: one or more permission checks failed; do not use this login.
- `UNAVAILABLE` / exit 1: invalid/missing configuration, connection or catalog
  failure; details and credentials are never printed. Do not treat it as PASS.

Checks: `restrictedRole`, `noMemberships`, `noOwnership` (relations, schemas,
current database), `noCreate`, `requiredReads`, `exactReads`, `noWrites`,
`noSequenceAccess`, `noDefinerExecute`. Required reads include owner predicates
and schema USAGE. Excess grants count even without schema USAGE; PUBLIC grants
and user-schema executable SECURITY DEFINER routines are included. An elevated
login fails even if application/session read-only is enabled.

This is point-in-time evidence for the connected database, not certification
of the cluster, future grants, arbitrary extension capabilities, tenant RLS or
trusted-caller security. Keep the report with separately approved credential
provisioning evidence and rerun after grant changes. No production provisioning
is performed by the command. The existing Agency CI job automatically runs its
real-PostgreSQL tests, including CLI exit codes, after building the package.

### Offline profile/page and optional invoice comparison (A6.6–A6.7)

In `backend/`, run
`npm run agency:compare:shadow -- <agency-uuid> [page] [invoice-uuid]`, or after
building,
`node dist/database/report-agency-shadow.js <agency-uuid> [page] [invoice-uuid]`.
Default output is DISABLED, without a DB/HTTP connection. To run an explicitly
approved sample, provide AGENCY_SHADOW_ENABLED=true, AGENCY_SERVICE_URL,
AGENCY_INTERNAL_TOKEN and the local projection's DATABASE_URL securely via the
environment. Both database connections should use reviewed SELECT-only logins.
The CLI compares the minimized profile and requested invoice page (default 1,
max 1000). Supply a page (usually 1) and final invoice UUID to also compare that
owned invoice's detail, independently of page membership. Omit the UUID to keep
the original two-request behavior. Missing and foreign invoices both compare as
absent; no ownership information is exposed. An explicitly empty/invalid invoice
UUID fails before DB/HTTP connections when enabled. The optional third request
shares the existing deadline and strict response validation. It never prints rows.
MATCH means equal observed snapshots; local changes give INCONCLUSIVE, stable
drift MISMATCH and invalid/unreachable remote data UNAVAILABLE. This does not
prove equality during unobserved transient changes, authorize sales or enable
any public route, nor establish full-portal parity. See
`docs/features/agency-shadow-comparison.md` and
`docs/features/agency-invoice-shadow.md` in the repo.

Representative parity against current backend projections, production credential
review, owner-approved public integration, and deployment remain separate gates.
Stopping this unused internal reader does not affect the current public portal.

## Optional portal profile integration (A6.9)

Prepare and test only; production activation is separately approved.
`AGENCY_PROFILE_READ_ENABLED=true` in the backend uses the existing public
profile URL and preserves the authenticated actor's `fullName`. The Agency
service route is `GET /internal/v1/agencies/:agencyId/portal-profile` and is
disabled unless `AGENCY_PORTAL_PROFILE_ENABLED=true`.

The route returns the existing Agency-owned profile fields without joining
`identity.users`: managerName, licenseNo, phone, email, city, address, tier,
suspendedAt, suspendReason and joinedAt. It is owner-bound, read-only,
repeatable-read and limited to a 64 KiB response. Network/timeout, 5xx and
oversized responses fall back to the authorized Core read; 404 preserves the
public not-found response; other 4xx, redirects and malformed/foreign data
fail closed. Both flags default to false. Opt-in requires a UTC backend and
the six additional profile column grants; verifier/readiness check them only
when the Agency profile flag is true. No grants, migrations or deployment are
performed by this package. Rollback is flag-first, then grant revocation.

See `docs/features/agency-profile-read-cutover.md` for the complete contract.

## Optional portal invoice integration (A6.8)

Prepare and test only; production activation is separately approved. Backend
`AGENCY_INVOICES_READ_ENABLED=true` uses the same public invoice URL and flat
array. The backend runtime must be UTC (`TZ=UTC`); non-UTC activation is rejected
because the legacy ORM parses timestamp-without-time-zone in the host timezone.
The backend derives the owner from the authenticated session, retains profile
and temporary-UAT checks, and forwards the normalized request ID. Browser tenant
headers are never forwarded. Other portal reads and all financial writers remain
in Core.

Set Agency `AGENCY_PORTAL_INVOICES_ENABLED=true` only with a reviewed reader
having the A6.4 grants plus column SELECT on `bookingId`, `issuedById`,
`descriptionFa` of `agency.agency_invoices`. Run `verify:reader` with the same
flag; `/ready` also checks those columns. The verifier's default minimal mode
rejects these additional grants. This code provisions no production grants.

`GET /internal/v1/agencies/:agencyId/portal-invoices` adds those existing fields
and `agencyId` to the invoice projection, without joins or new data. It returns
one snapshot, not concatenated pages. Disabled mode or more than 1000 rows/
1 MiB returns 503, never a truncated list. Backend transport errors, timeout,
5xx and excessive response size fall back to the authorized complete Core
read; 4xx, redirects and malformed/foreign rows fail closed as sanitized
503 `INTERNAL_ERROR`. This availability fallback is logged without invoice data.

Rollback: disable the backend flag first. Disable the service flag before
reverting the three optional grants. No schema rollback, financial data change,
PSP/Nira operation or server deployment is part of this change. See
`docs/features/agency-invoice-read-cutover.md` for acceptance evidence.
