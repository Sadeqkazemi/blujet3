# Microservices phase 6 — Ops/Admin cartable unread read cutover

## Scope

- Preserve public `GET /api/v1/cartable/unread-count`, its staff authorization,
  response envelope and `{ count }` payload.
- Add an owner-bound internal Ops/Admin projection read for the same count.
- Keep the Core read as the default and availability fallback. The feature flag
  is false unless explicitly enabled after projection reconciliation.
- Keep Core as the sole cartable writer. List, detail, read marking, resolution,
  transfer, reply and conversation expiry are outside this read-only slice.

## Contracts

The Ops/Admin process exposes:

`GET /internal/v1/ops-admin/cartable/unread-count`

It requires the existing `X-Internal-Token`, accepts only a UUID v4 in the
`X-Ops-Admin-Assignee-Id` header and returns exactly. The Ops/Admin HTTP logger
redacts both headers so the owner identifier and token are absent from access
logs:

```json
{
  "success": true,
  "data": {
    "assigneeId": "00000000-0000-4000-8000-000000000001",
    "count": 3,
    "observedAt": "2026-09-15T10:30:00.000Z"
  }
}
```

The query selects only a count from `ops.cartable_tasks`, scoped by trusted
`assigneeId` and `readAt IS NULL`. It returns no task identifier, content,
source reference or PII.

The Core backend uses these default-off settings:

| Variable | Rule |
| --- | --- |
| `OPS_ADMIN_CARTABLE_UNREAD_READ_ENABLED` | `false` by default; only `true` enables HTTP |
| `OPS_ADMIN_SERVICE_URL` | HTTP(S) origin without credentials, path, query or fragment |
| `OPS_ADMIN_INTERNAL_TOKEN` | at least 32 characters |

Enabled mode requires a UTC Node runtime. The client sends the authenticated
staff UUID in the redacted internal header, propagates a normalized request ID,
follows no redirects and uses one two-second header/body deadline. The complete
response is limited to 16 KiB and validated as an exact object with the requested owner,
non-negative safe integer count and UTC timestamp.

Network errors, timeouts, HTTP 5xx and oversized bodies use the existing Core
read. Redirects, unexpected 4xx responses, malformed JSON and malformed or
foreign projections fail closed with a sanitized 503. Logs contain only the
request ID and a fixed reason; no owner, URL, token or response body.

Rollback is setting `OPS_ADMIN_CARTABLE_UNREAD_READ_ENABLED=false`; disabled
mode performs no HTTP request and needs no schema rollback.

## Acceptance

- [x] Public URL, authorization and `{ count }` response stay compatible
      (`backend/test/cartable.e2e-spec.ts`).
- [x] Disabled mode performs no HTTP call and reads Core
      (`backend/src/modules/cartable/ops-admin-cartable-unread.client.spec.ts`,
      `backend/test/cartable.e2e-spec.ts`).
- [x] Enabled mode reads only the authenticated staff owner's projection
      (`backend/src/modules/ops-admin/ops-admin-read.service.spec.ts`,
      `backend/test/cartable.e2e-spec.ts`).
- [x] Internal auth and UUID validation reject unauthorized or malformed calls
      (`backend/src/modules/ops-admin/ops-admin.http.spec.ts`).
- [x] Network/timeout/5xx/oversized responses fall back to Core
      (`backend/src/modules/cartable/ops-admin-cartable-unread.client.spec.ts`).
- [x] Redirect, unexpected 4xx, malformed and cross-owner responses fail closed
      (`backend/src/modules/cartable/ops-admin-cartable-unread.client.spec.ts`).
- [x] The public response and all boundary logs expose no credential, URL, owner
      or task metadata (`backend/src/modules/cartable/ops-admin-cartable-unread.client.spec.ts`,
      `backend/src/production-artifacts.spec.ts`).
- [x] All cartable writes and all other reads remain Core-only
      (`backend/test/cartable.e2e-spec.ts`, `backend/src/production-artifacts.spec.ts`).
- [x] Focused unit/HTTP/E2E tests, lint, typecheck, build and OpenAPI checks pass.
- [x] Present the completed diff for approval before push/merge. Do not deploy or
      activate either the reader or projection consumer.
