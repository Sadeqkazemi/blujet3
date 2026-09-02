# Sandbox public purchase lifecycle

Source: `sandbox-multirole-uat (1).md`, re-audited 2026-08-07.

## Acceptance checklist

- [x] A newly created flight remains absent from public search until CEO
      registration succeeds.
- [x] CEO registration invalidates the exact route/date search cache, so the
      approved flight is visible immediately without waiting for the cache TTL.
- [x] Public flight search works without authentication and uses the selected
      Gregorian/Jalali day consistently.
- [x] A visitor who starts unauthenticated can preserve the selected flight,
      authenticate inline by OTP, complete passengers and seats, pay, and see
      the issued e-ticket.
- [x] A customer who is already authenticated skips the OTP gate and completes
      the same booking/payment/e-ticket path.
- [x] Search, seat map, booking creation and payment all enforce the same
      sellability state and registered price; pending/rejected flights cannot
      be purchased.
- [x] Payment remains idempotent, expired holds release inventory, and a
      different customer cannot view or pay another customer's booking.

## Regression evidence

- Backend lifecycle test covers commercial creation, hidden `PENDING_CEO`
  inventory, CEO registration, immediate anonymous search visibility, seat
  selection, customer booking, sandbox payment, and `TICKETED` retrieval.
- Public Playwright journeys cover both an unauthenticated visitor (inline OTP)
  and an already-authenticated customer (no repeated OTP).
- Agency booking snapshots default extras to zero/empty at the entity boundary,
  preventing agency allotment sales from failing on non-null database columns.
- Sandbox owner account preview returns every active USER/AGENCY account rather
  than silently omitting newer accounts after an arbitrary first-100 cap.

The suspended flight-city and add-flight form redesigns are outside this
change and must remain untouched.
