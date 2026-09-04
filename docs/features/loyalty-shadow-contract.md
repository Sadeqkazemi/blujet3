# A6.3 — automated restricted-reader shadow contract

Scope: repeatable local/CI integration evidence before any public read cutover.
Run the built backend shadow CLI against the real Loyalty Nest HTTP application
and PostgreSQL, with a generated column-scoped reader credential. Both projection
readers use this credential; only fixture setup/cleanup uses the test writer.
No HTTP mocks, production roles, migrations, public routes or deployments.

Acceptance (in `loyalty-service/test/shadow-contract.e2e-spec.ts`):

- [x] MATCH for synthetic membership/ledger/locks through the real CLI and HTTP;
  separately assert exact ledger points and IRR above JS safe integer, correct
  owner isolation and exclusion of expired locks.
- [x] MATCH for absent and deactivated memberships.
- [x] Invalid service credentials return UNAVAILABLE, exit 2, without secrets.
- [x] Stopped HTTP service returns UNAVAILABLE, exit 2.
- [x] Disabled comparison exits 0 without usable database/service configuration.
- [x] CLI emits only status/request ID, not owner IDs, PII or credentials.
- [x] Fixture rows are unchanged by comparison; synthetic rows/role are cleaned.
- [x] Lint, typecheck, both required builds and existing Loyalty suites pass.

Local evidence, 2026-09-04 (Node 22 / PostgreSQL 18.2): backend `npm run build`
and 13 focused shadow-comparator unit tests pass; Loyalty lint, typecheck,
build, 2 unit tests and 28 E2E tests pass (6 new contract cases). Workflow YAML
parses and executes the backend build before the dependent E2E suite. GitHub
CI/PostgreSQL 16 execution remains pending publication of this slice.

The first local contract run overlapped a backend build (`deleteOutDir: true`)
and failed two child-process cases. Serialized build-then-test passed all six;
CI enforces that order. The harness's child-process exit-code TypeScript union
was narrowed explicitly before the final successful typecheck. No production
behavior was changed to make these tests pass.

This adds deterministic synthetic integration evidence, not representative
production parity evidence, proof against concurrent ABA changes, or permission
to switch public reads. The existing comparator's MISMATCH/INCONCLUSIVE cases
remain covered by its focused unit tests. Production provisioning, comparison
window, cutover approval and deployment are separate gates.
