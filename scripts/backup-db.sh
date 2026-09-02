#!/usr/bin/env bash
# Nightly Postgres backup. Run from the repo root on the server (where
# docker-compose.prod.yml and .env live), e.g. via cron:
#   0 3 * * * cd /opt/app && ./scripts/backup-db.sh >> /var/log/blujet-backup.log 2>&1
set -euo pipefail

cd "$(dirname "$0")/.."
set -a
source .env
set +a

BACKUP_DIR="${BACKUP_DIR:-/opt/app/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
mkdir -p "$BACKUP_DIR"

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/blujet-$STAMP.sql.gz"

docker compose -f docker-compose.prod.yml exec -T db \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$OUT"

echo "Backup written: $OUT ($(du -h "$OUT" | cut -f1))"

find "$BACKUP_DIR" -name 'blujet-*.sql.gz' -mtime "+$RETENTION_DAYS" -delete
