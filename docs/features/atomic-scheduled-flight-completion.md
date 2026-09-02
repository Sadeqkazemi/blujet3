# Feature: atomic scheduled-flight completion

## Product flow

`مسیر پروازی` materializes dated `FlightInstance` rows as `DRAFT`. The
commercial add-flight flow completes one of those rows; it does not create an
unrelated flight from free-form route data.

## Acceptance checklist

### API and transaction

- [x] `PUT /flights/:id/complete-and-submit` accepts the complete definition,
      fare classes and pricing proposal for an existing scheduled occurrence.
- [x] The command locks the occurrence and commits definition, charge rules,
      fare rules, pricing proposal and `PENDING_OPERATIONS` status in one
      database transaction.
- [x] Any validation or persistence failure rolls the whole command back; no
      partially configured flight or fare class remains.
- [x] The command is allowed only for a materialized `DRAFT`,
      `OPERATIONS_REJECTED` or `REJECTED` occurrence and respects optimistic
      `expectedVersion`.
- [x] Aircraft identity and physical cabin capacities come from the occurrence
      aircraft definition. A client cannot increase or rewrite physical cabin
      capacity through this command.
- [x] Fare-class capacity is validated per physical cabin and duplicate
      `(cabin, classCode)` rows are rejected.
- [x] RBAC matches the existing flight-management writes:
      COMMERCIAL_MANAGER, SENIOR_MANAGER and EMPLOYEE+`fl_manage`.

### Commercial UI

- [x] Add Flight starts by resolving/selecting an existing route occurrence;
      an unknown flight number cannot create a standalone flight.
- [x] Route, departure, aircraft and physical capacity are inherited and shown
      read-only after resolution.
- [x] The form is presented as four steps: occurrence, fare classes, channel /
      agency capacity, and pricing/review.
- [x] Moving forward validates the current step; the final action calls only
      the atomic completion endpoint.
- [x] The page preserves server-provided agency commitment/allotment summaries
      and never fabricates agency data.

### Regression proof

- [x] Backend E2E proves happy path, rollback, stale version, unknown instance,
      invalid capacity and unauthorized access.
- [x] Frontend tests prove unknown numbers are blocked, inherited fields are
      read-only, step navigation works and final submission makes one command.
- [x] Existing operations → CEO → public publication and agency visibility
      journeys remain green.
