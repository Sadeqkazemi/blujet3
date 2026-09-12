# Microservices phase 6 — Loyalty version-aware projection

## Scope

This slice prepares the independently migrated Loyalty database to consume the
six approved Core full-snapshot events. Core remains the only business writer.
The projection path is an internal replay/catch-up mechanism and is not exposed
through HTTP or enabled in the running Loyalty reader.

The target stores event receipts separately from aggregate-version slots. This
lets it reject a reused event ID with different content, accept exact redelivery,
ignore stale aggregate versions and fail closed when one record version carries
different snapshots. Every receipt, slot and business-row upsert commits in one
PostgreSQL transaction.

## Reconciliation and safety

- Reconciliation compares the six business tables by row count and two
  order-independent full-row hashes.
- Reports contain table names, counts, hashes and status only. They never emit
  member fields, ciphertext, points movements, prices, identifiers, URLs or
  credentials.
- Member-dependent points/card events fail without a matching member and leave
  no receipt or slot, so a later transport can retry safely.
- The existing read-only HTTP credential and flags are unchanged.

## Acceptance checklist

- [x] An expand-only standalone migration adds receipt and aggregate-slot
  control tables without changing the six business tables.
- [x] Strict parsing accepts all six approved v1 snapshots and rejects malformed
  envelopes, fields, enums, IRR strings, versions and timestamps before SQL.
- [x] Newer snapshots atomically upsert their aggregate, exact redelivery is a
  duplicate, and older versions are recorded as stale.
- [x] Reused event IDs and divergent same-version snapshots fail closed and roll
  back every target write.
- [x] Missing member dependencies roll back cleanly and can be retried after the
  member snapshot arrives.
- [x] Reconciliation proves MATCH/MISMATCH using only content-free counters and
  hashes for all six business tables.
- [x] Loyalty unit/E2E tests, lint, typecheck, build and migration rollback pass.

## Deferred activation

Kafka subscription, retry/DLQ policy, baseline-plus-delta execution, production
credentials, reader URL cutover, Core writer freeze and deployment require
separate reviewed phases. This slice does not enable a second writer.
