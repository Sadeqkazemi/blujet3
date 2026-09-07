# A6.2 — Loyalty database reader verification

Scope: a read-only operational verifier plus real-PostgreSQL permission tests.
No public API cutover, production credential provisioning, migration, deployment
or ownership transfer. The backend remains the sole business writer.

The verifier connects only to the configured Loyalty database and inspects
PostgreSQL privilege metadata, never changing grants or business data. It
reports named boolean checks, not credentials, usernames, SQL or customer data.
Only the exact A6.1 projection columns may be readable. Elevated role flags,
role memberships, relation/schema/database ownership, schema/database CREATE, write grants,
other user-table column reads, sequence access and executable user-defined
SECURITY DEFINER routines cause verification to fail.

System catalogs and database TEMP permission are outside the projection check.
This is evidence for the current database/current grants, not a network audit,
authentication audit, guarantee against future grants, or proof about another
database in the cluster. Production provisioning/review remains separately
approved. It does not run automatically on public requests.

Acceptance:

- [x] Restricted reader passes with the required column SELECT grants.
- [x] Missing required SELECT fails; broad table SELECT/PII access fails.
- [x] Elevated or inherited-role access and writable privileges fail.
- [x] Real reader rejects protected writes even after session read-only is off.
- [x] Real reader cannot select protected PII or another domain's user table.
- [x] Existing membership and price-lock projections work with restricted grants.
- [x] CLI emits only status/check booleans and uses nonzero exit on failure.
- [x] Existing service tests, lint, typecheck and build pass.

Local evidence (2026-09-04, Node 22 / PostgreSQL 18.2):
`npm run lint:check`, `npm run typecheck`, `npm run build`, `npm test`
(2 tests) and `npm run test:e2e` (22 tests) pass. The new
`test/reader-verification.e2e-spec.ts` covers 13 permission/CLI cases;
the existing HTTP suite covers the remaining 9 E2E cases. CI already builds
then runs both suites on PostgreSQL 16; this unpushed slice has not run there.
Production credential verification and representative parity sampling remain
separately approved prerequisites, not completed acceptance evidence.

Test provisioning is confined to the existing isolated _test database, using
a newly generated login role and password, an empty parent role, and synthetic
sequence/function fixtures. The exact test objects, grants and roles are removed
afterward. No production role is created.

## Bounded parity sampler

`../../scripts/loyalty-shadow-sample.sh` is an operator-driven helper for a
separately approved comparison window. It accepts one to 32 explicit user UUIDs
and invokes the existing `loyalty:compare:shadow` command for each value. It
prints only aggregate counters (`sampled`, `match`, `mismatch`,
`inconclusive`, `unavailable`); UUIDs, response bodies, request IDs, database
errors and credentials never appear in its output. Exit code `0` means every
sample matched; `2` means at least one sample was not a stable match; `1` means
the invocation or configuration was invalid. The helper does not enable a
public read flag, provision a role, or modify database state.

Example (with an explicitly provisioned SELECT-only reader):

```sh
LOYALTY_SHADOW_ENABLED=true \
LOYALTY_SERVICE_URL=http://localhost:3500 \
LOYALTY_INTERNAL_TOKEN=<service-token> \
./scripts/loyalty-shadow-sample.sh \
  <user-uuid-1> <user-uuid-2>
```
