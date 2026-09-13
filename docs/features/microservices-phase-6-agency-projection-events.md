# Microservices phase 6 — Agency projection event contract

## Scope

This slice freezes three versioned, full-snapshot events for the existing
Agency read database: `AgencyProfileProjected`, `AgencyInvoiceProjected` and
`AgencyCreditRequestProjected`. The producer identity is `core-agency`; the
aggregate ID is the source row primary key and each payload carries a positive
`recordVersion` plus the audit row reference that authorized the snapshot.

This is a contract-only slice. It does not add a publisher call site, outbox
row, consumer, migration, Kafka client, data copy, read URL switch, dual-write,
feature-flag activation or deployment. Core remains the only Agency writer.

## Data and safety boundary

- Full snapshots contain only columns already owned by the three approved
  projections. Invoice and credit amounts are exact non-negative `bigint` IRR
  decimal strings; all timestamps are canonical UTC ISO strings.
- Profile contact fields are required by the existing portal projection. They
  are admitted only on the protected Agency event path and must remain inside
  encrypted outbox storage and authenticated TLS transport when publication is
  added. They must never be emitted to logs, metrics, reconciliation output or
  a future DLQ.
- Identity operator IDs and Core booking IDs remain stable scalar references.
  No consumer may join or write another domain database.
- Events reject unknown/missing fields, invalid enum values, unsafe amounts,
  non-canonical timestamps, invalid aggregate routing and inconsistent pending
  credit decisions.
- Schema IDs are immutable v1 identifiers and are resolved by the shared Kafka
  schema-header path without enabling Kafka publication.

## Acceptance checklist

- [x] Freeze exact v1 schema IDs, producer, aggregate types and payload fields
  for all three projections.
- [x] Build and parse detached full snapshots with strict enum, IRR, timestamp,
  record-version and routing validation.
- [x] Reject unknown fields, malformed PII-bearing snapshots and inconsistent
  credit decision state without exposing their values in errors.
- [x] Resolve exact Agency schemas through the shared event-schema catalog and
  Kafka schema header path.
- [x] Pass focused tests, Backend lint, typecheck and production build.
- [x] Present the completed diff for explicit approval before commit, push or
  merge. Do not activate publication, cut over reads or deploy.

## Next slice

Add positive source revisions and encrypted transactional outbox publication
at each existing Core mutation boundary. A later slice may add ordered Agency
projection storage, replay, reconciliation, checkpoint and metadata-only DLQ;
none of those are authorized by this contract.
