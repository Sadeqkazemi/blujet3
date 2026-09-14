# Microservices phase 6 — Ops/Admin Kafka projection worker

## Boundary

This slice wraps the existing Ops/Admin manual-ack handler in a standalone,
opt-in KafkaJS lifecycle. The process owns only the dedicated Ops/Admin
projection database and never receives Core database credentials. It remains
absent from Compose and deployment workflows, so merging this code cannot start
the consumer or change any public read path.

The runtime is disabled by default. An enabled worker requires an exact topic,
stable consumer group, bounded event size and dedicated production TLS/SCRAM
identity. Startup order is connect, exact-topic subscribe, then run the existing
sequential manual-ack handler. Partial startup disconnects; shutdown stops and
disconnects once. Broker, payload, database and credential errors are replaced
with bounded safe messages.

`GET /health` exposes only service/build identity. `GET /ready` checks the
projection database and reports only the consumer lifecycle state. No topic,
group, offset, lag, payload, identifier or raw error is returned.

## Acceptance checklist

- [x] Default-disabled configuration creates no Kafka client or broker call.
- [x] Enabled startup validates dedicated configuration, connects, subscribes
      to the exact topic and runs the existing manual-ack handler in order.
- [x] Ambiguous flags, malformed identifiers/limits and insecure production
      credentials fail before any broker call.
- [x] Startup, processing and shutdown failures are sanitized; partial startup
      disconnects and shutdown is idempotent.
- [x] Internal health/readiness disclose only build identity, database state and
      bounded consumer lifecycle state.
- [x] The worker uses only `OPS_ADMIN_PROJECTION_DATABASE_URL`; public API,
      OpenAPI, schemas, Core writers and read flags remain unchanged.
- [x] Unit tests, lint, typecheck and production build pass before review.
- [x] Owner approves the complete diff before commit/push/merge. No consumer
      activation, cutover or deployment is included.

Evidence: all 224 Backend unit suites (1,329 tests), six focused Ops/Admin
suites (62 tests), and four real-PostgreSQL projection tests pass. The database
proof ran after both existing migrations on a fresh isolated database that was
removed after the test. Scoped lint, typecheck, production build, diff hygiene
and OpenAPI stability pass.
