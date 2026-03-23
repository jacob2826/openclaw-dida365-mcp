#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOCAL_CONFIG="${SOURCE_DIR}/.sync-git.local"

if [[ -f "${LOCAL_CONFIG}" ]]; then
  # shellcheck source=/dev/null
  source "${LOCAL_CONFIG}"
fi

TARGET_DIR="${1:-${TARGET_DIR:-}}"
LOCAL_PATH_PREFIX="${LOCAL_PATH_PREFIX:-}"

if [[ -z "${TARGET_DIR}" ]]; then
  echo "TARGET_DIR is required. Set it in .sync-git.local or pass it as the first argument." >&2
  exit 1
fi

mkdir -p "${TARGET_DIR}"

rsync -a --delete --delete-excluded \
  --exclude '.git/' \
  --exclude 'node_modules/' \
  --exclude 'dist/' \
  --exclude 'coverage/' \
  --exclude '.sync-git.local' \
  --exclude '.DS_Store' \
  "${SOURCE_DIR}/" "${TARGET_DIR}/"

find "${TARGET_DIR}" -name '.DS_Store' -delete

LOCAL_PATH_PREFIX="${LOCAL_PATH_PREFIX}" \
  node "${SOURCE_DIR}/scripts/scan-sensitive.mjs" "${TARGET_DIR}"

echo "Synced sanitized publish mirror to ${TARGET_DIR}"
