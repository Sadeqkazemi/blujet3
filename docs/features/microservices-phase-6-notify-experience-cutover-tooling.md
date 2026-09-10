# Microservices phase 6 — Notify/Experience physical cutover tooling

## Scope

This slice makes the already-independent Notify and Experience schemas safe to
move to dedicated PostgreSQL databases. It adds operational tooling and CI
proof only. It does not copy production data, rotate a production credential,
change a production URL, enable dual-write, deploy, or move Identity/Core data.

## Database identities

- Migrations and a one-time transfer use a short-lived database owner URL.
- Long-running services use fixed non-owner roles:
  `blujet_notify_runtime` and `blujet_experience_runtime`.
- A runtime role has `CONNECT`, schema `USAGE`, and DML/sequence privileges only
  inside its own schema. It has no ownership, role membership, DDL, replication,
  RLS bypass, public-schema creation, or privilege in another domain schema.
- Role passwords are URL-safe, supplied only through environment secrets, and
  never printed.

## Transfer and reconciliation

The transfer command is fail-closed and supports only `notify` and
`experience`. Source and target URLs must identify different databases. The
source transaction is read-only. Apply mode additionally requires a reviewed
backup reference and an empty target domain.

Rows are copied in dependency-safe table order and bounded batches inside one
target transaction. Every table is checked before and after by row count and
two order-independent 64-bit PostgreSQL hashes over the complete persisted row.
Output contains only domain/table names, counts, hashes, and status; it never
contains URLs, credentials, row content, or PII. Any mismatch rolls the target
transaction back. Re-running against a populated target is refused, preventing
an accidental dual-write or duplicate import.

The separately reviewed operational sequence remains:

1. freeze the owning Core writer and drain the relevant outbox;
2. take and restore-verify a Core backup;
3. migrate the empty target and provision its restricted runtime role;
4. run the transfer and require exact reconciliation;
5. run UAT, switch only the service URL/credential, and observe;
6. revoke the service credential from Core; rollback restores the old URL and
   writer, never dual-writes.

## Acceptance checklist

- [x] A typed, allowlisted role provisioner creates both restricted runtime
      identities and verifies exact schema privileges.
- [x] A fail-closed transfer command requires a backup reference, empty target,
      distinct databases, read-only source and exact row-count/hash parity.
- [x] PostgreSQL integration tests prove own-domain DML succeeds while
      cross-domain read/write and all DDL fail.
- [x] The CI workflow provisions independent Notify/Experience databases and is
      wired to run transfer, reconciliation, replay-refusal and rollback proof.
      The GitHub run remains pending until owner-approved push.
- [x] Production artifacts document separate owner/runtime URLs and a manual
      cutover/rollback sequence without enabling it.
- [x] Existing service contracts, Core ACID ownership, public APIs and default
      deployment behavior remain unchanged.
- [x] Present the tested diff for owner approval before commit/push/merge. No
      server deployment or live credential change is authorized in this slice.
