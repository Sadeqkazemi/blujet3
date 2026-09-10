# Microservices phase 6 — Ops/Admin projection database bootstrap

## Scope

The independent Ops/Admin process currently serves a read-only cartable
summary and a bounded task-routing list. This slice gives that exact read model
a standalone PostgreSQL bootstrap. It does not move cartable commands, manager
messages, referrals, settings, audit writers, finance actions or any Core
commerce command.

Core remains the only writer. No production data is copied, no event consumer
is activated, no dual-write is added, and no runtime URL or deployment changes.

## Projection ownership

The dedicated database contains one `ops.cartable_tasks` projection with only
the fields already exposed to the process: `id`, `assigneeId`, `category`,
`sourceType`, `sourceId`, `status`, `resolvedAt`, `readAt` and `createdAt`.
Three local enum types preserve the existing routing contract.

Titles, descriptions, attachments, sender details, resolution text,
conversation content and transferred-user fields are deliberately absent.
Identity and Core identifiers are stable scalar references; the projection has
no cross-database foreign key or runtime join.

## Acceptance checklist

- [x] Standalone development and compiled TypeORM migration commands use only
  `OPS_ADMIN_PROJECTION_DATABASE_URL`; the long-running reader continues to use
  its restricted `OPS_ADMIN_DATABASE_URL` credential.
- [x] A fresh PostgreSQL database receives exactly one projection table, three
  local enum types and a dedicated migration history.
- [x] TypeORM entity metadata reports no schema drift after migration.
- [x] The projection contains no content/PII columns and no foreign keys.
- [x] Rollback removes only the `ops` schema and a compiled migration can
  recreate it.
- [x] Existing health, service-authenticated HTTP contracts, shared-schema
  compatibility path and default-off Compose profile remain unchanged.
- [x] CI proves the physical projection separately from the shared Core schema.

## Deferred projection activation

Before cutover, publish an approved cartable projection event, replay a complete
baseline and ordered deltas, reconcile counts and routing fields, provision
separate owner/writer/reader roles, and run UAT rollback. The runtime reader URL
may switch only in a separately approved release. Command writers remain in
Core until their APIs, idempotency, Saga compensation and reconciliation gates
are independently proven.
