# Microservices phase 6 — Ops/Admin durable Kafka checkpoints

## Boundary

This slice adds durable, content-free consumer progress to the standalone
Ops/Admin projection database. It does not activate Kafka, change a public API,
copy a baseline, switch reads, provision production credentials or deploy.

For every successfully applied, duplicate or stale `CartableTaskProjected`
delivery, the projection transaction advances one checkpoint identified by the
exact consumer group, topic and partition. `nextOffset` and `highWatermark`
never move backwards. The transaction must commit before the Kafka offset is
acknowledged; a database failure is retryable and receives no acknowledgement.

The runtime restores existing checkpoint evidence before connecting to Kafka.
Internal readiness returns only the number of observed partitions, the maximum
observed lag and the last checkpoint timestamp. It never returns topic, group,
partition coordinates, offsets, event identity, payload or credentials. Lag is
observability evidence only; no readiness threshold is introduced here.

## Acceptance checklist

- [x] The expand-only migration creates the exact checkpoint table, constraints
      and composite primary key and can be rolled back in isolation.
- [x] Applied, exact duplicate, semantic duplicate and stale deliveries persist
      projection outcome and checkpoint atomically.
- [x] Reused event IDs, equal-version conflicts and checkpoint failures write
      no partial projection state and receive no Kafka acknowledgement.
- [x] Concurrent or replayed offsets cannot move `nextOffset` or
      `highWatermark` backwards.
- [x] The runtime restores the bounded checkpoint summary before connecting and
      tracks successful deliveries without exposing coordinates.
- [x] Disabled mode makes no database-summary or broker call.
- [x] Internal readiness verifies the checkpoint relation and exposes only
      aggregate partition count, lag and UTC timestamp.
- [x] Focused unit and real-PostgreSQL tests, read-only lint, typecheck,
      production build, diff hygiene and OpenAPI stability pass.
- [ ] Owner approves the complete diff before commit/push/merge. No consumer
      activation, read cutover or deployment is included.

## Local evidence

- All 225 Backend unit suites and 1,335 tests pass; the six focused suites pass
  50 tests after the final transport hardening.
- Seven real-PostgreSQL cases pass after applying all three standalone
  Ops/Admin migrations, including atomic rollback, monotonic replay, ACK-gap
  recovery and migration down/up.
- TypeORM reports the migrated projection schema is up to date with no pending
  synchronization query.
- Scoped read-only ESLint, typecheck, production build, `git diff --check` and
  unchanged `docs/openapi.json` pass.
- Both exact disposable PostgreSQL databases were removed after verification.
