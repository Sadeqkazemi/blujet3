# Microservices phase 6 — Agency projection publisher activation

## Scope

This slice activates the existing encrypted transactional Agency projection
publisher at the current Core mutation boundaries for agency profiles,
invoices and credit requests. Core remains the only writer. No consumer,
baseline copy, read cutover, service URL, public API or deployment is enabled.

## Atomicity and privacy rules

- The business mutation, content-free projection audit and encrypted commerce
  outbox event commit in the same Core PostgreSQL transaction.
- The publisher reloads the post-write source row with an explicit internal
  revision select. Existing application reads and HTTP responses still omit
  `version`.
- Profile creation/suspension/reactivation, invoice creation/payment and credit
  request creation/decision publish the matching full snapshot and mutation.
- A publisher or outbox failure rolls back the source mutation and every
  consistency-sensitive row written by the same operation.
- Profile contact data remains only in encrypted outbox payloads. It is never
  added to logs, business-audit detail, errors or public responses.
- This is not dual-write: no Agency read-database row is written by Core.

## Acceptance checklist

- [x] Agency profile creation, suspension and reactivation publish ordered
  `CREATED`, `SUSPENDED` and `REACTIVATED` snapshots (Agencies E2E).
- [x] Invoice creation from direct, booking and seat-allotment flows publishes
  `CREATED`; payment publishes `PAID` in the same financial transaction
  (Agencies, Booking Engine and Commercial Overhaul E2E).
- [x] Credit-request creation and staff decision publish `CREATED` and
  `DECIDED` snapshots (Agency Portal E2E).
- [x] Forced projection failure proves rollback of profile, invoice and credit
  mutations, including associated ledger rows where applicable (Agencies and
  Agency Portal E2E).
- [x] Existing API envelopes, authorization, tenant scoping and version privacy
  remain unchanged (full Agencies and Agency Portal E2E suites).
- [x] Focused PostgreSQL E2E/unit tests, lint, typecheck and build pass.

## Deferred work

Kafka publication/runtime activation, the ordered Agency projection consumer,
checkpoint/DLQ handling, baseline-plus-delta replay, reconciliation, writer
freeze, `AGENCY_DATABASE_URL` cutover, UAT and deployment remain separate
approval gates.

Verification recorded: 1,258 Backend unit tests, 30 Agencies E2E tests, 38
Agency Portal E2E tests and 46 Booking Engine/Commercial Overhaul E2E tests
passed, with lint, typecheck and build. No service flag, consumer or deployment
was enabled.
