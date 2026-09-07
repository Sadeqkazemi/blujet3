-- Metadata-only observation, not an operational readiness certification.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '5s';
SET LOCAL lock_timeout = '1s';
SET LOCAL TIME ZONE 'UTC';

SELECT jsonb_pretty(jsonb_build_object(
  'observed_at_utc', CURRENT_TIMESTAMP,
  'transaction_read_only', current_setting('transaction_read_only'),
  'server_version_num', current_setting('server_version_num'),
  'in_recovery', pg_is_in_recovery(),
  'wal_level', current_setting('wal_level'),
  'archive_mode', current_setting('archive_mode'),
  'archive_timeout', current_setting('archive_timeout'),
  'server_ssl_enabled', current_setting('ssl'),
  'current_connection_tls', (
    SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()
  ),
  'current_role_superuser', (
    SELECT rolsuper FROM pg_roles WHERE rolname = current_user
  ),
  'archive_statistics', (
    SELECT jsonb_build_object(
      'archived_count', archived_count,
      'failed_count', failed_count,
      'last_archived_time', last_archived_time,
      'last_failed_time', last_failed_time,
      'statistics_reset_at', stats_reset
    ) FROM pg_stat_archiver
  ),
  'public_schema_create_grants', (
    SELECT COALESCE(jsonb_agg(n.nspname ORDER BY n.nspname), '[]'::jsonb)
    FROM pg_namespace n
    WHERE n.nspname NOT LIKE 'pg_%'
      AND n.nspname <> 'information_schema'
      AND EXISTS (
        SELECT 1 FROM aclexplode(COALESCE(n.nspacl, acldefault('n', n.nspowner))) a
        WHERE a.grantee = 0 AND a.privilege_type = 'CREATE'
      )
  ),
  'unverified', jsonb_build_array(
    'off_site_backup_and_restore',
    'automated_failover',
    'encryption_at_rest',
    'retention_policy',
    'all_application_connections_use_tls',
    'production_restore_drill'
  )
)) AS database_readiness_observation;

ROLLBACK;
