# Flight series approval and cancellation workflow

Approved product scope: the commercial Add Flight flow applies one commercial
definition to every future occurrence materialized under the entered seasonal
flight number. Operations and CEO review that occurrence series with its full
date range. A CEO approval publishes every pending occurrence in the series.
Commercial can cancel a published occurrence; finance receives the affected
booking/passenger queue and records each full refund.

## Acceptance checklist

- [x] Entering an active seasonal flight number exposes every future occurrence,
      Persian weekday/month labels, and the first/last operating dates.
- [x] Completing Add Flight copies fare classes, charge rules, pricing proposal,
      and sale controls to every eligible future occurrence in one transaction.
- [x] Operations sees one series review card with occurrence count, start/end,
      and every operating date; approve/reject applies to the entire pending series.
- [x] CEO pricing rows include the same series metadata and one approval publishes
      every pending occurrence with the same flight number as an independently
      searchable `FlightInstance`.
- [x] Fare-class cabin choices are generated only from positive cabin capacities
      inherited from the selected aircraft/template, including FIRST when defined.
- [x] Active-flight list and flight detail use the same canonical
      `FlightInstance.publicSaleEnabled` value; disabling sale never renders as active.
- [x] Commercial flight detail has a guarded cancel action with a mandatory reason.
- [x] Cancellation closes public sale atomically, records actor/reason/time, invalidates
      search, notifies signed-in customers, and attempts one SMS per paid booking.
- [x] Commercial and Finance navigation both expose a real cancelled-flights page.
- [x] Finance can inspect affected PNRs/passengers/amounts and idempotently refund an
      eligible booking; the operation writes immutable refund ledger rows, credits the
      customer wallet when an owner exists, and changes the booking to `REFUNDED`.
- [x] API authorization rejects non-commercial cancellation and non-finance payout.
- [x] Backend and frontend builds plus focused automated journeys pass. The local
      panel browser journey reaches the staff sign-in boundary; authenticated visual
      verification remains a deployment/UAT check and does not use stored credentials.

## Verification evidence

- Backend `npm run build` and focused Jest suites: 6 suites / 19 tests passed.
- Frontend `npm run build` and focused Vitest suites: 7 suites / 39 tests passed,
  including series review, cancellation action, finance refund, pricing, and cabins.
- Local browser: application served at `http://localhost:5173`; protected cancellation
  route correctly redirected an unauthenticated session to staff sign-in.

## API surface

- Existing `PUT /flights/:id/complete-and-submit` gains atomic series semantics for
  schedule-backed occurrences and returns `scheduleGroup` metadata.
- Existing operations queue/decision and pricing proposal/register endpoints gain
  `scheduleGroup` metadata and series-wide transitions.
- `POST /flights/:instanceId/cancel` — Commercial Manager, body `{ reason }`.
- `GET /flights/cancellations` — Commercial/Finance/Senior, real cancellation queue.
- `POST /flights/:instanceId/cancellations/:bookingId/refund` — Finance Manager;
  idempotent full cancellation refund to original account ledger/wallet.
