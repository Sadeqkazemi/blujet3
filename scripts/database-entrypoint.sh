#!/usr/bin/env sh
set -eu

# Both mounts are created by Docker as root. PostgreSQL must own the archive
# target before the official entrypoint drops privileges to the postgres user.
mkdir -p /var/lib/postgresql/wal-archive /var/lib/postgresql/base-backups
chown postgres:postgres \
  /var/lib/postgresql/wal-archive \
  /var/lib/postgresql/base-backups
chmod 0700 /var/lib/postgresql/wal-archive
chmod 0750 /var/lib/postgresql/base-backups

exec docker-entrypoint.sh "$@"
