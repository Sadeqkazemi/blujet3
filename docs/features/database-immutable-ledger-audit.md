# Database append-only financial and audit records

## Scope

Enforce the architecture and financial rules at PostgreSQL level for the
records whose history is the source of truth. The application may append new
entries, but no runtime or administrative ORM path may update or delete an
existing row.

Protected tables:

- `payments.ledger_entries` — money ledger entries and reversals.
- `payments.wallet_entries` — wallet movements.
- `loyalty.club_points_entries` — points ledger movements.
- `payments.bank_loan_webhook_events` — bank event evidence and replay trail.
- `audit.audit_logs` — security and business audit trail.

## Acceptance checklist

- [x] A TypeORM migration installs one reusable trigger function and a
      `BEFORE UPDATE OR DELETE` trigger on every protected table.
- [x] Inserts remain permitted so sales, refunds, wallet credits, points and
      audit events continue to work.
- [x] An attempted `UPDATE` is rejected with a stable PostgreSQL
      `55000` (`object_not_in_prerequisite_state`) error.
- [x] An attempted `DELETE` is rejected with the same error.
- [x] Trigger coverage is verified against `pg_trigger` for all five tables.
- [x] Migration `down` removes the triggers and function and `up` can install
      them again without leaving duplicate objects.
- [x] Automated PostgreSQL integration coverage exercises insert, update and
      delete behavior in an isolated transaction; no business rows remain.
- [x] `docs/DB_SCHEMA.md` and `PLAN.md` describe the database-enforced
      immutability boundary and the reversal-only correction rule.
- [x] Backend typecheck, lint, focused migration test and the existing unit
      suite pass. No deployment is performed in this phase.

Evidence: `backend/test/database-immutable-financial-audit.e2e-spec.ts`
(`installs the guard trigger...`, `allows an insert but rejects...`, and
`can reverse and reapply...`), plus 944/944 Backend unit tests. Legacy E2E
fixture cleanup now retains immutable audit and ledger rows: temporary actors
are tombstoned, while test flights are cancelled and hidden from sale instead
of deleting their evidence graph. Accountable ticketing fixtures likewise keep
their uniquely identified booking, passenger and document history.
Audit and survey fixtures use the same insert-time/retirement policy.
Bank webhook processing locks the loan before deciding its outcome, then
inserts the final APPLIED or IGNORED outcome once in the same transaction as
the loan/wallet changes. The unique provider/event key rejects duplicate
ingestion without mutating the original event log.

## API impact

Focused fixture regression verification: 82 tests pass across `club`,
`core-itinerary`, `reservation`, `notify-outbox`, and
`phase13e-pnr-lifecycle-reconciliation` E2E suites. Customer reset helpers
append compensating points entries; itinerary assertions count only their
own order or owner. Full CI remains a separate merge requirement.

No public endpoint or response envelope changes. Existing correction flows
must create reversal/adjustment rows instead of editing historical entries.
