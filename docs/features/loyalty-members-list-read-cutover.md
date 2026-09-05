# A6.14 — Compatible Loyalty members-list reads

This slice moves eligible reads of `GET /api/v1/club/members` behind an
optional Loyalty boundary. The public URL, role/permission guards, filters,
response envelope, member fields and unfiltered KPI semantics stay unchanged.
Member creation, deactivation, manual tier changes, card issuance and every
other write remain Core-only.

With `LOYALTY_MEMBERS_LIST_READ_ENABLED=false` (the default), Core performs the
existing TypeORM queries and no service request is made. When enabled, Backend
calls `GET /internal/v1/loyalty/members-list` with service identity, the
existing optional `level`/`q` filters and a propagated request ID. The internal
route has its own default-off `LOYALTY_MEMBERS_LIST_PROJECTION_ENABLED` switch.

The projection runs the filtered list and all unfiltered KPI aggregates in one
repeatable, read-only transaction. It returns at most 1000 active members and
contains only fields already exposed to authorized non-site-admin club staff.
It never selects `nationalIdEnc`, `nationalIdHash`, deactivation audit fields or
Identity rows. A result beyond the row/512-KiB boundary uses the current Core
read rather than silently truncating data.

`SITE_ADMIN` reads always remain in Core because their existing response
includes decrypted national ID. Any exact ten-digit national-ID search also
remains in Core because matching requires the protected HMAC column. This
deliberately avoids giving the read-only Loyalty process the PII encryption key
or access to encrypted/hash national-ID columns.

Network errors, timeouts, disabled/absent projection, 5xx, over-limit results
and oversized bodies use Core fallback. Redirects, unexpected 4xx and malformed
successful responses fail closed with a sanitized 503. No public behavior is
silently weakened.

The restricted reader additionally requires exact SELECT on these existing
columns:

- `loyalty.club_members`: `fullName`, `email`, `birthDate`, `joinDate`,
  `points`, `cardNo`, `issuedByLabelFa`, `createdAt` (base member columns are
  already documented);
- `loyalty.club_card_requests.status`.

No migration or automatic production grant is included. Rollback first
disables the Backend read flag, then the service projection and optional
grants.

## Acceptance

- [x] Public GET preserves its role/permission guards, filters, ordering,
  fields and unfiltered KPI semantics.
- [x] Internal projection is service-authenticated, read-only, bounded and
  never selects national-ID or Identity data.
- [x] `SITE_ADMIN` and exact national-ID searches always stay in Core.
- [x] Disabled, success, empty, unavailable, malformed, over-limit and
  oversized paths are covered.
- [x] All Club writers remain Core-only and perform no members-list HTTP call.
- [x] Conditional readiness and least-privilege verification cover only the
  exact additional columns.
- [x] Both builds and typechecks, full Loyalty lint, changed-file Backend lint,
  656 Backend unit, 25 Club E2E, 9 Loyalty unit and 38 Loyalty real-DB E2E tests
  pass. The repository-wide Backend lint still reports 447 pre-existing
  Prettier/CRLF errors outside this slice; none is in an A6.14 file.
- [ ] Production grant review, parity, flag enablement and deployment remain
  separately approved gates.
