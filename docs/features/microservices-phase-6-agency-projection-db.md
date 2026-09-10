# Microservices phase 6 — Agency projection database bootstrap

## Scope

The independent Agency process currently serves three read contracts: agency
profile, invoices and credit requests. This slice gives those projections a
standalone PostgreSQL bootstrap. It intentionally does not move the remaining
Agency command, API-key, document, messaging or seat-allotment tables.

Core remains the only writer. No production data is copied, no event consumer
is activated, no dual-write is added, and no URL or deployment changes.

## Projection ownership

The Agency read database contains `agency_profiles`, `agency_invoices` and
`agency_credit_requests` in schema `agency`, with three local enum types. The
two child projections reference the local profile. Identity operator IDs and
Core booking IDs are stable scalar references with no cross-database foreign
key or runtime join.

The projection keeps all fields needed by the existing default-off internal
contracts, including exact `bigint` IRR values. API responses remain decimal
strings and timestamps retain the current UTC application contract.

## Acceptance checklist

- [x] Standalone development and compiled TypeORM migration commands use only
  `AGENCY_DATABASE_URL`.
- [x] A fresh PostgreSQL database receives exactly three projection tables,
  three local enum types and a dedicated migration history.
- [x] TypeORM entity metadata reports no schema drift after migration.
- [x] Only invoice/credit-request to local-profile foreign keys exist.
- [x] Rollback removes only the `agency` schema.
- [x] CI tests the projection database separately from shared-schema
  compatibility tests.
- [ ] Publish approved Agency projection events, replay a complete baseline
  and ordered deltas, reconcile tenant counts/amounts/checksums in UAT, then
  switch `AGENCY_DATABASE_URL` under separate approval.

## Deferred command ownership

Membership approval, credit mutation, invoice settlement, API credentials,
documents, messaging, web-service requests and seat allotments remain in Core.
Each writer moves only after its command API, idempotency, outbox events, Saga
compensation and reconciliation gates are separately proven. Physical read
separation does not authorize a second writer.
