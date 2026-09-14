# Microservices phase 6 — Agency poison-message quarantine

## Scope

This slice adds bounded retry evidence and an operator-controlled quarantine to
the standalone Agency Kafka projection worker. The independent Agency database
owns the registry. It stores only delivery coordinates, a SHA-256 fingerprint,
an optional validated event UUID, a safe failure stage, counters, lifecycle
status and decision audit metadata. It never stores Kafka payloads, keys,
headers, raw errors, credentials or Agency business fields.

`AGENCY_DLQ_ENABLED=false` remains the default. When enabled, a delivery is
quarantined after three failures by default, configurable only from two through
ten. Before that threshold the source offset remains uncommitted and retryable.
At the threshold it remains blocked until an authenticated operator approves
retry or skip. Retry reprocesses the retained source delivery. Skip atomically
marks the record skipped and advances the durable checkpoint before the broker
offset is acknowledged. There is no automatic skip.

Projection success resolves earlier failure evidence. A broker acknowledgement
failure after a committed projection is not counted as poison data; idempotent
redelivery closes that gap. Failure-registry or checkpoint-write failure is
fail-closed and never advances the broker offset.

No broker retention policy, historical payload republisher, consumer/flag
activation, credential provisioning, baseline transfer, read/writer cutover,
Compose change or deployment is included.

## Internal operator API

- `GET /internal/v1/agency/dlq?status=QUARANTINED&limit=50`
- `POST /internal/v1/agency/dlq/:id/retry`
- `POST /internal/v1/agency/dlq/:id/skip`

The decision body is `{ operatorId, reason }`. All routes require the independent
`AGENCY_DLQ_OPERATOR_TOKEN` and return only sanitized metadata.

## Acceptance checklist

- [x] Expand-only Agency-owned quarantine table, exact entity metadata and safe
  rollback (`agency-kafka-failure-quarantine.migration.spec.ts`,
  `projection.integration-spec.ts`).
- [x] Bounded transport/projection retry, quarantine and content fingerprint
  enforcement (`agency-kafka.handler.spec.ts`, `projection.integration-spec.ts`).
- [x] Authenticated and validated operator retry/skip decisions with audit data
  (`agency-dlq.http.spec.ts`, `projection.integration-spec.ts`).
- [x] Atomic skip/checkpoint ordering, projection-before-ACK and ACK-gap replay
  (`agency-kafka.handler.spec.ts`, `projection.integration-spec.ts`).
- [x] Safe readiness count with fail-closed registry health
  (`agency-worker-health.controller.spec.ts`).
- [x] Unit, HTTP, migration, real-PostgreSQL, lint, typecheck and build checks.
- [x] Present the completed diff for explicit approval before commit/push/merge.
  Do not activate or deploy.

Local evidence: all 117 Agency unit/HTTP tests, 12 real-PostgreSQL projection
tests and 70 E2E tests pass. Agency lint, typecheck, migration/entity schema
parity and production build pass. The generated public OpenAPI is unchanged.
