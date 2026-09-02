# Microservices migration — phase 0 safety foundation

Architecture authority:
`docs/architecture/blujet-architecture-v1.1.md`.

This phase changes no domain ownership and extracts no service. It establishes
the deployment, contract, cache, and migration controls required before
`notify` becomes the first independently deployed service.

## Acceptance checklist

- [x] The architecture v1.1 ADR is stored in the repository and explicitly
  supersedes the separate-primary PSS writer topology while preserving useful
  Offer/Order contracts. Proven by `production-artifacts.spec.ts`.
- [x] Every backend `/health` response exposes a stable service name, package
  version, and exact deployed git commit. Docker builds receive the same commit
  SHA used by the deployment. Proven by `health.controller.spec.ts` and
  `production-artifacts.spec.ts`.
- [x] Production does not mount Swagger. Development and test keep Swagger;
  any future internal docs listener must be separately private.
  Proven by `swagger-policy.spec.ts`.
- [x] Search cache keys contain `SEARCH_CACHE_GEN`; changing the generation
  invalidates the catalogue without `FLUSHDB`. Proven by
  `search.airports.spec.ts` and focused search cache tests.
- [x] CI is configured to build the PR base schema, apply candidate TypeORM
  migrations over it, and reject destructive `up()` operations or edits to
  existing migrations. Proven structurally by `production-artifacts.spec.ts`.
- [ ] A real pull-request run produces passing baseline-migration evidence.
- [x] The deploy flow is configured to smoke backend and PSS health endpoints
  and verify their commit identity before completing. Proven structurally by
  `production-artifacts.spec.ts`.
- [ ] A real UAT workflow run produces passing post-deploy smoke evidence.
- [x] Backend production typecheck/build and all 382 unit tests pass; changed
  files have zero lint errors. PSS lint/typecheck/build and all 13 unit tests
  pass. Frontend production build passes. YAML, shell syntax, migration-gate
  dry run, and `git diff --check` pass locally.

## Explicit boundaries

- No `notify`, `experience`, or `identity` extraction in this phase.
- No change to public endpoint paths or response envelopes.
- No writer cutover to `pss-service`; `PSS_INTEGRATION_ENABLED=false` remains
  the production default.
- No split of inventory, order, payment, wallet, ledger, or ticket transactions.
- No destructive schema change and no production seed.
