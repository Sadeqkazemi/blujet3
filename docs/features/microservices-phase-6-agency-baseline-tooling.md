# Microservices phase 6 — Agency projection baseline tooling

## Scope

- Prepare a repeatable, backup-gated baseline copy of the three approved
  Agency read projections from Core into a separately migrated PostgreSQL
  database.
- Provision a non-owner, column-scoped SELECT-only credential for the Agency
  HTTP process. The Kafka projection worker keeps a different writable
  credential and remains disabled.
- Reconcile complete rows without printing profile data, invoice/credit
  amounts, identifiers, database URLs or credentials.
- Preserve every public/internal HTTP contract and keep all Agency read,
  consumer and DLQ flags disabled by default.

Core remains the sole business writer. This baseline does not activate Kafka,
copy later deltas, switch reads or authorize a second writer. Final read
cutover still requires ordered event catch-up, a drained source outbox, exact
reconciliation and separately approved UAT evidence.

## Acceptance evidence

- [x] `provision-independent-domain-runtime-role.spec.ts` proves the exact
      column-scoped `blujet_agency_runtime` contract and fail-closed verification.
- [x] `transfer-independent-domain-data.spec.ts` proves the exact three-table,
      dependency-safe Agency transfer contract and backup-gated bounded apply
      mode.
- [x] `independent-domain-database.e2e-spec.ts` proves a real Core-to-Agency
      PostgreSQL baseline transfer, checksum parity, replay rejection, own-domain
      SELECT, denied DML/DDL and denied cross-domain access.
- [ ] CI migrates a complete Core source and isolated Agency target, runs the
  boundary proof, and verifies standalone Agency migration rollback/restore.
- [x] `docs/RUNBOOK.md` separates baseline creation, event delta catch-up,
      writer/reader credentials and the later read cutover/rollback gate.

## Non-goals

- No Agency command API or command-table ownership move.
- No dual-write, CDC repair, automatic Kafka replay, URL switch or flag
  activation.
- No Order, Inventory, Payment or public API change.
- No server deployment.
