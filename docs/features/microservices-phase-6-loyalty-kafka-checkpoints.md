# Microservices phase 6 — Loyalty durable Kafka checkpoints

## Scope

This slice adds durable, per-partition progress evidence to the standalone
Loyalty projection worker. A checkpoint is keyed by consumer group, exact topic
and partition and stores the next offset, optional high watermark and UTC update
time. It is updated in the same PostgreSQL transaction as the event receipt,
aggregate slot and business projection. Kafka acknowledgement remains strictly
after that transaction.

Checkpoint offsets and high watermarks only move forward. Exact replay, stale
event and same-version duplicate paths also advance the checkpoint atomically;
conflict, dependency, transport and database failures advance neither the
checkpoint nor the broker offset. The runtime restores aggregate evidence before
connecting and updates its bounded in-memory view after successful delivery.

`GET /ready` exposes only partition count, maximum observed lag and last
checkpoint timestamp. It never exposes consumer group, topic, partition number,
offset, event identity, payload or credentials. No lag threshold is invented in
this phase, so lag is evidence rather than an automatic readiness failure.

No baseline copy, retained-delta replay, DLQ, production credential, read
cutover, Core writer freeze, Compose activation or deployment is included.

## Acceptance checklist

- [x] An expand-only migration creates the Loyalty-owned checkpoint table with
  composite identity and non-negative coordinate constraints
  (`loyalty-kafka-checkpoints.migration.spec.ts`).
- [x] Applied, exact replay, stale and same-version duplicate deliveries write
  projection state and checkpoint atomically; failures roll both back
  (`projection.integration-spec.ts`).
- [x] A replayed or out-of-order coordinate never moves persisted progress or
  high watermark backwards (`projection.integration-spec.ts`).
- [x] The Kafka adapter validates consumer group and optional high watermark,
  supplies delivery evidence to the projection, and ACKs only afterward
  (`loyalty-kafka.handler.spec.ts`).
- [x] The runtime restores durable summary before connecting and reports bounded
  current lag evidence after successful processing
  (`loyalty-kafka.runtime.spec.ts`).
- [x] Worker readiness verifies the checkpoint relation and returns only the
  safe aggregate evidence (`loyalty-worker-health.controller.spec.ts`).
- [x] Loyalty tests, migration rollback/restore, lint, typecheck and build pass.
- [x] Present the completed diff for explicit approval before commit/push/merge.
  Do not activate or deploy the worker.

Local evidence: 112 unit tests and 7 real-PostgreSQL projection tests pass;
Loyalty lint, typecheck and production build pass. The focused independent-domain
transfer contract tests, backend typecheck, scoped lint and backend build also
pass. No Kafka client, production credential, cutover or deployment was used.

## Deferred gates

Bounded retry classification, operator-controlled DLQ and replay, real Kafka
crash recovery UAT, baseline plus retained-delta execution, projection-writer
role provisioning, lag alert thresholds, read cutover, Core writer freeze and
deployment remain separate reviewed phases.
