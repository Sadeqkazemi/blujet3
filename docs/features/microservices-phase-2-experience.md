# Microservices phase 2 — Experience extraction

Status: implementation complete and approved by the owner for merge from
`codex/microservices-phase-2-experience`.

Architecture authority: `docs/architecture/blujet-architecture-v1.1.md`.

## Boundary

`experience-service` becomes the runtime owner of public content and customer
interaction data currently implemented by these backend modules:

- `blog`
- `site-content`
- `careers`
- `contact`
- `support-tickets`
- `survey`
- experience-owned file/media records

The service does not own or write flight inventory, bookings, payments,
identity, agency, cartable, or audit tables. Cross-boundary references are
stable UUIDs. Data needed from Core or Identity is obtained through typed
internal APIs or immutable snapshots, never a runtime join from Experience.

`StoredFile` is shared by Experience, identity verification, agency messages,
and operational cartable records. When the integration switch is enabled,
Experience is the single writer for the generic file/blob store; the backend
remains the compatibility read/authorization compositor for legacy attachment
flows that still span other domains. Stable file UUIDs and the shared upload
volume preserve those reads without introducing a second writer.

## Strangler slices

1. Extract independent content (`blog`, content blocks/highlights, `contact`)
   and establish the service health/security/CI boundary.
2. Extract careers, public media, and support tickets with actor identity
   supplied by verified claims and stable UUID references.
3. Extract surveys. Core supplies booking/flight snapshots through a private
   authenticated contract; notification delivery remains async through the
   existing Notify outbox.
4. Switch backend compatibility facades on. The public `/api/v1/**` paths and
   response envelopes remain unchanged; disabling the integration restores the
   in-process implementation.

## Availability and rollback

- Search, booking, inventory, payment, ticketing, and refund paths never call
  Experience in their synchronous request path.
- If Experience is unavailable, content/contact/support/survey endpoints may
  return stable `503 EXPERIENCE_UNAVAILABLE`; purchase remains operational.
- `EXPERIENCE_INTEGRATION_ENABLED=false` is the rollback switch.
- The service is internal-only in Compose. Browser traffic continues through
  the existing gateway/backend compatibility surface.
- Phase 2 uses the existing PostgreSQL instance and tables. Physical movement
  to schema `experience` is deferred to the phase 4 expand/contract migration.

## Security

- Every internal request requires `X-Internal-Token` and a propagated
  `X-Request-Id`.
- Actor context is explicit and validated; service methods repeat ownership
  and role checks and do not trust a client-supplied tenant/user id.
- Public submissions retain existing throttles and validation at the gateway;
  the Experience DTOs validate the payload again.
- Contact, application, support, and survey PII is never logged. File paths are
  not exposed in JSON responses.
- Health responses expose only service/version/commit and dependency state.

## Acceptance checklist

- [x] Existing public Blog/Site Content/Careers/Contact/Support/Survey/File
  paths and envelopes remain compatible.
- [x] Internal endpoints reject missing/wrong service identity and malformed
  DTOs.
- [x] Public reads expose only published/active content and allowed media.
- [x] Admin/customer operations enforce roles and per-resource ownership.
- [x] Experience writes are single-owner when the integration switch is on.
- [x] No Experience runtime query joins Core, Identity, Agency, Ops, or Notify
  tables; cross-boundary data uses internal contracts/snapshots.
- [x] Experience failure does not affect search, booking, payment, ticketing,
  or refund writes.
- [x] Survey notification delivery uses the Notify outbox and remains
  idempotent/retryable.
- [x] File streaming is bounded, authorized, and does not reveal disk paths.
- [x] Health/readiness expose service/version/commit and schema-aware database
  state without secrets.
- [x] Backend/Experience unit, real-Postgres E2E, typecheck, build, migration,
  YAML and diff checks pass locally and in CI.
- [x] Present the phase diff for explicit owner approval before merge; deploy
  remains a separate manual action.
