# Loyalty price-lock creation/cancellation publisher

Creation and cancellation snapshots share the Core transaction with wallet
fees. Cancellation locks its row before status validation. No API, fee policy,
database cutover or deployment change. Booking consumption is a later slice.

- [x] Creation/cancellation projection audit: `purchase-extras.e2e-spec.ts`.
- [x] Concurrent cancellation returns one success and one rejection (same spec).
- [x] 16 purchase-extras E2E tests pass with TZ=UTC; 4 price-lock unit tests pass.
- [x] Typecheck, scoped lint and production build pass.
- [ ] GitHub CI and merge approval.
