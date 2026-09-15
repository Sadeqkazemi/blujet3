# Microservices phase 6 — Reporting cutover readiness gate

## Scope

- Add an **offline, operator-invoked, read-only** CLI that answers whether
  Reporting-owned projection data on Core/shared PostgreSQL is ready for a
  later cutover onto the dedicated Reporting PostgreSQL database.
- Compare `reporting.core_itinerary_event_projections` and
  `reporting.core_itinerary_event_receipts` with bounded paging, require
  projection/receipt parity, require terminal Kafka failure statuses, and
  require checkpoint catch-up for the expected partitions.
- Emit metadata-only evidence. Do not print URLs, credentials, event IDs,
  order IDs, fingerprints, payloads, PII, per-partition offsets or raw errors.

This gate does **not** connect to Kafka, write rows, repair data, replay
events, copy a baseline, switch `REPORTING_DATABASE_URL`, enable the consumer
or deploy. Core remains the sole business writer. Inventory, orders and
payments stay on Core.

## Configuration

| Variable | Default / rule |
| --- | --- |
| `REPORTING_CUTOVER_CHECK_ENABLED` | `false`; any value other than `true` is disabled |
| `REPORTING_CUTOVER_SOURCE_DATABASE_URL` | required when enabled |
| `REPORTING_CUTOVER_TARGET_DATABASE_URL` | required when enabled |
| `REPORTING_CUTOVER_KAFKA_GROUP_ID` | required when enabled |
| `REPORTING_CUTOVER_KAFKA_TOPIC` | required when enabled |
| `REPORTING_CUTOVER_EXPECTED_PARTITIONS` | comma-separated integers, e.g. `0,1,2` |
| `REPORTING_CUTOVER_BATCH_SIZE` | integer 1–1000, default `100` |

When disabled the CLI must not open a database or Kafka connection.

Source and target must be different PostgreSQL databases. Source must be
Core/shared (name must not match `^blujet_reporting(?:_[A-Za-z0-9_]+)?$`).
Target must be an isolated Reporting database matching that pattern.

Use dedicated read-only LOGIN roles, never owner, writer or projection-runtime
credentials. Session options: `connectionTimeoutMillis=2000`,
`query_timeout`/`statement_timeout=5000`, `lock_timeout=2000`,
`default_transaction_read_only=on`, `timezone=UTC`.

### Source role `blujet_reporting_cutover_source` (Core/shared)

Minimum SELECT on schema `reporting`:

- `core_itinerary_event_projections`: `orderId`, `eventType`, `eventId`,
  `fingerprint`, `orderVersion`, `currency`, `occurredAt`, `createdAt`,
  `updatedAt` (never `payload`)
- `core_itinerary_event_receipts`: `eventId`, `fingerprint`, `orderId`,
  `eventType`, `orderVersion`, `receivedAt`
- `kafka_processing_failures`: `status`
- `kafka_consumer_checkpoints`: `consumerGroup`, `topic`, `partition`,
  `nextOffset`, `highWatermark`

```sql
GRANT CONNECT ON DATABASE blujet TO blujet_reporting_cutover_source;
GRANT USAGE ON SCHEMA reporting TO blujet_reporting_cutover_source;
GRANT SELECT (
  "orderId", "eventType", "eventId", fingerprint, "orderVersion", currency,
  "occurredAt", "createdAt", "updatedAt"
) ON reporting.core_itinerary_event_projections
  TO blujet_reporting_cutover_source;
GRANT SELECT (
  "eventId", fingerprint, "orderId", "eventType", "orderVersion", "receivedAt"
) ON reporting.core_itinerary_event_receipts
  TO blujet_reporting_cutover_source;
GRANT SELECT (status) ON reporting.kafka_processing_failures
  TO blujet_reporting_cutover_source;
GRANT SELECT (
  "consumerGroup", topic, "partition", "nextOffset", "highWatermark"
) ON reporting.kafka_consumer_checkpoints
  TO blujet_reporting_cutover_source;
ALTER ROLE blujet_reporting_cutover_source SET default_transaction_read_only = on;
```

### Target role `blujet_reporting_cutover_target` (Reporting)

The same column-level SELECT on the isolated `blujet_reporting` database.

