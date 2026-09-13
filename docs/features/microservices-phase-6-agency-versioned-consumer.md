# Microservices phase 6 — Agency version-aware projection

## Scope

This slice prepares the independent Agency database to apply the three approved
Core full-snapshot events. Core remains the only business writer. The consumer
is an internal replay/catch-up component and is not attached to HTTP, Kafka or
the running Agency reader in this slice.

The target records immutable event receipts separately from aggregate-version
slots. A receipt makes exact delivery idempotent and rejects event-ID reuse;
the slot enforces monotonic aggregate versions and detects a divergent snapshot
at the same version. Receipt, slot and business projection commit in one
PostgreSQL transaction.

## Reconciliation and safety

- Profile events must arrive before dependent invoice or credit-request events;
  otherwise the complete transaction rolls back for safe retry.
- Reconciliation compares only the three business projections by row count and
  two order-independent full-row hashes. Its report contains no tenant IDs,
  contact data, amounts, free text, database URLs or credentials.
- The existing read-only HTTP credential, contracts and default-off cutover
  flags are unchanged.
- Kafka runtime, checkpoint/DLQ policy, baseline transfer, read cutover, writer
  freeze, UAT and deployment remain separate approval gates.

## Acceptance checklist

- [x] An expand-only standalone migration adds positive target versions,
  immutable receipts and aggregate-version slots.
- [x] Strict parsing accepts the three approved v1 snapshots and rejects
  malformed envelopes, unexpected fields, invalid enums, IRR, versions and UTC
  timestamps before SQL (`agency-projection-event.spec.ts`).
- [x] Newer snapshots atomically upsert their projection, exact redelivery is a
  duplicate and older versions are recorded as stale
  (`projection.integration-spec.ts`).
- [x] Reused event IDs and divergent same-version snapshots fail closed and
  roll back every target write (`projection.integration-spec.ts`).
- [x] Missing profile dependencies roll back cleanly and can be retried after
  the profile snapshot arrives (`projection.integration-spec.ts`).
- [x] Bounded read-only reconciliation reports MATCH/MISMATCH/INCONCLUSIVE
  without exposing business values (`projection.integration-spec.ts`).
- [x] Agency unit/integration tests, lint, typecheck, build, schema parity and
  migration rollback pass (28 unit, 8 projection and 70 reader E2E tests).
- [ ] Present the completed diff and obtain explicit owner approval before
  commit, push or merge. Do not activate Kafka, cut over reads or deploy.

## Verification

Local verification passed with Node 22 and PostgreSQL 16: 28 unit tests, eight
projection integration tests across two temporary independent databases and 70
existing reader E2E tests. Lint, strict typecheck, production build, OpenAPI
stability, TypeORM schema parity and additive-migration rollback/restore pass.
The TypeORM schema inspector emits the upstream pg deprecation warning while
checking enum metadata; the schema check itself passes with no drift.
