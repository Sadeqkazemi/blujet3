# AGENTS.md

Project-wide rules live in `CLAUDE.md` (read it first). Standard commands are
in `CLAUDE.md` "Commands", `scripts/start-local.sh`, and each package's
`package.json`. This file only captures non-obvious, durable notes for working
in the Cursor Cloud VM.

## Cursor Cloud specific instructions

### Services and how they run here
Four dev services make up the product. The update script only refreshes
dependencies; it does NOT start services, run migrations, or seed. Start them
yourself each session.

- PostgreSQL 16 and Redis 7 are installed **natively via apt** in this VM (there
  is no Docker here — ignore `docker compose up`). They are not auto-started on
  boot; start them with:
  - `sudo pg_ctlcluster 16 main start`
  - `sudo redis-server --daemonize yes`
- Backend (NestJS) on `:3000` — `cd backend && npm run start:dev`. Health at
  `http://localhost:3000/health`; Swagger at `/docs`.
- Frontend (Vite PWA) on `:5173` — `cd frontend && npm run dev -- --host 0.0.0.0 --port 5173`.
  Open the app on **5173**, not 3000 (3000 is API-only and returns JSON 404 on `/`).
  Vite proxies API routes to the backend, so both must run.
- ML service (FastAPI, optional) on `:8000` — from `ml-service/`:
  `INTERNAL_TOKEN=dev-internal-token .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000`.
  Backend calls it with a 2s timeout + fallback, so search/booking/payment work
  without it. `INTERNAL_TOKEN` must equal the backend's `ML_SERVICE_INTERNAL_TOKEN`.

### Database state
- Role `blujet` / password `blujet` (superuser) and databases `blujet` (dev) and
  `blujet_test` (e2e) already exist, are migrated, and are seeded in the VM
  snapshot. After starting Postgres they are ready to use.
- If you add a migration: `cd backend && npx typeorm migrate dev` (dev DB). For the
  test DB, target it explicitly:
  `DATABASE_URL="postgresql://blujet:blujet@localhost:5432/blujet_test?schema=public" npx typeorm migrate deploy`.
- Seed staff/dev password for every role is `Blujet@1404` (e.g. staff login
  `chair` / `Blujet@1404`). Customer login is phone + OTP.

### Env files
- `backend/.env` and `frontend/.env` already exist in the snapshot (gitignored),
  created from the `.env.example` files with real dev secrets (valid 32-byte hex
  `PII_ENCRYPTION_KEY`, random JWT secrets). Recreate from `.env.example` only if
  missing; `PII_ENCRYPTION_KEY` must be a real 32-byte hex value or PII
  encryption fails at runtime.

### Testing gotchas
- Backend e2e (`cd backend && npm run test:e2e`) reads `backend/.env.test`
  (`blujet_test` DB) and **requires that DB to be seeded** — specs reference
  seeded staff accounts/routes. Seed it once per fresh DB:
  `DATABASE_URL="postgresql://blujet:blujet@localhost:5432/blujet_test?schema=public" npx typeorm db seed`.
  CI does not seed, so a batch of e2e specs are red in CI by default; that is a
  known pre-existing condition, not your environment.
- ML tests: run from `ml-service/` as `INTERNAL_TOKEN=test-internal-token .venv/bin/pytest`
  (the tests hard-code the `test-internal-token`; a different token yields 401s).
- Backend unit tests (`npm test`) and frontend tests (`cd frontend && npm test`)
  need no extra setup once deps are installed and Postgres/Redis are up.

### Do not commit generated churn
- `backend`'s `npm run lint` runs `eslint --fix` and rewrites many source files
  (prettier-style formatting). To lint as a read-only check, run eslint without
  `--fix`.
- Building or starting the backend regenerates `docs/openapi.json`.
- Revert this incidental churn (`git checkout -- .`) before committing unless a
  change is actually intended.
