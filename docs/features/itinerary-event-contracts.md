# Core itinerary commerce event contracts v1

Roadmap step 13: typed payloads for four existing envelope event types, scoped
to CoreItineraryOrder, not Booking. This is an additive internal contract, not
a business-writer cutover. The generic v1 transport remains compatible.

## Wire contract

Both use producer `core-commerce`, aggregateType `CoreItineraryOrder`,
aggregateId = persisted order id. Envelope eventVersion remains 1.
Payloads have exact keys; unknown fields (including PII) are rejected.
Correlation/idempotency IDs are opaque safe identifiers, never passenger data.
All reference IDs are bounded identifiers, not UUID-only: existing DB columns
are text. Event ID remains UUID. Neither references nor producer strings
authorize DB access or prove that a corresponding DB row exists.

| Event | Exact payload |
| --- | --- |
| OrderCreated | auditId, orderVersion, channel, status=HELD, currency=IRR, fareIrr, taxIrr, extrasIrr, totalIrr, holdExpiresAt |
| PaymentConfirmed | auditId, orderVersion, confirmationId, status=COMPLETED, currency=IRR, amountIrr |
| TicketIssued | auditId, orderVersion, currency=IRR, status=TICKETED, ticketDocumentIds, issuedAt |
| RefundRequested | auditId, orderVersion, currency=IRR, refundId, refundReference, quoteReference, status=RECEIVED, grossAmountIrr, penaltyAmountIrr, refundableIrr |

Amounts are canonical nonnegative decimal strings within signed PostgreSQL
bigint range; PaymentConfirmed amount is strictly positive. Order total equals
fare + tax + extras (same quote snapshot semantics). No floats/coercion.
orderVersion is the persisted positive int32 version, not a new sequence.
The hold expiry is UTC milliseconds and later than creation time; received
historical events are not rejected merely because the hold has since expired.
Business consumers still need current-state/version checks before any action.

Builders read only allowlisted fields from existing CoreItineraryOrder,
CoreItineraryPaymentConfirmation, CoreItineraryTicketDocument and
CoreItineraryRefund snapshots. Payment builder requires matching
order id, TICKETED order, COMPLETED confirmation, matching IRR/amount and a
null failureCode (the current payment service commits ledger, tickets and this
state together). An unverified PSP callback or RECEIVED/REVIEW_REQUIRED row is
not PaymentConfirmed. No paymentReference, PNR, contactPhone, owner/traveller,
requestHash or financial account identifiers are published.

`parseCoreItineraryEvent` rejects invalid/unknown types, metadata, payload and
amounts with VALIDATION_FAILED without echoing input.
`CommerceOutboxService.enqueueItinerary` validates before the existing atomic
outbox write; `CommerceInboxService.consumeItinerary` validates before opening
the existing inbox transaction and delivers a discriminated typed event to the
callback with that same EntityManager. Generic methods remain unchanged.

## Activation / ownership

No new table, migration, flag, public route, seed or dependency. No live calls
from hold/payment writers and no Kafka subscription. An actual audit row must
be written in the same Core transaction and its id supplied before producer
activation; the builders never generate pretend audit evidence. Existing hold
and payment services do not yet supply it here. Only Core owns these receipts.
TicketIssued requires a TICKETED order and a non-empty complete set of
accountable documents issued by the Core payment flow. RefundRequested is only
the initial RECEIVED request and carries the immutable quote amounts; a later
COMPLETED refund is a separate state transition and is not implied by this
event. FlightDisrupted remains an external operations/NIRA integration contract
and is intentionally not activated until its owner-approved schema exists.

## Backend checklist

- [x] Read the Core order/confirmation entities, hold/payment service state
  changes, envelope, outbox and inbox; document before code.
- [x] All 69 contract unit tests cover exact fields, required audit ID, privacy,
  correct monetary totals, legacy text IDs, version/state and type rejection
  (`core-itinerary-events.spec.ts`).
- [x] Strict methods reject invalid messages before DB access; existing
  generic v1 payloads are unchanged (`core-itinerary-events.spec.ts`).
- [x] PostgreSQL roundtrip: validated outbox survives replay with stable event
  ID; typed inbox deduplicates and atomically rolls back callback writes
  (`commerce-inbox.e2e-spec.ts`, all 10 tests pass).
- [x] All 862 units (140 suites), 25 PostgreSQL Inbox/Outbox tests,
  full read-only lint, typecheck/build and diff check pass locally.
- [x] Owner-approved push, CI and merge completed in PR #61 (merge commit
  `8ae873b6dfb0c4f7ae66634efbcacaf91335b2a0`). No deployment.

Regression evidence: `channel: ['SYSTEM']` initially passed via string
coercion. The added test failed before replacing coercion with exact string
comparisons, and now passes. Validation does not coerce caller input.

The existing Outbox PostgreSQL regression requires UTC in both Node and the DB
session (its timestamps have no time zone). A local PostgreSQL server defaulted
to Asia/Tehran while Node used UTC, so default nextAttemptAt values appeared
3.5 hours ahead and dispatch tests skipped them. Pin the test pool to UTC, as
the existing Kafka suite does; do not change the server-wide DB configuration.
Production UTC configuration remains a deployment prerequisite.
After this test-only correction, all 15 Outbox tests pass together with the
10 Inbox tests. Kafka broker suites were not rerun for this additive slice;
the previous merged adapter's broker evidence is in `kafka-inbox-ack.md`.
