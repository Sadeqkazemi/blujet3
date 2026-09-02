# CLAUDE.md — Project Rules (read and follow strictly)

## Project Overview
- Name: [airline project name]
- Description: An airline website: flight search, booking, seat selection,
  payment, e-ticketing, and an admin panel for flights, schedules and fares.
- The visual design is FINAL. Reference files live in `design-reference/`.
  Match them exactly: colors, spacing, typography, components. Do NOT redesign.

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
- Validation: class-validator DTOs on EVERY endpoint (server) + zod on
  frontend forms
- API docs: @nestjs/swagger — mandatory on every endpoint (see below)

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
│       ├── lib/         # utils, constants, config
│       └── types/       # shared TS types (generated from OpenAPI)
├── backend/
│   ├── prisma/          # schema.prisma, migrations, seed
│   └── src/
│       ├── modules/     # one NestJS module per domain:
│       │                # auth/, users/, flights/, search/, booking/,
│       │                # payment/, ticketing/, admin/, ai/
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
- Search: connection builder over flight instances; max 2 connections;
  respect minimum connection time per airport.
- Pricing is separate from availability. ALWAYS re-price immediately
  before payment; if the price changed, show the new price and require
  explicit user confirmation before charging.
- Booking flow is an explicit state machine:
  `DRAFT → HELD → PAID → TICKETED → (CANCELLED | EXPIRED | REFUNDED)`
  - HELD has a 10-minute TTL; expiry releases inventory automatically.
  - All state transitions are transactional and idempotent.
- Seat inventory lives ONLY in PostgreSQL. Prevent double-booking with
  `SELECT ... FOR UPDATE` or optimistic locking (version column). Exactly
  one of two concurrent buyers of the last seat may succeed.
- All timestamps stored in UTC; airport timezones stored separately
  (IANA tz). Departure/arrival always rendered in the airport's local time.
- Soft delete (`deleted_at`) for bookings and passengers; hard deletes only
  through the GDPR deletion flow.

## Code Standards
- TypeScript strict mode; no `any`.
- All API responses use one envelope:
  `{ success: boolean, data?: T, error?: { code: string, message: string } }`
- Errors: centralized error handler; never leak stack traces to clients.
- Every endpoint: input validation → auth check → service logic → typed response.
- Frontend never calls fetch/axios directly in components — only through `src/api/`.
- Environment variables: validated at startup; `.env.example` always kept current;
  never commit real secrets.
- Seed data: `backend/prisma/seed.ts` must stay in sync with the schema and
  create realistic sample data for every domain (test users with known
  passwords, sample airports/routes/flights with schedules and fares,
  sample bookings in each state) so any feature can be manually exercised
  right after `prisma migrate dev`. Update the seed in the same phase that
  adds a new table. Seed data is for development only — never run against
  production.

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
- `vite-plugin-pwa` configured with: manifest (name, theme color from
  design-reference, icons 192/512 + maskable), auto-update service worker.
- Cache strategy: app shell precached; API responses NEVER cached by the
  service worker (availability, prices and booking data must always be fresh).
- Must pass Lighthouse PWA installability checks before a phase that
  touches frontend is considered done.

## AI Integration Rules (platform features)
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
- Money is NEVER a float. Store as integer in smallest unit (e.g. cents)
  plus ISO 4217 currency code, or DECIMAL. All arithmetic through a single
  money utility module.
- PCI scope: NEVER store PAN/CVV. Payments only through the gateway's
  tokenization. Card data never touches our servers or logs.
- Every balance/payment change goes through a double-entry ledger table
  (immutable rows), never direct balance UPDATE. Refunds and cancellations
  are new ledger entries (reversals), never edits to old rows.
- Any multi-step money operation (pay → confirm booking → ticket) runs
  inside a DB transaction with row-level locking to prevent race conditions.
- Idempotency keys on all payment/booking-creating endpoints.
- Log every financial action to an audit table: who, what, when, before/after.

## Security Rules
- Rate limiting on auth, search, booking and money endpoints
  (per-IP and per-account).
- Passwords: argon2/bcrypt. Sessions revocable. 2FA REQUIRED for all
  admin accounts.
- Passenger PII (passport numbers, DOB, contact info): encrypted at rest
  (AES-256), TLS 1.2+ in transit, masked in logs.
- GDPR: implement passenger data export and deletion flows.
- All user input validated server-side regardless of client validation.
- CORS locked to known origins; helmet (or equivalent) enabled; CSRF
  protection on state-changing requests.
- Authorization checked per-resource (a user can only access their own
  bookings, passengers and tickets).
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
- NEVER log secrets, tokens, passwords, passport numbers, or full
  card/account numbers. Sensitive fields are redacted at the logger level
  (pino redact paths).
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
  logic, especially pricing, fare rules, taxes and the booking state
  machine (every legal and illegal transition).
- Frontend (Vitest + React Testing Library): tests for each feature's
  components — rendering with real-shaped data, loading/error/empty
  states, form validation messages.
- E2E (Playwright): at least one full user journey per feature running
  against the real stack (e.g. search -> select flight -> choose seat ->
  pay -> see e-ticket), plus visual check that key screens match
  design-reference.
- Concurrency tests (mandatory for booking): two parallel clients booking
  the LAST seat — exactly one succeeds, inventory never goes negative, the
  ledger stays consistent.
- Financial/pricing edge cases: zero, negative, rounding, insufficient
  funds, price change between search and payment (re-price flow), expired
  HOLD, double-submit with the same idempotency key.

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
