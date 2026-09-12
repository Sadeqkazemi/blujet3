# Microservices phase 6 — Loyalty Club publisher activation

## Scope

This slice activates the existing transactional Loyalty projection publisher
only for writes owned by `ClubService`: the singleton tier rule, members and
membership-card requests. Core remains the sole writer. Points entries, price
locks and referrals are deliberately left for separate reviewed slices.

No public route, response contract, feature flag, service URL, credential,
consumer or deployment changes in this slice.

## Atomicity and privacy rules

- Every changed Club row, its content-free projection audit and its encrypted
  commerce-outbox event commit in the same Core PostgreSQL transaction.
- The commerce outbox assigns a database-generated monotonic sequence and the
  dispatcher claims by that sequence, including events inserted in the same
  millisecond. UUID order is never used as a delivery-order surrogate.
- This sequence orders eligible claims only. Concurrent dispatchers, delayed
  retries and transaction commit order can still reorder delivery. The future
  consumer must enforce aggregate versions and reject stale/conflicting
  snapshots; strict transport ordering is not established by this slice.
- A business audit written by the same operation joins that transaction.
- Operations that change both a card request and its member publish both
  snapshots before commit; any publisher failure rolls back both rows.
- New rows publish version 1. Mutable rows publish the version returned by
  TypeORM after the successful save.
- Events contain the already-approved full snapshots. Member PII remains
  encrypted in the outbox and is never added to logs, audit details or public
  responses.
- Internal `version` fields remain absent from all existing Club HTTP payloads.

## Acceptance checklist

- [x] Tier-rule creation/update publishes `CREATED`/`UPDATED` (Club and Loyalty outbox E2E).
- [x] Member creation, restoration, linking, deactivation, tier changes and
  direct/request-based card changes publish the matching member snapshot.
- [x] Card-request creation, referral and decision publish the matching request
  snapshot.
- [x] A forced projection failure proves row and business-audit rollback (Club E2E).
- [x] Same-millisecond outbox inserts are claimed in database insertion order (Commerce outbox E2E).
- [x] Focused E2E/unit tests, lint, typecheck and build pass.

## Deferred work

Verification recorded: 1,213 Backend unit tests, 31 Club E2E tests and 19
Commerce/Loyalty outbox E2E tests passed, with lint, typecheck and build.
The outbox-only schema parity test passed. The full Core schema-log reported
399 proposed statements; these were not executed and full Core schema parity
is not claimed. Club E2E proves concurrent decisions have one winner and a
failure after request publication rolls back both source rows and its outbox.

Points-entry/member-cache publication, price-lock publication, referral
publication, the dedicated Loyalty inbox/upsert consumer, baseline-plus-delta
replay, reconciliation, writer freeze, URL cutover and deployment remain
separate approval gates.
