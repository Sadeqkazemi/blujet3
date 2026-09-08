# Reporting Kafka consumer lifecycle

This slice turns the existing Reporting Kafka acknowledgement adapter into an
opt-in application lifecycle. It remains disabled by default and does not add
an HTTP route, change a Core writer, deploy a service, or grant production
broker/database access.

`REPORTING_KAFKA_CONSUMER_ENABLED=true` creates one KafkaJS consumer with a
stable, explicitly configured group, subscribes to the exact Core event topic,
and runs the existing manual-ack handler. The consumer uses its own client and
SCRAM identity instead of inheriting the Core publisher identity. Production
startup requires verified TLS and dedicated Reporting credentials.

Rollback is configuration-only: disable the Reporting consumer flag and
restart the application. The Reporting projection and receipt rows remain
intact, Core continues as the only business writer, and a later re-enable
resumes from the committed consumer-group offset. New groups replay retained
events from the beginning by default so the idempotent projection can rebuild
from available history.

## Durable checkpoint and lag observation

For each validated delivery, Reporting writes the consumer group, exact topic,
partition, next offset and Kafka high watermark to
`reporting.kafka_consumer_checkpoints`. The checkpoint write shares the
projection transaction and advances offsets/high watermarks monotonically.
Kafka acknowledgement remains the final step after the database commit.

The readiness payload reports only aggregate checkpoint evidence: partition
count, maximum observed lag and last checkpoint timestamp. It does not expose
event payloads, topic names or raw offsets, and lag does not currently change
readiness. The stored high watermark is an observation from consumed records,
not a replacement for broker-side monitoring.

## Acceptance checklist

- [x] Disabled/default configuration creates no Kafka client and performs no
  connect, subscribe, run, or disconnect call
  (`reporting-kafka.runtime.spec.ts`).
- [x] Enabled startup connects, subscribes to the exact configured topic with
  a stable group, and runs the existing manual-ack handler only after
  subscription (`reporting-kafka.runtime.spec.ts`).
- [x] Ambiguous flags, malformed group/client identifiers, invalid limits,
  incomplete credentials, and insecure production configuration fail startup
  before any broker call (`reporting-kafka-consumer.config.spec.ts`).
- [x] Startup and shutdown failures are sanitized; partial startup attempts a
  disconnect, and shutdown is idempotent (`reporting-kafka.runtime.spec.ts`).
- [x] The real Kafka/PostgreSQL suite uses the lifecycle and still proves
  projection-before-offset plus acknowledgement-gap replay without duplicate
  projection/receipt (`reporting-projection.kafka-spec.ts`). CI run `34188378807`
  passed this fixture.
- [x] Projection, receipt and per-partition checkpoint commit atomically;
  exact replay and ACK-gap recovery cannot move a checkpoint backwards
  (`reporting-event-projection.e2e-spec.ts`,
  `reporting-projection.kafka-spec.ts`).
- [x] Readiness exposes only aggregate durable progress fields and retains no
  event payload in the checkpoint table.
- [x] No new public/internal HTTP route, Core writer, production grant,
  runtime activation, or server deployment is included.

Poison-event retry/dead-letter policy, lag alert thresholds, historical
backfill outside broker retention, and production flag activation remain
separate reviewed slices. Until retention/replay policy is approved, poison
records continue to fail closed without offset acknowledgement or automatic
skip.
