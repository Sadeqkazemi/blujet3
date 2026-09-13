# Microservices phase 6 — Agency durable Kafka checkpoints

## Scope

This slice adds durable per-partition progress evidence to the standalone
Agency Kafka projection worker. A checkpoint is stored in the dedicated Agency
projection database in the same PostgreSQL transaction as the projection
receipt, aggregate slot and business snapshot. Kafka acknowledgement still
happens only after that transaction commits.

The checkpoint is operational evidence, not a business source of truth. The
stored next offset and observed high watermark are monotonic, so replay or
out-of-order observations cannot move either value backwards. A projection
failure, transaction rollback or malformed delivery writes no checkpoint and
receives no Kafka acknowledgement.

The worker remains disabled by default and absent from Compose/deployment. This
slice does not add retry/DLQ policy, baseline replay, read cutover, Core writer
freeze, credentials, broker activation or deployment.

## Acceptance checklist

- [x] Add one expand-only Agency-owned checkpoint migration and matching
  TypeORM metadata with bounded coordinates and no cross-domain foreign key.
- [x] Persist checkpoint progress atomically for applied, duplicate and stale
  projection outcomes without changing direct non-Kafka projection calls.
- [x] Preserve monotonic next-offset/high-watermark values and prove rollback
  leaves both projection and checkpoint unchanged.
- [x] Pass the validated consumer group and optional Kafka high watermark from
  the manual-ACK adapter into the projection transaction.
- [x] Restore bounded checkpoint evidence before the broker connection and
  expose only partition count, maximum observed lag and last checkpoint UTC
  time through readiness.
- [x] Prove migration rollback/restore, handler ordering, acknowledgement-gap
  replay, runtime restore and safe readiness behavior.
- [x] Pass Agency tests, lint, typecheck, production build and schema parity.
- [x] Present the completed diff for explicit approval before commit/push/merge.
  Do not activate, cut over reads or deploy.

Local evidence: 97 unit tests, 10 real-PostgreSQL projection tests and 70 E2E
tests pass. Agency lint, typecheck and production build pass; the generated
OpenAPI artifact remains byte-identical.

## Deferred gates

Bounded poison-message retry and operator-controlled DLQ/replay, baseline plus
retained-delta execution, real-broker UAT, read cutover, Core writer freeze and
deployment remain separate reviewed phases.
