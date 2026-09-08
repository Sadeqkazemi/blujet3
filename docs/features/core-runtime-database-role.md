# Core runtime database isolation

Status: implemented and verified locally; awaiting owner review. No deployment
or production activation.

This phase removes PostgreSQL owner credentials from the long-running Backend
process. It is an infrastructure step toward database-per-domain, while the
owner-approved `inventory` + `orders` + `payments` ACID boundary remains one
Core Platform and one PostgreSQL primary.

## Contract

- Schema migrations run in a short-lived Compose job with the database-owner
  URL. The long-running Backend container never receives that URL.
- A second short-lived job idempotently creates or rotates
  `blujet_core_runtime` after migrations and grants only connection, schema
  usage, table DML and sequence usage required by the transitional Core.
- The runtime role is `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`,
  `NOINHERIT`, `NOREPLICATION` and `NOBYPASSRLS`; it owns no database, schema,
  table or migration history.
- The Backend receives only its restricted runtime `DATABASE_URL`, assembled
  from `CORE_DATABASE_PASSWORD`. The owner URL remains outside the application
  process.
- During the strangler window the Core role can access all existing domain
  schemas because legacy rollback paths still run in the monolith. Each
  extracted writer is removed from this grant in a later contract phase after
  its rollback window closes.
- Provisioning is idempotent and runs after every migration so newly added
  runtime tables/sequences receive the intended grants. It does not create,
  move, copy or dual-write business data.
- Public `/api/v1/**`, internal service contracts, feature flags and money
  formats are unchanged. No server deployment is included.

## Acceptance checklist

- [x] Production Compose orders `db -> db-migrate -> db-runtime-roles -> backend`.
- [x] Backend startup no longer runs TypeORM migrations.
- [x] The long-running Backend service contains no owner URL or owner password.
- [x] Role provisioning validates a strong URL-safe password and fails closed.
- [x] Unit/production-artifact tests cover role attributes, grants, ordering and
      owner-credential separation.
- [x] All 989 Backend unit tests, typecheck, production build, scoped lint and a
      real PostgreSQL role/read/no-DDL proof pass locally.
- [ ] Execute the Docker Compose staging smoke in CI; Docker is not installed on
      this workstation, so container startup is not claimed as local evidence.
- [ ] Owner reviews the diff before push/merge; deployment remains separate.

## Rollback

Revert the application/Compose release before removing the restricted role.
The role change does not alter rows or schemas, so no data rollback is needed.
Do not place owner credentials back into a long-running application as an
operational shortcut; use the previous reviewed deployment artifact instead.
