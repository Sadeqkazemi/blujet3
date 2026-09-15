# Microservices phase 6 — Agency projection cutover readiness gate

## Scope

- Add an **offline, operator-invoked, read-only** CLI that answers whether
  Agency-owned projection data on Core/shared PostgreSQL is ready for a later
  cutover onto the dedicated Agency PostgreSQL database.
- Compare only `agency.agency_profiles`, `agency.agency_invoices` and
  `agency.agency_credit_requests` using the existing reconciliation fingerprints.
- Compare Core `agency.agency_projection_audits` with Agency
  `agency.agency_projection_event_receipts` as a separate control: count plus
  two order-independent fingerprints over `id`/`auditId`, `aggregateType`,
  `aggregateId` and `recordVersion`.
- Require a drained `core-agency` commerce outbox, consistent Agency receipts
  and slots, terminal Kafka failure rows, and checkpoint catch-up for the
  expected partitions.
- Emit metadata-only evidence. Do not print URLs, credentials, agency names,
  identifiers, amounts, payloads, fingerprints, per-partition offsets or raw
  errors.

This gate does **not** connect to Kafka, write rows, repair data, replay
events, copy a baseline, switch `AGENCY_DATABASE_URL`, enable the consumer or
deploy. Core remains the sole business writer.

## Configuration

| Variable | Default / rule |
| --- | --- |
| `AGENCY_CUTOVER_CHECK_ENABLED` | `false` (unset) disables the gate with no connection. `true` runs it. Any other value, including empty, is a configuration error / UNAVAILABLE |
| `AGENCY_CUTOVER_SOURCE_DATABASE_URL` | required when enabled |
| `AGENCY_CUTOVER_TARGET_DATABASE_URL` | required when enabled |
| `AGENCY_CUTOVER_KAFKA_GROUP_ID` | required when enabled |
| `AGENCY_CUTOVER_KAFKA_TOPIC` | required when enabled |
| `AGENCY_CUTOVER_EXPECTED_PARTITIONS` | unique non-negative integers, e.g. `0,1,2` |
| `AGENCY_CUTOVER_BATCH_SIZE` | integer 1–1000, default `100` |

When disabled the CLI must not open a database or Kafka connection.

Enabled mode requires `TZ=UTC`. Source and target must be different PostgreSQL
databases. Source must be Core/shared (name must not match
`^blujet_agency(?:_[A-Za-z0-9_]+)?$`). Target must be an isolated Agency
database matching that pattern.

Use dedicated read-only LOGIN roles, never owner, writer or HTTP-reader
credentials. Session options: `connectionTimeoutMillis=2000`,
`query_timeout`/`statement_timeout=5000`, `lock_timeout=2000`,
`default_transaction_read_only=on`, `timezone=UTC`.

## READY contract

Both sessions are `REPEATABLE READ` and `READ ONLY`. READY requires all of:

1. The existing Agency reconciliation reports `MATCH` for the three owned
   tables within the configured bound (row counts and two full-row hashes).
2. `orders.commerce_outbox_events` rows with `producer = 'core-agency'` have
   no pending, in-flight, expired-lease or dead-letter backlog.
3. On the Agency target, every current business row has a matching
   `agency_projection_slots` row (`recordVersion` equals `version`) and every
   slot has a receipt with the same aggregate identity, version and semantic
   fingerprint.
4. Core `agency.agency_projection_audits` and Agency
   `agency.agency_projection_event_receipts` have the same row count and the
   same two order-independent fingerprints over `id`/`auditId`,
   `aggregateType`, `aggregateId` and `recordVersion`. This does not replace
   the business-row or slot/receipt checks.
5. `agency.kafka_processing_failures` has no non-terminal status. Terminal:
   `RESOLVED`, `SKIPPED`.
6. `agency.kafka_consumer_checkpoints` has exactly the expected
   `(consumerGroup, topic, partition)` set. Extra or missing partitions are
   NOT_READY. Every expected row has a non-null `highWatermark` and
   `nextOffset >= highWatermark`.

If a required condition cannot be proven, the gate is NOT_READY or
UNAVAILABLE. It does not invent rows, auto-repair, replay or mutate flags.

## Output and exit codes

- `reportVersion`, `checkedAt`, `status`
  (`DISABLED` \| `READY` \| `NOT_READY` \| `UNAVAILABLE`)
- allowlisted `reasons`
- `sourceCount`, `targetCount`, `mismatchCount`, `checksumEqual`,
  `auditReceiptParity`, `blockingOutboxCount`, `openFailureCount`,
  `receiptSlotMismatchCount`, `expectedPartitionCount`,
  `observedPartitionCount`, `maxLag`
- READY or DISABLED → exit 0
- NOT_READY → exit 2
- UNAVAILABLE / configuration failure → exit 1

Allowlisted reasons:

- `IDENTICAL_DATABASE`
- `INVALID_SOURCE_DATABASE`
- `INVALID_TARGET_DATABASE`
- `PROJECTION_COUNT_MISMATCH`
- `PROJECTION_CHECKSUM_MISMATCH`
- `PROJECTION_INCONCLUSIVE`
- `OUTBOX_PENDING`
- `OUTBOX_IN_FLIGHT`
- `OUTBOX_EXPIRED_LEASE`
- `OUTBOX_DEAD_LETTER`
- `AUDIT_RECEIPT_COUNT_MISMATCH`
- `AUDIT_RECEIPT_FINGERPRINT_MISMATCH`
- `RECEIPT_SLOT_MISMATCH`
- `DLQ_OPEN`
- `CHECKPOINT_MISSING`
- `CHECKPOINT_UNEXPECTED`
- `CHECKPOINT_WATERMARK_MISSING`
- `CHECKPOINT_LAG`
- `UNAVAILABLE`

## Non-goals

- No public `/api/v1` or OpenAPI change
- No new migration
- No producer/consumer, production Compose, runtime flag or deploy change
- No Kafka client
- No data transfer, dual-write or Core writer change

## Acceptance evidence

- [x] Unit tests cover config, TZ=UTC, status/reason aggregation, exact table
      scope, fingerprint determinism, disabled/no-connect, malformed config,
      timeouts and sanitized output.
- [x] Real PostgreSQL E2E proves READY plus row mismatch, checksum mismatch,
      source backlog, checkpoint lag, unresolved DLQ, missing partition, URL
      mix-up, read-only behavior, matching audits/receipts, a missing receipt,
      equal-count fingerprint mismatch and an extra receipt.
- [ ] CI `agency-service` job includes the E2E and remains in `ci-gate`.
- [ ] Present the diff for approval. Do not merge, deploy, activate the
      consumer or cut over reads.
