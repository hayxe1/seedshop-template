#!/bin/sh
set -eu

PROJECT_DIR="${PROJECT_DIR:-/opt/seedshop-template}"
ENV_FILE="${ENV_FILE:-${PROJECT_DIR}/.env.production}"

set -a
# shellcheck disable=SC1090
. "${ENV_FILE}"
set +a

curl --fail --silent --show-error --retry 3 --max-time 60 \
  --header "Authorization: Bearer ${CRON_SECRET}" \
  "https://${DOMAIN}/api/cron/commerce"
