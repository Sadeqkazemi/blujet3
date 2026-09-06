#!/usr/bin/env sh
set -eu

repo_root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
postgres_image="${POSTGRES_IMAGE:-postgres:16-alpine}"
database_name="blujet_pitr_test"
database_user="blujet"
database_password="blujet-pitr-ci-password"
suffix="$(date +%s)-$$"
primary_container="blujet-pitr-primary-$suffix"
recovery_container="blujet-pitr-recovery-$suffix"
work_dir="$(mktemp -d "${TMPDIR:-/tmp}/blujet-pitr.XXXXXX")"
base_dir="$work_dir/base"
archive_dir="$work_dir/archive"

cleanup() {
  docker rm -f "$primary_container" "$recovery_container" >/dev/null 2>&1 || true
  rm -rf "$work_dir"
}
trap cleanup EXIT HUP INT TERM

mkdir -p "$base_dir" "$archive_dir"
chmod 0777 "$base_dir" "$archive_dir"

docker run -d --name "$primary_container" \
  -e POSTGRES_USER="$database_user" \
  -e POSTGRES_PASSWORD="$database_password" \
  -e POSTGRES_DB="$database_name" \
  -v "$base_dir:/base" \
  -v "$archive_dir:/archive" \
  -v "$repo_root/scripts/archive-wal.sh:/usr/local/bin/blujet-archive-wal:ro" \
  "$postgres_image" postgres \
  -c wal_level=replica \
  -c archive_mode=on \
  -c archive_timeout=1s \
  -c "archive_command=WAL_ARCHIVE_DIR=/archive sh /usr/local/bin/blujet-archive-wal %p %f" \
  >/dev/null

ready=false
for _attempt in $(seq 1 45); do
  if docker exec "$primary_container" pg_isready -U "$database_user" -d "$database_name" >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
if [ "$ready" != true ]; then
  docker logs "$primary_container" >&2
  echo "PITR source PostgreSQL did not become ready" >&2
  exit 1
fi

settings="$(docker exec -e PGPASSWORD="$database_password" "$primary_container" \
  psql -U "$database_user" -d "$database_name" -Atqc \
  "SELECT current_setting('wal_level') || ':' || current_setting('archive_mode') || ':' || current_setting('archive_timeout');")"
if [ "$settings" != "replica:on:1s" ]; then
  echo "Unexpected PITR source settings: $settings" >&2
  exit 1
fi

docker exec -e PGPASSWORD="$database_password" "$primary_container" \
  psql -v ON_ERROR_STOP=1 -U "$database_user" -d "$database_name" -qc \
  "CREATE TABLE pitr_markers (id integer PRIMARY KEY, label text NOT NULL);"

# The base deliberately predates both markers. Recovery must replay archived
# WAL, stop after marker 1 and exclude the later committed marker 2.
docker exec -e PGPASSWORD="$database_password" "$primary_container" \
  pg_basebackup -h 127.0.0.1 -U "$database_user" -D /base \
  --format=plain --wal-method=stream --checkpoint=fast --no-password

docker exec -e PGPASSWORD="$database_password" "$primary_container" \
  psql -v ON_ERROR_STOP=1 -U "$database_user" -d "$database_name" -qc \
  "INSERT INTO pitr_markers (id, label) VALUES (1, 'before-target');"
target_lsn="$(docker exec -e PGPASSWORD="$database_password" "$primary_container" \
  psql -U "$database_user" -d "$database_name" -Atqc 'SELECT pg_current_wal_lsn();')"
case "$target_lsn" in
  */*) ;;
  *)
    echo "Invalid recovery target LSN: $target_lsn" >&2
    exit 1
    ;;
esac

docker exec -e PGPASSWORD="$database_password" "$primary_container" \
  psql -v ON_ERROR_STOP=1 -U "$database_user" -d "$database_name" -qc \
  "INSERT INTO pitr_markers (id, label) VALUES (2, 'after-target');"
wal_name="$(docker exec -e PGPASSWORD="$database_password" "$primary_container" \
  psql -U "$database_user" -d "$database_name" -Atqc \
  'SELECT pg_walfile_name(pg_switch_wal());')"
if ! printf '%s\n' "$wal_name" | grep -Eq '^[0-9A-F]{24}$'; then
  echo "Invalid WAL file name returned after switch: $wal_name" >&2
  exit 1
fi

archived=false
for _attempt in $(seq 1 45); do
  if [ -f "$archive_dir/$wal_name" ]; then
    archived=true
    break
  fi
  sleep 1
done
if [ "$archived" != true ]; then
  docker logs "$primary_container" >&2
  echo "PostgreSQL did not archive a completed WAL segment" >&2
  exit 1
fi

# Replays are idempotent only for identical bytes; a conflicting file must make
# archive_command fail so PostgreSQL never silently overwrites recovery data.
docker exec "$primary_container" sh /usr/local/bin/blujet-archive-wal \
  "/archive/$wal_name" "$wal_name"
printf 'different-bytes\n' > "$archive_dir/collision-source"
if docker exec "$primary_container" sh /usr/local/bin/blujet-archive-wal \
  /archive/collision-source "$wal_name" >/dev/null 2>&1; then
  echo "WAL archive collision was not rejected" >&2
  exit 1
fi
rm -f "$archive_dir/collision-source"

docker stop --time 30 "$primary_container" >/dev/null

docker run --rm --user 0 --entrypoint sh \
  -e TARGET_LSN="$target_lsn" \
  -v "$base_dir:/data" \
  "$postgres_image" -c '
    set -eu
    rm -f /data/postmaster.pid /data/standby.signal
    printf "%s\n" \
      "restore_command = '\''cp /archive/%f %p'\''" \
      "recovery_target_lsn = '\''$TARGET_LSN'\''" \
      "recovery_target_inclusive = '\''true'\''" \
      "recovery_target_action = '\''promote'\''" \
      >> /data/postgresql.auto.conf
    : > /data/recovery.signal
    chown -R postgres:postgres /data
    chmod 0700 /data
  '

docker run -d --name "$recovery_container" \
  -e POSTGRES_USER="$database_user" \
  -e POSTGRES_PASSWORD="$database_password" \
  -e POSTGRES_DB="$database_name" \
  -v "$base_dir:/var/lib/postgresql/data" \
  -v "$archive_dir:/archive:ro" \
  "$postgres_image" >/dev/null

recovered=false
for _attempt in $(seq 1 45); do
  result="$(docker exec -e PGPASSWORD="$database_password" "$recovery_container" \
    psql -U "$database_user" -d "$database_name" -Atqc \
    "SELECT pg_is_in_recovery()::int || ':' || COALESCE(string_agg(label, ',' ORDER BY id), '') FROM pitr_markers;" \
    2>/dev/null || true)"
  if [ "$result" = "0:before-target" ]; then
    recovered=true
    break
  fi
  sleep 1
done

if [ "$recovered" != true ]; then
  docker logs "$recovery_container" >&2
  echo "PITR verification failed; recovered marker state: ${result:-unavailable}" >&2
  exit 1
fi

echo "PostgreSQL PITR verified at LSN $target_lsn (later transaction excluded)"
