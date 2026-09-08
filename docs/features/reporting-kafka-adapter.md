# Reporting Kafka acknowledgement adapter

This slice connects the validated Core itinerary event boundary to the
Reporting projection store through a manual-ack KafkaJS handler. It does not
start a consumer, add a public/internal HTTP route, change an environment flag,
or deploy a process.

The adapter accepts only canonical events from `core-commerce` on the configured
exact topic. It validates the UTF-8 JSON envelope, bounded size, producer-derived
message key, event/correlation/version headers, partition and signed-bigint-safe
offset before calling Reporting. `ReportingEventConsumer` then performs the
strict typed itinerary validation before the existing projection transaction.

`autoCommit` is disabled and partitions are processed sequentially. The handler
heartbeats before and after projection and commits offset + 1 only after the
projection/receipt transaction succeeds. Projection failures, malformed events,
heartbeat failures and broker acknowledgement failures propagate as one safe
transport error without event data, database details or credentials. An
acknowledgement gap is safe: the same event ID replays through the Reporting
receipt and does not create another projection.

When the lifecycle supplies its validated consumer-group identity, the same
projection transaction also advances the Reporting-owned partition checkpoint.
The checkpoint is monotonic and contains only group/topic/partition progress;
it does not contain the event payload. This keeps durable lag evidence aligned
with the projection while Kafka remains authoritative for group offsets.

## Checklist

- [x] Canonical transport parsing is shared with Core Inbox and retains all
  existing rejection behavior (`commerce-inbox-kafka.handler.spec.ts`).
- [x] Reporting commits offsets only after `applied`, `duplicate`, or `stale`;
  no acknowledgement occurs on validation/projection/heartbeat failure
  (`reporting-kafka.handler.spec.ts`).
- [x] A real Kafka/PostgreSQL acknowledgement-gap replay produces one projection
  and one durable receipt; the lifecycle extension also retains one monotonic
  checkpoint (`reporting-projection.kafka-spec.ts`).
- [x] Reporting module exports the handler but no runtime subscription or route
  is enabled.
