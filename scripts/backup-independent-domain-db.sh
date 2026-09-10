#!/usr/bin/env sh
set -eu

domain="${DOMAIN_DATABASE_KIND:-}"
case "$domain" in
  notify)
    service=notify-db
    database=blujet_notify
    owner=blujet_notify_owner
    ;;
  experience)
    service=experience-db
    database=blujet_experience
    owner=blujet_experience_owner
    ;;
  identity)
    service=identity-db
    database=blujet_identity
    owner=blujet_identity_owner
    ;;
  *)
    echo 'DOMAIN_DATABASE_KIND must be notify, experience or identity' >&2
    exit 1
    ;;
esac

repo_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$repo_dir"

backup_dir="${BACKUP_DIR:-/opt/app/backups}"
retention_days="${RETENTION_DAYS:-7}"
mkdir -p "$backup_dir"
stamp=$(date -u +%Y%m%d-%H%M%S)
output="$backup_dir/${domain}-${stamp}.dump"

docker compose -f docker-compose.prod.yml -f docker-compose.domain-db.yml \
  exec -T "$service" pg_dump -U "$owner" -d "$database" \
  --format=custom --no-owner --file=- > "$output"

if [ ! -s "$output" ]; then
  rm -f "$output"
  echo "${domain} database backup is empty" >&2
  exit 1
fi

echo "${domain} database backup written: $output"
find "$backup_dir" -name "${domain}-*.dump" -mtime "+$retention_days" -delete
