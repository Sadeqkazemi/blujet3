# Microservices phase 6 — Loyalty read boundary (A6.1)

Status: contract-first slice; implementation has not switched any public
writer or production integration.

This is the first incremental slice of architecture phase 5 in
`docs/architecture/blujet-architecture-v1.1.md`. Loyalty is prepared as an
independently deployable boundary while the existing backend remains the
compatibility gateway and the only writer for the current rollout window.

## Hard safety rules

- `ClubMember`, `ClubPointsEntry`, `ClubTierRule`, `PriceLock` and related
  loyalty tables remain in the existing PostgreSQL `loyalty` schema.
- No dual-write, no cross-schema ORM joins, and no change to Core's local
  booking/payment transaction are allowed in this slice.
- The public `/api/v1/club/**`, customer-account and price-lock routes keep
  their current envelopes and behavior. The integration flag is disabled by
  default and is a rollback switch, not a migration prerequisite.
- The future service returns projection-safe data only; national-ID material,
  encryption fields, wallet balances and payment/ledger data never cross the
  boundary.

## Internal contract

All requests require the service identity header and a propagated request ID.
The endpoints are not published through nginx and are never called directly
by a browser.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/internal/v1/loyalty/members/:userId` | Return the user's active club projection or `404` without leaking PII. |
| `GET` | `/internal/v1/loyalty/price-locks/:userId` | Return active, unexpired price-lock projections owned by the user. |
| `GET` | `/health` / `/ready` | Service, commit and database-readiness metadata without secrets. |

The projection contract uses decimal strings for IRR values and ISO UTC
timestamps. It contains stable UUIDs, tier/card state, points and lock
metadata only; it never authorizes a sale. Core continues to claim and apply a
price lock inside its own transaction until a later approved command contract
exists.

## Rollout and rollback

1. Build and test the service against the existing `loyalty` schema in a
   disposable database.
2. Run shadow reads and compare normalized projections with the compatibility
   facade; record mismatches without changing user-visible responses.
3. Enable the read flag only after the comparison window and owner approval.
4. Roll back by disabling the flag. The gateway immediately resumes its local
   read path; no database revert or data rewrite is required.

Writer extraction, points earning/redeeming, price-lock creation/cancellation,
wallet debits, event publication and agency extraction are separate slices.
They require command contracts, transactional outbox evidence and an explicit
owner review before implementation.

