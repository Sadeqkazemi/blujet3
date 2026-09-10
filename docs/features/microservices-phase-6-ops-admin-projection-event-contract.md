# Microservices phase 6 — Ops/Admin projection event contract

## Scope

This slice defines the only event that may populate the dedicated Ops/Admin
cartable read model: `CartableTaskProjected` v1. It is a complete, versioned
routing snapshot emitted by `core-ops` for aggregate type `CartableTask`.

The payload contains only `auditId`, `taskVersion` and the routing fields owned
by the projection. The aggregate ID is the projected task ID. The event
excludes title, description, attachments, sender details, conversation content,
resolution text and transferred-user details.

This contract phase does not add a producer, consumer, migration, data copy,
dual-write, runtime URL switch or deployment. Core remains the sole cartable
writer. A later phase must add the monotonic source version and transactional
outbox before any event can be published.

## Ordering and idempotency

- `eventId` identifies one delivery; the consumer must reject reuse with
  different content.
- `taskVersion` is a positive, monotonically increasing integer per task.
- A lower version is stale, an equal version with identical content is a
  duplicate, and an equal version with different content is a conflict.
- Full snapshots make baseline replay and delta replay use the same upsert
  contract.
- Kafka keys remain `core-ops:CartableTask:<taskId>` so one task stays in one
  ordered partition.

## Acceptance checklist

- [x] The canonical event catalog accepts `CartableTaskProjected` v1 without
  changing existing Core itinerary events
  (`ops-admin-event-schema.spec.ts`, `core-itinerary-event-schema.spec.ts`).
- [x] The Ops/Admin schema catalog publishes
  `blujet.ops-admin.CartableTaskProjected.v1` and the shared Kafka adapter emits
  and verifies that exact `event-schema-id`
  (`kafka-event-publisher.spec.ts`, `kafka-event-message.spec.ts`).
- [x] The parser accepts only an exact, content-free snapshot with a positive
  `taskVersion`, valid enums, stable identifiers and canonical UTC timestamps
  (`ops-admin-events.spec.ts`).
- [x] The builder detaches caller-owned data and rejects invalid status/time
  combinations (`ops-admin-events.spec.ts`).
- [x] Existing schema-header compatibility remains unchanged for backlog events
  that do not yet carry a schema ID (`kafka-event-message.spec.ts`).
- [x] Focused unit tests, lint, typecheck and build pass; no runtime flag,
  database or deployment changes are included.

## Deferred activation

The next separately reviewed slice adds a monotonic Core source revision,
transactional outbox publication, an idempotent projection inbox/upsert and a
bounded reconciliation report. Cutover still requires baseline replay, parity
evidence, restricted database roles and a separately approved UAT release.
