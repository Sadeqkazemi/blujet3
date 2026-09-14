# Reporting shared-topic routing

## Scope

The Reporting worker consumes the shared canonical Kafka topic but currently
owns only `core-commerce` itinerary events. A routing-valid v1 delivery from an
approved foreign producer (`core-agency`, `core-loyalty` or `core-ops`) advances
only the Reporting consumer checkpoint and is then acknowledged. It must not
invoke the itinerary projection or create a Reporting receipt, projection slot
or DLQ failure.

The worker remains fail-closed for malformed envelopes, unknown producers,
transport metadata mismatches, cross-domain schema labels and invalid
`core-commerce` events. A legacy foreign delivery without `event-schema-id` is
admitted only while the existing schema-header requirement is disabled.
Checkpoint persistence completes before Kafka acknowledgement, so a database
failure leaves the delivery unacknowledged.

This slice changes no HTTP contract or database schema, enables no feature
flag, starts no consumer, copies no data and performs no deployment.

## Acceptance evidence

- [x] `reporting-kafka.handler.spec.ts` proves all approved foreign producers
      are checkpointed before ACK without projection or DLQ state.
- [x] `reporting-kafka.handler.spec.ts` proves checkpoint failure, malformed
      routing, unknown producers and cross-domain schemas remain unacknowledged.
- [x] `reporting-event-projection.e2e-spec.ts` proves checkpoint durability on
      real PostgreSQL with zero
      itinerary projections, receipts and processing failures.
- [x] All 1,267 Backend unit tests, 13 focused PostgreSQL tests, lint, typecheck
      and production build pass; OpenAPI
      remains unchanged.
- [x] Present the completed diff for explicit approval before merge. Do not
      activate the worker, cut over reads or deploy.
