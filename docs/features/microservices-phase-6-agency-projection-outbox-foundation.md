# Microservices phase 6 — Agency projection outbox foundation

## Scope

This slice adds the source-side persistence required before Agency projection
publication can be activated. The three existing Core source tables gain a
positive revision, a content-free append-only audit records each accepted
aggregate revision, and a typed service writes the matching encrypted
`core-agency` event to the existing transactional commerce outbox.

This is a foundation-only slice. It does not call the recorder from Agency,
Agency Portal or Booking mutation paths. It does not publish to Kafka, add an
Agency consumer, copy data, switch a read URL, dual-write a projection, change
an HTTP route or deploy. Core remains the sole writer.

## Atomicity and privacy boundary

- `agency_profiles`, `agency_invoices` and `agency_credit_requests` receive an
  additive `version integer NOT NULL DEFAULT 1` with a positive check. A
  database trigger advances every changed row revision atomically, including
  writes made through raw SQL; new rows start at version 1. Revision metadata
  is excluded from default selects and JSON responses. A mutation caller must
  explicitly select the post-write revision before recording its event.
- `agency_projection_audits` stores only aggregate type/id, revision, mutation
  and creation time. A database trigger rejects update and delete operations.
- Audit insertion and encrypted commerce-outbox insertion require the caller's
  active Core transaction. The same aggregate revision and mutation is an
  idempotent replay; a different mutation or changed snapshot is rejected.
- Profile PII exists only inside the encrypted envelope. It is absent from the
  projection audit, fingerprint inputs exposed to operators, logs and errors.
- Empty optional onboarding contact strings already accepted by the source
  schema remain valid event values; required license, manager and phone fields
  remain non-empty.

## Acceptance checklist

- [x] Add positive source revisions and an immutable, content-free Agency
  projection audit through an expand-only migration.
- [x] Register matching TypeORM entity metadata without exposing `version` in
  existing HTTP responses.
- [x] Record all three strict Agency snapshots only inside an active Core
  transaction with deterministic idempotency keys.
- [x] Store every accepted Agency snapshot in the encrypted commerce outbox and
  reject conflicting aggregate-version replays.
- [x] Prove source row, audit and outbox atomic commit/rollback against
  PostgreSQL.
- [x] Pass focused unit/E2E tests, Backend lint, typecheck and production build;
  present the diff before commit, push or merge. Do not deploy.

## Next slice

Activate the recorder at the reviewed mutation boundaries in `AgenciesModule`,
`AgencyPortalModule` and `BookingEngineModule`. Each source write and event must
share one transaction; a forced enqueue failure must roll the business row
back. Consumer, reconciliation, checkpoint, DLQ and read cutover remain later
approval gates.
