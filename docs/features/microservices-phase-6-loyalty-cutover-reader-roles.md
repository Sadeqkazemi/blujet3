# Microservices phase 6 — Loyalty cutover reader roles

## Scope

Provision two **offline, owner-invoked, read-only** PostgreSQL LOGIN roles for
the existing Loyalty cutover-readiness gate:

- `blujet_loyalty_cutover_source` on the named Core/shared database
- `blujet_loyalty_cutover_target` on the named isolated Loyalty database

This slice changes no table, HTTP route, worker flag, Kafka client, data or
deployment. It does not copy rows, activate a consumer or switch the Loyalty
read path.

## Role contract

- PostgreSQL 16+
- LOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOINHERIT, NOREPLICATION,
  NOBYPASSRLS
- No role memberships and no relation, schema or database ownership
- Session: `default_transaction_read_only=on`, `timezone=UTC`,
  `statement_timeout=5s`, `lock_timeout=2s`
- Source schema USAGE only on `loyalty` and `orders`; target schema USAGE only
  on `loyalty`; neither role receives schema CREATE
- Column-level SELECT only for the exact inputs used by the existing readiness
  gate

Both roles can read every column of the six projected business tables because
the existing reconciliation contract hashes the complete row:

- `club_members`
- `club_points_entries`
- `club_card_requests`
- `club_tier_rules`
- `price_locks`
- `customer_referrals`

The source role additionally reads only `producer`, `deliveredAt`,
`deadLetterAt` and `claimedAt` from `orders.commerce_outbox_events`, plus `id`,
`aggregateType`, `aggregateId` and `recordVersion` from
`loyalty.loyalty_projection_audits`.

The target role additionally reads only the parity fields from
`loyalty_projection_event_receipts` and `loyalty_projection_slots`, `status`
from `kafka_processing_failures`, and the group/topic/partition/offset fields
from `kafka_consumer_checkpoints`. It never receives receipt fingerprints,
failure payload/evidence fields or any other column.

Deny INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, sequence
USAGE/SELECT/UPDATE, TEMP, CREATE and foreign-schema access. When Core and
Loyalty share a PostgreSQL server, the source role cannot CONNECT to Loyalty
and the target role cannot CONNECT to Core. Isolation from every other database
remains an infrastructure control, not a cluster-wide ACL rewrite.

Passwords are 32–128 URL-safe characters (`A-Za-z0-9_-`). Owner usernames must
differ from the runtime writer and both cutover reader names. Source database
names must not match `^blujet_loyalty(?:$|[_-])`; target names must match it.
Source and target owner URLs must identify distinct databases.

Provisioning is transactional, idempotent and fail-closed. It resets role
attributes, memberships and grants before re-applying the exact contract. CLI
output contains `{ status, role, relationCount }` only. The documented PUBLIC
ACL baseline is a prerequisite and is verified without mutating PUBLIC or any
unrelated role.

## Configuration

| Variable                           | Use                                                |
| ---------------------------------- | -------------------------------------------------- |
| `LOYALTY_CUTOVER_SOURCE_OWNER_URL` | Core/shared owner URL for source provisioning      |
| `LOYALTY_CUTOVER_SOURCE_PASSWORD`  | password for `blujet_loyalty_cutover_source`       |
| `LOYALTY_CUTOVER_TARGET_OWNER_URL` | isolated Loyalty owner URL for target provisioning |
| `LOYALTY_CUTOVER_TARGET_PASSWORD`  | password for `blujet_loyalty_cutover_target`       |

Compiled scripts:

- `database:provision-loyalty-cutover-source:prod`
- `database:provision-loyalty-cutover-target:prod`

## Non-goals

- No migration, public/internal HTTP route or OpenAPI change
- No data transfer, dual-write, consumer/read flag, Compose change or deploy

## Acceptance evidence

- [x] Unit tests cover password/URL/kind validation, source/target exact grants,
      database identity, membership/elevation reset, absence of PUBLIC ACL
      mutation and rollback on verification failure.
- [x] Real PostgreSQL E2E proves the readiness queries, denied unrelated
      columns/writes/DDL/sequences/foreign schemas/counterpart CONNECT,
      fail-closed PUBLIC prerequisites, rerun correction and sanitized errors.
- [x] CI Loyalty job runs the E2E and remains in `ci-gate`.
- [x] Present the diff. Do not deploy, activate a consumer or cut over.
