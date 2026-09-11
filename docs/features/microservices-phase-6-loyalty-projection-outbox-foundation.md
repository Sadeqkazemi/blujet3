# Microservices phase 6 — Loyalty projection outbox foundation

## Scope

This expand-only slice adds a positive source `version` to every Loyalty-owned
row in both the Core compatibility schema and the independently migrated
Loyalty database. It also adds a content-free Core projection audit and a
typed service that can enqueue any of the six approved full-snapshot events in
the existing encrypted commerce outbox inside the caller's transaction.

This is a publisher foundation, not publisher activation. Existing Loyalty
mutation paths are connected in separately reviewed slices so each business
transaction can be converted and tested without a broad rewrite. Core remains
the only writer and no direct write to the dedicated database is introduced.

## Transaction and replay rules

- Mutable rows use TypeORM optimistic versions; append-only points entries stay
  at version 1.
- Projection audit uniqueness is
  `(aggregateType, aggregateId, recordVersion)`.
- Audit rows are append-only and contain no member data, points, prices or PII.
- The audit and encrypted outbox insert require the caller's active Core
  transaction and roll back with it.
- Repeating the same aggregate/version/mutation and snapshot is idempotent;
  changing the mutation or snapshot fails closed.
- Existing baseline tooling continues to require exact source/target columns,
  so the standalone Loyalty migration adds the same six version columns.
- Baseline tooling allows the known Core-only audit table on the source while
  still rejecting unknown source tables and every extra target table.

## Acceptance checklist

- [x] Expand-only Core migration adds six positive version columns and an
  immutable content-free audit table; rollback removes only this slice.
- [x] Standalone Loyalty migration adds the matching six version columns and
  preserves exact baseline transfer compatibility.
- [x] TypeORM metadata matches both migrated schemas.
- [x] The projection service requires an active transaction and enqueues exact
  approved v1 events with stable per-version idempotency keys.
- [x] Same-version replay is idempotent while mutation or snapshot divergence
  fails closed without plaintext PII persistence.
- [x] Focused migration/service/PostgreSQL tests, full unit suites, lint,
  typecheck and build pass.

## Deferred work

The next slices connect Club administration and then points/price-lock/referral
mutations to this service. After every Core writer is connected, the dedicated
Loyalty inbox/upsert, baseline-plus-delta replay and reconciliation can be
implemented. No Kafka consumer, cutover, flag activation or deployment is part
of this foundation.
