# Feature: Database reliability — truthful backup status and restore proof

This phase implements the first operational slice of the database architecture:
the IT backup API reports the repository's real backup policy and evidence, and
CI proves that the primary PostgreSQL database can be restored into a throwaway
database. It does not deploy, configure a cloud provider, enable PITR, or add a
one-click destructive restore endpoint.

## Acceptance checklist

- [ ] `GET /it/backups/schedule` reports the enforced nightly database backup
  policy (03:00 cron, seven-day retention) — `backend/test/it-manager.e2e-spec.ts`
- [ ] The schedule does not claim file backup or cloud/off-site storage when
  neither is configured — `backend/test/it-manager.e2e-spec.ts`
- [ ] The schedule includes the most recent successful dump timestamp and file,
  or explicit nulls when none exists — `backend/test/it-manager.e2e-spec.ts`
- [ ] A successful backup record remains the evidence of `pg_dump` completion;
  failed commands remain `FAILED` and never become synthetic `SUCCESS` rows —
  existing `backend/test/it-manager.e2e-spec.ts`
- [ ] CI migrates the primary backend schema, dumps it, restores it to a
  throwaway PostgreSQL database, and verifies required schemas/tables —
  `scripts/verify-backup-restore.sh` in the `backend-backup-restore` job
- [ ] The restore check always removes its throwaway database and temporary
  dump, including on failure — shell `trap` in `scripts/verify-backup-restore.sh`
- [ ] Non-IT callers still receive 403 for all backup endpoints — existing
  `backend/test/it-manager.e2e-spec.ts`
