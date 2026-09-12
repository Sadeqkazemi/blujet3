# Loyalty price-lock booking lifecycle publisher

Attaching a lock to a booking and consuming it during payment must publish the
same versioned snapshot in the existing Core transaction. A conditional attach
must affect exactly one row; otherwise the booking rolls back. Payment locks
the attached row so cancellation and consumption have one winner.

- [x] One of two concurrent booking attempts attaches the lock; the loser rolls
  back (`purchase-extras.e2e-spec.ts`, booking lifecycle test).
- [x] `LINKED` and `CONSUMED` audit/outbox rows commit with booking/payment
  (`purchase-extras.e2e-spec.ts`, booking lifecycle test).
- [x] Failed points payment leaves the lock active and adds no audit/outbox row
  (`purchase-extras.e2e-spec.ts`, booking lifecycle test).
- [x] 16 Purchase Extras E2E tests, typecheck and scoped lint pass.
- [x] Production build and diff validation pass.
- [ ] GitHub CI and explicit merge approval; no deployment or cutover.
