# Loyalty projection runtime role

## Scope

Provision one non-owner PostgreSQL LOGIN role for the standalone Loyalty
projection worker. The owner credential remains an offline operator-only
input; the long-running worker receives only its restricted
`LOYALTY_PROJECTION_DATABASE_URL` credential.

This is a credential-isolation slice. It does not change the Loyalty schema,
copy data, activate Kafka, switch a runtime URL, cut over reads or deploy.

## Acceptance checklist

- [x] `blujet_loyalty_projection_runtime` is restricted to PostgreSQL 16
      databases named `blujet_loyalty` or `blujet_loyalty_*`
      (`provision-loyalty-projection-runtime-role.spec.ts`).
- [x] The role has CONNECT to only the isolated Loyalty database and USAGE on
      only schema `loyalty`
      (`loyalty-projection-runtime-role.e2e-spec.ts`).
- [x] The six business projections, projection slots, checkpoints and failure
      registry allow only SELECT/INSERT/UPDATE
      (`loyalty-projection-runtime-role.e2e-spec.ts`).
- [x] Immutable event receipts allow only SELECT/INSERT
      (`loyalty-projection-runtime-role.e2e-spec.ts`).
- [x] DELETE, TRUNCATE, DDL, sequence access, ownership, memberships, TEMP,
      non-Loyalty schema access and foreign database CONNECT are denied
      (`loyalty-projection-runtime-role.e2e-spec.ts`).
- [x] Provisioning is idempotent, transactional and fails closed on an
      incomplete relation or privilege boundary
      (`provision-loyalty-projection-runtime-role.spec.ts`,
      `loyalty-projection-runtime-role.e2e-spec.ts`).
- [x] CLI output contains only `status`, `role` and `relationCount`; secrets,
      URLs, row data and event data are never emitted
      (`provision-loyalty-projection-runtime-role.spec.ts`).
- [x] Unit and real-PostgreSQL tests prove the allow/deny contract and rerun
      (`provision-loyalty-projection-runtime-role.spec.ts`,
      `loyalty-projection-runtime-role.e2e-spec.ts`).
- [x] The dedicated proof runs in the Loyalty CI job and is excluded from the
      generic Backend E2E shards (`production-artifacts.spec.ts`).
- [x] Lint, typecheck, build, OpenAPI stability and diff hygiene pass before
      review (local validation on 2026-09-16).

## Explicitly deferred

- Kafka consumer activation or ACL changes.
- Baseline copy, repair, replay, dual-write or read cutover.
- Runtime URL or production Compose changes.
- Deployment or merge without owner approval.
