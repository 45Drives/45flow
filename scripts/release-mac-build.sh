#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-${ROOT_DIR}/scripts/.env.release}"

truthy() {
  local v="${1:-}"
  [[ "$v" == "1" || "$v" == "true" || "$v" == "TRUE" || "$v" == "yes" || "$v" == "YES" ]]
}

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE (copy from scripts/.env.release.example)" >&2
  exit 1
fi

# Preserve direct runtime override (e.g. MAC_BUILD_KIND=x64 bash ...).
MAC_BUILD_KIND_RUNTIME_SET=0
MAC_BUILD_KIND_RUNTIME_VALUE=""
if [[ -n "${MAC_BUILD_KIND+x}" ]]; then
  MAC_BUILD_KIND_RUNTIME_SET=1
  MAC_BUILD_KIND_RUNTIME_VALUE="${MAC_BUILD_KIND}"
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

# Apply runtime overrides after sourcing env file.
if [[ "$MAC_BUILD_KIND_RUNTIME_SET" == "1" ]]; then
  MAC_BUILD_KIND="$MAC_BUILD_KIND_RUNTIME_VALUE"
  export MAC_BUILD_KIND
fi

# Allow orchestrator/runtime override even when ENV_FILE defines MAC_BUILD_KIND.
if [[ -n "${MAC_BUILD_KIND_OVERRIDE:-}" ]]; then
  MAC_BUILD_KIND="$MAC_BUILD_KIND_OVERRIDE"
  export MAC_BUILD_KIND
fi

cd "$ROOT_DIR"

# Ensure node exists in non-interactive SSH shells (nvm/homebrew/common paths)
if ! command -v node >/dev/null 2>&1; then
  if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
    # shellcheck disable=SC1090
    source "$HOME/.nvm/nvm.sh"
    nvm use --silent >/dev/null 2>&1 || true
  fi
fi

if ! command -v node >/dev/null 2>&1; then
  for p in /opt/homebrew/bin/node /usr/local/bin/node /usr/bin/node; do
    if [[ -x "$p" ]]; then
      export PATH="$(dirname "$p"):$PATH"
      break
    fi
  done
fi

if ! command -v node >/dev/null 2>&1; then
  echo "node: command not found on mac build host" >&2
  echo "Install Node or make it available in PATH for non-interactive shells." >&2
  exit 1
fi

VERSION="$(node -p "require('./package.json').version")"
STAMP="$(date +%Y%m%d-%H%M%S)"
BUNDLE_TAG="${BUNDLE_TAG_OVERRIDE:-mac-${MAC_BUILD_KIND}-${VERSION}-${STAMP}}"

REMOTE_DIR="${SIGN_INBOX}/${BUNDLE_TAG}"

SSH_OPTS=(
  -o BatchMode=yes
  -o PreferredAuthentications=publickey
  -o PasswordAuthentication=no
  -o KbdInteractiveAuthentication=no
)

# SSH multiplexing can fail with stale control sockets (e.g. "master hello exchange failed").
# Keep it opt-in for reliability.
if truthy "${SSH_USE_MUX:-0}"; then
  SSH_OPTS+=(
    -o ControlMaster=auto
    -o ControlPersist=5m
    -o ControlPath="$HOME/.ssh/cm-%r@%h:%p"
  )
fi

SSH=(ssh "${SSH_OPTS[@]}")
RSYNC_SSH=(ssh "${SSH_OPTS[@]}")

echo "Build tag: $BUNDLE_TAG"
echo "BUNDLE_TAG=$BUNDLE_TAG"

if ! truthy "${MAC_SKIP_BUILD:-0}"; then
  echo "Building macOS (${MAC_BUILD_KIND}) unsigned..."
  rm -rf dist/mac-universal dist/mac-arm64 dist/mac-x64 dist/sign-stage || true
else
  echo "MAC_SKIP_BUILD=1; skipping build, using existing app bundle for (${MAC_BUILD_KIND})."
fi

