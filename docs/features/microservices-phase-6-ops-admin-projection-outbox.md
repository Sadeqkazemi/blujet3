# Microservices phase 6 — Ops/Admin source revision and outbox

## Scope

This slice makes every Core-owned `CartableTask` mutation observable through
the approved `CartableTaskProjected` v1 contract. Core remains the only writer.
The task row, its monotonic version, a content-free projection audit record and
the encrypted event outbox row commit in one PostgreSQL transaction.

The existing shared Core event outbox is reused because Ops/Admin cartable and
Order/Inventory/Payment still run inside the same Core process and PostgreSQL
primary. This does not grant the Ops/Admin process access to Core schemas and
does not introduce a second writer.

## Data and delivery rules

- `ops.cartable_tasks.version` starts at one and increases on every projected
  mutation.
- `ops.cartable_projection_audits` is append-only, content-free evidence keyed
  uniquely by `(taskId, taskVersion)`.
- The event idempotency key is `cartable-projected:<taskId>:v<taskVersion>`.
- Title, description, attachments, sender identity, conversation content and
  resolution notes never enter the audit row or event payload.
- The existing encrypted Core outbox dispatcher publishes only after commit;
  rollback removes the task mutation, audit and outbox row together.
- Kafka publication remains controlled by the existing default-off event-bus
  flag. No consumer, baseline copy, URL cutover or deployment is added here.

## Acceptance checklist

- [x] Expand-only Core migration adds the positive task version and
  content-free projection audit table; rollback removes only this additive
  slice (`cartable-projection-outbox.e2e-spec.ts`).
- [x] Create, read-marker, resolve, transfer, conversation close and automatic
  archive mutations enqueue exact v1 full snapshots in the same transaction
  (`cartable-projection-event.service.spec.ts`, `cartable.e2e-spec.ts`).
- [x] Multi-row mutations emit one ordered versioned event per changed task and
  a rollback leaves no projection audit/outbox residue
  (`cartable-projection-outbox.e2e-spec.ts`).
- [x] Duplicate `(taskId, taskVersion)` projection attempts are idempotent and
  conflicting content fails closed (`cartable-projection-event.service.spec.ts`).
- [x] Existing HTTP contracts, authorization, Core writers and default-off
  Kafka behavior remain unchanged; lint, typecheck, build and tests pass.

## Deferred work

The next separately reviewed slice adds the Ops/Admin-owned inbox receipt,
ordered projection upsert and bounded reconciliation report in the dedicated
database. Baseline replay, reader URL switch and feature-flag activation remain
separate UAT gates. No server deployment is part of this slice.
