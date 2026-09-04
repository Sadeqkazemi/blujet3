# Backend unsafe-argument warning cleanup

Scope: the 24 `no-unsafe-argument` warnings reported by backend lint. No API,
database, pricing, availability, authorization or deployment contract changes.
Existing endpoint contracts remain in `docs/API.md` and `docs/DB_SCHEMA.md`.

Backend change:
- [x] Inspect the affected flight capacity maps and existing E2E callers.
- [x] Confirm existing API/database contracts; no schema or wire changes needed.
- [x] Follow existing typed Nest application and test-helper conventions.
- [x] Limit edits to flights.service.ts, five affected E2E suites, one shared
  test-only string validator and this checklist/PLAN.md.
- [x] Replace inferred untyped maps with `Map<CabinClass, number>`.
- [x] Narrow response fields from unknown before string/Date/BigInt consumers;
  type the search-advisory Nest HTTP server. Do not coerce or suppress warnings.
- [x] Existing flights unit tests and careers, commitments, flights,
  search-advisory, site-content E2E suites pass (happy path and existing
  authorization/validation/not-found cases remain intact).
- [x] Test the scalar validator against valid strings and non-string values
  (`search-advisory.e2e-spec.ts`, separate unit describe: 10 cases).
- [x] Zero unsafe-argument warnings, typecheck and build pass; no new any/TODO.

Local evidence: 42 unit tests across 12 flights suites and 65 tests across the
five affected E2E suites passed. Scoped read-only ESLint with `--max-warnings 0`
passed. Full-backend ESLint using `fix: true` in memory (no `outputFixes` or
filesystem writes) matched the existing CI lint behavior: 0 errors, 0 warnings.
No ESLint configuration or rule severity was changed. CI has not been rerun
for this unpushed slice.

Pre-existing formatting and unnecessary-assertion diagnostics exposed by
read-only lint are outside this warning-only slice; CI's existing `lint --fix`
handles those. Do not weaken lint rules or include unrelated formatting churn.
