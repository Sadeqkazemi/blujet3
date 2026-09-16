# Microservices phase 6 — Ops/Admin worker runtime-role attestation

## Scope

This slice makes the independent Ops/Admin projection worker prove its active
PostgreSQL identity and effective least-privilege contract before it reads a
durable checkpoint or opens Kafka. The same attestation runs before the
readiness relation probes. It does not create or alter a role, add a migration,
copy data, enable the consumer, cut over reads, change Compose, or deploy.

## Runtime contract

When the Kafka consumer is enabled, startup must run in this order:

1. attest the live database session;
2. restore the durable checkpoint;
3. connect to Kafka;
4. subscribe and run the handler.

The session must be a direct login as
`blujet_ops_admin_projection_runtime`: both `current_user` and `session_user`
must match. The current database name must match
`^blujet_ops_admin(_[A-Za-z0-9_]+)?$`, and `search_path` must be exactly
`ops, pg_catalog`.

Attestation verifies the frozen provisioner contract:

- LOGIN with NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOINHERIT,
  NOREPLICATION and NOBYPASSRLS;
- no role memberships and no database, schema or relation ownership;
- CONNECT only to the current isolated database;
- schema `ops` USAGE without CREATE, and no database CREATE or TEMP;
- SELECT/INSERT/UPDATE on `cartable_tasks`, `kafka_consumer_checkpoints` and
  `kafka_processing_failures`;
- SELECT/INSERT only on `cartable_projection_event_receipts`;
- no access to unexpected Ops/Admin relations, foreign-domain relations or
  sequences, and no DELETE/TRUNCATE/REFERENCES/TRIGGER privileges.

## Failure and observability rules

- Any missing or extra privilege fails closed with one fixed, sanitized startup
  error. No query row, URL, role metadata or credential is logged.
- Attestation or checkpoint failure must not call Kafka connect, subscribe,
  run, stop or disconnect.
- Once a broker connection has been attempted, existing partial-startup
  disconnect behavior remains unchanged.
- Disabled mode remains connection-free and does not attest.
- Liveness remains process-only. Readiness attests first, then performs the
  existing four zero-row relation probes and reports the existing sanitized
  database-down shape on any failure.

## Acceptance checklist

- [x] Freeze startup ordering, exact identity, grants and deny rules before
  implementation.
- [x] Add one shared, read-only attestation query used by worker startup and
  readiness.
- [x] Prove direct-login identity, required grants, unexpected privileges and
  sanitized failure with unit tests.
- [x] Prove startup ordering and that pre-broker failures make no Kafka call.
- [x] Preserve disabled behavior, shutdown semantics and readiness response
  shape.
- [x] Pass focused tests, read-only lint, typecheck, build, diff hygiene and
  OpenAPI stability.
- [ ] Present the diff and CI evidence before merge. Consumer activation,
  cutover and deployment remain separate approvals.

## Local evidence

- 29 focused unit tests pass across attestation, startup and readiness.
- All 247 Backend unit suites pass (1,521 tests).
- Scoped read-only ESLint, TypeScript typecheck and the production build pass.
- `git diff --check` passes and `docs/openapi.json` remains byte-identical.
