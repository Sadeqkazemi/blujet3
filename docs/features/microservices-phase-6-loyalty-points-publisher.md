# Loyalty points publisher

Connect purchase earnings and payment redemption to the existing encrypted
projection outbox. The caller must supply an active Core transaction. Lock the
member before computing its ledger balance; insert the immutable points entry,
update the display cache and publish both full snapshots before commit.
No direct writes to the independent Loyalty database or deployment.

- [x] Publish entry and member snapshots atomically (`club.e2e-spec.ts`, real points credit).
- [x] Verify points/cache/audit/outbox rollback (`club.e2e-spec.ts`, real points credit).
- [x] Two simultaneous redemptions cannot overspend (`club.e2e-spec.ts`, real points credit).
- [x] Full Club regression suite after the additional assertions: 31 tests passed.
- [x] Backend typecheck, scoped ESLint and production build passed.
- [ ] GitHub CI and explicit merge approval.
