# Reporting Kafka worker process

This slice gives the existing Reporting projection consumer its own NestJS
process while reusing the validated event admission, projection transaction and
manual Kafka acknowledgement code. It does not add a public API, create a new
business writer, or move Order, Inventory or Payment out of the Core ACID
boundary.

The worker connects with `REPORTING_DATABASE_URL`, which must belong to a
dedicated non-superuser role restricted to the `reporting` schema. It never runs
migrations. Schema changes remain an operator-owned Core migration step. Kafka
consumption is fail-closed and requires the existing explicit enable flag; in
production it also requires TLS and dedicated SCRAM credentials.

The existing backend remains API-compatible. Its embedded consumer stays
disabled unless explicitly configured, so introducing the worker image alone
does not create a second active consumer. Production activation, credential
provisioning and deployment require separate approval.

## Acceptance checklist

- [x] A dedicated `reporting-worker` NestJS entry point loads only the three
  Reporting projection/checkpoint entities and the existing Kafka runtime
  (`reporting-worker.config.spec.ts`, production build entrypoint assertion).
- [x] Worker configuration rejects a disabled consumer, missing database URL,
  invalid port, or insecure production Kafka configuration before startup
  (`reporting-worker.config.spec.ts`, existing Kafka config regression).
- [x] `/health` exposes only service/build identity; `/ready` requires both the
  Reporting database and Kafka lifecycle to be ready without exposing topic,
  group, credentials, offsets, payloads or database rows
  (`reporting-worker-health.controller.spec.ts`).
- [x] The worker container has no migration/seed entrypoint and production
  Compose keeps it behind an opt-in profile with a dedicated database URL
  (`Dockerfile.reporting-worker`, parsed `docker-compose.prod.yml`).
- [x] Existing public APIs, Core writers, schemas, feature flags and server
  deployment state remain unchanged.
- [x] 24 focused tests, all 985 Backend unit tests, 10 Reporting/schema-parity
  PostgreSQL tests, repository-wide read-only lint, typecheck and production
  build pass.
