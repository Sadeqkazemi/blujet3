# API Gateway hardening

## Scope

This phase hardens the existing NestJS/Nginx HTTP edge. It does not move or
duplicate domain behavior. Booking, pricing, seat inventory/locks, executive
approval, and financial decisions remain in their existing domain modules.

## Acceptance checklist

- [x] `GET /api/v1/health` and an ordinary controller under `/api/v1/*`
  reach the same handlers and return the same payload/status as their legacy
  unprefixed paths; legacy paths remain available during migration. Proven by
  `gateway.integration.spec.ts` (version aliases and health aliases).
- [x] Every response includes one valid `X-Request-Id`. A safe incoming ID is
  propagated; a missing, malformed, or oversized ID is replaced. The same ID
  is available to structured request/error logging. Proven by
  `gateway.integration.spec.ts` (safe/unsafe correlation IDs).
- [x] Production trusts exactly the configured reverse-proxy hop count. The
  application derives `req.ip`/`X-Real-IP` from that trusted chain, while
  Nginx forwards host, protocol, and client-address headers. Proven by
  `gateway.integration.spec.ts` and `edge-routing.test.ts`.
- [x] A global per-IP request limit protects public APIs. Login/credential
  verification is limited to 5 requests/minute and OTP issuance to 3
  requests/minute, using the normalized login/phone identity in the tracker
  as well as the resolved client IP. Proven by `gateway.integration.spec.ts`.
- [x] `/health` and `/api/v1/health` are public and exempt from throttling.
  Proven by `gateway.integration.spec.ts` and `health.controller.spec.ts`.
- [x] Requests have a configurable server-side processing timeout. Timeout
  failures use HTTP 504 and the common error envelope. Proven by
  `gateway.integration.spec.ts`.
- [x] Request bodies have a configurable maximum size in NestJS and Nginx.
  Oversized JSON/form bodies use HTTP 413 and the common error envelope when
  rejected by either edge layer. Proven by `gateway.integration.spec.ts` and
  `edge-routing.test.ts`.
- [x] Helmet security headers are present on API responses; production HSTS
  is enabled only when the configured deployment is HTTPS. Proven by
  `gateway.integration.spec.ts`.
- [x] Request logs are JSON/Pino records containing request ID, resolved real
  IP, method, URL, status, duration, and no authorization/cookie/credential/
  OTP/PII values. Proven by `gateway.integration.spec.ts` (allow-list
  serializer) and `edge-routing.test.ts` (Nginx JSON access log).
- [x] Validation, throttling, timeout, oversized-body, 404, and unexpected
  failures use stable error codes and never expose stack traces. Proven by
  `gateway.integration.spec.ts` and the full backend unit suite.
- [x] Supertest integration coverage proves request ID, forwarded/real IP,
  headers, limits, timeout, body size, and error-envelope behavior.
- [x] Regression coverage proves both versioned and legacy routes, including
  auth-cookie path behavior, remain usable.
- [x] Backend build, targeted tests, changed-file read-only ESLint, frontend
  build/lint, and both full unit suites pass.

## Configuration

| Variable | Default | Purpose |
|---|---:|---|
| `API_RATE_LIMIT_MAX` | `300` | General requests per window per resolved IP |
| `API_RATE_LIMIT_WINDOW_MS` | `60000` | General throttling window |
| `API_REQUEST_TIMEOUT_MS` | `30000` | Maximum controller processing time |
| `API_MAX_BODY_BYTES` | `10485760` | Maximum parsed request body (10 MiB) |
| `TRUST_PROXY_HOPS` | `1` in production, `0` otherwise | Trusted reverse-proxy hop count |
| `HTTPS_ENABLED` | `false` | Enables HSTS when TLS terminates at the edge |

No database migration or schema change is required.
