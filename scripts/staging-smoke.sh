#!/bin/sh
set -eu

compose_file="${1:-docker-compose.prod.yml}"
env_file="${2:?usage: staging-smoke.sh COMPOSE_FILE ENV_FILE}"
project_name="${COMPOSE_PROJECT_NAME:-blujet-staging-smoke}"

compose() {
  docker compose --project-name "$project_name" --env-file "$env_file" -f "$compose_file" "$@"
}

cleanup() {
  compose down --volumes --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

case "$project_name" in
  *staging*) ;;
  *) echo "Refusing smoke run: compose project must identify staging." >&2; exit 1 ;;
esac

compose build backend pss-service notify-service experience-service frontend
# Run candidate migrations with the Core owner in a short-lived job before
# provisioning extracted service roles. The long-running Backend never
# receives this owner URL.
compose up -d --wait db redis pss-db db-migrate

notify_password="${STAGING_NOTIFY_DB_PASSWORD:?STAGING_NOTIFY_DB_PASSWORD is required}"
experience_password="${STAGING_EXPERIENCE_DB_PASSWORD:?STAGING_EXPERIENCE_DB_PASSWORD is required}"

compose exec -T db psql -U blujet -d blujet \
  -v ON_ERROR_STOP=1 \
  -v notify_password="$notify_password" \
  -v experience_password="$experience_password" <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'notify_writer') THEN
    CREATE ROLE notify_writer LOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'experience_writer') THEN
    CREATE ROLE experience_writer LOGIN;
  END IF;
END
$$;
ALTER ROLE notify_writer PASSWORD :'notify_password';
ALTER ROLE experience_writer PASSWORD :'experience_password';
GRANT CONNECT ON DATABASE blujet TO notify_writer, experience_writer;
GRANT USAGE ON SCHEMA notify TO notify_writer;
GRANT USAGE ON SCHEMA experience TO experience_writer;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA notify TO notify_writer;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA notify TO notify_writer;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA experience TO experience_writer;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA experience TO experience_writer;
SQL

unset notify_password experience_password
compose up -d --wait pss-service notify-service experience-service backend frontend

COMPOSE_PROJECT_NAME="$project_name" sh scripts/smoke-service-health.sh "$compose_file" "$env_file"
compose exec -T frontend curl --fail --silent --show-error http://localhost/health >/dev/null
compose exec -T frontend curl --fail --silent --show-error http://localhost/ >/dev/null

echo "Staging compose smoke passed"
