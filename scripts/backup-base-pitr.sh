#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ ! -f .env ]]; then
  echo "Missing .env beside docker-compose.prod.yml" >&2
  exit 1
fi

set -a
source .env
set +a

POSTGRES_USER="${POSTGRES_USER:-blujet}"
POSTGRES_DB="${POSTGRES_DB:-blujet}"
BACKUP_DIR="${BACKUP_DIR:-/opt/app/backups}"
PITR_BASE_RETENTION_DAYS="${PITR_BASE_RETENTION_DAYS:-7}"
export BACKUP_DIR POSTGRES_USER POSTGRES_DB

if [[ ! "$PITR_BASE_RETENTION_DAYS" =~ ^[0-9]+$ ]] ||
  ((PITR_BASE_RETENTION_DAYS < 7)); then
  echo "PITR_BASE_RETENTION_DAYS must be an integer of at least 7" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

stamp="$(date -u +%Y%m%d-%H%M%S)"
staging_name=".blujet-pitr-base-${stamp}-$$"
staging_path="$BACKUP_DIR/$staging_name"
output_path="$BACKUP_DIR/blujet-pitr-base-${stamp}.tar.gz"
partial_path="$output_path.part"
archive_list="$BACKUP_DIR/.blujet-pitr-base-${stamp}-list-$$"

cleanup() {
  rm -rf -- "$staging_path"
  rm -f -- "$partial_path"
  rm -f -- "$archive_list"
}
trap cleanup EXIT HUP INT TERM

docker compose -f docker-compose.prod.yml exec -T -u postgres \
  -e PGPASSWORD="${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}" \
  db pg_basebackup \
  --host=127.0.0.1 \
  --username="$POSTGRES_USER" \
  --pgdata="/var/lib/postgresql/base-backups/$staging_name" \
  --format=plain \
  --wal-method=stream \
  --checkpoint=fast \
  --no-password

docker compose -f docker-compose.prod.yml exec -T -u postgres db \
  pg_verifybackup "/var/lib/postgresql/base-backups/$staging_name"

tar -C "$staging_path" -czf "$partial_path" .
tar -tzf "$partial_path" > "$archive_list"
grep -qx './PG_VERSION' "$archive_list"
grep -qx './backup_label' "$archive_list"
grep -qx './backup_manifest' "$archive_list"
rm -f -- "$archive_list"
chmod 0600 "$partial_path"
mv -f -- "$partial_path" "$output_path"
rm -rf -- "$staging_path"

# Keep the newest base older than the retention boundary as an anchor. A PITR
# target seven days ago needs a base from at or before that target, not merely a
# newer base. Cleanup runs only after the new base has been validated above.
mapfile -d '' expired_bases < <(
  find "$BACKUP_DIR" -maxdepth 1 -type f \
    -name 'blujet-pitr-base-*.tar.gz' \
    -mtime "+$PITR_BASE_RETENTION_DAYS" -print0 | sort -z
)
if ((${#expired_bases[@]} > 1)); then
  for ((index = 0; index < ${#expired_bases[@]} - 1; index++)); do
    rm -f -- "${expired_bases[$index]}"
  done
fi

mapfile -d '' retained_bases < <(
  find "$BACKUP_DIR" -maxdepth 1 -type f \
    -name 'blujet-pitr-base-*.tar.gz' -print0 | sort -z
)
if ((${#retained_bases[@]} == 0)); then
  echo "No validated PITR base backup remains; refusing WAL cleanup" >&2
  exit 1
fi

oldest_base="${retained_bases[0]}"
backup_label="$(tar -xOzf "$oldest_base" ./backup_label)"
start_wal="$(printf '%s\n' "$backup_label" | sed -n \
  's/^START WAL LOCATION: .* (file \([0-9A-F]\{24\}\)).*/\1/p' | head -n 1)"
if [[ ! "$start_wal" =~ ^[0-9A-F]{24}$ ]]; then
  echo "Cannot read the oldest retained base backup WAL boundary" >&2
  exit 1
fi

docker compose -f docker-compose.prod.yml exec -T -u postgres db \
  pg_archivecleanup /var/lib/postgresql/wal-archive "$start_wal"

echo "PITR base backup written: $output_path ($(du -h "$output_path" | cut -f1))"
echo "Archived WAL retained from oldest base boundary: $start_wal"
