#!/bin/sh
set -eu

PROJECT_DIR="${PROJECT_DIR:-/opt/seedshop-template}"
ENV_FILE="${ENV_FILE:-${PROJECT_DIR}/.env.production}"
STATE_DIR="${STATE_DIR:-/var/lib/seedshop-template-release}"
LOCK_FILE="${LOCK_FILE:-/run/lock/seedshop-template-deploy.lock}"
REMOTE_IMAGE="${REMOTE_IMAGE:?Set REMOTE_IMAGE to the client registry image}"
PRODUCTION_TAG="seedshop-template-web:production"
ROLLBACK_TAG="seedshop-template-web:rollback"
WEB_CONTAINER="seedshop-template-web-1"

usage() {
  echo "Usage: $0 deploy sha256:<digest> <40-character-revision> <github-user> | rollback" >&2
  exit 2
}

compose() {
  docker compose --env-file "${ENV_FILE}" "$@"
}

is_digest() {
  printf '%s' "$1" | grep -Eq '^sha256:[0-9a-f]{64}$'
}

is_revision() {
  printf '%s' "$1" | grep -Eq '^[0-9a-f]{40}$'
}

is_github_user() {
  printf '%s' "$1" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9-]{0,38}$'
}

container_image_id() {
  docker inspect --format '{{.Image}}' "${WEB_CONTAINER}" 2>/dev/null
}

image_id() {
  docker image inspect --format '{{.Id}}' "$1" 2>/dev/null
}

read_state() {
  state_name="$1"
  fallback="$2"
  state_file="${STATE_DIR}/${state_name}"
  if [ -f "${state_file}" ]; then
    head -n 1 "${state_file}"
  else
    printf '%s\n' "${fallback}"
  fi
}

write_state() {
  state_name="$1"
  state_value="$2"
  temporary_file="${STATE_DIR}/.${state_name}.$$"
  umask 077
  printf '%s\n' "${state_value}" > "${temporary_file}"
  mv "${temporary_file}" "${STATE_DIR}/${state_name}"
}

write_release_state() {
  current_image="$1"
  current_revision="$2"
  previous_image="$3"
  previous_revision="$4"
  write_state current-image "${current_image}"
  write_state current-revision "${current_revision}"
  write_state previous-image "${previous_image}"
  write_state previous-revision "${previous_revision}"
}

wait_for_release() {
  expected_revision="$1"
  attempt=1
  while [ "${attempt}" -le 90 ]; do
    container_id="$(compose ps -q web 2>/dev/null || true)"
    health_status=""
    if [ -n "${container_id}" ]; then
      health_status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${container_id}" 2>/dev/null || true)"
    fi

    if [ "${health_status}" = "healthy" ]; then
      health_json="$(curl --fail --silent --show-error "https://${DOMAIN}/api/health" 2>/dev/null || true)"
      if printf '%s' "${health_json}" | grep -Fq '"database":"available"'; then
        if [ "${expected_revision}" = "legacy" ] || \
          printf '%s' "${health_json}" | grep -Fq "\"release\":\"${expected_revision}\""; then
          return 0
        fi
      fi
    fi

    attempt=$((attempt + 1))
    sleep 2
  done

  return 1
}

recreate_web() {
  revision="$1"
  APP_REVISION="${revision}" compose up -d --no-deps --no-build --force-recreate web
}

show_failure_context() {
  compose ps >&2 || true
  compose logs --tail=150 web caddy >&2 || true
}

