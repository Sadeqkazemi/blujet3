# Microservices phase 6 — Agency Kafka projection worker

## Scope

This slice adds a standalone NestJS process that owns the Agency Kafka
consumer lifecycle and writes only to the dedicated Agency projection
database. The existing Agency HTTP process remains read-only and never receives
the projection-writer credential.

Consumption is disabled by default. Starting the worker requires an explicit
consumer flag, a dedicated projection database URL and valid Kafka settings.
Production additionally requires TLS and Agency-specific SCRAM credentials.
The worker subscribes to one exact topic with one stable consumer group, runs
the existing sequential manual-ACK adapter and becomes ready only after both
the database contract and consumer lifecycle are ready.

No public or internal business route changes. No baseline copy, retained-delta
replay, reader cutover, Core writer freeze, durable Kafka checkpoint, DLQ or
deployment is included.

## Acceptance checklist

- [x] Disabled configuration opens no Kafka connection and validates no unused
  broker secret (`agency-kafka.config.spec.ts`, `agency-kafka.runtime.spec.ts`).
- [x] Enabled configuration validates broker addresses, identifiers, size
  bounds, exact booleans and dedicated production TLS/SCRAM credentials
  (`agency-kafka.config.spec.ts`).
- [x] The standalone worker requires `AGENCY_PROJECTION_DATABASE_URL`; it does
  not use the HTTP reader URL or internal API token
  (`agency-worker.config.spec.ts`).
- [x] Startup connects, subscribes and runs the existing manual-ACK handler in
  order; startup and processing failures are content-free and fail closed
  (`agency-kafka.runtime.spec.ts`).
- [x] Shutdown stops and disconnects once without exposing broker details
  (`agency-kafka.runtime.spec.ts`).
- [x] `/health` is content-free and `/ready` checks the complete Agency
  projection schema plus consumer lifecycle without exposing topic, group,
  offset, payload or credentials (`agency-worker-health.controller.spec.ts`).
- [x] The HTTP service no longer constructs the projection writer boundary
  (`app.module.ts`, production build and 70 HTTP E2E tests).
- [x] Focused tests, full Agency unit tests, real-PostgreSQL projection tests,
  E2E, lint, typecheck and build pass.
- [x] Present the diff and obtain explicit approval before commit/push/merge.
  Do not deploy or enable the worker in any environment.

## Deferred gates

Durable per-partition checkpoints and lag evidence, bounded retry policy,
operator-controlled DLQ/replay, baseline plus retained-delta execution, real
broker UAT, production secret provisioning, read cutover, Core writer freeze
and deployment remain separately reviewed phases.

## Local evidence

All 92 Agency unit tests, 9 real-PostgreSQL projection tests and 70 HTTP E2E
tests pass. Agency lint, typecheck and production build pass. The worker entry
artifact is built, and regenerated OpenAPI remains byte-compatible with the
tracked HTTP contract.
