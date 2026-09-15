# Microservices phase 6 — Loyalty projection cutover readiness

## Scope

- Add an offline, read-only gate that decides whether the existing Core Loyalty
  reads may later be switched to the isolated Loyalty projection.
- Compare all six Loyalty-owned business tables through the existing full-row
  reconciliation contract.
- Require the Core Loyalty outbox to be drained, projection receipts and slots
  to be consistent, every expected Kafka partition to be caught up, and every
  poison delivery to have a terminal operator decision.
- Return aggregate, metadata-only evidence. The gate must never print a member,
  identifier, points balance, locked price, event payload, URL or credential.

Core remains the sole business writer. This slice does not replay an event,
repair a row, start a consumer, enable a public reader, change a database URL or
deploy a service.

## Configuration and result

The compiled command is `npm run check:cutover:prod` in `loyalty-service` and
uses only these settings:

| Variable                               | Rule                                                        |
| -------------------------------------- | ----------------------------------------------------------- |
| `LOYALTY_CUTOVER_CHECK_ENABLED`        | `false` by default; only exact `true` enables database work |
| `LOYALTY_CUTOVER_SOURCE_DATABASE_URL`  | restricted Core reader URL                                  |
| `LOYALTY_CUTOVER_TARGET_DATABASE_URL`  | restricted isolated Loyalty reader URL                      |
| `LOYALTY_CUTOVER_KAFKA_GROUP_ID`       | exact consumer group                                        |
| `LOYALTY_CUTOVER_KAFKA_TOPIC`          | exact shared event topic                                    |
| `LOYALTY_CUTOVER_EXPECTED_PARTITIONS`  | unique comma-separated non-negative partition list          |
| `LOYALTY_CUTOVER_RECONCILIATION_LIMIT` | per-table fingerprint ceiling, `1..1000000`                 |

Enabled execution requires a UTC process, distinct PostgreSQL databases,
two-second connection/lock timeouts and five-second query/statement timeouts.
Both snapshots are `REPEATABLE READ`, `READ ONLY`. Disabled mode opens no
database connection.

The command emits one JSON object containing only report version, UTC capture
time, status, fixed reason codes and aggregate counts/booleans. Status is one of
`READY`, `NOT_READY`, `DISABLED` or `UNAVAILABLE`. Exit codes are respectively
`0`, `2`, `0` and `1`.

## Acceptance checklist

- [x] Disabled mode opens no database connection and returns metadata-only
      `DISABLED` evidence.
- [x] Invalid flags, non-UTC execution, identical/malformed URLs, malformed
      Kafka identifiers, duplicate/negative partitions and unsafe limits fail
      closed without exposing configuration values.
- [x] The existing reconciliation contract compares exactly `club_members`,
      `club_points_entries`, `club_card_requests`, `club_tier_rules`,
      `price_locks` and `customer_referrals` under read-only repeatable
      snapshots.
- [x] Any count/checksum/inconclusive table result is `NOT_READY`; serialized
      output contains no table row, fingerprint, identifier, PII, points or IRR.
- [x] Pending, in-flight, expired-lease or dead-lettered `core-loyalty` outbox
      rows block readiness.
- [x] Source projection audits and target idempotency receipts have exact
      aggregate parity, and target slots exactly match the current six-table
      aggregate/version set.
- [x] Missing, unexpected, watermark-less or lagging Kafka checkpoints block
      readiness for the configured group/topic/partitions.
- [x] Every non-`RESOLVED`/`SKIPPED` Loyalty failure row blocks readiness.
- [x] Unit and real-PostgreSQL tests prove READY plus every blocking class,
      read-only behavior, bounded output and connection cleanup.
- [x] Loyalty lint, typecheck, build, OpenAPI stability and diff hygiene pass;
      no consumer/read flag, Compose production path or deployment changes.
- [x] Present the complete diff and receive explicit approval before commit,
      push or merge. Deployment and cutover remain separate actions.
