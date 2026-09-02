# CLAUDE.md — blujet Project Rules (read and follow strictly)

## Project Overview
- Name: **blujet** (بلوجت) — Persian airline booking platform
- Description: An airline website: flight search, booking, seat selection,
  payment, e-ticketing, customer club (loyalty), user wallet, agency portal,
  and multi-role management panels for flights, schedules, fares and finance.
- The visual design is FINAL. Reference files live in `design-reference/`
  (the exported HTML pages listed in "Design Reference Pages" below).
  Match them exactly: colors, spacing, typography, components. Do NOT redesign.

## Locale & Direction (NON-NEGOTIABLE)
- The entire UI is **Persian (fa-IR), RTL**. `dir="rtl"` at the root;
  every layout mirrored. LTR only for isolated spans (flight codes,
  airport codes, Latin passenger names, emails).
- Font: **Vazirmatn** (weights 400–900); monospace numbers via Roboto Mono
  where the design shows them.
- Calendar: **Jalali (شمسی)** everywhere users see dates — search box,
  price calendar, edit-search calendar, panels' day/month/year filters.
  Store timestamps in UTC (ISO 8601 / Gregorian) in the DB; convert at the
  edge. Use a maintained Jalali lib (e.g. dayjs + jalaliday); never
  hand-roll conversion.
- Digits: displayed as Persian digits (۰–۹) exactly as in the design;
  stored and transmitted as Latin digits. One shared formatting utility
  (`faDigits`, `faMoney` with ٬ thousands separator) — no ad-hoc formatting.
- Primary brand color: `#1668c4` (accent), dark navy `#0d2640`; follow
  design-reference for the full palette.

## Design Reference Pages (exported from the approved design)
Public site:
- صفحه اصلی (home: search box with step-by-step flow, popular routes, offers)
- نتایج پرواز (results: search summary, Jalali price calendar, filters,
  AI price radar, price lock, seat selection + buy modal)
- تکمیل خرید (checkout: passenger form, services, payment methods, boarding-pass ticket)
- پرداخت (gateway page: pay methods, discount code, pay-with-points)
- مدیریت رزرو (PNR lookup, change/refund)
- مقاصد، باشگاه مشتریان، درباره ما، تماس با ما، پشتیبانی، قوانین و مقررات
- ورود و ثبتنام، فراموشی رمز، ورود مدیران و کارمندان، صفحه 404، صفحه تعمیر و نگهداری

Authenticated:
- پنل کاربر (trips, wallet, club points, passengers, refunds)
- پنل آژانس (agency portal: credit, bookings, settlement, inbox)

Management panels (one per role — shared shell, role-scoped tabs):
- پنل ادمین سایت، پنل مدیر عامل، پنل رئیس هیئت مدیره، پنل مدیر ارشد،
  پنل مدیر مالی، پنل مدیر بازرگانی، پنل مدیر IT، پنل کارمند
- Includes the internal reservation/lock system (ReservationSystem component).

## Tech Stack (FINAL — do not substitute)
- Frontend: React + TypeScript + Vite, TailwindCSS
- Mobile output: PWA via `vite-plugin-pwa` (installable app: manifest,
  service worker, offline shell, app icons). PWA setup is part of Phase 1,
  not an afterthought.
- Backend: NestJS (TypeScript, modular architecture)
- Database: PostgreSQL via Prisma
- Cache / rate limiting: Redis (search-result cache TTL 5–10 min; Redis is
  NEVER the source of truth for seats or bookings)
- ML service: FastAPI (Python 3.12) — price suggestion & flight
  recommendation microservice. INTERNAL ONLY: called exclusively by the
  NestJS backend, never exposed to the internet or the frontend
  (see "ML Service Rules")
- Auth: JWT access + refresh tokens, httpOnly cookies (@nestjs/passport)
  + SMS OTP (see "Auth & Roles")
- Validation: class-validator DTOs on EVERY endpoint (server) + zod on
  frontend forms
- API docs: @nestjs/swagger — mandatory on every endpoint (see below)

