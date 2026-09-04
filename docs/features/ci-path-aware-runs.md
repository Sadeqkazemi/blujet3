# Path-aware CI runs

Status: implemented locally; merge and deployment are separately gated.

The CI workflow previously ran Backend E2E, Frontend and every extracted
service for every pull request. A PSS-only contract change therefore waited on
the unrelated 20+ minute Backend suite.

`Detect changed areas` now compares the pull-request base and head commits and
selects only the affected jobs:

- `backend/**` runs Backend and migration compatibility.
- backend database or package changes additionally run Experience and Notify,
  because both rehearse the shared-cluster schema.
- each extracted service, Frontend and ML run only for their own paths.
- CI workflow, root production environment and Compose changes run every job.
- reusable `workflow_call` executions remain full runs.

The always-present `CI gate` fails when any selected job fails or is cancelled,
and treats intentionally skipped unrelated jobs as valid. This gives branch
protection one stable check name without forcing unrelated suites to execute.

No production workflow, deployment command, application API or database schema
is changed by this optimization.

## Backend E2E stability

The Backend validation job and the database-backed E2E suite run as separate
CI jobs. E2E specs are split across four Jest shards; every shard receives its
own PostgreSQL and Redis service and prepares its own test schema through the
existing Jest global setup. This avoids repeating migration/seed work inside a
single job and prevents accumulated database load from exhausting the old
30-minute Backend timeout.

Acceptance evidence:

- [x] Changed-file lint, typecheck, build and all 116 unit suites pass locally.
- [ ] All four Backend E2E shards pass against isolated PostgreSQL 16 services.
- [x] `destination-stats.e2e-spec.ts` passes and closes safely when application setup
      fails or times out.
- [x] The stable `CI gate` requires both Backend validation and the complete
      Backend E2E matrix when backend paths change.
