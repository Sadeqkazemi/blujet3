# Microservices phase 6 — Reporting cutover reader roles

## Scope

Provision two **offline, owner-invoked, read-only** PostgreSQL LOGIN roles
for the existing Reporting cutover-readiness gate:

- `blujet_reporting_cutover_source` on the named Core/shared database
- `blujet_reporting_cutover_target` on the named isolated Reporting database

This slice changes no table, HTTP route, worker flag, Kafka client, data or
deployment. It does not copy rows or switch `REPORTING_DATABASE_URL`.

## Role contract

- PostgreSQL 16+
- LOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOINHERIT, NOREPLICATION,
  NOBYPASSRLS
- No role memberships and no relation, schema or database ownership
- Session: `default_transaction_read_only=on`, `timezone=UTC`,
  `statement_timeout=5s`, `lock_timeout=2s`
- Schema: USAGE on `reporting` only, without CREATE
- Column-level SELECT only:

| Table | Columns |
| --- | --- |
| `core_itinerary_event_projections` | `orderId`, `eventType`, `eventId`, `fingerprint`, `orderVersion`, `currency`, `occurredAt`, `createdAt`, `updatedAt` |
| `core_itinerary_event_receipts` | `eventId`, `fingerprint`, `orderId`, `eventType`, `orderVersion`, `receivedAt` |
| `kafka_processing_failures` | `consumerGroup`, `topic`, `status` |
| `kafka_consumer_checkpoints` | `consumerGroup`, `topic`, `partition`, `nextOffset`, `highWatermark` |

Never grant `payload` or any other table/column. Deny INSERT, UPDATE, DELETE,
TRUNCATE, REFERENCES, TRIGGER, sequence USAGE/SELECT/UPDATE, TEMP, CREATE and
foreign-schema access. When Core and Reporting share a PostgreSQL server, the
source role cannot CONNECT to Reporting and the target role cannot CONNECT to
Core. Isolation from every other database remains an infrastructure control
(separate server/instance or `pg_hba.conf`), not a hidden cluster-wide ACL
rewrite by this provisioner.

Passwords are 32–128 URL-safe characters (`A-Za-z0-9_-`). Owner usernames must
differ from the runtime writer and both cutover reader names. Source database
names must not match `^blujet_reporting(?:_[A-Za-z0-9_]+)?$`. Target names
must match that pattern. Source and target owner URLs must not identify the
same database.

Provisioning is transactional and fail-closed. Re-running is idempotent: it
resets attributes, revokes memberships/elevation and re-applies the exact
grants. CLI output is `{ status, role, relationCount }` only.

The database security baseline is a prerequisite. `PUBLIC` must not provide
TEMP/CREATE on the selected database or USAGE/CREATE on non-Reporting schemas.
When source and target share a server, `PUBLIC` must not provide CONNECT on the
counterpart database. The provisioner verifies these effective privileges and
rolls back if they leak; it never revokes `PUBLIC` or changes an unrelated role.
Both owner URLs are required on every invocation so this counterpart boundary
cannot be skipped accidentally.

## Configuration

| Variable | Use |
| --- | --- |
| `REPORTING_CUTOVER_SOURCE_OWNER_URL` | Core/shared owner URL for the source provisioner |
| `REPORTING_CUTOVER_SOURCE_PASSWORD` | password for `blujet_reporting_cutover_source` |
| `REPORTING_CUTOVER_TARGET_OWNER_URL` | isolated Reporting owner URL for the target provisioner |
| `REPORTING_CUTOVER_TARGET_PASSWORD` | password for `blujet_reporting_cutover_target` |

Compiled scripts:

- `database:provision-reporting-cutover-source:prod`
- `database:provision-reporting-cutover-target:prod`

## Non-goals

- No migration, public/internal HTTP route or OpenAPI change
- No Kafka, data transfer, dual-write, consumer/read flag, Compose or deploy

## Acceptance evidence

- [x] Unit tests cover password/URL/kind validation, exact GRANT SQL, denied
      payload, source/target database identity, identical-database rejection,
      membership/elevation reset SQL, absence of PUBLIC ACL mutation and
      rollback on verification failure.
- [x] Real PostgreSQL E2E proves allowed column reads, denied payload / writes /
      DDL / sequences / foreign schema / counterpart CONNECT, fail-closed PUBLIC
      prerequisites, unchanged unrelated-role access, rerun correction and
      sanitized errors.
- [x] CI Reporting job runs the E2E and remains in `ci-gate`.
- [x] Present the diff. Do not deploy, activate the consumer or cut over.
