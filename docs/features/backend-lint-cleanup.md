# Backend lint cleanup — 2026-09-05

Owner-approved scope: resolve the 479 existing backend lint findings after merging
the Kafka real-broker change. Base: PR #52, main `81e4224`. Follow-up approval:
restore eight immutable migrations and exempt only their formatting rule.

Backend change:
- [x] Read repository rules, lint configuration and affected assertion contexts.
- [x] Confirm unchanged API and DB contracts in docs/API.md and docs/DB_SCHEMA.md.
- [x] Identify existing patterns: repository ESLint/Prettier, no new dependencies.
- [x] Reproduce baseline: 473 formatting findings and 6 unnecessary non-null assertions.
- [x] Apply mechanical formatting and remove only the six redundant assertions.
- [x] Check emitted JavaScript equivalence for every changed TypeScript file (45/45).
- [x] Pass full read-only ESLint, unit tests, typecheck and build (commands below).
- [x] Verify flight approval/pricing: 23 tests across the two existing E2E suites.
- [x] Inspect final diff; no API, schema, runtime flag or deployment changes.
- [x] Owner approved push/merge and the exact-file historical formatting exemption.
- [ ] Verify final CI before merge (PR #53).

Write scope: only backend TypeScript files reported by lint, plus this checklist,
PLAN.md and API/schema no-change notes. Six assertions occur in
`passenger-fares.spec.ts`, `flight-workflow.service.ts` and `pricing.service.ts`.
Preserve necessary assertions, compiler/lint rules, dependency versions and all
business logic. No type/safety rule weakening. Eight published migrations must
remain identical to main, including whitespace. Only `prettier/prettier` is
disabled for their exact paths; new migrations remain fully checked.

Touched files use consistent LF. Some tracked files previously mixed CRLF and
LF, so raw diffs include line-ending normalization; ignore end-of-line whitespace
when reviewing the logical diff. Git/TypeScript configuration remains unchanged.

Runtime-equivalence check: load `tsconfig.json` with TypeScript, transpile the
HEAD and working-tree versions of all 45 changed `.ts` files using the same
compiler options (comments/source maps disabled), normalize generated JavaScript
with Prettier's Babel parser, and compare. Result: zero differences, including
the six erased non-null assertions and migration statements.

No endpoints are added or changed; additional 401/403/400/ownership tests are not
needed for whitespace and erased TypeScript-only assertions. Existing tests
remain the behavioral regression evidence.

## Initial local verification (before CI migration correction)

All commands below ran after final LF normalization, from `backend/`:

- `node node_modules/eslint/bin/eslint.js "{src,apps,libs,test}/**/*.ts"`:
  exit 0, no errors or warnings, no autofix during verification.
- `npm run typecheck` and `npm run build`: exit 0.
- With `NODE_OPTIONS=--experimental-vm-modules`,
  `node node_modules/jest/bin/jest.js --maxWorkers=2 --silent`:
  137 suites / 767 tests passed.
- With the same Node option,
  `node node_modules/jest/bin/jest.js --config test/jest-e2e.json --runInBand --runTestsByPath test/flight-approval-workflow.e2e-spec.ts test/flight-definition.e2e-spec.ts --silent`:
  2 suites / 23 tests passed against local PostgreSQL; existing setup applies
  migrations and test seed, no production connection.
- `git diff --check`: exit 0. Runtime-equivalence comparison: 45 files, zero differences.
- Initial PR #53 CI rejected modifications to eight historical migrations, even
  though their emitted behavior was unchanged. The correction restores all eight
  files and preserves `check-expand-only-migrations.mjs` unchanged.

## Final migration-safe verification

- [ ] No migration diff against main; expand-only gate passes on committed HEAD.
- [ ] Read-only lint, typecheck and build pass with the exact-file exemption.
- [ ] Effective ESLint config keeps type/safety rules for historical files and
  formatting checks for a normal/new migration.
- [ ] PR #53 final CI and CodeQL pass; no deployment.
