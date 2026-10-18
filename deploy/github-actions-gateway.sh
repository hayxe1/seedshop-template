#!/bin/sh
set -eu
set -f
export LC_ALL=C

PROJECT_DIR="${PROJECT_DIR:-/opt/seedshop-template}"
release_command="${PROJECT_DIR}/deploy/release-vps.sh"
original_command="${SSH_ORIGINAL_COMMAND:-}"

if [ ! -x "${release_command}" ]; then
  echo "Production release command is unavailable." >&2
  exit 1
fi

if [ "${original_command}" = "rollback" ]; then
  exec "${release_command}" rollback
fi

if [ "$(printf '%s' "${original_command}" | wc -l)" -ne 0 ] || \
  ! printf '%s' "${original_command}" | \
    grep -Eq '^deploy sha256:[0-9a-f]{64} [0-9a-f]{40} [A-Za-z0-9][A-Za-z0-9-]{0,38}$'; then
  echo "Unsupported production deployment command." >&2
  exit 1
fi

IFS=' '
set -- ${original_command}
exec "${release_command}" "$1" "$2" "$3" "$4"
