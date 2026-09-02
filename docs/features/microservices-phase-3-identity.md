# Microservices phase 3 — Identity verification foundation

Status: implementation slice complete on
`codex/microservices-phase-3-identity`; login and session ownership remain on
the Backend until the explicit cutover slice.

Architecture authority: `docs/architecture/blujet-architecture-v1.1.md`.

## Boundary

`identity-service` is the future owner of customer OTP login, staff password +
2FA login, agency login, refresh rotation, step-up and sessions. This first
slice establishes the cryptographic boundary without changing the public auth
contract: the existing Backend continues to issue and validate HS256 access
tokens while the new service publishes the RS256 public key contract.

The private signing key is loaded only from `IDENTITY_JWT_PRIVATE_KEY` and is
never returned by an endpoint, logged, or committed. Consumers receive only a
JWKS document containing `n`, `e`, `kid`, `alg=RS256`, and `use=sig`.

## Internal contract

The service has no published host port. Every non-health route requires
`X-Internal-Token`.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/internal/v1/identity/jwks.json` | Public signing keys for Gateway and future services. |
| `GET` | `/health/live` | Liveness for Compose/uptime checks. |
| `GET` | `/health` | Service/version/commit and active key metadata. |

The JWKS route is intentionally authenticated at the service boundary. The
Gateway will cache the document by `kid` in the next slice and verify tokens
locally; request-path calls to Identity are not part of authorization.

## Rollout and rollback

- `identity-service` runs under the `identity` Compose profile until an RSA
  private key is provisioned in the deployment secret store.
- Existing HS256 login, OTP, refresh, logout, sandbox and session behavior is
  unchanged in this slice.
- No existing user, refresh-token, 2FA or security-policy rows are moved or
  dual-written yet.
- The later cutover will add an explicit `IDENTITY_INTEGRATION_ENABLED` switch;
  rollback will restore Backend-issued HS256 tokens without changing public
  `/api/v1/auth/**` paths.

## Acceptance checklist

- [x] Identity service builds independently with a production Dockerfile.
- [x] RSA PKCS#8 key is validated and converted to a minimal public JWKS.
- [x] Internal routes reject missing or incorrect service identity.
- [x] Health responses expose service/version/commit and key metadata only.
- [x] No login/session behavior changes before the cutover slice.
- [x] Unit and real HTTP contract tests prove key secrecy and request IDs.
- [x] CI validates lint, typecheck, build, unit and E2E contracts.
- [ ] Move authentication persistence and token issuance to Identity.
- [ ] Enable Gateway RS256 verification and dual-key rotation in UAT.
- [ ] Present the complete phase diff for explicit owner approval before merge;
  deploy remains a separate manual action.
