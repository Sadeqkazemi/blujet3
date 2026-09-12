# Microservices phase 6 — Loyalty Kafka acknowledgement adapter

## Scope

This slice connects the existing strict Loyalty event parser and transactional
projection store to a KafkaJS `eachMessage` boundary. It does not create or
start a Kafka consumer, add an HTTP route, change a database URL, copy data,
activate a read flag, move a Core writer or deploy a process.

The adapter accepts only the configured exact topic and canonical
`core-loyalty` messages. It validates the bounded UTF-8 JSON value, producer
key, event/correlation/version headers, optional schema header, partition and
signed-bigint-safe offset before invoking the projection consumer. Kafka auto
commit is disabled, partitions are processed sequentially, and offset + 1 is
committed only after the receipt, aggregate slot and business projection have
committed. An acknowledgement gap therefore replays through the existing
idempotent receipt path.

Every transport, projection, heartbeat or acknowledgement failure is surfaced
as one content-free error. Event payloads, PII, database errors, headers,
credentials and offsets are never copied into that error.

## Acceptance checklist

- [x] Subscription/topic/size configuration is validated and snapshotted
  before processing (`loyalty-kafka.handler.spec.ts`).
- [x] Valid `applied`, `duplicate` and `stale` deliveries commit offset + 1 only
  after the projection transaction; a real PostgreSQL acknowledgement gap
  replays to one business row, receipt and slot (`loyalty-kafka.handler.spec.ts`,
  `projection.integration-spec.ts`).
- [x] Wrong topic, key, headers, schema, producer, UTF-8/JSON, partition,
  offset or oversized values fail before projection and ACK
  (`loyalty-kafka.handler.spec.ts`).
- [x] Projection, heartbeat and broker-ACK failures remain retryable and expose
  only a sanitized error (`loyalty-kafka.handler.spec.ts`).
- [x] The Loyalty application can construct the adapter without opening a
  broker connection or enabling a consumer (`loyalty-projection.module.spec.ts`).
- [x] Loyalty tests, lint, typecheck and build pass.

## Deferred activation

Kafka lifecycle/configuration, a dedicated consumer identity, durable
checkpoint/lag evidence, bounded retry and operator-controlled DLQ, baseline
plus retained-delta execution, production credentials, reader cutover, Core
writer freeze and deployment remain separate reviewed phases.
