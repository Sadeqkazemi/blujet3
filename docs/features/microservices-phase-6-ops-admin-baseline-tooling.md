# Microservices phase 6 — Ops/Admin projection baseline tooling

## Scope

- Prepare a repeatable, backup-gated, operator-invoked **offline** copy of Core
  cartable **routing metadata** into a separately migrated Ops/Admin projection
  database.
- Copy only `ops.cartable_tasks` on the target, using the exact columns of
  `OpsAdminCartableTaskProjection`. Never copy task content, attachments,
  passenger PII, financial details, tokens, credentials or audit bodies.
- Provision `blujet_ops_admin_projection_reader`: a non-owner, NOINHERIT,
  default-read-only HTTP credential on the independent projection database.
  It is distinct from `blujet_ops_admin_projection_runtime` and from Core
  `blujet_ops_admin_reader`.
- Reconcile with metadata-only evidence: source/target counts, two independently
  ordered SHA-256 aggregates, and PASS/FAIL. Do not print IDs, assignees,
  source references, payloads, PII, backup paths, URLs or credentials.

Core remains the sole business writer. This baseline does not activate Kafka,
dual-write, copy later deltas, switch HTTP reads, change runtime flags or
deploy. Final read cutover still requires ordered event catch-up, a drained
source outbox, exact reconciliation and separately approved UAT evidence.

## Transfer contract

- Source owner URL and target owner URL are required and must identify
  different PostgreSQL databases.
- Source database name must **not** match
  `^blujet_ops_admin(_[A-Za-z0-9_]+)?$`.
- Target database name **must** match that pattern (isolated Ops/Admin).
- Both servers must be PostgreSQL 16 with applied migrations
  (`migrations` on Core; `ops_admin_projection_migrations` on the target).
- Target `ops.cartable_tasks` must be empty before apply. Control tables are
  not copied and do not count as a populated business target.
- Apply mode requires a verified backup **file**: regular file (not a
  directory or symlink), non-zero size, mtime within 24 hours, and an exact
  SHA-256 supplied separately. Errors never include the path or contents.
- Apply is one transaction. Insert or parity failure rolls back every copied
  row. An empty target plus identical source metadata is deterministic
  (idempotent for an empty target). A second apply against a non-empty target
  fails closed.
- Reconcile/report mode (`OPS_ADMIN_BASELINE_APPLY` not `true`) is read-only
  and reports only count/hash parity.

Column mapping from Core `ops.cartable_tasks`:

- Copied: `id`, `assigneeId`, `category`, `sourceType`, `sourceId`, `status`,
  `resolvedAt`, `readAt`, `createdAt`
- `version` → `taskVersion`
- `auditId`, `fingerprint` are NULL on baseline rows
- Never copied: `title`, `description`, `attachments`, `senderId`,
  `senderLabelFa`, `resolutionNote`, `conversationId`, `transferredToId`

## HTTP reader contract

- Role: `blujet_ops_admin_projection_reader`
- CONNECT only to the isolated Ops/Admin database
- USAGE on schema `ops` (no CREATE)
- SELECT only `id`, `assigneeId`, `category`, `sourceType`, `sourceId`,
  `status`, `resolvedAt`, `readAt`, `createdAt` on `ops.cartable_tasks`
- Denied: writes, sequences, DDL, `taskVersion`/`auditId`/`fingerprint`,
  `ops.cartable_projection_event_receipts`, `ops.kafka_consumer_checkpoints`,
  Core CONNECT, other schemas/databases, the projection-writer role

## Non-goals

- No public `/api/v1` or `docs/openapi.json` change
- No dual-write, consumer activation, reader URL cutover or flag change
- No production Compose/deploy topology
- No edits to Kafka handler, projection Kafka module, worker health, DLQ
  config, or failure-quarantine entities/migrations

## Acceptance evidence

- [x] `transfer-ops-admin-projection-baseline.spec.ts` proves URL/database
      identity rejection, backup artifact/SHA-256/age validation, checksum
      helpers and sanitized PASS/FAIL output.
- [x] `provision-ops-admin-projection-reader-role.spec.ts` proves the exact
      column-scoped reader contract and refusal to reuse the writer role.
- [x] `ops-admin-projection-baseline.e2e-spec.ts` proves real PostgreSQL:
      empty-target copy and two-hash parity; non-empty target rejection;
      checksum-mismatch rollback; missing/stale/wrong backup rejection;
      reader exact-column access and denial of write/DDL/control tables/Core
      CONNECT; standalone migration down/up and schema parity.
- [ ] CI `ops-admin` job includes the baseline E2E and remains in `ci-gate`.
- [ ] Present the completed diff for explicit approval. Do not merge, deploy,
      cut over reads or enable worker flags.
