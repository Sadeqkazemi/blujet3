# Microservices phase 6 — Loyalty read boundary (A6.1)

Status: A6.1 read boundary implemented and locally verified; no public read,
writer, production integration or deployment has been switched.

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
2. Run the explicitly enabled **offline** shadow command and compare normalized
   projections with the compatibility facade; record only status/request ID
   without changing user-visible responses. The command performs local-before,
   remote and local-after reads at one fixed expiry instant; it marks concurrent
   local changes inconclusive and is not itself proof of global consistency.
3. A later slice may implement the public read flag, only after the comparison
   window and owner approval. A6.1 does not contain that switch.
4. In A6.1, disable the offline shadow flag to stop all comparison work. Public
   reads remain local throughout; no database revert or data rewrite is needed.

Writer extraction, points earning/redeeming, price-lock creation/cancellation,
wallet debits, event publication and agency extraction are separate slices.
They require command contracts, transactional outbox evidence and an explicit
owner review before implementation.

The implementation is in `loyalty-service/`; CI applies the unchanged backend
schema to a disposable database, seeds it, then runs lint, typecheck, build,
unit and real-PostgreSQL E2E checks. Deployment must use a separately
provisioned column-scoped SELECT-only role described in that package's README.
The backend command is `npm run loyalty:compare:shadow -- <user-uuid>`, guarded
by `LOYALTY_SHADOW_ENABLED=false` by default. No public HTTP fallback or
automatic request-path call exists in this slice, so disabled means zero
Loyalty network or database work.

## Local verification — 2026-09-04

- Loyalty lint, typecheck and build passed; 2 configuration tests and 9 HTTP /
  PostgreSQL E2E tests passed against the migrated local test database.
- Backend scoped lint, typecheck and build passed; 13 offline-shadow tests and
  2 real-PostgreSQL projection regression tests passed. The regression first
  reproduced an unquoted camelCase bigint cast, then passed after explicit
  identifier quoting. No production schema changes were needed.
- A built-service/built-backend smoke check returned MATCH for synthetic
  membership, ledger and active-lock data (including IRR above JS safe integer),
  MATCH for an absent member, and DISABLED with an invalid DB URL. Its local
  service process was stopped and its synthetic fixtures were cleaned up.
- CI and optional Compose YAML parse successfully; package/lock consistency
  and git whitespace checks passed. GitHub CI has not run for these unpushed
  changes. Docker image execution was not tested because Docker is unavailable
  in this environment; production reader grants and representative parity
  sampling remain separate release gates.