deploy_release() {
  digest="$1"
  revision="$2"
  registry_user="$3"

  is_digest "${digest}" || usage
  is_revision "${revision}" || usage
  is_github_user "${registry_user}" || usage

  current_image="$(image_id "${PRODUCTION_TAG}" || true)"
  if [ -z "${current_image}" ]; then
    current_image="$(container_image_id || true)"
  fi
  if [ -z "${current_image}" ]; then
    echo "Could not determine the current production web image." >&2
    exit 1
  fi

  current_revision="$(read_state current-revision legacy)"
  prior_rollback_image="$(image_id "${ROLLBACK_TAG}" || true)"
  docker image tag "${current_image}" "${PRODUCTION_TAG}"

  docker_config="$(mktemp -d)"
  cleanup_docker_config() {
    rm -rf "${docker_config}"
  }
  trap cleanup_docker_config EXIT INT TERM

  echo "Authenticating to GHCR with an ephemeral workflow token..."
  DOCKER_CONFIG="${docker_config}" docker login ghcr.io --username "${registry_user}" --password-stdin >/dev/null
  DOCKER_CONFIG="${docker_config}" docker pull "${REMOTE_IMAGE}@${digest}"
  candidate_image="$(image_id "${REMOTE_IMAGE}@${digest}")"

  echo "Creating a fresh PostgreSQL backup before release..."
  PROJECT_DIR="${PROJECT_DIR}" ENV_FILE="${ENV_FILE}" sh "${PROJECT_DIR}/deploy/backup-postgres.sh"

  docker image tag "${current_image}" "${ROLLBACK_TAG}"
  docker image tag "${candidate_image}" "${PRODUCTION_TAG}"

  echo "Starting release ${revision} (${digest})..."
  if recreate_web "${revision}" && wait_for_release "${revision}"; then
    write_release_state "${candidate_image}" "${revision}" "${current_image}" "${current_revision}"
    compose ps
    echo "Release ${revision} is healthy at https://${DOMAIN}"
    return 0
  fi

  echo "Release ${revision} failed health verification. Restoring ${current_revision}..." >&2
  show_failure_context
  docker image tag "${current_image}" "${PRODUCTION_TAG}"
  if [ -n "${prior_rollback_image}" ]; then
    docker image tag "${prior_rollback_image}" "${ROLLBACK_TAG}"
  fi

  if recreate_web "${current_revision}" && wait_for_release "${current_revision}"; then
    echo "Automatic rollback to ${current_revision} succeeded." >&2
    exit 1
  fi

  echo "CRITICAL: automatic rollback to ${current_revision} also failed." >&2
  show_failure_context
  exit 1
}

rollback_release() {
  current_image="$(image_id "${PRODUCTION_TAG}" || true)"
  previous_image="$(image_id "${ROLLBACK_TAG}" || true)"
  if [ -z "${current_image}" ] || [ -z "${previous_image}" ]; then
    echo "Both ${PRODUCTION_TAG} and ${ROLLBACK_TAG} must exist before rollback." >&2
    exit 1
  fi

  current_revision="$(read_state current-revision legacy)"
  previous_revision="$(read_state previous-revision legacy)"
  if [ "${current_image}" = "${previous_image}" ] && [ "${current_revision}" = "${previous_revision}" ]; then
    echo "Rollback target is identical to the current release." >&2
    exit 1
  fi

  docker image tag "${previous_image}" "${PRODUCTION_TAG}"
  docker image tag "${current_image}" "${ROLLBACK_TAG}"

  echo "Rolling back ${current_revision} to ${previous_revision}..."
  if recreate_web "${previous_revision}" && wait_for_release "${previous_revision}"; then
    write_release_state "${previous_image}" "${previous_revision}" "${current_image}" "${current_revision}"
    compose ps
    echo "Rollback to ${previous_revision} is healthy at https://${DOMAIN}"
    return 0
  fi

  echo "Rollback to ${previous_revision} failed. Restoring ${current_revision}..." >&2
  show_failure_context
  docker image tag "${current_image}" "${PRODUCTION_TAG}"
  docker image tag "${previous_image}" "${ROLLBACK_TAG}"

  if recreate_web "${current_revision}" && wait_for_release "${current_revision}"; then
    echo "The original release ${current_revision} was restored." >&2
    exit 1
  fi

  echo "CRITICAL: both rollback and restoration failed." >&2
  show_failure_context
  exit 1
}

if [ "$(id -u)" -ne 0 ]; then
  echo "This release command must run as root." >&2
  exit 1
fi

if [ ! -f "${ENV_FILE}" ]; then
  echo "Environment file not found: ${ENV_FILE}" >&2
  exit 1
fi

if [ ! -f "${PROJECT_DIR}/docker-compose.yml" ]; then
  echo "Compose file not found in ${PROJECT_DIR}." >&2
  exit 1
fi

mkdir -p "${STATE_DIR}"
chmod 700 "${STATE_DIR}"
cd "${PROJECT_DIR}"

set -a
# shellcheck disable=SC1090
. "${ENV_FILE}"
set +a

if [ -z "${DOMAIN:-}" ]; then
  echo "DOMAIN is required in ${ENV_FILE}." >&2
  exit 1
fi

exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  echo "Another Seedshop Template release is already running." >&2
  exit 1
fi

case "${1:-}" in
  deploy)
    [ "$#" -eq 4 ] || usage
    deploy_release "$2" "$3" "$4"
    ;;
  rollback)
    [ "$#" -eq 1 ] || usage
    rollback_release
    ;;
  *)
    usage
    ;;
esac
