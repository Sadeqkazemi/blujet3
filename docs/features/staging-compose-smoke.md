# Feature: Isolated staging compose smoke gate

The manual `Staging Compose Smoke` workflow exercises the production-shaped
Compose topology on an isolated GitHub runner. It uses a distinct Compose
project and disposable volumes, applies migrations with the Core owner, creates
temporary schema-scoped runtime roles for Notify and Experience, starts the
services, verifies service commit identity and the frontend gateway, then tears
the environment down.

## Acceptance checklist

- [x] The workflow is manual-only and cannot deploy to a server.
- [x] Staging uses a distinct Compose project and disposable volumes.
- [x] Extracted services use dedicated runtime URLs; the Core owner is used only
  for the migration step.
- [x] Health, readiness/commit identity and frontend gateway smoke are required.
- [x] Cleanup removes containers, networks and staging volumes on exit.
- [x] Run the workflow successfully before the next transactional extraction
  or any real UAT/production deployment (GitHub Actions run `34114641282` on
  main commit `fea6247`).

Evidence: the isolated Compose project completed migration, schema-scoped
Notify/Experience runtime-role setup, service health/commit checks and
frontend gateway smoke, then removed its containers, network and volumes.
