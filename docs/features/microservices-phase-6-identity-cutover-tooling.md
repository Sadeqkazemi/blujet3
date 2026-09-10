# Identity physical database cutover tooling

## Scope

- Prepare, but do not activate, an independent PostgreSQL database for the six
  Identity-owned tables.
- Preserve the existing public `/api/v1/auth/**` facade, RS256/JWKS behaviour
  and Redis-backed sessions.
- Keep exactly one authoritative Identity writer at every cutover and rollback
  step; dual-write is forbidden.
- Do not deploy or change a live credential in this phase.

## Acceptance evidence

- [x] `provision-independent-domain-runtime-role.spec.ts` proves the
  `blujet_identity_runtime` contract, strong secret validation and rollback on
  failed privilege verification.
- [x] `transfer-independent-domain-data.spec.ts` proves the exact six-table,
  foreign-key-safe Identity transfer contract and backup-gated execution.
- [x] `independent-domain-database.e2e-spec.ts` proves real PostgreSQL transfer,
  full-row parity, populated-target replay rejection, own-domain DML, denied
  DDL and denied cross-domain reads/writes.
- [x] GitHub CI creates isolated Identity source/target databases, runs the
  standalone migration, executes the boundary proof, then proves migration
  rollback and clean restore.
- [x] `docs/RUNBOOK.md` documents writer freeze, backup/restore proof, transfer,
  reconciliation, single-writer cutover, RS256/JWKS/session smoke and rollback.

## Non-goals

- No automatic production transfer or URL switch.
- No second writer, CDC replication or merge of divergent histories.
- No public API, money, Order, Inventory or Payment database change.
- No token, credential, encrypted PII or row content in command output.