## Auth & Roles (RBAC)
- Two separate login surfaces, matching the design:
  1. ورود و ثبتنام — customers: phone number + SMS OTP (primary),
     email+password optional. فراموشی رمز via SMS/email code.
  2. ورود مدیران و کارمندان — staff: username+password + mandatory 2FA.
- Roles (enum, seeded): `USER`, `AGENCY`, `EMPLOYEE`, `IT_MANAGER`,
  `COMMERCIAL_MANAGER` (مدیر بازرگانی), `FINANCE_MANAGER` (مدیر مالی),
  `SENIOR_MANAGER` (مدیر ارشد), `CEO` (مدیر عامل), `BOARD_CHAIR`
  (رئیس هیئت مدیره), `SITE_ADMIN`.
- Panel tabs/permissions are role-scoped exactly as in the design (e.g.
  finance tab visible to FINANCE_MANAGER, CEO, SENIOR_MANAGER, BOARD_CHAIR,
  COMMERCIAL_MANAGER; «تراکنش‌های اخیر» و «تسویه آژانس‌ها» only in the
  finance manager panel). Authorization enforced server-side per endpoint,
  never by hiding UI alone.
- SMS provider behind an interface (`SmsProvider`) — OTP, ticket issuance
  message, refund notifications. Mock provider in dev/tests.

## Repository Structure
```
/
├── CLAUDE.md
├── PLAN.md              # roadmap & progress — update after every phase
├── docs/
│   ├── API.md           # single source of truth for all endpoints
│   └── DB_SCHEMA.md     # tables, relations, indexes
├── design-reference/    # exported design files — visual source of truth
├── frontend/
│   ├── public/          # PWA icons, manifest assets
│   └── src/
│       ├── api/         # typed API client, one file per resource
│       ├── components/  # shared UI components
│       ├── features/    # one folder per feature (pages + logic)
│       ├── hooks/
│       ├── lib/         # utils, constants, config (fa digits/money/Jalali here)
│       └── types/       # shared TS types (generated from OpenAPI)
├── backend/
│   ├── prisma/          # schema.prisma, migrations, seed
│   └── src/
│       ├── modules/     # one NestJS module per domain:
│       │                # auth/, users/, flights/, search/, booking/,
│       │                # payment/, ticketing/, refunds/, club/, wallet/,
│       │                # agencies/, promo/, reporting/, admin/, ai/
│       │                # each: controller, service, dto/, entities, *.spec.ts
│       ├── common/      # guards, interceptors, filters, decorators
│       └── config/      # env loading + validation (fail fast on missing vars)
├── ml-service/          # FastAPI (Python): price suggestion + flight recommendations
│   ├── app/
│   │   ├── api/         # internal routes (/internal/v1/...)
│   │   ├── schemas/     # pydantic request/response models
│   │   ├── services/    # pricing & recommendation logic, model loading
│   │   └── core/        # config, logging, internal auth
│   ├── tests/           # pytest
│   └── pyproject.toml
└── docker-compose.yml   # local dev: db + redis + backend + ml-service + frontend
```

## Workflow Rules
1. NEVER write feature code before `docs/API.md` and `docs/DB_SCHEMA.md`
   cover that feature and the user has approved them.
2. Build in phases. One feature = backend endpoint + tests + frontend page,
   fully working, before starting the next feature.