resolve_app_path() {
  local kind="$1"
  local builder_product_name
  local -a candidate_dirs=()
  local -a candidate_names=()
  local -a discovered_apps=()

  case "$kind" in
    universal) candidate_dirs=("${ROOT_DIR}/dist/mac-universal") ;;
    arm64) candidate_dirs=("${ROOT_DIR}/dist/mac-arm64") ;;
    x64) candidate_dirs=("${ROOT_DIR}/dist/mac" "${ROOT_DIR}/dist/mac-x64") ;;
    *) return 1 ;;
  esac

  if [[ -n "${APP_PRODUCT_FILENAME:-}" ]]; then
    candidate_names+=("${APP_PRODUCT_FILENAME}")
  fi

  builder_product_name="$(
    node -e "const b=require('./electron-builder.json'); console.log((b.mac&&b.mac.productName)||b.productName||'')"
  )"
  if [[ -n "$builder_product_name" ]]; then
    candidate_names+=("$builder_product_name")
  fi

  for dir in "${candidate_dirs[@]}"; do
    for name in "${candidate_names[@]}"; do
      if [[ -d "${dir}/${name}.app" ]]; then
        printf '%s\n' "${dir}/${name}.app"
        return 0
      fi
    done

    shopt -s nullglob
    discovered_apps=("${dir}/"*.app)
    shopt -u nullglob
    if [[ "${#discovered_apps[@]}" -eq 1 ]]; then
      printf '%s\n' "${discovered_apps[0]}"
      return 0
    fi
  done

  return 1
}

if ! truthy "${MAC_SKIP_BUILD:-0}"; then
  LOCK_HASH="$(cat yarn.lock package.json 2>/dev/null | shasum -a 256 | cut -d' ' -f1)"
  HASH_CACHE="node_modules/.yarn-install-hash"
  if [[ -f "$HASH_CACHE" ]] && [[ "$(cat "$HASH_CACHE" 2>/dev/null)" == "$LOCK_HASH" ]]; then
    echo "Dependencies unchanged, skipping yarn install (macOS)."
  else
    echo "Running yarn install (macOS)..."
    yarn install --frozen-lockfile
    printf '%s' "$LOCK_HASH" > "$HASH_CACHE"
  fi
  if [[ "${MAC_BUILD_KIND}" == "universal" ]]; then
    CSC_IDENTITY_AUTO_DISCOVERY=false SKIP_AFTER_SIGN=1 yarn mac:dir:universal
  elif [[ "${MAC_BUILD_KIND}" == "arm64" ]]; then
    CSC_IDENTITY_AUTO_DISCOVERY=false SKIP_AFTER_SIGN=1 yarn mac:dir:arm64
  elif [[ "${MAC_BUILD_KIND}" == "x64" ]]; then
    CSC_IDENTITY_AUTO_DISCOVERY=false SKIP_AFTER_SIGN=1 yarn mac:dir:x64
  else
    echo "MAC_BUILD_KIND must be 'arm64', 'x64', or 'universal'" >&2
    exit 1
  fi
fi

APP_PATH="$(resolve_app_path "${MAC_BUILD_KIND}" || true)"
if [[ -z "$APP_PATH" || ! -d "$APP_PATH" ]]; then
  echo "Missing app bundle for kind '${MAC_BUILD_KIND}'." >&2
  echo "Tried APP_PRODUCT_FILENAME='${APP_PRODUCT_FILENAME:-}' and productName from electron-builder.json." >&2
  exit 1
fi

echo "Shipping to signing Mac: ${SIGN_USER}@${SIGN_HOST}:${REMOTE_DIR}"
"${SSH[@]}" "${SIGN_USER}@${SIGN_HOST}" "mkdir -p '$REMOTE_DIR'"

rsync -a --delete -e "${RSYNC_SSH[*]}" \
  "$APP_PATH" \
  "${SIGN_USER}@${SIGN_HOST}:${REMOTE_DIR}/"

