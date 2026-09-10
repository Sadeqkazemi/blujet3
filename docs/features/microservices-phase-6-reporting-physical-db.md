# Microservices phase 6 — Reporting physical database bootstrap

## Scope

Reporting already runs as an independent NestJS worker and connects through
`REPORTING_DATABASE_URL`, but a fresh Reporting database previously required
the complete Backend migration history. This slice gives Reporting its own
TypeORM DataSource and one bootstrap migration containing only the four
Reporting-owned tables.

This is infrastructure readiness, not a production cutover. It does not copy
or delete data, enable Kafka consumption, change an HTTP route, introduce a
dual-write, or deploy a service.

## Ownership and boundaries

- Reporting owns the projection, receipt, Kafka checkpoint and sanitized
  failure-quarantine tables in schema `reporting`.
- `orderId` and `eventId` are stable event references. There is no foreign key,
  ORM relation or runtime join to Core, Identity, Agency, Loyalty, Experience
  or Notify.
- The worker and migration CLI share the same four-entity metadata. Runtime
  migration execution remains disabled.
- The existing Reporting tables in the Core migration history remain only for
  pre-cutover compatibility. Removing them is destructive and is deferred
  until transfer, reconciliation and rollback-retention gates have passed.

## Acceptance checklist

- [x] Standalone development and compiled-production migration commands use
  only `REPORTING_DATABASE_URL`.
- [x] A fresh PostgreSQL database receives exactly four Reporting tables and a
  dedicated `reporting_migrations` history table.
- [x] TypeORM metadata reports no schema drift after bootstrap.
- [x] Rollback removes the Reporting schema without touching another domain.
- [x] Unit tests prove exact entity/migration ownership and absence of
  cross-domain foreign keys.
- [x] CI provisions Reporting from an empty database without running the Core
  migration chain.
- [ ] Provision a non-superuser database/role, back up and transfer existing
  Reporting rows, compare row counts and checksums, exercise Kafka replay/DLQ
  in UAT, and switch `REPORTING_DATABASE_URL` under separate approval.

## Operational cutover gate

Take a backup, stop the Reporting consumer, migrate and reconcile all four
tables, run UAT replay and quarantine checks, then change the URL and resume the
single writer. Any parity mismatch is a no-go. Rollback stops the new worker,
restores the old URL and preserves both database copies for investigation.
