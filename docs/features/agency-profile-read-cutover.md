# A6.9 — Compatible portal profile reads

The owner authorized continuing the Agency extraction with the next read-only
slice. Implementation is prepared and tested with flags defaulting off. Server
activation, production grants, publication and deployment remain separate gates.

Public GET `/api/v1/agency-portal/profile` keeps the existing URL, auth guard,
response fields and error envelope. The temporary UAT agency is resolved locally
before any service call and retains its current read-only projection. For a normal
authenticated AGENCY, `fullName` is derived from the authenticated backend actor;
it is never accepted from the browser or Agency service.

With backend `AGENCY_PROFILE_READ_ENABLED=false`, the existing Core TypeORM read
is unchanged and no HTTP request occurs. Enabling requires a UTC Node runtime,
`AGENCY_SERVICE_URL` and a service token of at least 32 characters. The backend
calls GET `/internal/v1/agencies/:agencyId/portal-profile` with a normalized
request ID and trusted `X-Agency-Id` derived from the session. Browser tenant
headers, user JWTs and credentials are never forwarded.

The Agency route separately requires `AGENCY_PORTAL_PROFILE_ENABLED=true`. It
reads one owner-scoped row in a READ ONLY / REPEATABLE READ transaction and
returns exactly: agencyId, managerName, licenseNo, phone, email, city, address,
tier, suspendedAt, suspendReason and joinedAt. It never joins `identity.users`.
The backend derives `isActive` from suspendedAt and returns
`isTemporaryReadOnly=false`, preserving the current public shape.

The complete encoded response is limited to 64 KiB. Backend uses one shared
two-second header/body deadline, no redirects, retries or cache, and validates
the exact object, owner UUID, Agency tier, strings and UTC timestamps. A valid
404 preserves the existing public `NOT_FOUND` response without Core fallback.
Network/timeout, 5xx and over-limit responses fall back to the current authorized
Core read. Other 4xx, redirects and malformed/cross-tenant bodies fail closed as
sanitized 503. Logs contain only request ID and a fixed reason, never contacts,
license, address, tenant ID, URL or token.

Opt-in reader credentials additionally need column SELECT on managerName,
licenseNo, phone, email, address and suspendReason of
`agency.agency_profiles`. Readiness and `verify:reader` require this exact
expanded projection only when the service profile flag is true. Existing minimal
and invoice flags remain independent. No migration or automatic grant is added.

Rollback order: disable the backend profile flag first, then disable the Agency
profile route, then revoke the six optional profile columns. No data/schema
rollback is required. All profile writes and every financial, reservation,
credit, payment, invoice and ticket operation remain in Core.

Backend change checklist:

- [x] Inspect the public profile flow, Agency entity/minimized route, sibling
  client, reader verifier, readiness and relevant E2E fixtures.
- [x] Document API, data ownership, limits, failure policy and rollback first.
- [x] Add the failing public/internal contract tests; the pre-implementation
  contract returned 404 and the implemented route now returns 200.
- [x] Implement the service route/config/verifier/readiness and backend client.
- [x] Prove success, auth, tenant isolation, missing owner, malformed/foreign
  response, bounded failure, availability fallback, UAT preservation and rollback.
- [x] Run focused and neighboring tests, lint, typecheck, builds, deterministic
  internal OpenAPI and unchanged public OpenAPI checks.
- [ ] Present the diff for separate publication and merge approval; do not deploy.

## Local evidence — 2026-09-04

- 24 focused backend profile-client cases pass.
- 68 Agency service E2E cases pass, including real restricted PostgreSQL grants,
  profile route HTTP contract, verifier CLI modes, readiness, tenant isolation,
  missing/oversized profiles and rollback.
- 35 backend Agency Portal E2E cases pass under `TZ=UTC`, including the existing
  profile regression, authenticated session ownership, Core fallback and disabled
  no-HTTP behavior.
- Backend and Agency typechecks/builds pass; Agency unit config tests pass and
  Agency lint is clean. The scoped backend profile lint is clean; the repository's
  existing CRLF files are checked with `core.whitespace=cr-at-eol`.
- Internal OpenAPI export passes after build and its path contract now has seven
  read/health operations; the public `docs/openapi.json` remains unchanged.
- No schema migration, production grant, financial writer, server configuration,
  feature-flag activation or deployment was performed.
