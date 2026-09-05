# A6.10 — Compatible Loyalty points reads

This slice moves only `GET /api/v1/my/club-points` to an optional Loyalty
read boundary. The flag is disabled by default; Core remains the fallback and
the sole writer for membership, points, wallet, price-lock and card-request
operations.

The backend calls `GET /internal/v1/loyalty/members/:userId` with the internal
service token and owner header. The browser cannot supply the owner. Responses
are bounded, exact and owner-checked; 404 means no membership, while network
and 5xx failures use the existing Core read. Malformed or unauthorized data is
rejected with a sanitized 503. No migration, grant or public route shape change
is included.

## Rollback

Set `LOYALTY_POINTS_READ_ENABLED=false` in the backend environment. No database
rollback or data rewrite is needed. Do not enable this flag before a separately
provisioned restricted Loyalty reader and representative shadow parity evidence
are reviewed.

## Acceptance

- [x] Exact internal contract, owner binding and request correlation.
- [x] Default-off flag with strict URL/token/UTC validation.
- [x] Bounded response parsing and safe Core fallback.
- [x] Unit coverage for disabled, success, absent, unavailable, malformed and
  foreign-owner paths.
- [x] No write path, migration, schema grant or deployment change.
- [ ] UAT credential review, representative parity and owner-approved flag
  transition.
