# Loyalty worker runtime-role attestation

## Scope

- [x] Keep `/health` as pure process liveness with no database or Kafka call.
- [x] Make `/ready` require the exact
      `blujet_loyalty_projection_runtime` database session identity on an
      isolated Loyalty database name.
- [x] Fail closed when the runtime role is elevated, owns database objects,
      inherits another role, can create database/schema objects, can use a
      sequence, can reach another domain relation or can connect to another
      database.
- [x] Require the exact ten-table projection/checkpoint/failure grant boundary;
      the immutable receipt table must remain insert-only after SELECT.
- [x] Preserve the existing consumer, checkpoint and quarantine readiness
      contract after database attestation succeeds.
- [x] Return only a fixed `down-or-misconfigured` database status when the
      database or credential boundary is unavailable.
- [x] Prove valid, wrong-role, elevated and unavailable cases with focused
      tests, then run Loyalty lint, typecheck, build and OpenAPI/diff hygiene.

## Exclusions

This change does not provision a role, alter a credential or URL, activate
Kafka, copy data, change a migration, expose a public API, edit production
Compose, cut over reads, deploy or merge. The offline provisioner and its real
PostgreSQL E2E remain the authority for creating and proving the role itself.
