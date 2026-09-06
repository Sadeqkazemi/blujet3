# Reporting event read-model seam

The initial slice created the admission boundary for the independent
Reporting read model. `ReportingEventConsumer` validates the existing typed
Core itinerary events and forwards a detached discriminated event to a sink
owned by Reporting. The extension below adds the Reporting-owned projection
writer and schema while keeping public endpoints and runtime subscriptions off.

The sink is intentionally a small port. A later Reporting service can provide
an idempotent projection store and stale-version policy without changing event
validation or Core transaction ownership. Projection failures propagate to the
caller so the existing Inbox/outbox retry and dead-letter policy remains in
control; errors are never converted into successful processing.

## Checklist

- [x] Validated typed events are forwarded to the read-model sink with a
  detached snapshot (`reporting-event-consumer.spec.ts`).
- [x] Malformed events are rejected before the sink is called.
- [x] Sink failures propagate for retry/dead-letter handling.
- [x] No HTTP route, runtime subscription or Core business writer is enabled.

## Projection store extension

`ReportingItineraryProjectionStore` persists one latest non-PII fact for each
`orderId + eventType` in the Reporting-owned schema. Projection and idempotency
checks run in one transaction under advisory locks for the event ID and slot.
The store returns `applied`, `duplicate` or `stale`; it fails closed on reused
event IDs or conflicting content at the same version. Versions are compared per
event type because multiple valid facts can share one order version.

An append-only Reporting-owned receipt row records the full-envelope
fingerprint for every accepted event ID, including semantic duplicates and
stale deliveries. This preserves global event-ID idempotency even after a newer
version replaces the latest projection row. It stores envelope identity only,
not the event payload or PII.

- [x] Independent Reporting projection/receipt tables and additive migration.
- [x] Duplicate, stale, event-ID reuse, concurrent delivery and rollback behavior
  proven against PostgreSQL.
- [x] Module wiring exports the consumer without enabling a subscription.
