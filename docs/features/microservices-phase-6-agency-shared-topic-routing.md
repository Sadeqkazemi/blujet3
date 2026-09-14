# Agency shared-topic routing

## Scope

The Agency projection worker consumes the shared canonical Kafka topic but owns
only `core-agency` events. A routing-valid v1 delivery from an approved producer
(`core-commerce`, `core-loyalty` or `core-ops`) must
advance the Agency consumer checkpoint and be acknowledged without invoking an
Agency projection or creating Agency receipt/DLQ state. This prevents unrelated
Core, Loyalty or Ops/Admin traffic from blocking Agency baseline catch-up.

The worker still fails closed for malformed envelopes, mismatched transport
metadata, invalid schema headers and every invalid `core-agency` event. A
foreign producer cannot disguise an event with an Agency schema identifier, and
an Agency producer cannot bypass the strict Agency payload parser. Checkpoint
storage commits before Kafka acknowledgement, so a database failure leaves the
delivery unacknowledged.

This slice changes no HTTP contract or business table, enables no feature flag,
starts no consumer, switches no Agency read and performs no deployment. Core
remains the sole Agency business writer.

## Acceptance evidence

- [x] `agency-kafka.handler.spec.ts` proves an approved non-Agency delivery is
      checkpointed and acknowledged without projection or DLQ failure state.
- [x] `agency-kafka.handler.spec.ts` proves malformed, metadata-mismatched and
      cross-labeled deliveries remain unacknowledged and fail closed.
- [ ] `projection.integration-spec.ts` proves ignored delivery checkpointing is
      durable and creates no projection receipt or aggregate slot.
- [x] All 130 Agency unit tests, lint, typecheck and production build pass; the
      exported OpenAPI SHA-256 remains unchanged.
- [ ] Present the completed diff for explicit approval before merge. Do not
      activate the worker, cut over reads or deploy.
