# Microservices phase 6 — Identity physical database bootstrap

## Scope

This slice gives `identity-service` a standalone PostgreSQL bootstrap for the
six tables already assigned to the `identity` bounded context. It does not move
credential verification, copy production data, change the Redis-backed session
authority, or enable the existing Identity cutover flag.

The current Backend remains the only credential writer until backup, transfer,
checksum reconciliation, writer freeze and UAT have been approved. No
dual-write, public API change, URL switch or deployment is included.

## Ownership and isolation

The dedicated database contains `users`, `refresh_tokens`,
`two_factor_challenges`, `password_reset_events`, `security_policy` and
`customer_identity_verifications` in schema `identity`. All seven foreign keys
remain inside that schema and reference `identity.users`.

The customer-verification `idCardFileId` is an opaque stable reference to
Experience file metadata. It has no cross-database foreign key or runtime join.
Identity retains encrypted PII fields and token hashes exactly as currently
modelled; the bootstrap stores no plaintext credential, OTP or refresh token.

## Acceptance checklist

- [x] Standalone development and compiled TypeORM migration commands use only
  `IDENTITY_DATABASE_URL`.
- [x] A fresh PostgreSQL database receives exactly six Identity-owned tables,
  six local enum types and a dedicated migration history.
- [x] TypeORM entity metadata reports no schema drift after migration.
- [x] Every foreign key remains internal to `identity.users`; file IDs stay
  scalar cross-domain references.
- [x] Rollback removes only the `identity` schema and a compiled migration can
  recreate it.
- [x] Identity JWT/session HTTP contracts, Redis session authority and all
  public `/api/v1/auth/**` facades remain unchanged.
- [x] CI proves the fresh migration separately from the shared Core schema.

## Deferred cutover

Provision a non-superuser database/role, back up and transfer existing rows,
verify encrypted-field and row-count checksums, freeze the Core credential
writer, run UAT login/rotation/rollback, and switch the Identity database URL
only in a separately approved release. No production flag or server is changed
by this bootstrap.
