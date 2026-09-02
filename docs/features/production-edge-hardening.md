# Production edge hardening

Scope: production reverse-proxy routing, backend health semantics, and
document-level locale metadata. Payment gateway and OTP provider work are
explicitly out of scope for this phase.

## Acceptance checklist

- [x] Every top-level NestJS controller prefix is routed to the backend by the
  production Nginx configuration. Proof: `edge-routing.test.ts` — "routes every
  top-level backend controller prefix through production nginx".
- [x] Browser navigations for paths shared by the SPA and API return the SPA,
  while JSON/API requests still reach NestJS in both Vite and Nginx. Proof:
  `edge-routing.test.ts` — "keeps shared SPA/API paths HTML-aware in dev and
  production".
- [x] `GET /health` returns a successful payload when PostgreSQL is reachable
  and an HTTP 503 exception when it is not. Proof:
  `health.controller.spec.ts`.
- [x] Changing the public locale updates the root document `lang` and `dir`
  attributes (`en/ltr`, `fa|ar/rtl`). Proof: `useLocale.test.tsx` — "keeps the
  root document language and direction in sync".

## Non-goals

- Real SMS/OTP provider integration.
- Real payment gateway integration.
- Visual redesign or route renaming.
