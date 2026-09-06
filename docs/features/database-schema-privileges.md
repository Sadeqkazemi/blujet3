# Feature: Database schema privilege hardening

This phase hardens the existing schema-per-domain PostgreSQL layout without
creating separate primaries or changing application credentials. The migration
removes the default `CREATE` privilege from `PUBLIC` on `public` and all
domain schemas. Existing owner/service privileges are unchanged; no business
rows, tables or compatibility views are copied or removed.

## Acceptance checklist

- [ ] `PUBLIC` cannot create objects in `public` or any domain schema after the
  migration — `backend/src/database/schema-privileges.spec.ts`
- [ ] The migration does not revoke the application owner's existing access or
  change table data — migration SQL review plus `backend/src/database/schema-privileges.spec.ts`
- [ ] Migration rollback restores only the previous schema `CREATE` defaults —
  `backend/src/database/schema-privileges.spec.ts`
- [ ] CI applies the migration in the normal migration-compatibility rehearsal —
  `.github/workflows/ci.yml` / `backend-migration-compatibility`
- [ ] Existing backend unit and schema-domain tests remain green — CI Backend job
- [ ] No separate primary database or Core transaction boundary is introduced —
  `docs/DB_SCHEMA.md` and migration review
