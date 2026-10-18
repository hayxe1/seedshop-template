#!/bin/sh
set -eu

PROJECT_DIR="${PROJECT_DIR:-/opt/seedshop-template}"
ENV_FILE="${ENV_FILE:-${PROJECT_DIR}/.env.production}"
BACKUP_FILE="${1:-}"

if [ -z "${BACKUP_FILE}" ] || [ ! -f "${BACKUP_FILE}" ]; then
  echo "Usage: CONFIRM_RESTORE=RESTORE_SEEDSHOP_TEMPLATE sh deploy/restore-postgres.sh /absolute/path/to/backup.dump" >&2
  exit 1
fi

if [ "${CONFIRM_RESTORE:-}" != "RESTORE_SEEDSHOP_TEMPLATE" ]; then
  echo "Restore replaces the current database. Set CONFIRM_RESTORE=RESTORE_SEEDSHOP_TEMPLATE to continue." >&2
  exit 1
fi

if [ ! -f "${ENV_FILE}" ]; then
  echo "Environment file not found: ${ENV_FILE}" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "${ENV_FILE}"
set +a

cd "${PROJECT_DIR}"

restart_web() {
  docker compose --env-file "${ENV_FILE}" start web >/dev/null 2>&1 || true
}
trap restart_web EXIT INT TERM

docker compose --env-file "${ENV_FILE}" stop web
docker compose --env-file "${ENV_FILE}" exec -T postgres \
  pg_restore --clean --if-exists --no-owner --no-privileges \
  --username="${POSTGRES_USER}" --dbname="${POSTGRES_DB}" < "${BACKUP_FILE}"
docker compose --env-file "${ENV_FILE}" start web

trap - EXIT INT TERM
echo "Database restored from: ${BACKUP_FILE}"
