# Kafka commerce outbox foundation

The owner selected Kafka. Kafka complements a transactional Core outbox; it
does not replace atomic PostgreSQL writes. This slice prepares durable delivery
without splitting Order, Inventory or Payment or connecting Nira.

Backend checklist:
- [x] Read publisher/envelope and sibling Notify entity/service/dispatcher.
- [x] Document API and DB ownership before implementation.
- [x] Limit changes to Kafka transport/config, commerce outbox entity/migration,
  module wiring, tests and docs; no business-writer or frontend changes.
- [x] Strict startup flags and TLS plus SCRAM in production:
  `backend/src/config/kafka-events.config.spec.ts`; raw transport errors redacted:
  `backend/src/common/events/kafka-event-publisher.spec.ts`.
- [x] Disabled transport performs no network or polling; concurrent publishes
  share connection initialization; failures propagate, shutdown drains work:
  publisher spec above and `backend/test/commerce-outbox.e2e-spec.ts`.
- [x] Active transaction required, rollback removes event, semantic replay
  returns stable ID and changed payload conflicts under concurrent enqueue:
  `backend/test/commerce-outbox.e2e-spec.ts`.
- [x] Worker claims with SKIP LOCKED and fenced leases, sends persisted IDs,
  acknowledges only confirmed sends, retries and quarantines without deleting
  failed events: `backend/test/commerce-outbox.e2e-spec.ts`.
- [x] Additive migration apply/revert/reapply and entity/schema parity on local
  PostgreSQL 18: `backend/test/commerce-outbox.e2e-spec.ts`; PostgreSQL 16
  migration compatibility and E2E passed in CI `33970270336` for PR #50.
- [x] Local verification: all 751 Backend unit tests (135 suites), 15 focused
  PostgreSQL E2E tests, typecheck, build and scoped lint pass. After the final
  disconnect-error redaction, publisher tests and static/build checks rerun.
- [ ] Real Kafka broker/TLS/SASL outage and restart integration evidence.
- [x] CI `33970270336` and CodeQL `33970270393` passed; owner-approved PR #50
  merged as `49f9321`. No server deployment.

No HTTP endpoint is added (401/403 and tenant authorization remain with existing
domain callers). Enqueue is an internal API, not an authorization boundary.
Payloads must exclude PII and credentials; business payload schemas and actual
producers require a separate reviewed slice. Encryption at rest does not make
plaintext publication of PII acceptable.

Delivery semantics: at-least-once, not end-to-end exactly-once. A process crash
after Kafka ACK but before the DB update may resend the same event. Kafka
idempotent producers do not replace consumer deduplication. Aggregate keys
select Kafka partitions; cross-worker/domain event order is not guaranteed by
this foundation. Ordered business workflows need sequence-aware consumers.

`KAFKA_EVENTS_ENABLED=false` disables draining without deleting pending events.
Stop the worker before key rotation; pending encrypted rows need the old PII
key until migrated. No grants, broker provisioning or production deploy here.
The database dead-letter state is durable even if Kafka is unavailable. There
is no automatic replay, Kafka DLQ topic, consumer or Schema Registry yet.

Activation prerequisites: provision the topic and least-privilege broker ACLs,
apply the additive migration, verify Core DB-role access, and complete broker
integration tests before enabling the worker. The foundation polls one event
per second per instance and uses a two-minute lease with at most ten attempts;
load testing, backlog metrics/alerts and operational replay are still required
before business producers are connected. A corrupt envelope is quarantined
immediately; exhausted retries retain encrypted data for reviewed recovery.

Local verification (2026-09-05): the full unit run includes 47 focused event /
Kafka configuration tests; 15 PostgreSQL E2E tests passed, including Nest module
wiring and in-flight shutdown. Kafka was
mocked in these tests; no real broker or external business system was contacted.
The E2E fixture cleanup removes only rows created by its unique test producer.

KafkaJS reference: https://kafka.js.org/docs/producing and
https://kafka.js.org/docs/configuration. Explicit finite retries are needed
because idempotent producer retries otherwise default to MAX_SAFE_INTEGER.
