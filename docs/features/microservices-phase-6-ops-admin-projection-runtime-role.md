# Microservices phase 6 — Ops/Admin projection runtime role

## Scope

This slice provisions `blujet_ops_admin_projection_runtime` as the restricted
LOGIN used by the independent Ops/Admin projection worker. Provisioning is
env-driven, idempotent and fail-closed. It does not start the worker, subscribe
to Kafka, cut over HTTP reads, change Compose/deploy, or add a production
migration for `ops.kafka_consumer_checkpoints`.

The checkpoint table contract is owned by Codex migration
`1794038400000-OpsAdminKafkaConsumerCheckpoints`. This provisioner grants DML
only after that relation exists (or a test fixture creates the same table for
allow/deny proof). The table name and columns stay:

`consumerGroup`, `topic`, `partition`, `nextOffset`, `highWatermark`, `updatedAt`.

## Allowed access (Ops/Admin database only)

- CONNECT to a database whose name matches `^blujet_ops_admin(_[A-Za-z0-9_]+)?$`
- USAGE on schema `ops` (no CREATE)
- `ops.cartable_tasks`: SELECT, INSERT, UPDATE
- `ops.cartable_projection_event_receipts`: SELECT, INSERT only (no UPDATE)
- `ops.kafka_consumer_checkpoints`: SELECT, INSERT, UPDATE
- `default_transaction_read_only` is not set; the worker must write allowed rows

## Forbidden access

- Core (`blujet`) and every other database's object privileges
- schema `public` and `identity` / `orders` / `inventory` / `payments` /
  `agency` / `loyalty`
- SUPERUSER, CREATEDB, CREATEROLE, BYPASSRLS, INHERIT
- CREATE / ALTER / DROP, ownership, role membership
- DELETE, TRUNCATE, sequence privileges, and UPDATE on receipts
- credentials and `pg_authid` password material

## Provisioning rules

- Owner URL: `OPS_ADMIN_PROJECTION_DATABASE_OWNER_URL`
- Role password: `OPS_ADMIN_PROJECTION_RUNTIME_PASSWORD` (32–128 URL-safe)
- Owner username must differ from the runtime role
- Protocol must be `postgresql:` or `postgres:`; server version ≥ 16
- Errors are redacted: no password, no full connection URL
- Missing required relations fail closed; no default-privilege GRANT for
  future tables

## Acceptance checklist

- [x] Docs freeze the exact role, per-table grants and deny list before code
  (`docs/features/microservices-phase-6-ops-admin-projection-runtime-role.md`).
- [x] Provisioner follows existing `provision-*-role.ts` patterns and is
  idempotent (`provision-ops-admin-projection-runtime-role.spec.ts`,
  `test/ops-admin-projection-runtime-role.e2e-spec.ts`).
- [x] Weak passwords, non-PostgreSQL URLs, Core database names and owner=role
  are rejected without printing secrets
  (`provision-ops-admin-projection-runtime-role.spec.ts`).
- [x] Real PostgreSQL proves tasks/checkpoints SELECT/INSERT/UPDATE, receipts
  SELECT/INSERT with UPDATE denied, and rejects DELETE, TRUNCATE, sequences,
  DDL, public writes, foreign schemas and Core objects
  (`test/ops-admin-projection-runtime-role.e2e-spec.ts`).
- [x] Worker activation, read cutover, Compose/deploy and production
  credentials remain unchanged.

## Deferred

Connect the worker as this role, enable the Kafka consumer, replay baseline
events and switch the HTTP reader URL under separate owner approval.
