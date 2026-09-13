# Microservices phase 6 — Agency Kafka acknowledgement adapter

## Boundary

This slice adds a construction-only KafkaJS adapter around the existing
transactional Agency projection consumer. It does not create a Kafka client,
subscribe to a broker, copy data, switch readers, move a writer or deploy a
service.

The only accepted topic is the configured Agency topic. Every delivery must
carry the canonical `core-agency:<aggregateType>:<aggregateId>` key and headers
matching the parsed v1 event. `event-schema-id` remains optional for legacy
traffic until the separately approved strict-header gate is enabled.

## Acceptance checklist

- [x] Kafka auto commit is disabled and a partition is processed sequentially.
- [x] Topic, partition, offset, size, UTF-8 JSON, event contract, key and
      transport headers fail closed before projection.
- [x] Schema headers, when present, match
      `blujet.agency.<eventType>.v1`; an optional strict flag rejects a missing
      header.
- [x] The next offset is committed only after the Agency projection transaction
      succeeds, for applied, duplicate and stale deliveries.
- [x] A heartbeat, projection or offset-commit failure returns a sanitized
      Agency boundary error and never exposes payload, PII, broker metadata or raw
      errors.
- [x] A failed Kafka ACK followed by redelivery creates one business projection
      and one inbox receipt, then safely commits the replayed offset.
- [x] The adapter is exported from the Agency projection module without a
      runtime/broker provider.
- [x] Existing Agency HTTP/OpenAPI and database schemas remain unchanged.
- [x] Agency lint, typecheck, unit, real-PostgreSQL projection tests, E2E and
      production build pass before review.

## Deferred gates

Kafka client lifecycle, credentials, consumer group/checkpoint persistence,
bounded retry and DLQ, baseline replay, reconciliation approval, reader cutover
and deployment remain disabled and require separate evidence and approval.

## Local evidence

Agency lint, typecheck and production build pass. All 53 unit tests, 9
real-PostgreSQL projection tests and 70 E2E tests pass. Regenerated OpenAPI is
byte-compatible with the tracked contract, and TypeORM migration/entity parity
remains covered by the projection suite.
