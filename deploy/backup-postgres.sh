#!/bin/sh
set -eu

PROJECT_DIR="${PROJECT_DIR:-/opt/seedshop-template}"
ENV_FILE="${ENV_FILE:-${PROJECT_DIR}/.env.production}"

if [ ! -f "${ENV_FILE}" ]; then
  echo "Environment file not found: ${ENV_FILE}" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "${ENV_FILE}"
set +a

BACKUP_DIR="${BACKUP_DIR:-/var/backups/seedshop-template}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

case "${BACKUP_RETENTION_DAYS}" in
  *[!0-9]*|"")
    echo "BACKUP_RETENTION_DAYS must be a positive integer." >&2
    exit 1
    ;;
esac

mkdir -p "${BACKUP_DIR}"
cd "${PROJECT_DIR}"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_file="${BACKUP_DIR}/seedshop-template-${timestamp}.dump"
temporary_file="${backup_file}.partial"

cleanup() {
  rm -f "${temporary_file}"
}
trap cleanup EXIT INT TERM

docker compose --env-file "${ENV_FILE}" exec -T postgres \
  pg_dump --format=custom --no-owner --no-privileges \
  --username="${POSTGRES_USER}" --dbname="${POSTGRES_DB}" > "${temporary_file}"

mv "${temporary_file}" "${backup_file}"
sha256sum "${backup_file}" > "${backup_file}.sha256"
trap - EXIT INT TERM

find "${BACKUP_DIR}" -maxdepth 1 -type f \
  \( -name "seedshop-template-*.dump" -o -name "seedshop-template-*.dump.sha256" \) \
  -mtime "+${BACKUP_RETENTION_DAYS}" -delete

if [ -n "${RCLONE_REMOTE:-}" ]; then
  if ! command -v rclone >/dev/null 2>&1; then
    echo "RCLONE_REMOTE is set, but rclone is not installed." >&2
    exit 1
  fi

  rclone copy "${backup_file}" "${RCLONE_REMOTE}"
  rclone copy "${backup_file}.sha256" "${RCLONE_REMOTE}"
fi

echo "Backup created: ${backup_file}"
