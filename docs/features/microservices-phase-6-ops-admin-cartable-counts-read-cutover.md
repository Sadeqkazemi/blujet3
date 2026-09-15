# Microservices phase 6 — Ops/Admin cartable counts read cutover

## Scope

- Preserve public `GET /api/v1/cartable`, its staff authorization and response
  shape.
- Keep task rows, filters, detail and every cartable write in Core.
- Allow only the owner-scoped `counts`, `statusCounts` and `totalOpen` fields to
  come from the Ops/Admin projection behind a default-off feature flag.
- Keep the existing Core aggregate queries as an availability fallback and the
  immediate rollback path.

## Contract

The Ops/Admin process exposes:

`GET /internal/v1/ops-admin/cartable/counts`

It requires `X-Internal-Token` and a UUID v4
`X-Ops-Admin-Assignee-Id`. It returns exactly:

```json
{
  "success": true,
  "data": {
    "assigneeId": "00000000-0000-4000-8000-000000000001",
    "counts": { "ADMIN": 2, "AGENCY": 1, "MANAGER": 0 },
    "statusCounts": {
      "OPEN": 3,
      "APPROVED": 4,
      "REJECTED": 1,
      "TRANSFERRED": 0
    },
    "totalOpen": 3,
    "observedAt": "2026-09-15T10:30:00.000Z"
  }
}
```

The query is restricted to aggregate counts over `ops.cartable_tasks` for the
trusted assignee. It returns no task identifier, source reference, content or
PII. `totalOpen` and `statusCounts.OPEN` must both equal the sum of the three
OPEN category counters.

Core uses these settings:

| Variable | Rule |
| --- | --- |
| `OPS_ADMIN_CARTABLE_COUNTS_READ_ENABLED` | `false` by default; only `true` enables HTTP |
| `OPS_ADMIN_SERVICE_URL` | HTTP(S) origin without credentials, path, query or fragment |
| `OPS_ADMIN_INTERNAL_TOKEN` | 32–256 characters without whitespace |

Enabled mode requires a UTC runtime. The client propagates a normalized request
ID, follows no redirects, applies a two-second deadline and limits the response
to 16 KiB. It accepts only the exact envelope, requested owner, fixed counter
keys, non-negative safe integers, internally consistent totals and a strict UTC
timestamp.

Network errors, timeouts, HTTP 5xx and oversized bodies use the existing Core
aggregate reads. Redirects, unexpected 4xx responses, malformed JSON and
malformed or cross-owner data fail closed with a sanitized 503. Logs contain no
owner, URL, token or response body.

Rollback is setting `OPS_ADMIN_CARTABLE_COUNTS_READ_ENABLED=false`. Disabled
mode performs no HTTP request and needs no schema rollback. This change neither
activates the projection consumer nor deploys any service.

## Acceptance

- [x] Public route and response shape remain compatible; task rows still come
      from Core.
- [x] Disabled mode performs no HTTP request and uses Core aggregates.
- [x] Enabled mode returns only the authenticated owner's projection counters.
- [x] Internal auth and UUID validation reject unauthorized or malformed calls.
- [x] Availability failures fall back; invalid boundary data fails closed.
- [x] Cartable writes and non-counter reads remain Core-only.
- [x] Focused tests, lint, typecheck, build and OpenAPI/diff hygiene pass.
- [x] Present the completed diff before push/merge; do not deploy or enable the
      flag.
