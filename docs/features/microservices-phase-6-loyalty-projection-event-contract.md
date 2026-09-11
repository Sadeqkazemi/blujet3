# Microservices phase 6 — Loyalty projection event contract

## Scope

This slice defines six v1 full-snapshot events for the Loyalty-owned database:
member, points entry, card request, tier rule, price lock and customer referral.
Core remains the only writer. No producer, consumer, data copy, URL cutover,
feature-flag activation or deployment is introduced here.

Each event carries one positive, monotonically increasing `recordVersion` for
its aggregate. Full snapshots let the later baseline and delta replay use one
strict upsert contract. IRR values use decimal strings and timestamps use
canonical UTC ISO strings. Member ciphertext and deterministic lookup hashes
may cross only this internal encrypted-outbox/event path and must never be
written to logs or operator reports.

## Ordering and idempotency

- `eventId` identifies one delivery; reuse with different content must fail.
- `recordVersion` is monotonic per `(aggregateType, aggregateId)`.
- Lower versions are stale; equal identical snapshots are duplicates; equal
  divergent snapshots are conflicts.
- Kafka keys are `core-loyalty:<aggregateType>:<aggregateId>`, preserving one
  aggregate's order within a partition.
- `ClubPointsEntry` is append-only and therefore starts at version 1; later
  versions are reserved for a future explicit contract revision, not mutation.

## Acceptance checklist

- [x] The canonical catalog recognizes all six Loyalty v1 events without
  changing existing Core itinerary or Ops/Admin contracts.
- [x] Each schema has a stable `blujet.loyalty.*.v1` identifier and exact
  payload-field allowlist.
- [x] Builders emit detached full snapshots with lossless IRR strings and
  canonical UTC timestamps.
- [x] Parsers reject extra fields, invalid enums, invalid versions, malformed
  money/timestamps and incompatible producer/aggregate combinations.
- [x] Kafka publication attaches and validates the exact schema identifier.
- [x] Focused unit tests, lint, typecheck and build pass; runtime behavior,
  databases, public APIs and deployment remain unchanged.

## Deferred activation

The next reviewed slices add Core source revisions and transactional outbox
publication, then the dedicated Loyalty inbox/upsert and bounded
reconciliation. Baseline replay, final writer freeze and any read or writer
cutover require separate UAT evidence and owner approval.
