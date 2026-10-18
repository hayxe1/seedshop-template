#!/bin/sh
set -eu

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  if [ -z "${DATABASE_URL:-}" ]; then
    echo "DATABASE_URL is required when RUN_MIGRATIONS=true"
    exit 1
  fi

  echo "Applying Prisma migrations..."
  ./node_modules/.bin/prisma migrate deploy
fi

exec "$@"
