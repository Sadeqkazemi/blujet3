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

- [ ] A TypeORM migration installs one reusable trigger function and a
      `BEFORE UPDATE OR DELETE` trigger on every protected table.
- [ ] Inserts remain permitted so sales, refunds, wallet credits, points and
      audit events continue to work.
- [ ] An attempted `UPDATE` is rejected with a stable PostgreSQL
      `55000` (`object_not_in_prerequisite_state`) error.
- [ ] An attempted `DELETE` is rejected with the same error.
- [ ] Trigger coverage is verified against `pg_trigger` for all five tables.
- [ ] Migration `down` removes the triggers and function and `up` can install
      them again without leaving duplicate objects.
- [ ] Automated PostgreSQL integration coverage exercises insert, update and
      delete behavior in an isolated transaction; no business rows remain.
- [ ] `docs/DB_SCHEMA.md` and `PLAN.md` describe the database-enforced
      immutability boundary and the reversal-only correction rule.
- [ ] Backend typecheck, lint, focused migration test and the existing unit
      suite pass. No deployment is performed in this phase.

## API impact

No public endpoint or response envelope changes. Existing correction flows
must create reversal/adjustment rows instead of editing historical entries.
