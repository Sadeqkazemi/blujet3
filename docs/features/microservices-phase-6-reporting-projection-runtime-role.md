# Microservices phase 6 — Reporting projection runtime role

## Scope

Provision one non-owner PostgreSQL login for the independently runnable
Reporting projection worker. The role is restricted to the four tables already
owned by the standalone Reporting database and cannot connect to Core or any
other database on the same PostgreSQL cluster.

This slice changes no table, event, HTTP route, worker flag, database URL or
deployment manifest. It does not copy data or activate the Reporting consumer.

## Runtime contract

- Role: `blujet_reporting_projection_runtime`
- Database: an isolated database named `blujet_reporting` or
  `blujet_reporting_<suffix>` on PostgreSQL 16+
- Role attributes: LOGIN, NOINHERIT, NOSUPERUSER, NOCREATEDB, NOCREATEROLE,
  NOREPLICATION and NOBYPASSRLS
- Session defaults: UTC, a five-second statement timeout and no default
  transaction read-only mode because the projection worker must persist its
  own read model and delivery controls
- Schema: USAGE on `reporting`, without CREATE
- `core_itinerary_event_projections`: SELECT, INSERT, UPDATE
- `core_itinerary_event_receipts`: SELECT, INSERT only
- `kafka_consumer_checkpoints`: SELECT, INSERT, UPDATE
- `kafka_processing_failures`: SELECT, INSERT, UPDATE
- Denied everywhere: DELETE, TRUNCATE, DDL, sequence access, role membership,
  relation/schema/database ownership, Core database CONNECT and access to
  non-Reporting schemas

The offline provisioner uses an owner URL and a separately supplied 32–128
character URL-safe runtime password. A long-running process receives only its
runtime URL; the owner URL must never be passed to it.

## Acceptance checklist

- [x] Unit tests prove password, owner URL, database identity, exact grant
      validation and transactional rollback; a compiled missing-config smoke
      proves the CLI emits only its fixed sanitized failure.
- [x] Real PostgreSQL tests prove the worker's allowed inserts/updates/selects
      and deny receipt update, every delete, DDL, sequences, memberships,
      ownership, foreign-schema reads and Core/foreign database CONNECT.
- [x] Re-running the provisioner is idempotent and preserves explicit access
      held by other principals while still removing PUBLIC foreign CONNECT.
- [x] `.env.example`, package scripts, API/database documentation and the
      Reporting CI job describe and verify the same role.
- [x] Backend unit tests, read-only lint, typecheck, build and OpenAPI stability
      pass.
- [x] PostgreSQL 16, all eight Backend E2E shards, CodeQL and the CI gate passed
      as part of all 34 PR checks in CI run `34948343892`.
- [x] Present the completed diff and receive explicit approval before merge.
      Do not copy data, enable Kafka, cut over reads or deploy.
