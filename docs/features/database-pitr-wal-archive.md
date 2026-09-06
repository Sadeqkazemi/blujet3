# Feature: Database reliability — WAL archive and point-in-time recovery

This phase turns the primary PostgreSQL 16 deployment into a recoverable PITR
source. The existing nightly `pg_dump` remains useful for logical recovery, but
it is not a PITR base backup. Production therefore gains continuous WAL
archiving to a dedicated Docker volume plus a separate physical base-backup
command. CI must prove recovery to a transaction boundary between two writes.

The repository configuration deliberately does not claim off-site durability.
The WAL archive and physical base backup initially live on the database host;
copying both to independently credentialed object storage remains an operational
cutover gate once a provider and credentials are approved.

No public or internal HTTP endpoint and no application table changes in this
phase. Recovery is intentionally an operator-only, destructive runbook action.

## Acceptance checklist

- [ ] The production PostgreSQL service enables `wal_level=replica`,
  `archive_mode=on`, a bounded `archive_timeout`, and a fail-closed
  `archive_command` — `backend/src/production-artifacts.spec.ts`
- [ ] WAL files are written to a volume separate from the primary `PGDATA`
  volume, and an existing archive file is accepted only when byte-identical —
  `scripts/archive-wal.sh` and `backend/src/production-artifacts.spec.ts`
- [ ] `scripts/backup-base-pitr.sh` creates a plain physical base backup with
  streamed WAL, verifies the base with `pg_verifybackup`, packages it
  atomically, validates the archive, and removes its staging directory on
  success or failure — shell implementation and
  `backend/src/production-artifacts.spec.ts`
- [ ] A failed base backup never prunes the WAL archive; successful retention
  cleanup keeps WAL from the oldest retained base backup — shell implementation
  and `backend/src/production-artifacts.spec.ts`
- [ ] CI starts PostgreSQL 16 with the production archive helper, takes a base
  backup, writes two committed markers, recovers to the LSN between them, and
  proves that only the first marker exists — `scripts/verify-pitr-recovery.sh`
  in the `backend-pitr-recovery` job
- [ ] The required backup/restore proof jobs are dependencies of `CI gate`, so
  a skipped or failed selected proof cannot be hidden by a green gate —
  `backend/src/production-artifacts.spec.ts`
- [ ] The runbook documents base-backup scheduling, health checks, retention,
  destructive PITR recovery, and the unresolved off-site storage gate —
  `docs/RUNBOOK.md`
- [ ] No deployment, production cron change, restore, merge, or push occurs
  without separate owner approval.
