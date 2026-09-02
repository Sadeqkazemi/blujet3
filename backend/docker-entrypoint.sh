#!/bin/sh
set -e

echo "Running database migrations..."
npm run migration:run:prod

if [ "$SEED_ON_START" = "true" ]; then
  if [ "$NODE_ENV" = "production" ]; then
    echo "FATAL: SEED_ON_START=true is forbidden in production." >&2
    echo "Set SEED_ON_START=false and use the audited bootstrap/cleanup procedure." >&2
    exit 1
  fi
  echo "Seeding non-production database..."
  npm run seed:prod
fi

exec "$@"
