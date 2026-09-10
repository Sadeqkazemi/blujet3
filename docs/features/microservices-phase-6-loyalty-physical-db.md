# Microservices phase 6 — Loyalty physical database bootstrap

## Scope

Loyalty currently reads a restricted `loyalty` schema in the shared Core
PostgreSQL cluster. This slice gives the service an independently migratable
database containing all six Loyalty-owned tables. It does not move the writer,
copy production data, or enable any read cutover.

Core remains the only writer until the Loyalty command API and its outbox/event
projection have replay, idempotency and reconciliation evidence. Running both
writers is forbidden.

## Ownership and references

Loyalty owns `club_members`, `club_points_entries`, `club_card_requests`,
`club_tier_rules`, `price_locks` and `customer_referrals` in schema `loyalty`.

The dedicated database keeps only two internal foreign keys: points and card
requests reference their owning member. Identity user IDs, Core booking IDs,
Inventory flight-instance IDs and operator IDs are stable scalar references;
there are no cross-database foreign keys or runtime joins.

Encrypted national-ID data remains encrypted. All IRR amounts stay `bigint`,
and API projections continue to expose decimal strings. Existing timestamp
columns preserve their UTC application contract.

## Acceptance checklist

- [x] Standalone development and compiled TypeORM migration commands use only
  `LOYALTY_DATABASE_URL`.
- [x] A fresh PostgreSQL database receives exactly six Loyalty tables, eight
  local enum types and a dedicated migration history.
- [x] Entity metadata matches the migrated schema with no drift.
- [x] Only member-owned internal foreign keys exist; Identity, Order and
  Inventory references are scalar.
- [x] Rollback removes only the `loyalty` schema.
- [x] CI proves the bootstrap in a database separate from the existing
  shared-schema compatibility tests.
- [ ] Define and approve Loyalty command/event contracts, project a complete
  snapshot plus ordered deltas, reconcile counts/balances/checksums in UAT,
  stop the Core writer, and only then switch the URL under separate approval.

## Cutover and rollback

The safe sequence is backup, baseline copy, ordered event catch-up, balance and
row checksum reconciliation, writer freeze, final delta, single-writer switch,
and UAT. Any mismatch is a no-go. Rollback restores the compatibility reads and
Core writer; it never enables dual-write and retains the independent database
for investigation.
