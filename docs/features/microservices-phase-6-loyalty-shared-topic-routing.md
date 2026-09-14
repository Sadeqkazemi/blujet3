# Loyalty shared-topic routing

## Scope

The Loyalty projection worker consumes the shared canonical Kafka topic but owns
only `core-loyalty` events. A routing-valid v1 delivery from an approved producer
(`core-commerce`, `core-agency` or `core-ops`) must
advance the Loyalty consumer checkpoint and be acknowledged without invoking a
Loyalty projection or creating Loyalty receipt/slot/DLQ state. This prevents
unrelated Core, Agency or Ops/Admin traffic from blocking Loyalty baseline
catch-up.

The worker still fails closed for malformed envelopes, mismatched transport
metadata, invalid schema headers and every invalid `core-loyalty` event. A
foreign producer cannot disguise an event with a Loyalty schema identifier, and
a Loyalty producer cannot bypass the strict Loyalty payload parser. Checkpoint
storage commits before Kafka acknowledgement, so a database failure leaves the
delivery unacknowledged.

This slice changes no HTTP contract or business table, enables no feature flag,
starts no consumer, switches no Loyalty read and performs no deployment. Core
remains the sole Loyalty business writer.

## Acceptance evidence

- [x] `loyalty-kafka.handler.spec.ts` proves an approved non-Loyalty delivery is
      checkpointed and acknowledged without projection or DLQ failure state.
- [x] `loyalty-kafka.handler.spec.ts` proves malformed, metadata-mismatched and
      cross-labeled deliveries remain unacknowledged and fail closed.
- [x] `projection.integration-spec.ts` proves ignored delivery checkpointing is
      durable and creates no projection receipt, aggregate slot or failure row.
- [ ] Present the completed diff for explicit approval before merge. Do not
      activate the worker, cut over reads or deploy.
