# Microservices phase 6 — Loyalty physical database baseline tooling

## Scope

- Prepare a repeatable, backup-gated baseline copy of all six Loyalty-owned
  tables into a separately migrated PostgreSQL database.
- Give the long-running Loyalty process a dedicated SELECT-only runtime role;
  migration and transfer continue to use a separate short-lived owner.
- Reconcile complete rows without printing PII, point/price values, URLs or
  credentials.
- Preserve every public/internal HTTP contract and keep all Loyalty feature
  flags disabled by default.

Core remains the sole writer. This baseline cannot be used as a live read
cutover until ordered event catch-up, idempotency and points-balance/full-row
reconciliation are implemented and proven under a final writer freeze.

## Acceptance evidence

- [x] `provision-independent-domain-runtime-role.spec.ts` proves the
  SELECT-only `blujet_loyalty_runtime` contract and fail-closed verification.
- [x] `transfer-independent-domain-data.spec.ts` proves the exact six-table,
  foreign-key-safe transfer contract and backup-gated bounded apply mode.
- [x] `independent-domain-database.e2e-spec.ts` proves real PostgreSQL baseline
  transfer, checksum parity, replay rejection, own-schema SELECT, denied DML,
  denied DDL and denied cross-domain reads/writes.
- [x] CI migrates isolated Loyalty source/target databases, runs the boundary
  proof and verifies standalone migration rollback/restore.
- [x] `docs/RUNBOOK.md` distinguishes baseline creation from later event
  catch-up and separately approved read cutover/rollback.

## Non-goals

- No command API or Loyalty writer extraction.
- No dual-write, CDC, automatic event replay, URL switch or flag activation.
- No Order, Inventory, Payment or public API change.
- No server deployment.
