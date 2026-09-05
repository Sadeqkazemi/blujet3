# A6.19 — Compatible agency credit-request history reads

Preserve GET `/api/v1/agency-portal/credit-requests`, AGENCY session ownership,
existing field names, descending createdAt order and temporary-UAT empty list.
An independent default-off `AGENCY_CREDIT_REQUESTS_READ_ENABLED` in Core uses
GET `/internal/v1/agencies/:agencyId/portal-credit-requests`, gated separately
by `AGENCY_PORTAL_CREDIT_REQUESTS_ENABLED=false` in Agency.

The internal route requires service identity and a trusted matching tenant
header. It reads only the owner's existing agency profile and credit requests,
in one READ ONLY / REPEATABLE READ transaction. No Identity joins or writes.
Fields: id, agencyId, requestedLimitIrr (decimal string), note, status,
decidedById, decidedAt and createdAt (UTC). No new business rules or migration.
The optional reader needs exact SELECT on these eight request columns; base
grants stay unchanged. Readiness and the reader verifier enforce opt-in grants.

The complete list is bounded to 1000 rows/1 MiB; overflow returns 503, never a
partial list. Core uses a 2-second deadline, strict owner/shape/order validation,
no redirects/retries/cache. Network, 5xx and byte overflow use complete Core
fallback. Other 4xx, redirects and malformed/foreign successes fail closed with
a sanitized 503. Config requires a valid service origin/token and UTC runtime.

POST requests, staff approval/rejection, credit limits and financial ledger
remain Core-only. Rollback disables Core flag before service flag and optional
grants. Publication/merge and server deployment require separate approval.

Backend checklist:
- [x] Read portal controller/service/entity/tests and sibling invoice client.
- [x] Document API/DB, tenancy, bounds and rollback before implementation.
- [x] Files: Core client/config/wiring; Agency route/DTO/readiness/grants;
  environment examples, docs and focused unit/HTTP/PostgreSQL regressions.
- [x] Implement the read boundary without changing any writer; POST/decisions
  retain their current Core implementation (`agency-portal.service.ts`).
- [x] Prove 400/401/403/404, ownership, exact IRR/UTC, empty and rollback paths
  (`agency-service/test/agency.e2e-spec.ts`, `backend/test/agency-portal.e2e-spec.ts`).
- [x] Prove restricted grants, denied writes, row/byte bounds and readiness
  (`agency-service/test/agency.e2e-spec.ts` — credit-request conditional grants).
- [x] Pass both typechecks/builds, complete Agency lint and focused Backend
  source lint. The existing mixed-line-ending portal test retains its prior
  formatting; its semantic ESLint checks pass without reformatting old code.
- [x] Generate deterministic internal OpenAPI; public OpenAPI remains unchanged.
- [x] Owner approved publication and merge on 2026-09-05.
- [ ] CI/security checks before merge; no server deployment or flag activation.

Local evidence (2026-09-05): all 704 Backend unit cases pass (including 28 new
credit-client cases); 37 Backend portal E2E, 70 Agency real-PostgreSQL E2E and
2 Agency config cases pass. The initial route regression failed with 404 before
implementation and now passes. Tests cover real 2-second header/body deadlines,
oversized transport, invalid origin/timezone/token, invalid/foreign responses,
UAT's no-network empty path and missing-profile rejection before remote calls.
The new fixture rows/grants are removed; no temporary Agency reader remains.
No migration, server configuration or production flag is changed. This evidence
does not replace PostgreSQL 16 CI or representative operational parity/grant review.