rsync -a -e "${RSYNC_SSH[*]}" \
  "${ROOT_DIR}/${ENTITLEMENTS_FILE}" \
  "${SIGN_USER}@${SIGN_HOST}:${SIGN_INBOX}/${ENTITLEMENTS_FILE}"

SIGN_GIT_SSH_CMD="ssh -o BatchMode=yes -o ConnectTimeout=20"
SIGN_GIT_PULL_CMD="${SIGN_GIT_PULL_CMD:-cd '${SIGN_INBOX}' && GIT_SSH_COMMAND=\"${SIGN_GIT_SSH_CMD}\" git pull --ff-only}"
echo "Updating signing host repo..."
SIGN_GIT_PULL_CMD_ESCAPED="$(printf '%q' "$SIGN_GIT_PULL_CMD")"
# fail fast instead of hanging if GitHub auth can't proceed non-interactively on the signing host
"${SSH[@]}" "${SIGN_USER}@${SIGN_HOST}" "bash -lc $SIGN_GIT_PULL_CMD_ESCAPED"

echo "Trigger signing/notarization on Intel..."
"${SSH[@]}" "${SIGN_USER}@${SIGN_HOST}" \
  "bash -lc '\"${SIGN_INBOX}/scripts/sign-mac-on-intel.sh\" \"$BUNDLE_TAG\"'"

INTEL_OUT_DIR="${SIGN_OUTPUT_DIR%/}/${BUNDLE_TAG}"
SYNC_SIGNED_BACK_TO_ARM="${SYNC_SIGNED_BACK_TO_ARM:-1}"
ARM_SIGNED_OUTPUT_DIR_TEMPLATE="${ARM_SIGNED_OUTPUT_DIR:-${ROOT_DIR}/Mac-signed/__BUNDLE_TAG__/}"
ARM_SIGNED_OUTPUT_DIR_EFFECTIVE="${ARM_SIGNED_OUTPUT_DIR_TEMPLATE//__BUNDLE_TAG__/${BUNDLE_TAG}}"
ARM_SIGNED_OUTPUT_DIR_EFFECTIVE="${ARM_SIGNED_OUTPUT_DIR_EFFECTIVE%/}"

echo "Signed artifacts are on Intel Mac under: ${INTEL_OUT_DIR}"

if truthy "$SYNC_SIGNED_BACK_TO_ARM"; then
  mkdir -p "${ARM_SIGNED_OUTPUT_DIR_EFFECTIVE}"
  echo "Syncing signed artifacts back to ARM host path: ${ARM_SIGNED_OUTPUT_DIR_EFFECTIVE}"
  RSYNC_MAX_RETRIES="${RSYNC_MAX_RETRIES:-3}"
  RSYNC_RETRY_DELAY="${RSYNC_RETRY_DELAY:-5}"
  _rsync_ok=0
  for _attempt in $(seq 1 "$RSYNC_MAX_RETRIES"); do
    if rsync -a --delete -e "${RSYNC_SSH[*]}" \
      "${SIGN_USER}@${SIGN_HOST}:${INTEL_OUT_DIR}/" \
      "${ARM_SIGNED_OUTPUT_DIR_EFFECTIVE}/"; then
      _rsync_ok=1
      break
    fi
    echo "rsync failed (attempt ${_attempt}/${RSYNC_MAX_RETRIES}). Retrying in ${RSYNC_RETRY_DELAY}s..." >&2
    sleep "$RSYNC_RETRY_DELAY"
  done
  if [[ "$_rsync_ok" -ne 1 ]]; then
    echo "rsync from Intel Mac failed after ${RSYNC_MAX_RETRIES} attempts." >&2
    echo "Artifacts remain on Intel Mac at: ${INTEL_OUT_DIR}" >&2
    exit 1
  fi
  echo "Synced signed artifacts to ARM host path: ${ARM_SIGNED_OUTPUT_DIR_EFFECTIVE}"
else
  echo "SYNC_SIGNED_BACK_TO_ARM=0; skipping Intel -> ARM artifact sync."
fi

echo "Done."
