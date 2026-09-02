#!/bin/sh
set -eu
npx typeorm migration:run -d dist/database/data-source.js
exec "$@"
