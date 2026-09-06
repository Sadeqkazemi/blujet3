# Reporting event read-model seam

This slice creates the admission boundary for the future independent
Reporting read model. `ReportingEventConsumer` validates the existing typed
Core itinerary events and forwards a detached discriminated event to a sink
owned by Reporting. It does not add a table, migration, public endpoint,
subscription or projection writer.

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
- [x] No database, migration, HTTP route, subscription or business writer is
  enabled.
- [ ] Independent Reporting projection store, idempotency and stale-version
  policy — separate phase after event ownership and deployment review.
