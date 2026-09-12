# Microservices phase 6 — Loyalty Kafka projection worker

## Scope

This slice adds a standalone NestJS process that owns the Loyalty Kafka
consumer lifecycle and writes only to the dedicated Loyalty projection
database. The existing Loyalty HTTP process remains read-only and never
receives the projection-writer credential.

Consumption is disabled by default. Starting the worker requires an explicit
consumer flag, a dedicated projection database URL and valid Kafka settings.
Production additionally requires TLS and Loyalty-specific SCRAM credentials.
The worker subscribes to one exact topic with one stable consumer group, runs
the existing sequential manual-ACK adapter and becomes ready only after both
the database contract and consumer lifecycle are ready.

No public or internal business route changes. No baseline copy, retained-delta
replay, reader cutover, Core writer freeze, durable Kafka checkpoint, DLQ or
deployment is included.

## Acceptance checklist

- [x] Disabled configuration opens no Kafka connection and validates no unused
  broker secret.
- [x] Enabled configuration validates broker addresses, identifiers, size
  bounds, exact booleans and dedicated production TLS/SCRAM credentials.
- [x] The standalone worker requires `LOYALTY_PROJECTION_DATABASE_URL`; it does
  not use the HTTP reader URL or internal API token.
- [x] Startup connects, subscribes and runs the existing manual-ACK handler in
  order; startup and processing failures are content-free and fail closed.
- [x] Shutdown stops and disconnects once without exposing broker details.
- [x] `/health` is content-free and `/ready` checks the projection schema plus
  the consumer lifecycle without exposing topic, group, offset or credentials.
- [x] Focused tests, full Loyalty unit tests, lint, typecheck and build pass.
- [x] Present the diff and obtain explicit approval before commit/push/merge. Do not
  deploy or enable the worker in any environment.

Local evidence: all 106 Loyalty unit tests, 6 real-PostgreSQL projection tests
and 9 focused HTTP contract tests pass. Loyalty lint, typecheck and build pass.
The HTTP module no longer constructs the projection writer boundary.

## Deferred gates

Durable per-partition checkpoints and lag evidence, bounded retry policy,
operator-controlled DLQ/replay, baseline plus retained-delta execution, real
broker UAT, production secret provisioning, read cutover, Core writer freeze
and deployment remain separately reviewed phases.
