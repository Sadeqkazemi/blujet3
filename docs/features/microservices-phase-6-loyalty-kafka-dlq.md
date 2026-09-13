# Microservices phase 6 — Loyalty poison-message quarantine

## Scope

This slice adds bounded retry evidence and an operator-controlled quarantine to
the standalone Loyalty Kafka projection worker. The registry is owned by the
independent Loyalty database and stores only delivery coordinates, a SHA-256
fingerprint, an optional validated event UUID, a safe failure stage, counters,
status and decision audit metadata. It never stores Kafka payloads, keys,
headers, raw errors, credentials or Loyalty business fields.

`LOYALTY_DLQ_ENABLED=false` remains the default. When enabled, a delivery is
quarantined after three failures by default, configurable only from two through
ten. Before that threshold the source offset remains uncommitted and retryable.
At the threshold the offset remains blocked until an authenticated operator
approves retry or skip. Retry reprocesses the retained source delivery; skip
atomically marks the record skipped and advances the durable checkpoint before
the broker offset is acknowledged. There is no automatic skip.

Projection success resolves earlier failure evidence. A broker acknowledgement
failure after a committed projection is not counted as poison data; normal
idempotent replay closes that gap. Failure-registry or checkpoint-write failure
is fail-closed and never advances the broker offset.

No broker retention policy, historical payload republisher, automatic repair,
consumer/flag activation, credential provisioning, read/writer cutover,
Compose change or deployment is included.

## Internal operator API

- `GET /internal/v1/loyalty/dlq?status=QUARANTINED&limit=50`
- `POST /internal/v1/loyalty/dlq/:id/retry`
- `POST /internal/v1/loyalty/dlq/:id/skip`

The decision body is `{ operatorId, reason }`. All routes require the independent
`LOYALTY_DLQ_OPERATOR_TOKEN` and return only sanitized metadata; topic,
partition, offset, payload, key, headers and raw errors are never returned.

## Acceptance checklist

- [x] An expand-only migration adds the Loyalty-owned quarantine table with a
  unique delivery identity, bounded counters/states and no foreign keys
  (`loyalty-kafka-failure-quarantine.migration.spec.ts`).
- [x] Transport and projection failures retry without ACK and become blocked at
  the configured threshold; acknowledgement gaps do not increment failures
  (`loyalty-kafka.handler.spec.ts`, `projection.integration-spec.ts`).
- [x] Same delivery coordinates with different content fail closed
  (`projection.integration-spec.ts`).
- [x] Operator retry and skip transitions are authenticated, validated,
  pessimistically locked and auditable (`loyalty-dlq.http.spec.ts`,
  `projection.integration-spec.ts`).
- [x] Skip advances the checkpoint in the same transaction as the terminal
  status, then ACKs; replay after an ACK gap remains idempotent
  (`loyalty-kafka.handler.spec.ts`, `projection.integration-spec.ts`).
- [x] Readiness exposes only the quarantined count and fails safely when the
  registry is unavailable (`loyalty-worker-health.controller.spec.ts`).
- [x] Migration rollback/restore, unit, HTTP, real-PostgreSQL, lint, typecheck
  and build checks pass.
- [x] Present the completed diff for explicit approval before commit/push/merge.
  Do not activate or deploy.

Local evidence: all 132 Loyalty unit/HTTP tests and 10 real-PostgreSQL
projection tests pass; Loyalty lint, typecheck, migration/entity schema parity
and production build pass. No Kafka/DLQ flag, broker credential, URL, Compose
profile, read/writer cutover or deployment was activated.
