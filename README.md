# blujet

Persian-first airline platform for flight search, booking, ticketing, refunds,
wallet and loyalty, agencies, and role-scoped management panels.

## Repository layout

| Path | Purpose |
| --- | --- |
| `backend/` | NestJS API, TypeORM migrations, domain services, and tests |
| `frontend/` | React, TypeScript, Vite, Tailwind, and PWA client |
| `ml-service/` | Internal FastAPI recommendation and pricing-assistance service |
| `docs/` | API, schema, deployment, operations, and feature acceptance docs |
| `design-reference/` | Approved visual reference; never a runtime data source |
| `scripts/` | Local and operational helper scripts |

The product and engineering rules are defined in `CLAUDE.md`. Read them before
changing domain behavior, authentication, financial logic, or UI design.

## Local development

Prerequisites: Docker Compose, Node.js 22, npm, and Python 3.12.

```bash
docker compose up -d
cd backend && npm ci && npm run migration:run && npm run start:dev
cd frontend && npm ci && npm run dev
cd ml-service && python -m pip install -e ".[dev]" && uvicorn app.main:app --reload
```

Copy only the documented `.env.example` files for local configuration. Never
commit real credentials, production data, access tokens, OTPs, or customer PII.

## Required checks

Pull requests to `main` run:

- backend migration, seed, lint, build, unit tests, and E2E tests;
- frontend lint, build, and component tests;
- ML service pytest suite;
- CodeQL analysis for JavaScript/TypeScript and Python.

Useful local commands:

```bash
cd backend && npm run lint && npm run build && npm test && npm run test:e2e
cd frontend && npm run lint && npm run build && npm test
cd ml-service && pytest
```

## Delivery

Feature work is submitted through a pull request. `main` is protected and must
remain deployable. A push to `main` or an authorized manual dispatch runs the
same required CI workflow, waits for approval in the GitHub `uat` environment,
and deploys the exact reviewed commit SHA through GitHub Actions.

Operational procedures, health checks, backups, and rollback guidance are in
`docs/RUNBOOK.md`. Repository secrets belong in GitHub Actions or the protected
server environment, never in Git.

## Security

Report vulnerabilities privately to the repository owner. Do not open a public
issue containing credentials, personal data, exploit details, or server access
information. See `.github/SECURITY.md`.
