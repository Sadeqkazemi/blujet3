# Microservices phase 6 — Ops/Admin cutover readiness gate

## Scope

- Add an **offline, operator-invoked, read-only** CLI that answers whether the
  independent Ops/Admin projection database is ready for a later read cutover.
- Compare Core `ops.cartable_tasks` routing metadata with the projection table,
  drain evidence for `core-ops` outbox rows, require terminal DLQ statuses, and
  require checkpoint catch-up for the expected Kafka partitions.
- Emit metadata-only evidence. Do not print URLs, credentials, task IDs,
  assignees, source IDs, payloads, PII, per-partition offsets or raw errors.

This gate does **not** connect to Kafka, write rows, repair data, replay
events, copy a baseline, switch the HTTP reader URL, enable the consumer or
deploy. Core remains the sole business writer.

## Configuration

| Variable | Default / rule |
| --- | --- |
| `OPS_ADMIN_CUTOVER_CHECK_ENABLED` | `false`; any value other than `true` is disabled |
| `OPS_ADMIN_CUTOVER_SOURCE_DATABASE_URL` | required when enabled |
| `OPS_ADMIN_CUTOVER_TARGET_DATABASE_URL` | required when enabled |
| `OPS_ADMIN_CUTOVER_KAFKA_GROUP_ID` | required when enabled |
| `OPS_ADMIN_CUTOVER_KAFKA_TOPIC` | required when enabled |
| `OPS_ADMIN_CUTOVER_EXPECTED_PARTITIONS` | comma-separated integers, e.g. `0,1,2` |
| `OPS_ADMIN_CUTOVER_BATCH_SIZE` | integer 1–1000, default `100` |

When disabled the CLI must not open a database or Kafka connection.

Source and target must be different PostgreSQL databases. Source must be Core
(name must not match `^blujet_ops_admin(_[A-Za-z0-9_]+)?$`). Target must be an
isolated Ops/Admin database matching that pattern.

## READY contract

Both sessions are `REPEATABLE READ` and `READ ONLY`. READY requires all of:

1. Every Core cartable routing row matches the projection row with the same
   `id` (paged merge on `id`, one batch in memory per side). Compared fields:
   `assigneeId`, `category`, `sourceType`, `sourceId`, `status`, `resolvedAt`,
   `readAt`, `taskVersion` (Core `version`), `createdAt`. Content columns are
   never selected.
2. `orders.commerce_outbox_events` rows with `producer = 'core-ops'` have no
   pending, in-flight, expired-lease or dead-letter messages.
3. `ops.kafka_processing_failures` has no non-terminal status. Terminal:
   `RESOLVED`, `SKIPPED`.
4. `ops.kafka_consumer_checkpoints` has exactly the expected
   `(consumerGroup, topic, partition)` set. Extra or missing partitions are
   NOT_READY. Every expected row has a non-null `highWatermark` and
   `nextOffset >= highWatermark`.

## Output and exit codes

- `reportVersion`, `capturedAt`, `status`
  (`DISABLED` \| `READY` \| `NOT_READY` \| `UNAVAILABLE`)
- allowlisted `reasons`
- `sourceCount`, `targetCount`, `mismatchCount`, `blockingOutboxCount`,
  `openFailureCount`, `expectedPartitionCount`, `observedPartitionCount`,
  `maxLag`
- READY or DISABLED → exit 0
- NOT_READY → exit 2
- UNAVAILABLE / configuration failure → exit 1

Allowlisted reasons:

- `IDENTICAL_DATABASE`
- `INVALID_SOURCE_DATABASE`
- `INVALID_TARGET_DATABASE`
- `CARTABLE_COUNT_MISMATCH`
- `CARTABLE_MISSING`
- `CARTABLE_UNEXPECTED`
- `CARTABLE_STALE`
- `CARTABLE_MISMATCH`
- `OUTBOX_PENDING`
- `OUTBOX_IN_FLIGHT`
- `OUTBOX_EXPIRED_LEASE`
- `OUTBOX_DEAD_LETTER`
- `DLQ_OPEN`
- `CHECKPOINT_MISSING`
- `CHECKPOINT_UNEXPECTED`
- `CHECKPOINT_WATERMARK_MISSING`
- `CHECKPOINT_LAG`
- `UNAVAILABLE`

## Non-goals

- No public `/api/v1` or `docs/openapi.json` change
- No new migration (existing cartable, outbox, checkpoint and DLQ tables)
- No producer/consumer, production Compose, runtime flag or deploy change
- No Kafka client

## Acceptance evidence

- [x] `check-ops-admin-projection-cutover-readiness.spec.ts` covers disabled
      mode, invalid config, identical/invalid databases, paged match, mismatch
      classes, outbox, DLQ, checkpoints, lag, sanitized output and read-only
      SQL.
- [x] `ops-admin-projection-cutover-readiness.e2e-spec.ts` proves READY and
      fail-closed cases against real PostgreSQL.
- [ ] CI `ops-admin` job includes the E2E and remains in `ci-gate`.
- [ ] Present the diff for approval. Do not merge, deploy, activate the
      consumer or cut over reads.