```sql
GRANT CONNECT ON DATABASE blujet_reporting TO blujet_reporting_cutover_target;
GRANT USAGE ON SCHEMA reporting TO blujet_reporting_cutover_target;
GRANT SELECT (
  "orderId", "eventType", "eventId", fingerprint, "orderVersion", currency,
  "occurredAt", "createdAt", "updatedAt"
) ON reporting.core_itinerary_event_projections
  TO blujet_reporting_cutover_target;
GRANT SELECT (
  "eventId", fingerprint, "orderId", "eventType", "orderVersion", "receivedAt"
) ON reporting.core_itinerary_event_receipts
  TO blujet_reporting_cutover_target;
GRANT SELECT (status) ON reporting.kafka_processing_failures
  TO blujet_reporting_cutover_target;
GRANT SELECT (
  "consumerGroup", topic, "partition", "nextOffset", "highWatermark"
) ON reporting.kafka_consumer_checkpoints
  TO blujet_reporting_cutover_target;
ALTER ROLE blujet_reporting_cutover_target SET default_transaction_read_only = on;
```

Compared identifier and enum/string fields (`orderId`, `eventType`, `eventId`,
`fingerprint`, `currency`, `status`) are exact string/null matches. Only
timestamp columns (`occurredAt`, `createdAt`, `updatedAt`, `receivedAt`) are
normalized to ISO-8601.

## READY contract

Both sessions are `REPEATABLE READ` and `READ ONLY`. READY requires all of:

1. Every Core projection row matches the dedicated-database row with the same
   `(orderId, eventType)` (paged merge, one batch in memory per side).
   Compared fields: `eventId`, `fingerprint`, `orderVersion`, `currency`,
   `occurredAt`, `createdAt`, `updatedAt`. `payload` is never selected.
2. Every Core receipt row matches the dedicated-database row with the same
   `eventId`. Compared fields: `fingerprint`, `orderId`, `eventType`,
   `orderVersion`, `receivedAt`.
3. On each side, every projection `eventId` has a receipt with the same
   `fingerprint`, `orderId`, `eventType` and `orderVersion`.
4. `reporting.kafka_processing_failures` has no non-terminal status on either
   side. Terminal: `RESOLVED`, `SKIPPED`.
5. `reporting.kafka_consumer_checkpoints` on each side has exactly the
   expected `(consumerGroup, topic, partition)` set. Extra or missing
   partitions are NOT_READY. Matching partitions must agree on
   `nextOffset`/`highWatermark`. Every expected row has a non-null
   `highWatermark` and `nextOffset >= highWatermark`.

If a required condition cannot be proven from these columns, the gate is
NOT_READY. It does not invent rows or skip the check.

## Output and exit codes

- `reportVersion`, `capturedAt`, `status`
  (`DISABLED` \| `READY` \| `NOT_READY` \| `UNAVAILABLE`)
- allowlisted `reasons`
- `sourceCount`, `targetCount`, `receiptSourceCount`, `receiptTargetCount`,
  `mismatchCount`, `parityMismatchCount`, `openFailureCount`,
  `expectedPartitionCount`, `observedPartitionCount`, `maxLag`
- READY or DISABLED → exit 0
- NOT_READY → exit 2
- UNAVAILABLE / configuration failure → exit 1

Allowlisted reasons:

- `IDENTICAL_DATABASE`
- `INVALID_SOURCE_DATABASE`
- `INVALID_TARGET_DATABASE`
- `PROJECTION_COUNT_MISMATCH`
- `PROJECTION_MISSING`
- `PROJECTION_UNEXPECTED`
- `PROJECTION_MISMATCH`
- `RECEIPT_COUNT_MISMATCH`
- `RECEIPT_MISSING`
- `RECEIPT_UNEXPECTED`
- `RECEIPT_MISMATCH`
- `RECEIPT_PARITY_MISMATCH`
- `FAILURE_OPEN`
- `CHECKPOINT_MISSING`
- `CHECKPOINT_UNEXPECTED`
- `CHECKPOINT_WATERMARK_MISSING`
- `CHECKPOINT_LAG`
- `CHECKPOINT_MISMATCH`
- `UNAVAILABLE`

## Non-goals

- No public `/api/v1` or `docs/openapi.json` change
- No new migration (existing Reporting tables only)
- No producer/consumer, production Compose, runtime flag or deploy change
- No Kafka client
- No data transfer, dual-write or Core writer change
- No Order/Inventory/Payment database split

## Acceptance evidence

- [x] `check-reporting-projection-cutover-readiness.spec.ts` covers disabled
      mode, invalid config, identical/invalid databases, paged match, count
      and fingerprint mismatch, date-like identifier PROJECTION_MISMATCH,
      source.end after target connect failure, client
      timeouts, parity, open failures, checkpoints, lag, sanitized output and
      read-only SQL.
- [x] `reporting-cutover-readiness.e2e-spec.ts` proves READY and fail-closed
      cases against real PostgreSQL.
- [ ] CI `reporting` job includes the E2E and remains in `ci-gate`.
- [ ] Present the diff for approval. Do not merge, deploy, activate the
      consumer or cut over reads.
