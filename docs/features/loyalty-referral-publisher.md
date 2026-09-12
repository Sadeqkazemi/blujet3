# Loyalty referral publisher

Create a referral atomically with a new customer and publish its encrypted
snapshot. On the referred customer's first ticketed booking, lock the referral
and referrer member before writing the reward ledger, member cache and all
versioned projection snapshots. No API, reward policy, cutover or deployment
changes.

- [x] Signup commits customer, referral and `CREATED` event together
  (`customer-referrals.e2e-spec.ts`, signup test).
- [x] Concurrent first-ticket processing awards exactly 500 points once
  (`customer-referrals.e2e-spec.ts`, reward test).
- [x] Forced rollback leaves referral/member/ledger/audit/outbox unchanged
  (`customer-referrals.e2e-spec.ts`, reward test).
- [x] Reward commits referral, points entry, member cache and all projection
  events together (`customer-referrals.e2e-spec.ts`, reward test).
- [x] 4 Referral, 28 Auth and 16 Purchase Extras E2E tests pass.
- [x] Typecheck, scoped lint, production build and diff validation pass.
- [ ] GitHub CI and explicit merge approval; no deployment or cutover.
