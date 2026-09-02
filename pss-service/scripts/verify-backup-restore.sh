#!/usr/bin/env sh
set -eu

container_id="$(docker ps --filter publish=5433 --format '{{.ID}}' | head -n 1)"
if [ -z "$container_id" ]; then
  echo "PSS PostgreSQL CI container was not found" >&2
  exit 1
fi

restore_db="blujet_pss_restore_test"
dump_path="/tmp/blujet-pss-restore-proof.dump"

cleanup() {
  docker exec -e PGPASSWORD=blujet_pss "$container_id" \
    dropdb -U blujet_pss --if-exists "$restore_db" >/dev/null 2>&1 || true
  docker exec "$container_id" rm -f "$dump_path" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker exec -e PGPASSWORD=blujet_pss "$container_id" \
  pg_dump -U blujet_pss -d blujet_pss_test --format=custom --file="$dump_path"
docker exec -e PGPASSWORD=blujet_pss "$container_id" \
  createdb -U blujet_pss "$restore_db"
docker exec -e PGPASSWORD=blujet_pss "$container_id" \
  pg_restore -U blujet_pss -d "$restore_db" --exit-on-error "$dump_path"

result="$(docker exec -e PGPASSWORD=blujet_pss "$container_id" \
  psql -U blujet_pss -d "$restore_db" -Atc \
  "SELECT (to_regclass('public.pss_idempotency_records') IS NOT NULL)::int || ':' || (to_regclass('public.pss_outbox_events') IS NOT NULL)::int || ':' || (SELECT count(*) FROM migrations);")"

case "$result" in
  1:1:[1-9]*) ;;
  *)
    echo "Restored PSS backup failed schema/migration verification: $result" >&2
    exit 1
    ;;
esac

echo "PSS backup restore verified"
