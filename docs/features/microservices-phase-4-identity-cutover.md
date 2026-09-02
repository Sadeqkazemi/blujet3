# Microservices phase 4 — Identity token/session cutover

Status: implementation complete on `codex/microservices-phase-4-identity-cutover`;
production activation and deployment remain separate owner-approved actions.

## Contract

`identity-service` now owns access-token issuance, refresh-token rotation and
session records for the cutover path. Backend keeps the existing
`/api/v1/auth/**` facade and delegates token/session operations over authenticated
internal HTTP. Login credential, OTP and 2FA verification still execute in the
Backend during this strangler slice; no identity tables are dual-written.

Identity issues RS256 JWTs with issuer/audience and `kid`; the Backend verifies
them locally from an in-memory JWKS cache. Authorization never calls Identity on
the request path. The cache accepts a current key and retained previous public
keys during a rotation window.

## Flags and rollback

- `IDENTITY_INTEGRATION_ENABLED=true` selects Identity issuance, refresh,
  logout, session list/revoke and RS256-only verification.
- `IDENTITY_INTEGRATION_ENABLED=false` retains legacy HS256 issuance and DB
  sessions.
- `IDENTITY_JWT_VERIFICATION_MODE=dual` is the rollback bridge: Backend issues
  HS256 again while accepting both HS256 and still-live RS256 access tokens.
- `IDENTITY_JWT_VERIFICATION_MODE=legacy` is the steady legacy state.

Production must switch flags deliberately (`legacy → dual → identity` for
cutover; `identity → dual → legacy` for rollback) and keep the previous public
key for at least one access-token TTL. Identity Redis is the session source of
truth when configured; `memory://` is test-only.

## Internal endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/internal/v1/identity/tokens` | Issue an RS256 access token and refresh-backed session. |
| POST | `/internal/v1/identity/sessions/refresh` | Rotate refresh token and revoke the presented token. |
| POST | `/internal/v1/identity/sessions/logout` | Revoke a refresh-backed session. |
| POST | `/internal/v1/identity/sessions/list` | List active sessions for the authenticated facade user. |
| POST | `/internal/v1/identity/sessions/revoke` | Revoke a non-current session owned by that user. |

Every endpoint requires `X-Internal-Token`; tokens and secrets are redacted from
logs. No endpoint or migration exposes private key material.

## Acceptance

- [x] Access/refresh issuance and session ownership delegate to Identity when enabled.
- [x] Existing auth facade paths and cookie contract remain unchanged.
- [x] Local RS256 verification uses cached JWKS and validates issuer, audience, expiry and role.
- [x] `dual` verification mode provides explicit rollback without database dual-write.
- [x] Current + previous public JWKs support zero-downtime key rotation.
- [x] Unit and HTTP tests cover rotation, refresh replay, session list/revoke and rollback mode.
- [ ] Owner approves UAT flag transition and a deployment window.
