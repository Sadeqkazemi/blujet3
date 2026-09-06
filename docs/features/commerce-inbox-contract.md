# Event Bus: Core receive contract and transactional inbox

This delivers the Core-owned receive/deduplication seam within roadmap step 13,
not another service extraction or a completed Event Bus. Existing v1 envelopes
remain compatible; domain payload schemas and real consumer activation remain
explicitly open. Do not change Order/Inventory/Payment ownership.

## Contract and ownership

`CommerceInboxService.consume(consumer, expectedProducer, event, apply)` owns a
READ COMMITTED transaction. Consumer and expectedProducer are trusted local
configuration, never copied from a received message. Validate the existing v1
envelope and exact producer before any DB query. Serialize by `(consumer,eventId)`
using a transaction advisory lock; compare a SHA-256 fingerprint of the entire
envelope with object keys sorted (array order preserved). Exact retry returns
`duplicate`, invokes no handler and does not modify the receipt. Changed content
under the same key is `IDEMPOTENCY_PAYLOAD_MISMATCH`, never silently accepted.

For new events, insert a receipt and invoke `apply(manager, event)` in the same
transaction. Handler failure rolls back BOTH receipt and local DB effects.
Return `processed` only after commit. Caller acknowledges a Kafka offset only
after `processed`/`duplicate`; on any exception it must not acknowledge. Handlers
use only the supplied manager and local Core DB writes, no network calls or
cross-service writes; external effects require a transactional outbox. This is
not an automatic Saga, authorization layer, sequence guard or exactly-once Kafka.

`orders.commerce_inbox_receipts` belongs only to Core. Other services must keep
their own receipts alongside their own effects, not reuse this table remotely.
No payload or credentials are stored, only consumer/event ID, SHA-256 and UTC
receipt time. No TTL/delete/grants/seed or background consumer is introduced.
Retain receipts across rollback/restarts; deleting them permits old events to
apply again. Lock wait is bounded to 5 seconds; errors propagate for retry.

## Backend checklist

- [x] Read architecture, envelope, outbox, migration and neighboring specs.
- [x] Document API/schema and Core-only ownership before implementation.
- [x] Validate malformed/version/producer/consumer cases before invoking DB/handler
  (10 cases in `src/modules/commerce-inbox/commerce-inbox.service.spec.ts`).
- [x] Exact retry survives a new service instance; key ordering is insignificant;
  changed payload/metadata conflicts; separate consumers isolate
  (`test/commerce-inbox.e2e-spec.ts`).
- [x] Eight concurrent deliveries produce one local effect and one receipt
  (`test/commerce-inbox.e2e-spec.ts`).
- [x] Handler failure rolls back both writes, retry succeeds, and DB failure
  propagates without invoking the handler (`test/commerce-inbox.e2e-spec.ts`).
- [x] Lock timeout leaves no receipt/effect; retry after lock release succeeds
  (`test/commerce-inbox.e2e-spec.ts`).
- [x] Additive migration down/up/down/up on an empty test table inside a rolled-back
  transaction, plus entity/schema parity (`test/commerce-inbox.e2e-spec.ts`).
- [x] Real Kafka duplicate offsets from ACK gap produce one committed local effect
  (`test/kafka/commerce-outbox.kafka-spec.ts`; all 13 broker tests pass).
- [x] Gateway regression (10), inbox unit tests (10), full backend unit suite (777),
  full read-only lint, typecheck and build pass locally.
- [x] Exported Nest module wiring commits through its real injected service;
  all 8 PostgreSQL tests and final changed-file lint pass
  (`test/commerce-inbox.e2e-spec.ts`).
- [ ] Owner-approved push and CI before merge. No server deployment.

Files: Core inbox service/module/spec, receipt entity/migration/data-source
registration, PostgreSQL and existing Kafka tests; docs/API, DB_SCHEMA, PLAN.
No HTTP endpoints: 400/403 are tested as internal exceptions; HTTP 401, Swagger
and resource ownership remain with future authorized domain callers. No new
runtime dependency, application module activation or .env flag.

Migration SQL was compared with TypeORM `migration:generate --dryrun` output
against an empty, uniquely named local fixture database; SQL matches. The
fixture database and temporary generation scripts were removed afterward.
No receipt retention deletion or live database migration was performed.

Gateway inventory: `docs/features/api-gateway.md` and
`backend/src/gateway/gateway.integration.spec.ts` cover existing edge behavior;
service token guards exist in Identity/Notify/Experience/Loyalty/Agency. These
are code evidence, not a new server audit. mTLS, production flags, network
configuration and service-specific cutover acceptance remain open.
