#!/usr/bin/env sh
set -eu

# CI-only proof that the primary PostgreSQL dump is restorable. The throwaway
# database is created in the CI container and is always removed by the trap.
container_id="$(docker ps --filter publish=5432 --format '{{.ID}}' | head -n 1)"
if [ -z "$container_id" ]; then
  echo "Primary PostgreSQL CI container was not found" >&2
  exit 1
fi

db_user="${POSTGRES_USER:-blujet}"
source_db="${POSTGRES_DB:-blujet_test}"
restore_db="blujet_restore_$(date +%s)_$$"
dump_path="/tmp/${restore_db}.dump"

cleanup() {
  docker exec -e PGPASSWORD="${POSTGRES_PASSWORD:-blujet}" "$container_id" \
    dropdb -U "$db_user" --if-exists "$restore_db" >/dev/null 2>&1 || true
  docker exec "$container_id" rm -f "$dump_path" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker exec -e PGPASSWORD="${POSTGRES_PASSWORD:-blujet}" "$container_id" \
  pg_dump -U "$db_user" -d "$source_db" --format=custom --file="$dump_path"
docker exec -e PGPASSWORD="${POSTGRES_PASSWORD:-blujet}" "$container_id" \
  createdb -U "$db_user" "$restore_db"
docker exec -e PGPASSWORD="${POSTGRES_PASSWORD:-blujet}" "$container_id" \
  pg_restore -U "$db_user" -d "$restore_db" --exit-on-error "$dump_path"

result="$(docker exec -e PGPASSWORD="${POSTGRES_PASSWORD:-blujet}" "$container_id" \
  psql -U "$db_user" -d "$restore_db" -Atc \
  "SELECT (to_regclass('public.migrations') IS NOT NULL)::int || ':' || (to_regclass('ops.backup_records') IS NOT NULL)::int || ':' || (to_regclass('orders.bookings') IS NOT NULL)::int || ':' || (SELECT count(*) FROM migrations);")"

case "$result" in
  1:1:1:[1-9]*) ;;
  *)
    echo "Restored primary backup failed schema verification: $result" >&2
    exit 1
    ;;
esac

echo "Primary database backup restore verified"