3. After each phase: run the app, run tests, fix everything, then update
   PLAN.md (mark done / what's next). Only then move on.
4. If a requirement is ambiguous, ASK — do not invent product decisions.
   The design-reference pages win over this file on any visual/UX question.
5. Never leave TODO stubs in "completed" work. A phase is done only when
   it runs end-to-end.
6. Human review gate: at the end of every phase, present a summary of the
   diff (files changed, endpoints added, migrations) to the user for
   approval BEFORE merging to `main`. Never merge to `main` without
   explicit user approval.

## Flight Engine & Booking Rules (domain core)
- Data model aligned with IATA NDC concepts (Offer, Order, PaxSegment,
  FareRule) to ease future GDS/NDC integration.
- Entities: `Route` → `Flight` → `Schedule` (recurring via RRULE) →
  `FlightInstance` → `Inventory` (fare classes, e.g. Y/B/M) → `FareRule`.
- Cabins: Economy + Business (design: rows 3–6 business 2-2, economy 2-3);
  seat map config lives per aircraft type in the DB, not hardcoded.
- Search: connection builder over flight instances; max 2 connections;
  respect minimum connection time per airport. Airport list per design:
  20 Iranian cities + DXB / IST / NJF.
- Pricing is separate from availability. ALWAYS re-price immediately
  before payment; if the price changed, show the new price and require
  explicit user confirmation before charging.
- Booking flow is an explicit state machine:
  `DRAFT → HELD → PAID → TICKETED → (CANCELLED | EXPIRED | REFUNDED)`
  - HELD has a 10-minute TTL (matches the design's hold timer);
    expiry releases inventory automatically.
  - All state transitions are transactional and idempotent.
- Seat inventory lives ONLY in PostgreSQL. Prevent double-booking with
  `SELECT ... FOR UPDATE` or optimistic locking (version column). Exactly
  one of two concurrent buyers of the last seat may succeed.
- PNR: short unique booking code shown on the ticket; مدیریت رزرو looks up
  by PNR + passenger id/phone, and drives change/refund flows.
- Refunds (استرداد): fare-rule–driven penalty calculation, user-visible
  breakdown before confirmation, processed as ledger reversals; admin
  approval queue in the panels as designed.
- All timestamps stored in UTC; airport timezones stored separately
  (IANA tz). Departure/arrival always rendered in the airport's local time
  (Jalali date + HH:mm).
- Soft delete (`deleted_at`) for bookings and passengers; hard deletes only
  through the GDPR deletion flow.

## Club, Wallet, Agencies & Promotions (from the design)
- **Customer club (باشگاه مشتریان)**: tiers (e.g. عادی/نقره‌ای/طلایی),
  points earned per purchase (cashback shown at checkout), points ledger
  (same double-entry rules as money). **Pay with points** is a payment
  method on the gateway page — only for club members; conversion rate is
  server-side config.
- **Price lock (قفل قیمت هوشمند)**: gold-tier members only, exactly as in
  the results page design: lock a fare for up to 72h for a fee; fee/risk
  suggested by the ML service but authorized and computed by NestJS.
- **User wallet (کیف پول)**: balance in the ledger, top-up via gateway,
  usable as a payment method. Never a mutable balance column.
- **Discount codes (کد تخفیف)**: entered on the پرداخت page (NOT checkout —
  per final design). Promo engine: code, type (percent/fixed), constraints
  (route, cabin, dates, usage caps, per-user cap), full audit of redemptions.
- **Agencies (پنل آژانس)**: agency accounts with credit line, agency
  pricing/commission, booking on behalf of customers, periodic settlement
  (تسویه‌حساب) visible in the finance manager panel, and an inbox/messages
  thread with the airline as designed.
- **Reporting (پنل‌ها)**: sales chart with day/month/year filter;
  completed-flights stats box (flight count, total seats, sold, unsold)
  synced to the same filter; income/expense chart; KPI boxes (کل درآمد,
  سود خالص, هزینه عملیاتی) that re-scope when a chart month is selected.
  All aggregates computed server-side (SQL), never in the browser.

## Code Standards
- TypeScript strict mode; no `any`.
- All API responses use one envelope:
  `{ success: boolean, data?: T, error?: { code: string, message: string } }`
- Error messages shown to users are Persian; error `code`s are stable
  English enums (`common/errors.ts`).
- Errors: centralized error handler; never leak stack traces to clients.
- Every endpoint: input validation → auth check → service logic → typed response.
- Frontend never calls fetch/axios directly in components — only through `src/api/`.
- Environment variables: validated at startup; `.env.example` always kept current;
  never commit real secrets.
- Seed data: `backend/prisma/seed.ts` must stay in sync with the schema and
  create realistic sample data for every domain (test users with known
  passwords **for every role**, sample airports/routes/flights with
  schedules and fares, club members in each tier, an agency with credit,
  promo code `BLUE20`, sample bookings in each state) so any feature can be
  manually exercised right after `prisma migrate dev`. Update the seed in
  the same phase that adds a new table. Seed data is for development only —
  never run against production.

## API Documentation Rules (OpenAPI — for humans AND AI tools)
- Every controller/endpoint MUST have @nestjs/swagger decorators:
  @ApiTags, @ApiOperation (clear one-line summary), @ApiResponse for
  success AND error cases, and fully typed DTOs with @ApiProperty
  (description + example on every field).
- Swagger UI served at `/docs`; raw spec exported to `docs/openapi.json`
  after every phase. This spec is the single source of truth — keep
  docs/API.md as a human-readable summary generated from it.
- Frontend types in `frontend/src/types/` are GENERATED from
  `openapi.json` (openapi-typescript). Never hand-write duplicate types.
- Error codes are enumerated in one place (`common/errors.ts`) and
  documented in the spec. No ad-hoc error strings.

## PWA Rules
- `vite-plugin-pwa` configured with: manifest (name "blujet", theme color
  `#1668c4`, icons 192/512 + maskable, `dir: "rtl"`, `lang: "fa"`),
  auto-update service worker.
- Cache strategy: app shell precached; API responses NEVER cached by the
  service worker (availability, prices and booking data must always be fresh).
- Must pass Lighthouse PWA installability checks before a phase that
  touches frontend is considered done.

## AI Integration Rules (platform features)
- Design AI features in scope: رادار هوشمند قیمت (buy-now-or-wait
  recommendation on results page), قفل قیمت hoshmand fee/risk suggestion,
  admin-side pricing suggestions. All follow these rules:
- All AI calls live in `backend/src/modules/ai/` behind a provider
  interface (e.g. `AiProvider`) so the vendor can be swapped without
  touching business logic.
- API keys ONLY in backend env vars. The frontend NEVER talks to the AI
  vendor directly — always through our own authenticated endpoints.
- Every AI endpoint has: auth guard, per-user rate limiting, input size
  limits, timeout + graceful fallback, and usage logging (user, tokens,
  cost) to the database.
- AI output shown to users is treated as untrusted content (sanitized,
  never executed, never used to authorize actions — an AI suggestion can
  never change a booking or price by itself).
- AI features must degrade gracefully: if the AI service is down, search,
  booking and payment keep working.

## ML Service Rules (FastAPI — price suggestion & recommendations)
- Scope: `POST /internal/v1/price-suggestion` and
  `POST /internal/v1/recommendations`. Nothing else lives here — no auth,
  no bookings, no payments.
- Network isolation: the service is reachable ONLY on the internal Docker
  network. The frontend NEVER calls it; every request goes through an
  authenticated NestJS endpoint.
- NestJS side: the client for this service lives behind an interface in
  `backend/src/modules/ai/` (same provider pattern as other AI calls) so
  it can be mocked in tests and swapped later.
- Internal auth: NestJS authenticates to the service with a shared token
  from env vars, sent on every request. Reject requests without it.
- ADVISORY ONLY (non-negotiable): outputs are suggestions. The
  authoritative price is ALWAYS computed by the NestJS pricing module and
  re-priced before payment. An ML suggestion can never set a bookable
  price, change inventory, or authorize anything.
- Graceful degradation: NestJS calls it with a hard timeout (e.g. 2s) and
  a fallback — if the service is down, search/booking/payment continue
  without suggestions. Circuit-break after repeated failures.
- Data minimization: send only what the model needs (route, dates, cabin,
  aggregate history). NEVER send passenger PII, passport numbers, or
  payment data to this service.
- Validation: every request/response validated with pydantic; typed
  schemas mirrored in the NestJS client.
- Observability: same standards as the backend — structured JSON logs,
  propagate the `X-Request-Id` from NestJS into every log line,
  `GET /health` endpoint, errors reported to Sentry when DSN is set.
- Testing: pytest for unit tests (pricing logic, edge cases: no history,
  extreme values) + schema tests; NestJS integration tests run against a
  mocked service; at least one E2E path with the real service in docker.
- Model artifacts are versioned; the response includes the model version
  so any suggestion can be traced to the model that produced it.

## Financial Rules (NON-NEGOTIABLE)
- Currency: **IRR (ریال)** stored as integer — no decimals. The UI shows
  تومان (rial ÷ 10) with Persian digits and ٬ separators via the shared
  money utility; conversion happens ONLY in that utility. Currency code
  stored with every amount (ISO 4217) for future multi-currency.
- Money is NEVER a float. All arithmetic through a single money utility
  module.
- Payment gateway: **Shetab/IPG** (e.g. Shaparak-connected PSP) behind a
  `PaymentGateway` interface — request/redirect/verify/reverse; sandbox
  driver for dev/tests. NEVER store PAN/CVV; card data never touches our
  servers or logs (redirect-based flow only).
- Every balance/payment change (gateway, wallet, club points, agency
  credit, refunds) goes through a double-entry ledger table (immutable
  rows), never direct balance UPDATE. Refunds and cancellations are new
  ledger entries (reversals), never edits to old rows.
- Any multi-step money operation (pay → confirm booking → ticket) runs
  inside a DB transaction with row-level locking to prevent race conditions.
- Idempotency keys on all payment/booking-creating endpoints.
- Log every financial action to an audit table: who, what, when, before/after.

## Security Rules
- Rate limiting on auth, OTP (strict: per-phone + per-IP), search, booking
  and money endpoints (per-IP and per-account).
- Passwords: argon2/bcrypt. Sessions revocable. 2FA REQUIRED for all
  staff/admin accounts. OTP codes: 6 digits, 2-minute TTL, single-use,
  hashed at rest.
- Passenger PII (national ID, passport numbers, DOB, contact info):
  encrypted at rest (AES-256), TLS 1.2+ in transit, masked in logs.
- National ID (کد ملی) validated with the official checksum server-side.
- GDPR-equivalent: implement passenger data export and deletion flows.
- All user input validated server-side regardless of client validation.
- CORS locked to known origins; helmet (or equivalent) enabled; CSRF
  protection on state-changing requests.
- Authorization checked per-resource (a user can only access their own
  bookings, passengers and tickets; an agency only its own customers;
  each manager role only its permitted panel data).
- Audit log (append-only) for every booking change, payment event and
  admin action.

## Observability & Debugging (production-grade from day one)
- Structured logging: use Pino (via `nestjs-pino`) — JSON logs with level,
  timestamp, and context. `console.log` is forbidden in committed code.
- Request correlation: every incoming request gets a request ID
  (middleware/interceptor); the ID is included in every log line for that
  request and returned in an `X-Request-Id` response header, so any user
  report can be traced end-to-end in the logs.
- Log levels: `error` for failures needing attention, `warn` for
  recoverable anomalies (rate limit hits, retries), `info` for business
  events (login, booking created, ticket issued), `debug` for development
  detail. Production runs at `info`.
- NEVER log secrets, tokens, OTP codes, passwords, national IDs, passport
  numbers, or full card/account numbers. Sensitive fields are redacted at
  the logger level (pino redact paths).
- Error tracking: Sentry (or equivalent) wired into BOTH backend (NestJS
  interceptor/filter) and frontend (React error boundary + global handler).
  DSN comes from env vars; disabled when the var is absent (local dev).
  Every unhandled exception in production must surface in Sentry with the
  request ID attached.
- Health checks: backend exposes `GET /health` via `@nestjs/terminus` —
  checks DB connectivity and returns build version/commit SHA. Used by
  Docker healthcheck and uptime monitoring. `/health` is public,
  unauthenticated, and rate-limit-exempt, and returns no sensitive data.
- Financial log trail: in addition to the audit table, every money
  operation logs its ledger transaction ID, so DB records and logs can be
  cross-referenced during an incident.
- Debugging workflow for reported bugs: reproduce with a failing automated
  test FIRST, then fix, then keep the test as a regression guard. Never
  "fix" a bug that has no test proving it existed.

## Testing (per-feature, mandatory — this defines "done")
For EVERY feature, before writing implementation code, create
`docs/features/<feature-name>.md` containing an acceptance checklist:
every behavior from the design (screens, states, validations, edge cases)
and every endpoint from docs/API.md that the feature touches.

Then implement, then prove each checklist item with automated tests:

- Backend (Jest + Supertest, real Postgres via docker): integration test
  for every endpoint — happy path, auth failure (401/403), validation
  failure (400), and not-found/ownership cases. Unit tests for service
  logic, especially pricing, fare rules, taxes, promo codes, points
  conversion, refund penalties, and the booking state machine (every legal
  and illegal transition).
- Frontend (Vitest + React Testing Library): tests for each feature's
  components — rendering with real-shaped data (Persian digits, Jalali
  dates, RTL), loading/error/empty states, form validation messages.
- E2E (Playwright): at least one full user journey per feature running
  against the real stack (e.g. search -> select flight -> choose seat ->
  pay -> see e-ticket), plus visual check that key screens match
  design-reference. Include one role-based journey per panel (login as
  that role, see only permitted tabs).
- Concurrency tests (mandatory for booking): two parallel clients booking
  the LAST seat — exactly one succeeds, inventory never goes negative, the
  ledger stays consistent.
- Financial/pricing edge cases: zero, negative, rounding (rial/toman),
  insufficient funds/wallet/points, price change between search and
  payment (re-price flow), expired HOLD, expired price lock, promo misuse
  (reuse, wrong route, expired), double-submit with the same idempotency key.

A feature is COMPLETE only when: every checklist item in its
docs/features/<name>.md is marked with the test file/name that proves it,
all tests pass locally AND in CI, and lint + typecheck are clean.
Unchecked items = feature not done. Never mark a feature done by
"it looks like it works" — only by passing tests.

## Deployment (git-based, automated)
- Production runs on a single server via `docker-compose.prod.yml`:
  postgres (internal only) + redis (internal only) + ml-service (internal
  only) + backend + frontend + Caddy (auto-SSL).
- Deploys happen ONLY through GitHub Actions (`.github/workflows/deploy.yml`):
  push to `main` -> tests must pass -> SSH deploy -> `prisma migrate deploy`.
  Never deploy by hand-editing files on the server.
- `main` is always deployable. Feature work happens on branches; merge to
  `main` only when the phase is complete and tests pass.
- Secrets live in GitHub Actions Secrets and in `/opt/app/.env` on the
  server (chmod 600). Never in the repo, never in logs.
- DB changes in production use `prisma migrate deploy` exclusively
  (never `db push`, never manual SQL).
- Nightly `pg_dump` backups on the server, 7-day retention. A backup is
  only real if it restores: once a month, restore the latest dump into a
  throwaway Postgres container and run a sanity query (row counts on core
  tables). Document the restore command in `docs/RUNBOOK.md`.
- `docs/RUNBOOK.md`: short operational guide — how to read logs
  (`docker compose logs`), how to check `/health`, how to restore a backup,
  how to roll back a bad deploy (redeploy previous commit). Keep it updated
  whenever deployment changes.
- Uptime monitoring: an external ping on `/health` (e.g. a free uptime
  service) alerting on downtime. Downtime must be noticed by us, not
  reported by users.

## Commands
- `docker compose up -d` — start PostgreSQL + Redis for local dev
- `cd backend && npm run start:dev` — backend dev server
- `cd frontend && npm run dev` — frontend dev server
- `cd ml-service && uvicorn app.main:app --reload` — ML service dev server
- `cd ml-service && pytest` — ML service tests
- `cd backend && npx prisma migrate dev` — apply schema changes
- `npm test` (in each package) — run tests
- `npm run lint && npm run typecheck` — must pass in BOTH packages before
  finishing any phase
