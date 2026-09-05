# A6.13 — Compatible Loyalty tier-rules reads

This slice moves only `GET /api/v1/club/tier-rules` behind an optional Loyalty
read boundary. The public URL, staff authorization and employee permission,
response envelope and fields remain unchanged. `PATCH /api/v1/club/tier-rules`,
tier recomputation and every other Loyalty write remain Core-only.

With `LOYALTY_TIER_RULES_READ_ENABLED=false` (the default), Core performs the
existing TypeORM read and no service request is made. When enabled, Backend
calls `GET /internal/v1/loyalty/tier-rules` with service identity and a
propagated request ID. The internal route is independently protected by the
default-off `LOYALTY_TIER_RULES_PROJECTION_ENABLED` flag.

The Loyalty projection is a repeatable, read-only query of the oldest singleton
rule. It returns only `goldMinPoints`, `platinumMinPoints`,
`cardRequestMinPoints`, `updatedAt` and `updatedById`. Backend resolves the
existing Persian updater-role label from its current Identity data, so Loyalty
does not read or join `identity.users`. The computed three-row `preview` remains
in Backend and the public response does not change.

An absent rule, disabled projection, network error, timeout, 5xx or oversized
body uses the existing Core path, which may create the defensive default row.
Redirects and malformed or unexpected successful responses fail closed with a
sanitized 503. The response is limited to 16 KiB.

The restricted Loyalty reader already has the three threshold columns and
`createdAt` for membership projection. This slice additionally requires exact
column SELECT on `loyalty.club_tier_rules.updatedAt` and `updatedById`. No
migration or automatic production grant is included. Rollback first disables
`LOYALTY_TIER_RULES_READ_ENABLED`, then disables the service projection and
revokes the optional columns.

## Acceptance

- [x] Public GET preserves its contract, role and employee-permission guards.
- [x] Internal projection is service-authenticated, read-only, exact and has no
  Identity join.
- [x] Disabled, success, absent, unavailable, malformed and oversized paths are
  covered.
- [x] PATCH remains Core-only and performs no Loyalty HTTP request.
- [x] Conditional readiness and least-privilege verification cover the exact
  additional columns.
- [x] Backend and Loyalty lint, typecheck, build and focused tests pass.
- [ ] Production grant review, parity, flag enablement and deployment remain
  separately approved gates.

## Local evidence — 2026-09-05

- Backend: 640 unit cases across 129 suites and 23 Club E2E cases pass.
- Loyalty: 4 unit cases and 35 real-PostgreSQL E2E cases pass, including
  conditional exact grants, denied writes and the cross-process shadow suite.
- Backend and Loyalty typecheck/build pass; scoped Backend lint and complete
  Loyalty lint pass.
- Both new flags remain false. No migration, production grant, commit, push,
  merge or deployment was performed.
