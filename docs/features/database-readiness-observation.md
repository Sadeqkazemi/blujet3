# Database readiness observation

This metadata-only diagnostic observes the connected database; it does not
declare production ready, change settings, trigger a backup, or restore data.
No business table, password, connection URL, archive command, or WAL filename
is included. Run against an explicitly selected environment only.

## Acceptance

- [x] Execute `scripts/database-readiness.sql` on the local test database.
- [x] Verify the observation reports a read-only transaction and UTC timestamp.
- [x] Verify unproven operational controls remain explicitly unverified.
- [x] Verify the final successful command is ROLLBACK and close the connection.
- [ ] Run the manually dispatched PostgreSQL 16 CI observation and retain its
  sanitized JSON artifact before release.
- Server execution and operational acceptance remain separate; a successful CI
  query proves only the diagnostic contract on the pinned PostgreSQL 16 image.

Local evidence (2026-09-06): PostgreSQL 18.2, test database, Node `pg` execution
with assertions on read-only mode, UTC offset, six unverified controls and
final ROLLBACK command. Archive mode and server SSL were off; the diagnostic
role was superuser; PUBLIC had no schema CREATE grants. No server was queried.

## Interpretation

- `server_ssl_enabled` is server capability, not proof that every client uses
  TLS. `current_connection_tls` describes only this diagnostic connection;
  null is unavailable evidence, not success.
- Archiver counters are cumulative since `statistics_reset_at`. A historical
  failure is not necessarily a current incident; compare observations. A null
  last archive timestamp does not prove recoverability.
- `public_schema_create_grants` lists schemas where PUBLIC has CREATE. An
  empty list does not prove table ownership or least-privilege service roles.
- A superuser connection is explicitly visible in the result, not treated as
  proof that the application's normal credentials are restricted.
- Off-site restore, failover, at-rest encryption and retention require separate
  evidence. No thresholds, provider, topology or retention period are invented.
