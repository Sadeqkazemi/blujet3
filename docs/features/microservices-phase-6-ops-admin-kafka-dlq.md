# Microservices phase 6 — Ops/Admin poison-message quarantine

## Scope

This slice adds bounded retry evidence and an operator-controlled quarantine to
the standalone Ops/Admin Kafka projection worker. The independent Ops/Admin
database owns the registry. It stores only delivery coordinates, a SHA-256
fingerprint, an optional validated event UUID, a safe failure stage, counters,
lifecycle status, UTC timestamps and decision audit metadata. It never stores
Kafka payloads, keys, headers, raw errors, credentials, task identifiers,
cartable content, passenger data or financial data.

`OPS_ADMIN_DLQ_ENABLED=false` remains the default. When enabled, a delivery is
quarantined after three failures by default, configurable only from two through
ten. Before that threshold the source offset remains uncommitted and retryable.
At the threshold it remains blocked until an authenticated operator approves
retry or skip. Retry allows another bounded processing cycle. Skip atomically
marks the record skipped and advances the durable checkpoint before the broker
offset is acknowledged. There is no automatic skip.

Projection success resolves earlier failure evidence. A broker ACK failure
after a committed projection is not classified as poison data; idempotent
redelivery closes that gap. Failure-registry or checkpoint-write failure is
fail-closed and never advances the broker offset.

No broker retention policy, historical payload store/republisher, shared-topic
routing, consumer activation, baseline transfer, read cutover, Compose change
or deployment is included.

## Internal operator API

- `GET /internal/v1/ops-admin/dlq?status=QUARANTINED&limit=50`
- `POST /internal/v1/ops-admin/dlq/:id/retry`
- `POST /internal/v1/ops-admin/dlq/:id/skip`

The decision body is `{ operatorId, reason }`. `operatorId` has a strict
machine-identity format and `reason` is a fixed allowlisted code rather than
free text. All routes require the dedicated `OPS_ADMIN_DLQ_OPERATOR_TOKEN` and
return only sanitized metadata.

Allowed reason codes are `TRANSIENT_DEPENDENCY_RECOVERED`,
`PROJECTION_FIX_DEPLOYED`, `SCHEMA_COMPATIBILITY_CONFIRMED`,
`MESSAGE_REJECTED_AFTER_REVIEW` and `DUPLICATE_DELIVERY_CONFIRMED`.

## Acceptance checklist

- [x] Expand-only Ops/Admin-owned quarantine table and exact TypeORM metadata
  (`ops-admin-kafka-failure-quarantine.migration.spec.ts`,
  `ops-admin-projection-data-source.options.spec.ts`).
- [x] Bounded transport/projection retry, quarantine and content-fingerprint
  enforcement (`ops-admin-kafka.handler.spec.ts`).
- [x] Authenticated, validated operator retry/skip decisions with bounded audit
  codes (`ops-admin-dlq-auth.guard.spec.ts`, `ops-admin-dlq.http.spec.ts`).
- [x] Atomic skip/checkpoint ordering, projection-before-ACK, registry failure
  and ACK-gap replay (`ops-admin-kafka.handler.spec.ts`).
- [x] Sanitized readiness count, fail-closed registry health and recovered
  runtime state (`ops-admin-projection-worker-health.controller.spec.ts`,
  `ops-admin-kafka.runtime.spec.ts`).
- [x] Exact restricted runtime grant SQL for the new control table
  (`provision-ops-admin-projection-runtime-role.spec.ts`).
- [ ] Run the authored real-PostgreSQL retry/skip, fingerprint, migration
  rollback and allow/deny proofs in CI
  (`ops-admin-projection-consumer.e2e-spec.ts`,
  `ops-admin-projection-runtime-role.e2e-spec.ts`).
- [x] All 230 Backend unit suites (1,371 tests), full read-only lint, typecheck,
  build, unchanged public OpenAPI and diff-hygiene checks pass locally.
- [ ] Owner review before commit/push/merge. No activation, cutover or deploy.
