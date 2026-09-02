# Complete sandbox multi-role UAT

## Approved decisions

- Customer profile completeness has one server-owned definition: full name,
  national ID, birth date, passport number, and verified email (20% each).
- The customer, SITE_ADMIN, and SENIOR_MANAGER can see the same completion
  result. SENIOR_MANAGER access is read-only and sensitive identity values are
  masked.
- Agency membership requires ordered approval: COMMERCIAL_MANAGER first,
  FINANCE_MANAGER second. The account is created only after both approvals.
- An agency sells against one active allotment. A successful sale consumes the
  allotment and agency credit atomically and immediately issues the ticket.

## Acceptance checklist

### Canonical customer profile completion

- [x] One shared backend helper computes percentage, missing fields, and
  `profileIncomplete` for both `/profile` and `/customers*`.
- [x] SITE_ADMIN and SENIOR_MANAGER can list customers and see the same
  incomplete badge/count; other manager roles receive 403.
- [x] SENIOR_MANAGER sees masked national ID and read-only customer detail.
- [x] The SENIOR_MANAGER sidebar exposes the customers page and badge.
- [x] Backend and frontend tests cover complete, incomplete, forbidden, and
  masked views.

### Ordered dual agency approval

- [x] Membership requests persist commercial and finance approval actor/time.
- [x] COMMERCIAL_MANAGER approval never creates an agency account; it advances
  the request to finance review.
- [x] FINANCE_MANAGER cannot approve before commercial approval.
- [x] FINANCE_MANAGER final approval creates exactly one User, AgencyProfile,
  and AgencyCreditLine transactionally and sends credentials once.
- [x] Repeated/concurrent approval cannot create duplicate agency accounts.
- [x] Request UI shows both approval stages and only the current role's valid
  action.

### Real agency allotment sale

- [x] Booking has nullable `allotmentId` with an indexed foreign key.
- [x] `POST /agency-portal/allotments/:allotmentId/bookings` accepts cabin and
  passengers and is idempotent.
- [x] The endpoint rejects another agency's, released, exhausted, mismatched,
  or missing allotment.
- [x] Flight, allotment, and agency credit are locked in one transaction.
- [x] A successful sale creates an AGENCY/TICKETED Booking, Passenger rows and
  a SALE ledger entry carrying `agencyId` and `bookingId`.
- [x] Concurrent requests cannot exceed physical seats, allotment seats, or
  agency credit.
- [x] Agency portal offers a real seat/passenger sales form and refreshes the
  used/remaining counts from the API after success.
- [x] Backend E2E and frontend component tests prove happy, ownership,
  exhaustion, credit, idempotency, and concurrent-last-allotment-seat cases.

## Verification gate

All changed packages must pass lint, build/typecheck and tests. The pull request
must pass the protected GitHub checks before merge; UAT deployment remains
behind the protected `uat` environment approval.
