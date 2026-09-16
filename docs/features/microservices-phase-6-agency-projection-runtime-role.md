# Microservices phase 6 — Agency projection runtime role

## Scope

This slice provisions `blujet_agency_projection_runtime` as the restricted
LOGIN used by the independent Agency projection worker. Provisioning is
env-driven, idempotent and fail-closed. It does not start the worker, subscribe
to Kafka, copy data, dual-write, cut over HTTP reads, change
`AGENCY_PROJECTION_DATABASE_URL` in production, or change Compose/deploy.

The role exists so the worker can stop depending on the Agency database owner.
Activation of that URL remains a later, separately approved step.

## Allowed access (isolated Agency database only)

- CONNECT to a database whose name matches `^blujet_agency(?:_[A-Za-z0-9_]+)?$`
- USAGE on schema `agency` (no CREATE)
- `agency.agency_profiles`: SELECT, INSERT, UPDATE
- `agency.agency_invoices`: SELECT, INSERT, UPDATE
- `agency.agency_credit_requests`: SELECT, INSERT, UPDATE
- `agency.agency_projection_event_receipts`: SELECT, INSERT only (no UPDATE)
- `agency.agency_projection_slots`: SELECT, INSERT, UPDATE
- `agency.kafka_consumer_checkpoints`: SELECT, INSERT, UPDATE
- `agency.kafka_processing_failures`: SELECT, INSERT, UPDATE
- `default_transaction_read_only` is not set; the worker must write allowed rows

## Forbidden access

- Core (`blujet`) and every other database, including CONNECT
- schema `public` and `identity` / `orders` / `inventory` / `payments` /
  `loyalty` / `notify` / `experience` / `ops` / `audit` / `reporting`
- SUPERUSER, CREATEDB, CREATEROLE, INHERIT, REPLICATION, BYPASSRLS
- CREATE / ALTER / DROP, TEMP, ownership, role membership
- DELETE, TRUNCATE, REFERENCES, TRIGGER, sequence privileges
- UPDATE on `agency_projection_event_receipts`
- credentials and `pg_authid` password material

## Provisioning rules

- Role name is fixed: `blujet_agency_projection_runtime`
- Owner URL: `AGENCY_PROJECTION_DATABASE_OWNER_URL`
- Role password: `AGENCY_PROJECTION_RUNTIME_PASSWORD` (32–128 URL-safe)
- Owner username must differ from the runtime role
- Protocol must be `postgresql:` or `postgres:`; server version ≥ 16
- Before GRANT, existing privileges for this role are revoked and the contract
  is rebuilt. Other databases keep their owners and pre-existing non-PUBLIC
  CONNECT grantees.
- Missing required relations or leftover extra privileges fail closed inside
  the same transaction (rollback).
- CLI output is only `{ status, role, relationCount }`. Errors are redacted:
  no password, no full connection URL, no PII.

## Acceptance checklist

- [x] Docs freeze the exact role, per-table grants and deny list before code
  (`docs/features/microservices-phase-6-agency-projection-runtime-role.md`).
- [x] Provisioner follows the corrected Ops/Admin runtime pattern with an
  Agency-specific contract (`provision-agency-projection-runtime-role.ts`).
- [x] Weak passwords, non-PostgreSQL URLs, Core database names and owner=role
  are rejected without printing secrets
  (`provision-agency-projection-runtime-role.spec.ts`).
- [x] Exact grants, no extra tables, receipt UPDATE denied, membership/elevation
  reset, idempotent rerun and verification-failure rollback are unit-proven
  (`provision-agency-projection-runtime-role.spec.ts`).
- [x] Real PostgreSQL proves the seven tables, permitted DML, denied receipt
  UPDATE, DELETE/DDL/TEMP/sequence/cross-domain/Core CONNECT, no ownership or
  membership, idempotent rerun and fail-closed incomplete relations
  (`test/agency-projection-runtime-role.e2e-spec.ts`).
- [x] Dedicated Jest config and Agency CI job run the PostgreSQL proof; Backend
  E2E ignores this spec so it is not shard-selected
  (`test/jest-agency-projection-runtime-role.json`, `.github/workflows/ci.yml`,
  `backend/test/jest-e2e.json`).
- [x] Worker activation, Kafka, read cutover, Compose/deploy and production
  `AGENCY_PROJECTION_DATABASE_URL` remain unchanged.

## Deferred

Connect the worker as this role, enable the Kafka consumer, replay baseline
events and switch the writer URL under separate owner approval.
