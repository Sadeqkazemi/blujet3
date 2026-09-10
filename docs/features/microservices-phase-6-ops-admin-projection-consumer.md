# Microservices phase 6 — Ops/Admin ordered projection consumer

## Scope

This slice completes the database-side admission boundary for the approved
`CartableTaskProjected` v1 event. It adds an idempotent receipt and monotonic
full-snapshot upsert to the dedicated Ops/Admin projection database, plus a
bounded read-only reconciliation report. Core remains the only cartable writer.

Kafka subscription, baseline replay, repair, reader URL cutover, feature-flag
activation and server deployment are deliberately excluded. The new consumer
is callable by the next transport slice but is not started by the current
read-only Ops/Admin process.

## Data and failure rules

- A projection accepts only the strict content-free v1 event contract.
- Event receipt and projection mutation commit in one PostgreSQL transaction.
- Exact event-ID replay returns `duplicate`; reuse with different content
  returns `IDEMPOTENCY_PAYLOAD_MISMATCH`.
- A lower `taskVersion` returns `stale`; an equal version with identical
  semantic content returns `duplicate`; an equal version with different
  content returns `CONFLICT`.
- Reconciliation is read-only, bounded to 10,000 rows and reports counts only.
- No task content, PII, connection URL or stable identifier is written to CLI
  output or error output.

## Acceptance checklist

- [x] Expand-only standalone migration adds projection ordering fields and the
  content-free receipt table; compiled rollback restores the bootstrap schema.
- [x] Strict admission applies a newer snapshot once and handles exact,
  semantic and stale replays idempotently.
- [x] Conflicting event IDs or equal task versions fail closed and leave both
  receipt and projection state unchanged.
- [x] Concurrent/out-of-order deliveries cannot regress a task projection.
- [x] Bounded reconciliation reports match/missing/unexpected/stale/divergent
  totals without identifiers and never mutates either database.
- [x] Existing Ops/Admin HTTP/auth/read-only behavior and default-off runtime
  remain unchanged; focused tests, lint, typecheck and build pass.

## Deferred UAT activation

Provision a dedicated projection writer credential, connect the Kafka handler,
replay the approved baseline and deltas, run reconciliation to `MATCH`, then
switch the restricted reader URL under separate owner approval. Rollback keeps
Core as the single writer and returns reads to the current compatibility path.
