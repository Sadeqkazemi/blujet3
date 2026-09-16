# Microservices phase 6 — Agency cutover reader roles

## Scope

Provision two **offline, owner-invoked, read-only** PostgreSQL LOGIN roles
for the existing Agency cutover-readiness gate:

- `blujet_agency_cutover_source` on Core/shared PostgreSQL
- `blujet_agency_cutover_target` on the isolated Agency database

This slice changes no HTTP route, worker flag, Kafka client, data copy or
deployment. It does not switch `AGENCY_DATABASE_URL`. The Gate slot query
lists explicit columns so the target role never receives `auditId` or
`updatedAt`.

## Role contract

- PostgreSQL 16+
- LOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOINHERIT, NOREPLICATION,
  NOBYPASSRLS
- No role memberships and no relation, schema or database ownership
- Session: `default_transaction_read_only=on`, `timezone=UTC`,
  `statement_timeout=5s`, `lock_timeout=2s`

### Source (`agency` + `orders.commerce_outbox_events`)

| Relation | Columns |
| --- | --- |
| `agency.agency_profiles` | all current columns including `version` |
| `agency.agency_invoices` | all current columns including `version` |
| `agency.agency_credit_requests` | all current columns including `version` |
| `agency.agency_projection_audits` | `id`, `aggregateType`, `aggregateId`, `recordVersion` |
| `orders.commerce_outbox_events` | `producer`, `deliveredAt`, `deadLetterAt`, `claimedAt` |

### Target (`agency` only)

| Relation | Columns |
| --- | --- |
| `agency_profiles` / `agency_invoices` / `agency_credit_requests` | all current columns including `version` |
| `agency_projection_event_receipts` | `eventId`, `semanticFingerprint`, `aggregateType`, `aggregateId`, `recordVersion`, `auditId` |
| `agency_projection_slots` | `aggregateType`, `aggregateId`, `recordVersion`, `semanticFingerprint` |
| `kafka_processing_failures` | `status` |
| `kafka_consumer_checkpoints` | `consumerGroup`, `topic`, `partition`, `nextOffset`, `highWatermark` |

Never grant `envelopeFingerprint`, `receivedAt`, outbox payload, table-level
SELECT beyond the rows above, INSERT/UPDATE/DELETE/TRUNCATE, sequence
USAGE/SELECT/UPDATE, TEMP, CREATE or foreign-schema access. When Core and
Agency share a PostgreSQL server, the source role cannot CONNECT to Agency
and the target role cannot CONNECT to Core.

Passwords are 32–128 URL-safe characters (`A-Za-z0-9_-`). Owner usernames must
differ from `blujet_agency_runtime` and both cutover reader names. Source
database names must not match `^blujet_agency(?:_[A-Za-z0-9_]+)?$`. Target
names must match that pattern. Source and target owner URLs must not identify
the same database.

Provisioning is transactional and fail-closed. Re-running is idempotent: it
resets attributes, revokes memberships/elevation and re-applies the exact
grants. CLI output is `{ status, role, relationCount }` only.

The database security baseline is a prerequisite. `PUBLIC` must not provide
TEMP/CREATE on the selected database or USAGE/CREATE on disallowed schemas.
When source and target share a server, `PUBLIC` must not provide CONNECT on
the counterpart database. The provisioner verifies these effective privileges
and rolls back if they leak; it never revokes `PUBLIC` or changes an unrelated
role. Both owner URLs are required on every invocation.

## Configuration

| Variable | Use |
| --- | --- |
| `AGENCY_CUTOVER_SOURCE_OWNER_URL` | Core/shared owner URL for the source provisioner |
| `AGENCY_CUTOVER_SOURCE_PASSWORD` | password for `blujet_agency_cutover_source` |
| `AGENCY_CUTOVER_TARGET_OWNER_URL` | isolated Agency owner URL for the target provisioner |
| `AGENCY_CUTOVER_TARGET_PASSWORD` | password for `blujet_agency_cutover_target` |

Compiled scripts:

- `database:provision-agency-cutover-source:prod`
- `database:provision-agency-cutover-target:prod`

Gate runtime URLs stay in `agency-service/.env.example`.

## Non-goals

- No public/internal HTTP route or OpenAPI change
- No Kafka, data transfer, dual-write, consumer/read flag, Compose or deploy

## Acceptance evidence

- [x] Unit tests cover password/URL/kind validation, exact GRANT SQL, denied
      columns, source/target database identity, identical-database rejection,
      membership/elevation reset SQL, absence of PUBLIC ACL mutation and
      rollback on verification failure
      (`provision-agency-cutover-reader-roles.spec.ts`).
- [x] Real PostgreSQL E2E proves allowed column reads, denied extra columns /
      writes / DDL / sequences / foreign schema / counterpart CONNECT, fail-closed
      PUBLIC prerequisites, unchanged unrelated-role access, rerun correction,
      Gate execution without privilege errors and sanitized errors
      (`agency-cutover-reader-roles.e2e-spec.ts`).
- [x] CI Agency job runs the E2E and remains in `ci-gate`.
- [ ] Present the diff. Do not deploy, activate the consumer or cut over.
