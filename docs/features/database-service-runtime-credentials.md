# Feature: Dedicated runtime database credentials

This phase makes the production compose contract match the schema-per-domain
architecture for the already extracted `notify` and `experience` services.
Each process must receive a separately provisioned, non-superuser PostgreSQL
URL. The migration owner remains responsible for schema changes; service
runtime roles do not receive database-wide ownership or migration privileges.

## Acceptance checklist

- [x] Production compose requires `NOTIFY_DATABASE_URL` and
  `EXPERIENCE_DATABASE_URL` instead of reusing the Core owner URL.
- [x] The production environment template documents non-superuser,
  schema-scoped grants and fails closed while they are unprovisioned.
- [x] Production artifact tests reject the old shared-credential wiring.
- [ ] Provision and verify the roles and grants on the target PostgreSQL
  cluster; this is an operations step and is intentionally not run here.
- [ ] Enable TLS for all production PostgreSQL connections after the target
  cluster is configured; the current compose network is not a deployment.

No separate primary database or distributed transaction boundary is introduced
by this phase. `inventory`, `orders`, and `payments` remain one transactional
Core Platform as required by the architecture decision.
