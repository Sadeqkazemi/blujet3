# A6.12 — Compatible Loyalty membership reads

This slice moves only `GET /api/v1/my/club/membership` behind an optional
Loyalty read boundary. The public URL, `USER` authorization, response envelope
and fields stay unchanged. `POST /api/v1/my/club/join`, card requests, staff
decisions, tier-rule changes and every points writer remain Core-only.

With `LOYALTY_MEMBERSHIP_READ_ENABLED=false` (the default), Core performs the
existing TypeORM read and no service request is made. When enabled, the backend
calls owner-bound `GET /internal/v1/loyalty/membership/:userId` with the
internal token and a request ID derived from the authenticated request. The
browser cannot choose the owner header.

The Loyalty route has its own default-off
`LOYALTY_MEMBERSHIP_PROJECTION_ENABLED` switch. This keeps the already deployed
minimal reader ready until its optional exact grants are provisioned. Service
projection is enabled and verified before the backend public-read flag.

The internal projection returns active membership/card fields, the
ledger-derived points balance, the oldest configured tier rule and the newest
non-rejected card request. It contains no name, email, national ID, birth date,
wallet, payment or inventory data. The response is exact and bounded: card
history accepts at most 32 entries and the encoded response at most 64 KiB.

Network errors, timeouts, 5xx responses and oversized bodies use the current
Core read. Redirects, unexpected 4xx responses, malformed data, unknown enums,
foreign owners and invalid card-history structures fail closed with a
sanitized 503. An absent active membership is a valid 200 projection because
the response still includes the tier thresholds needed by the existing page.

The restricted Loyalty reader additionally needs column SELECT on:

- `loyalty.club_members.cardNo`;
- `loyalty.club_card_requests`: `id`, `memberId`, `status`, `history`, `cardNo`,
  `createdAt`;
- `loyalty.club_tier_rules`: `goldMinPoints`, `platinumMinPoints`,
  `cardRequestMinPoints`, `createdAt`.

No migration or automatic production grant is included. The verifier and
readiness contract are expanded to require only these exact columns. Rollback
is first setting `LOYALTY_MEMBERSHIP_READ_ENABLED=false`, then disabling the
service projection and revoking its optional grants; no schema or data rollback
is needed.

## Acceptance

- [x] Public route preserves member, absent-member and staff-forbidden behavior.
- [x] Internal projection is owner-bound, read-only, PII-free and exact.
- [x] Disabled, success, absent, unavailable, malformed, oversized and
  foreign-owner client paths are covered.
- [x] `join`, card-request, approval, tier and points writers remain Core-only.
- [x] Backend and Loyalty tests, lint, typecheck and builds pass.
- [ ] Production reader review, representative parity, flag enablement and
  deployment remain separately approved gates.

## Local evidence — 2026-09-05

- Backend: 632 unit cases across 128 suites and 21 Club E2E cases pass.
- Loyalty: 3 unit cases and 33 real-PostgreSQL E2E cases pass, including the
  conditional exact reader grants and rejected writes.
- Backend and Loyalty typecheck/build pass; scoped Backend lint and complete
  Loyalty lint pass.
- Both flags remain false; no production grant, migration, push, merge or
  deployment was performed.
