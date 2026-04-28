#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEFAULT_ENV_FILE="${ROOT_DIR}/scripts/release/.env.orchestrator"

ENV_FILE="${ORCH_ENV_FILE:-$DEFAULT_ENV_FILE}"
CLI_GH_TAG_MESSAGE=""
CLI_GH_NOTES=""
CLI_GH_TITLE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file|-e)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for $1" >&2
        exit 1
      fi
      ENV_FILE="$2"
      shift 2
      ;;
    --git-tag-message|-m)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for $1" >&2
        exit 1
      fi
      CLI_GH_TAG_MESSAGE="$2"
      shift 2
      ;;
    --release-notes|-n)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for $1" >&2
        exit 1
      fi
      CLI_GH_NOTES="$2"
      shift 2
      ;;
    --release-title|-t)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for $1" >&2
        exit 1
      fi
      CLI_GH_TITLE="$2"
      shift 2
      ;;
    --help|-h)
      cat <<'USAGE'
Usage: bash scripts/release/orchestrate-release.sh [--env-file ENV_FILE] [--git-tag-message MESSAGE] [--release-notes NOTES] [--release-title TITLE]
       bash scripts/release/orchestrate-release.sh [ENV_FILE]

Options:
  -e, --env-file          Path to orchestrator env file.
  -m, --git-tag-message   Override GH_TAG_MESSAGE for this run only.
  -n, --release-notes     Override GH_NOTES for this run only.
  -t, --release-title     Override GH_TITLE for this run only.
  -h, --help              Show this help.
USAGE
      exit 0
      ;;
    -*)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
    *)
      if [[ "$ENV_FILE" == "${ORCH_ENV_FILE:-$DEFAULT_ENV_FILE}" ]]; then
        ENV_FILE="$1"
      else
        echo "Unexpected argument: $1" >&2
        exit 1
      fi
      shift
      ;;
  esac
done

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing orchestrator env file: $ENV_FILE" >&2
  echo "Copy from scripts/release/.env.orchestrator.example" >&2
  exit 1
fi

# Preserve runtime env overrides so they win over values in ENV_FILE.
RUNTIME_OVERRIDE_KEYS=(
  RUN_LINUX_BUILD
  RUN_MAC_BUILD
  RUN_WINDOWS_BUILD
  WIN_PHASE
  MAC_BUILD_KIND
  MAC_PHASE
  RELEASE_VERSION
  RELEASE_TAG
  RELEASE_STAGING_DIR
  RELEASE_BUILDS_DIR
  GH_CREATE_DRAFT
  GH_UPLOAD_RELEASE
  GH_PUBLISH_RELEASE
  GH_TITLE
  GH_TAG_MESSAGE
  GH_NOTES
)
declare -A RUNTIME_OVERRIDES=()
for _k in "${RUNTIME_OVERRIDE_KEYS[@]}"; do
  if [[ -n "${!_k+x}" ]]; then
    RUNTIME_OVERRIDES["$_k"]="${!_k}"
  fi
done
if [[ -n "$CLI_GH_TAG_MESSAGE" ]]; then
  RUNTIME_OVERRIDES["GH_TAG_MESSAGE"]="$CLI_GH_TAG_MESSAGE"
fi
if [[ -n "$CLI_GH_NOTES" ]]; then
  RUNTIME_OVERRIDES["GH_NOTES"]="$CLI_GH_NOTES"
fi
if [[ -n "$CLI_GH_TITLE" ]]; then
  RUNTIME_OVERRIDES["GH_TITLE"]="$CLI_GH_TITLE"
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

for _k in "${!RUNTIME_OVERRIDES[@]}"; do
  printf -v "$_k" '%s' "${RUNTIME_OVERRIDES[$_k]}"
  export "$_k"
done

cd "$ROOT_DIR"

# Backward-compatible aliases (old single-host vars -> new split vars)
WIN_BUILD_HOST="${WIN_BUILD_HOST:-${WIN_HOST:-}}"
WIN_BUILD_PORT="${WIN_BUILD_PORT:-${WIN_PORT:-22}}"
WIN_BUILD_USER="${WIN_BUILD_USER:-${WIN_USER:-}}"
WIN_BUILD_PASSWORD="${WIN_BUILD_PASSWORD:-${WIN_PASSWORD:-}}"
WIN_BUILD_REMOTE_DIR="${WIN_BUILD_REMOTE_DIR:-${WIN_REMOTE_DIR:-45flow-premium-dev}}"
WIN_BUILD_PREPARE_CMD="${WIN_BUILD_PREPARE_CMD:-${WIN_PREPARE_CMD:-}}"
WIN_BUILD_CMD="${WIN_BUILD_CMD:-cd ${WIN_BUILD_REMOTE_DIR} && yarn install && yarn build:win}"
WIN_BUILD_EXE_GLOB="${WIN_BUILD_EXE_GLOB:-${WIN_EXE_GLOB:-${WIN_BUILD_REMOTE_DIR}/dist/*-win-*.exe}}"
WIN_BUILD_DIST_DIR="${WIN_BUILD_DIST_DIR:-${WIN_BUILD_REMOTE_DIR%/}/dist/}"
WIN_BUILD_DISABLE_SIGN="${WIN_BUILD_DISABLE_SIGN:-1}"
WIN_BUILD_NO_SIGN_PREFIX="${WIN_BUILD_NO_SIGN_PREFIX:-set CSC_IDENTITY_AUTO_DISCOVERY=false&& set CSC_LINK=&& set CSC_KEY_PASSWORD=&& set WIN_CSC_LINK=&& set WIN_CSC_KEY_PASSWORD=&& set CSC_NAME=&& set WIN_CSC_NAME=&& }"
WIN_BUILD_NO_SIGN_PREFIX_POSIX="${WIN_BUILD_NO_SIGN_PREFIX_POSIX:-CSC_IDENTITY_AUTO_DISCOVERY=false CSC_LINK= CSC_KEY_PASSWORD= WIN_CSC_LINK= WIN_CSC_KEY_PASSWORD= CSC_NAME= WIN_CSC_NAME= }"

WIN_SIGN_WIN_DIR="${WIN_SIGN_WIN_DIR:-}"

truthy() {
  local v="${1:-}"
  [[ "$v" == "1" || "$v" == "true" || "$v" == "TRUE" || "$v" == "yes" || "$v" == "YES" ]]
}

require_cmd() {
  local c="$1"
  command -v "$c" >/dev/null 2>&1 || {
    echo "Required command not found: $c" >&2
    exit 1
  }
}

require_cmd ssh
require_cmd scp
require_cmd rsync
require_cmd node
require_cmd yarn

PACKAGE_VERSION="$(node -p "require('./package.json').version")"
VERSION="$PACKAGE_VERSION"
if [[ -n "${RELEASE_VERSION:-}" && "${RELEASE_VERSION}" != "$PACKAGE_VERSION" ]]; then
  echo "RELEASE_VERSION (${RELEASE_VERSION}) does not match package.json (${PACKAGE_VERSION}); using package.json version." >&2
fi
RELEASE_TAG_RAW="${RELEASE_TAG:-v__VERSION__}"
RELEASE_TAG="${RELEASE_TAG_RAW//__VERSION__/${VERSION}}"
RELEASE_TAG="${RELEASE_TAG//$'\r'/}"
STAMP="$(date +%Y%m%d-%H%M%S)"
STAGING_DIR_RAW="${RELEASE_STAGING_DIR:-${ROOT_DIR}/builds/release/__VERSION__}"
STAGING_DIR="${STAGING_DIR_RAW//__VERSION__/${VERSION}}"
RELEASE_BUILDS_DIR_RAW="${RELEASE_BUILDS_DIR:-}"
if [[ -z "$RELEASE_BUILDS_DIR_RAW" ]]; then
  RELEASE_BUILDS_DIR="$STAGING_DIR"
else
  RELEASE_BUILDS_DIR="${RELEASE_BUILDS_DIR_RAW//__VERSION__/${VERSION}}"
  RELEASE_BUILDS_DIR_NORMALIZED="${RELEASE_BUILDS_DIR%/}"
  if [[ "$RELEASE_BUILDS_DIR_NORMALIZED" == "./builds/release" || "$RELEASE_BUILDS_DIR_NORMALIZED" == "${ROOT_DIR}/builds/release" ]]; then
    RELEASE_BUILDS_DIR="$STAGING_DIR"
  fi
fi

mkdir -p "$STAGING_DIR"/{linux,windows,mac}
mkdir -p "$RELEASE_BUILDS_DIR"

SSH_STRICT_OPTS=(
  -o StrictHostKeyChecking=no
  -o UserKnownHostsFile=/dev/null
  -o ConnectTimeout=20
  -o ServerAliveInterval=20
  -o ServerAliveCountMax=4
)

needs_sshpass=0
for p in "${WIN_BUILD_PASSWORD:-}" "${MAC_ARM_PASSWORD:-}" "${MAC_FETCH_PASSWORD:-}" "${MAC_SIGN_PASSWORD:-}"; do
  if [[ -n "${p:-}" ]]; then
    needs_sshpass=1
    break
  fi
done
if [[ "$needs_sshpass" == "1" ]]; then
  require_cmd sshpass
fi

ssh_run() {
  local host="$1" user="$2" pass="$3" port="$4" cmd="$5"
  if [[ -n "$pass" ]]; then
    sshpass -p "$pass" ssh "${SSH_STRICT_OPTS[@]}" -p "$port" -l "$user" "$host" "$cmd"
  else
    ssh "${SSH_STRICT_OPTS[@]}" -p "$port" -l "$user" "$host" "$cmd"
  fi
}

rsync_to() {
  local host="$1" user="$2" pass="$3" port="$4" src="$5" dest="$6"
  local excludes="${RSYNC_EXCLUDES:-}"
  local delete_flag=()
  if truthy "${RSYNC_DELETE:-0}"; then
    delete_flag=(--delete)
  fi
  local ssh_user_escaped
  ssh_user_escaped="$(printf '%q' "$user")"
  if [[ -n "$pass" ]]; then
    sshpass -p "$pass" rsync -az "${delete_flag[@]}" \
      -e "ssh -p $port -l $ssh_user_escaped ${SSH_STRICT_OPTS[*]}" \
      $excludes \
      "$src" "${host}:$dest"
  else
    rsync -az "${delete_flag[@]}" \
      -e "ssh -p $port -l $ssh_user_escaped ${SSH_STRICT_OPTS[*]}" \
      $excludes \
      "$src" "${host}:$dest"
  fi
}

rsync_from() {
  local host="$1" user="$2" pass="$3" port="$4" src="$5" dest="$6"
  local ssh_user_escaped
  ssh_user_escaped="$(printf '%q' "$user")"
  if [[ -n "$pass" ]]; then
    sshpass -p "$pass" rsync -az \
      -e "ssh -p $port -l $ssh_user_escaped ${SSH_STRICT_OPTS[*]}" \
      "${host}:$src" "$dest"
  else
    rsync -az \
      -e "ssh -p $port -l $ssh_user_escaped ${SSH_STRICT_OPTS[*]}" \
      "${host}:$src" "$dest"
  fi
}

scp_from_file() {
  local host="$1" user="$2" pass="$3" port="$4" remote_file="$5" local_file="$6"
  local remote_file_escaped="${remote_file// /\\ }"
  local remote_spec="${host}:${remote_file_escaped}"
  local user_ssh_opt="${user// /\\ }"
  if [[ -n "$pass" ]]; then
    sshpass -p "$pass" scp "${SSH_STRICT_OPTS[@]}" -o "User=${user_ssh_opt}" -P "$port" "$remote_spec" "$local_file"
  else
    scp "${SSH_STRICT_OPTS[@]}" -o "User=${user_ssh_opt}" -P "$port" "$remote_spec" "$local_file"
  fi
}

copy_to_release_builds() {
  if [[ "$RELEASE_BUILDS_DIR" == "$STAGING_DIR" ]]; then
    return
  fi
  local file
  for file in "$@"; do
    [[ -f "$file" ]] || continue
    cp -f "$file" "$RELEASE_BUILDS_DIR/"
  done
}

generate_update_metadata() {
  local output

  mkdir -p "$STAGING_DIR/windows" "$STAGING_DIR/mac" "$STAGING_DIR/linux"

  mapfile -t win_exes < <(find "$STAGING_DIR/windows" -maxdepth 3 -type f -name "*${VERSION}*win*.exe" | sort)
  if [[ "${#win_exes[@]}" -eq 0 ]]; then
    mapfile -t win_exes < <(find "$STAGING_DIR/windows" -maxdepth 3 -type f -name "*win*.exe" | sort)
  fi
  mapfile -t win_blockmaps < <(find "$STAGING_DIR/windows" -maxdepth 3 -type f -name "*.exe.blockmap" | sort)
  if [[ "${#win_exes[@]}" -gt 0 ]]; then
    output="$STAGING_DIR/windows/latest.yml"
    win_gen=(node "$ROOT_DIR/scripts/release/generate-update-yml.mjs" --version "$VERSION" --output "$output")
    for f in "${win_exes[@]}" "${win_blockmaps[@]}"; do
      win_gen+=(--file "$f")
    done
    "${win_gen[@]}"
    copy_to_release_builds "$output"
  fi

  mapfile -t mac_zips < <(find "$STAGING_DIR/mac" -maxdepth 4 -type f -name "*${VERSION}*mac*.zip" | sort)
  if [[ "${#mac_zips[@]}" -eq 0 ]]; then
    mapfile -t mac_zips < <(find "$STAGING_DIR/mac" -maxdepth 4 -type f -name "*mac*.zip" | sort)
  fi
  mapfile -t mac_dmgs < <(find "$STAGING_DIR/mac" -maxdepth 4 -type f -name "*${VERSION}*mac*.dmg" | sort)
  if [[ "${#mac_dmgs[@]}" -eq 0 ]]; then
    mapfile -t mac_dmgs < <(find "$STAGING_DIR/mac" -maxdepth 4 -type f -name "*mac*.dmg" | sort)
  fi
  mapfile -t mac_blockmaps < <(find "$STAGING_DIR/mac" -maxdepth 4 -type f \( -name "*.zip.blockmap" -o -name "*.dmg.blockmap" \) | sort)
  if [[ "${#mac_zips[@]}" -gt 0 ]]; then
    output="$STAGING_DIR/mac/latest-mac.yml"
    mac_primary_zip="$(basename "${mac_zips[0]}")"
    mac_gen=(
      node "$ROOT_DIR/scripts/release/generate-update-yml.mjs"
      --version "$VERSION"
      --output "$output"
      --path "$mac_primary_zip"
    )
    for f in "${mac_zips[@]}" "${mac_dmgs[@]}" "${mac_blockmaps[@]}"; do
      mac_gen+=(--file "$f")
    done
    "${mac_gen[@]}"
    copy_to_release_builds "$output"
  fi

  mapfile -t linux_debs < <(find "$STAGING_DIR/linux" -maxdepth 2 -type f -name "*${VERSION}*linux*.deb" | sort)
  if [[ "${#linux_debs[@]}" -eq 0 ]]; then
    mapfile -t linux_debs < <(find "$STAGING_DIR/linux" -maxdepth 2 -type f -name "*linux*.deb" | sort)
  fi
  mapfile -t linux_rpms < <(find "$STAGING_DIR/linux" -maxdepth 2 -type f -name "*${VERSION}*linux*.rpm" | sort)
  if [[ "${#linux_rpms[@]}" -eq 0 ]]; then
    mapfile -t linux_rpms < <(find "$STAGING_DIR/linux" -maxdepth 2 -type f -name "*linux*.rpm" | sort)
  fi
  mapfile -t linux_appimages < <(find "$STAGING_DIR/linux" -maxdepth 2 -type f -name "*${VERSION}*linux*.AppImage" | sort)
  if [[ "${#linux_appimages[@]}" -eq 0 ]]; then
    mapfile -t linux_appimages < <(find "$STAGING_DIR/linux" -maxdepth 2 -type f -name "*linux*.AppImage" | sort)
  fi
  if [[ "${#linux_debs[@]}" -gt 0 || "${#linux_rpms[@]}" -gt 0 || "${#linux_appimages[@]}" -gt 0 ]]; then
    output="$STAGING_DIR/linux/latest-linux.yml"
    linux_gen=(node "$ROOT_DIR/scripts/release/generate-update-yml.mjs" --version "$VERSION" --output "$output")
    for f in "${linux_debs[@]}" "${linux_rpms[@]}" "${linux_appimages[@]}"; do
      linux_gen+=(--file "$f")
    done
    "${linux_gen[@]}"
    copy_to_release_builds "$output"
  fi
}

echo "Release version: $VERSION"
echo "Release tag: $RELEASE_TAG"
echo "Staging dir: $STAGING_DIR"
echo "Release builds dir: $RELEASE_BUILDS_DIR"

if truthy "${RUN_LINUX_BUILD:-1}"; then
  echo "== Linux build =="
  LINUX_CLEAN_OUTPUTS="${LINUX_CLEAN_OUTPUTS:-1}"

  if truthy "$LINUX_CLEAN_OUTPUTS"; then
    shopt -s nullglob
    stale_dist_linux=(dist/*-linux-*.deb dist/*-linux-*.rpm dist/*-linux-*.AppImage)
    if [[ "${#stale_dist_linux[@]}" -gt 0 ]]; then
      rm -f -- "${stale_dist_linux[@]}"
    fi
    shopt -u nullglob
  fi

  LINUX_GIT_PULL_CMD="${LINUX_GIT_PULL_CMD:-git pull --ff-only}"
  bash -lc "$LINUX_GIT_PULL_CMD"
  echo "Running yarn install (Linux)..."
  yarn install
  LINUX_BUILD_CMD="${LINUX_BUILD_CMD:-yarn build:linux}"
  bash -lc "$LINUX_BUILD_CMD"

  if truthy "$LINUX_CLEAN_OUTPUTS"; then
    shopt -s nullglob
    stale_staging_linux=("$STAGING_DIR/linux/"*.deb "$STAGING_DIR/linux/"*.rpm "$STAGING_DIR/linux/"*.AppImage)
    if [[ "${#stale_staging_linux[@]}" -gt 0 ]]; then
      rm -f -- "${stale_staging_linux[@]}"
    fi
    if [[ "$RELEASE_BUILDS_DIR" != "$STAGING_DIR" ]]; then
      stale_release_linux=("$RELEASE_BUILDS_DIR/"*-linux-*.deb "$RELEASE_BUILDS_DIR/"*-linux-*.rpm "$RELEASE_BUILDS_DIR/"*-linux-*.AppImage)
      if [[ "${#stale_release_linux[@]}" -gt 0 ]]; then
        rm -f -- "${stale_release_linux[@]}"
      fi
    fi
    shopt -u nullglob
  fi

  shopt -s nullglob
  linux_artifacts=(dist/*"${VERSION}"*-linux-*.deb dist/*"${VERSION}"*-linux-*.rpm dist/*"${VERSION}"*-linux-*.AppImage)
  if [[ "${#linux_artifacts[@]}" -eq 0 ]]; then
    linux_artifacts=(dist/*-linux-*.deb dist/*-linux-*.rpm dist/*-linux-*.AppImage)
  fi
  if [[ "${#linux_artifacts[@]}" -eq 0 ]]; then
    echo "No Linux artifacts found in dist/" >&2
    exit 1
  fi
  cp -f "${linux_artifacts[@]}" "$STAGING_DIR/linux/"
  copy_to_release_builds "${linux_artifacts[@]}"
  shopt -u nullglob
fi

run_windows_flow() {
  if ! truthy "${RUN_WINDOWS_BUILD:-1}"; then
    return
  fi
  echo "== Windows build/sign =="
  WIN_PHASE="${WIN_PHASE:-stage}" # stage | finalize
  case "$WIN_PHASE" in
    stage|finalize) ;;
    auto)
      echo "WIN_PHASE=auto is deprecated; using WIN_PHASE=stage (manual signing flow)." >&2
      WIN_PHASE="stage"
      ;;
    *)
      echo "WIN_PHASE must be one of: stage, finalize (got '$WIN_PHASE')" >&2
      exit 1
      ;;
  esac

  : "${WIN_BUILD_HOST:?WIN_BUILD_HOST is required when RUN_WINDOWS_BUILD=1}"
  : "${WIN_BUILD_USER:?WIN_BUILD_USER is required when RUN_WINDOWS_BUILD=1}"
  : "${WIN_SIGN_WIN_DIR:?WIN_SIGN_WIN_DIR is required when RUN_WINDOWS_BUILD=1}"

  if [[ "$WIN_PHASE" == "stage" ]] && (truthy "${GH_UPLOAD_RELEASE:-0}" || truthy "${GH_PUBLISH_RELEASE:-0}"); then
    echo "WIN_PHASE=stage cannot run with GH upload/publish enabled." >&2
    echo "Disable GH_UPLOAD_RELEASE/GH_PUBLISH_RELEASE or run WIN_PHASE=finalize." >&2
    exit 1
  fi

  WIN_BUILD_MODE="${WIN_BUILD_MODE:-git}" # git | rsync
  WIN_BUILD_GIT_PULL_CMD="${WIN_BUILD_GIT_PULL_CMD:-cd ${WIN_BUILD_REMOTE_DIR} && git pull --ff-only}"
  WIN_BUILD_CMD="${WIN_BUILD_CMD:-cd ${WIN_BUILD_REMOTE_DIR} && yarn install && yarn build:win}"
  WIN_BUILD_EXE_GLOB="${WIN_BUILD_EXE_GLOB:-${WIN_BUILD_REMOTE_DIR}/dist/*-win-*.exe}"
  WIN_BUILD_DIST_DIR_WIN="${WIN_BUILD_DIST_DIR_WIN:-${WIN_BUILD_DIST_DIR:-${WIN_BUILD_REMOTE_DIR}\\dist}}"
  WIN_BUILD_DIST_DIR_WIN="${WIN_BUILD_DIST_DIR_WIN%\\}"
  WIN_BUILD_DIST_DIR_WIN="${WIN_BUILD_DIST_DIR_WIN%/}"

  mkdir -p "$STAGING_DIR/windows/unsigned" "$STAGING_DIR/windows/signed"

  if [[ "$WIN_PHASE" != "finalize" ]]; then
    ssh_run "$WIN_BUILD_HOST" "$WIN_BUILD_USER" "${WIN_BUILD_PASSWORD:-}" "$WIN_BUILD_PORT" "$WIN_BUILD_GIT_PULL_CMD"

    if [[ "$WIN_BUILD_MODE" == "rsync" ]]; then
      if [[ -n "${WIN_BUILD_PREPARE_CMD:-}" ]]; then
        ssh_run "$WIN_BUILD_HOST" "$WIN_BUILD_USER" "${WIN_BUILD_PASSWORD:-}" "$WIN_BUILD_PORT" "$WIN_BUILD_PREPARE_CMD"
      fi
      RSYNC_EXCLUDES="--exclude=.git --exclude=dist --exclude=builds --exclude=node_modules --exclude=.env*"
      RSYNC_DELETE=1
      rsync_to "$WIN_BUILD_HOST" "$WIN_BUILD_USER" "${WIN_BUILD_PASSWORD:-}" "$WIN_BUILD_PORT" "${ROOT_DIR}/" "${WIN_BUILD_REMOTE_DIR}/"
      RSYNC_DELETE=0
    fi

    WIN_BUILD_CMD_EFFECTIVE="$WIN_BUILD_CMD"
    if truthy "${WIN_BUILD_DISABLE_SIGN:-1}"; then
      if [[ "$WIN_BUILD_CMD" =~ ^[[:space:]]*cmd\.exe[[:space:]]+/c[[:space:]]+\"(.*)\"[[:space:]]*$ ]]; then
        WIN_BUILD_CMD_INNER="${BASH_REMATCH[1]}"
        WIN_BUILD_CMD_EFFECTIVE="cmd.exe /c \"${WIN_BUILD_NO_SIGN_PREFIX}${WIN_BUILD_CMD_INNER}\""
      else
        WIN_BUILD_CMD_EFFECTIVE="${WIN_BUILD_NO_SIGN_PREFIX_POSIX}${WIN_BUILD_CMD}"
      fi
    fi
    ssh_run "$WIN_BUILD_HOST" "$WIN_BUILD_USER" "${WIN_BUILD_PASSWORD:-}" "$WIN_BUILD_PORT" "$WIN_BUILD_CMD_EFFECTIVE"

    WIN_UNSIGNED_EXE_REMOTE_WIN="$(ssh_run "$WIN_BUILD_HOST" "$WIN_BUILD_USER" "${WIN_BUILD_PASSWORD:-}" "$WIN_BUILD_PORT" \
      "powershell -NoProfile -Command \"\$f = Get-ChildItem -LiteralPath '${WIN_BUILD_DIST_DIR_WIN}' -Filter *.exe -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1; if (-not \$f) { Write-Error 'No unsigned Windows EXE found'; exit 44 }; Write-Output \$f.FullName\"")"
    WIN_UNSIGNED_EXE_REMOTE_WIN="$(printf '%s' "$WIN_UNSIGNED_EXE_REMOTE_WIN" | tr -d '\r')"
    WIN_SIGN_BASENAME="$(printf '%s' "$WIN_UNSIGNED_EXE_REMOTE_WIN" | sed -E 's#.*[\\/]##')"

    WIN_SIGN_INPUT_WIN="${WIN_SIGN_WIN_DIR%\\}\\${WIN_SIGN_BASENAME}"
    ssh_run "$WIN_BUILD_HOST" "$WIN_BUILD_USER" "${WIN_BUILD_PASSWORD:-}" "$WIN_BUILD_PORT" \
      "powershell -NoProfile -Command \"\$dst='${WIN_SIGN_WIN_DIR}'; New-Item -ItemType Directory -Force -Path \$dst | Out-Null; Copy-Item -LiteralPath '${WIN_UNSIGNED_EXE_REMOTE_WIN}' -Destination (Join-Path \$dst '${WIN_SIGN_BASENAME}') -Force\""
  fi

  if [[ "$WIN_PHASE" == "stage" ]]; then
    echo "Windows stage complete. Unsigned EXE copied to manual signing folder."
    echo "Sign manually on the Windows build/sign host, then rerun with WIN_PHASE=finalize."
    echo "Expected input path: ${WIN_SIGN_INPUT_WIN}"
    echo "Resume command:"
    echo "  WIN_PHASE=finalize bash scripts/release/orchestrate-release.sh '${ENV_FILE}'"
    exit 0
  fi

  if [[ "$WIN_PHASE" != "stage" ]]; then
    SIGN_FETCH_INFO="$(ssh_run "$WIN_BUILD_HOST" "$WIN_BUILD_USER" "${WIN_BUILD_PASSWORD:-}" "$WIN_BUILD_PORT" \
      "powershell -NoProfile -Command \"\$sign='${WIN_SIGN_WIN_DIR}'; \$dist='${WIN_BUILD_DIST_DIR_WIN}'; \$f = Get-ChildItem -LiteralPath \$sign -Filter *.exe -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1; if (-not \$f) { Write-Error 'No signed Windows EXE found'; exit 45 }; New-Item -ItemType Directory -Force -Path \$dist | Out-Null; \$safeExe = Join-Path \$dist '__orchestrator_signed.exe'; Copy-Item -LiteralPath \$f.FullName -Destination \$safeExe -Force; \$bmSrc = \"\$([string]\$f.FullName).blockmap\"; \$safeBm = \"\$([string]\$safeExe).blockmap\"; if (\$bmSrc -and (Test-Path -LiteralPath \$bmSrc -ErrorAction SilentlyContinue)) { Copy-Item -LiteralPath \$bmSrc -Destination \$safeBm -Force; Write-Output \"BLOCKMAP=\$safeBm\" } else { Write-Output \"BLOCKMAP=\" }; Write-Output \"EXE=\$safeExe\"; Write-Output \"NAME=\$([string]\$f.Name)\"\"")"
    SIGN_FETCH_INFO="$(printf '%s' "$SIGN_FETCH_INFO" | tr -d '\r')"
    WIN_PRIMARY_EXE_REMOTE_WIN="$(printf '%s\n' "$SIGN_FETCH_INFO" | awk -F= '/^EXE=/{print $2}' | tail -n1)"
    WIN_PRIMARY_BLOCKMAP_REMOTE_WIN="$(printf '%s\n' "$SIGN_FETCH_INFO" | awk -F= '/^BLOCKMAP=/{print $2}' | tail -n1)"
    WIN_PRIMARY_EXE_NAME="$(printf '%s\n' "$SIGN_FETCH_INFO" | awk -F= '/^NAME=/{print $2}' | tail -n1)"
    if [[ -z "$WIN_PRIMARY_EXE_REMOTE_WIN" ]]; then
      echo "Unable to resolve signed Windows EXE path from remote host." >&2
      exit 1
    fi
    if [[ -z "$WIN_PRIMARY_EXE_NAME" ]]; then
      WIN_PRIMARY_EXE_NAME="$(printf '%s' "$WIN_PRIMARY_EXE_REMOTE_WIN" | sed -E 's#.*[\\/]##')"
    fi
    WIN_PRIMARY_EXE_REMOTE_POSIX="${WIN_PRIMARY_EXE_REMOTE_WIN//\\//}"
    WIN_PRIMARY_EXE_LOCAL="$STAGING_DIR/windows/signed/${WIN_PRIMARY_EXE_NAME}"
    scp_from_file "$WIN_BUILD_HOST" "$WIN_BUILD_USER" "${WIN_BUILD_PASSWORD:-}" "$WIN_BUILD_PORT" "$WIN_PRIMARY_EXE_REMOTE_POSIX" "$WIN_PRIMARY_EXE_LOCAL"
    WIN_PRIMARY_EXE="$WIN_PRIMARY_EXE_LOCAL"

    WIN_PRIMARY_BLOCKMAP=""
    if [[ -n "$WIN_PRIMARY_BLOCKMAP_REMOTE_WIN" ]]; then
      WIN_PRIMARY_BLOCKMAP_REMOTE_POSIX="${WIN_PRIMARY_BLOCKMAP_REMOTE_WIN//\\//}"
      WIN_PRIMARY_BLOCKMAP="$STAGING_DIR/windows/signed/${WIN_PRIMARY_EXE_NAME}.blockmap"
      scp_from_file "$WIN_BUILD_HOST" "$WIN_BUILD_USER" "${WIN_BUILD_PASSWORD:-}" "$WIN_BUILD_PORT" "$WIN_PRIMARY_BLOCKMAP_REMOTE_POSIX" "$WIN_PRIMARY_BLOCKMAP"
    fi

    yarn release:gen-yml \
      --version "$VERSION" \
      --output "$STAGING_DIR/windows/latest.yml" \
      --file "$WIN_PRIMARY_EXE"
    copy_to_release_builds "$WIN_PRIMARY_EXE"
    if [[ -n "${WIN_PRIMARY_BLOCKMAP:-}" ]]; then
      copy_to_release_builds "$WIN_PRIMARY_BLOCKMAP"
    fi
    copy_to_release_builds "$STAGING_DIR/windows/latest.yml"
  fi
}

if truthy "${RUN_MAC_BUILD:-1}"; then
  echo "== macOS build/sign/notarize =="
  : "${MAC_ARM_HOST:?MAC_ARM_HOST is required when RUN_MAC_BUILD=1}"
  : "${MAC_ARM_USER:?MAC_ARM_USER is required when RUN_MAC_BUILD=1}"
  : "${MAC_ARM_REPO_DIR:?MAC_ARM_REPO_DIR is required when RUN_MAC_BUILD=1}"

  MAC_ARM_PORT="${MAC_ARM_PORT:-22}"
  MAC_BUILD_KIND_REQUESTED="${MAC_BUILD_KIND:-universal}"
  MAC_PHASE="${MAC_PHASE:-full}"
  case "$MAC_PHASE" in
    full|sign) ;;
    *)
      echo "MAC_PHASE must be one of: full, sign (got '$MAC_PHASE')" >&2
      exit 1
      ;;
  esac
  MAC_RELEASE_ENV_LOCAL="${MAC_RELEASE_ENV_LOCAL:-}"
  MAC_RELEASE_ENV_REMOTE="${MAC_RELEASE_ENV_REMOTE:-${MAC_ARM_REPO_DIR}/scripts/.env.release}"
  MAC_ARM_GIT_PULL_CMD="${MAC_ARM_GIT_PULL_CMD:-cd '${MAC_ARM_REPO_DIR}' && git pull --ff-only}"
  MAC_FETCH_HOST="${MAC_FETCH_HOST:-$MAC_ARM_HOST}"
  MAC_FETCH_PORT="${MAC_FETCH_PORT:-$MAC_ARM_PORT}"
  MAC_FETCH_USER="${MAC_FETCH_USER:-$MAC_ARM_USER}"
  MAC_FETCH_PASSWORD="${MAC_FETCH_PASSWORD:-${MAC_ARM_PASSWORD:-}}"
  MAC_FETCH_DIR_TEMPLATE="${MAC_FETCH_DIR:-}"
  MAC_FETCH_PRE_CLEAN="${MAC_FETCH_PRE_CLEAN:-1}"
  # MAC_FETCH_CLEANUP_OLD="${MAC_FETCH_CLEANUP_OLD:-1}"
  # MAC_FETCH_KEEP_COUNT="${MAC_FETCH_KEEP_COUNT:-20}"
  # MAC_FETCH_CLEANUP_GLOB="${MAC_FETCH_CLEANUP_GLOB:-mac-*}"
  MAC_REMOTE_CMD_TEMPLATE="${MAC_REMOTE_CMD:-}"

  case "$MAC_BUILD_KIND_REQUESTED" in
    both) MAC_BUILD_KINDS=(x64 arm64) ;;
    arm64|x64|universal) MAC_BUILD_KINDS=("$MAC_BUILD_KIND_REQUESTED") ;;
    *)
      echo "MAC_BUILD_KIND must be one of: arm64, x64, universal, both (got '$MAC_BUILD_KIND_REQUESTED')" >&2
      exit 1
      ;;
  esac

  if [[ -z "$MAC_FETCH_DIR_TEMPLATE" ]]; then
    if [[ -n "${MAC_ARM_OUTPUT_DIR:-}" ]]; then
      MAC_FETCH_DIR_TEMPLATE="${MAC_ARM_OUTPUT_DIR%/}/__BUNDLE_TAG__/"
    elif [[ -n "${MAC_SIGN_OUTPUT_DIR:-}" ]]; then
      MAC_FETCH_DIR_TEMPLATE="${MAC_SIGN_OUTPUT_DIR%/}/__BUNDLE_TAG__/"
    else
      echo "Set MAC_FETCH_DIR (or MAC_ARM_OUTPUT_DIR / MAC_SIGN_OUTPUT_DIR) when RUN_MAC_BUILD=1." >&2
      exit 1
    fi
  fi

  if [[ "${#MAC_BUILD_KINDS[@]}" -gt 1 ]] && [[ "$MAC_FETCH_DIR_TEMPLATE" != *"__BUNDLE_TAG__"* ]]; then
    echo "MAC_FETCH_DIR must include __BUNDLE_TAG__ when MAC_BUILD_KIND=both." >&2
    echo "Current MAC_FETCH_DIR: ${MAC_FETCH_DIR_TEMPLATE}" >&2
    exit 1
  fi

  if [[ -n "$MAC_RELEASE_ENV_LOCAL" ]]; then
    RSYNC_EXCLUDES=""
    rsync_to "$MAC_ARM_HOST" "$MAC_ARM_USER" "${MAC_ARM_PASSWORD:-}" "$MAC_ARM_PORT" \
      "$MAC_RELEASE_ENV_LOCAL" "$MAC_RELEASE_ENV_REMOTE"
  fi

  if [[ "$MAC_PHASE" != "sign" ]]; then
    ssh_run "$MAC_ARM_HOST" "$MAC_ARM_USER" "${MAC_ARM_PASSWORD:-}" "$MAC_ARM_PORT" "$MAC_ARM_GIT_PULL_CMD"
  else
    echo "MAC_PHASE=sign; skipping git pull on ARM Mac."
  fi

  mkdir -p "$STAGING_DIR/mac"
  MAC_CLEAN_OUTPUTS="${MAC_CLEAN_OUTPUTS:-1}"
  if truthy "$MAC_CLEAN_OUTPUTS"; then
    shopt -s nullglob
    stale_staging_mac=("$STAGING_DIR/mac/"*)
    if [[ "${#stale_staging_mac[@]}" -gt 0 ]]; then
      rm -rf -- "${stale_staging_mac[@]}"
    fi
    if [[ "$RELEASE_BUILDS_DIR" != "$STAGING_DIR" ]]; then
      stale_release_mac=(
        "$RELEASE_BUILDS_DIR/"*-mac.zip
        "$RELEASE_BUILDS_DIR/"*-mac.zip.blockmap
        "$RELEASE_BUILDS_DIR/"*-mac.dmg
        "$RELEASE_BUILDS_DIR/"*-mac.dmg.blockmap
      )
      if [[ "${#stale_release_mac[@]}" -gt 0 ]]; then
        rm -f -- "${stale_release_mac[@]}"
      fi
    fi
    shopt -u nullglob
  fi

  for MAC_KIND in "${MAC_BUILD_KINDS[@]}"; do
    BUNDLE_TAG_RAW="${MAC_BUNDLE_TAG:-mac-__KIND__-__VERSION__-__STAMP__}"
    BUNDLE_TAG="${BUNDLE_TAG_RAW//__KIND__/${MAC_KIND}}"
    BUNDLE_TAG="${BUNDLE_TAG//__VERSION__/${VERSION}}"
    BUNDLE_TAG="${BUNDLE_TAG//__STAMP__/${STAMP}}"
    MAC_FETCH_DIR="${MAC_FETCH_DIR_TEMPLATE//__BUNDLE_TAG__/${BUNDLE_TAG}}"
    MAC_FETCH_DIR_CLEAN="${MAC_FETCH_DIR%/}"

    MAC_REMOTE_CMD_EFFECTIVE="$MAC_REMOTE_CMD_TEMPLATE"
    MAC_SKIP_BUILD_FLAG=""
    if [[ "$MAC_PHASE" == "sign" ]]; then
      MAC_SKIP_BUILD_FLAG="MAC_SKIP_BUILD=1"
    fi
    if [[ -z "$MAC_REMOTE_CMD_EFFECTIVE" ]]; then
      MAC_REMOTE_SCRIPT="${MAC_REMOTE_SCRIPT:-scripts/release-mac-build.sh}"
      MAC_REMOTE_CMD_EFFECTIVE="cd '${MAC_ARM_REPO_DIR}' && ${MAC_SKIP_BUILD_FLAG} MAC_BUILD_KIND_OVERRIDE='${MAC_KIND}' BUNDLE_TAG_OVERRIDE='${BUNDLE_TAG}'"
      if [[ -n "$MAC_RELEASE_ENV_LOCAL" ]]; then
        MAC_REMOTE_CMD_EFFECTIVE="${MAC_REMOTE_CMD_EFFECTIVE} ENV_FILE='${MAC_RELEASE_ENV_REMOTE}'"
      fi
      MAC_REMOTE_CMD_EFFECTIVE="${MAC_REMOTE_CMD_EFFECTIVE} bash ${MAC_REMOTE_SCRIPT}"
    else
      MAC_REMOTE_CMD_EFFECTIVE="${MAC_REMOTE_CMD_EFFECTIVE//__BUNDLE_TAG__/${BUNDLE_TAG}}"
      MAC_REMOTE_CMD_EFFECTIVE="${MAC_REMOTE_CMD_EFFECTIVE//__ENV_FILE__/${MAC_RELEASE_ENV_REMOTE}}"
      MAC_REMOTE_CMD_EFFECTIVE="export MAC_BUILD_KIND_OVERRIDE='${MAC_KIND}'; export ${MAC_SKIP_BUILD_FLAG:-MAC_SKIP_BUILD=0}; ${MAC_REMOTE_CMD_EFFECTIVE}"
    fi

    if truthy "$MAC_FETCH_PRE_CLEAN"; then
      ssh_run "$MAC_FETCH_HOST" "$MAC_FETCH_USER" "${MAC_FETCH_PASSWORD:-}" "$MAC_FETCH_PORT" \
        "mkdir -p '${MAC_FETCH_DIR_CLEAN}' && find '${MAC_FETCH_DIR_CLEAN}' -maxdepth 1 -type f \\( -name '*-mac*.zip' -o -name '*-mac*.dmg' -o -name '*-mac*.blockmap' \\) -delete"
    fi

    ssh_run "$MAC_ARM_HOST" "$MAC_ARM_USER" "${MAC_ARM_PASSWORD:-}" "$MAC_ARM_PORT" "$MAC_REMOTE_CMD_EFFECTIVE"

    MAC_KIND_DIR="$STAGING_DIR/mac/${MAC_KIND}"
    mkdir -p "$MAC_KIND_DIR"
    rsync_from "$MAC_FETCH_HOST" "$MAC_FETCH_USER" "${MAC_FETCH_PASSWORD:-}" "$MAC_FETCH_PORT" \
      "$MAC_FETCH_DIR" "$MAC_KIND_DIR/"

    shopt -s nullglob
    mac_kind_zips=("$MAC_KIND_DIR/"*.zip)
    mac_kind_dmgs=("$MAC_KIND_DIR/"*.dmg)
    mac_kind_blockmaps=("$MAC_KIND_DIR/"*.zip.blockmap "$MAC_KIND_DIR/"*.dmg.blockmap)
    shopt -u nullglob

    if [[ "${#mac_kind_zips[@]}" -eq 0 ]]; then
      echo "No mac ZIP artifact found in $MAC_KIND_DIR" >&2
      exit 1
    fi

    for f in "${mac_kind_zips[@]}" "${mac_kind_dmgs[@]}" "${mac_kind_blockmaps[@]}"; do
      [[ -f "$f" ]] || continue
      f_dir="$(dirname "$f")"
      f_base="$(basename "$f")"
      if [[ "$f_base" == *"-mac."* ]]; then
        f_new_base="${f_base/-mac./-mac-${MAC_KIND}.}"
      else
        f_new_base="$f_base"
      fi
      if [[ "$f_new_base" != "$f_base" ]]; then
        mv -f -- "$f" "$f_dir/$f_new_base"
      fi
    done

    shopt -s nullglob
    mac_kind_outputs=("$MAC_KIND_DIR/"*.zip "$MAC_KIND_DIR/"*.dmg "$MAC_KIND_DIR/"*.zip.blockmap "$MAC_KIND_DIR/"*.dmg.blockmap)
    shopt -u nullglob
    if [[ "${#mac_kind_outputs[@]}" -gt 0 ]]; then
      copy_to_release_builds "${mac_kind_outputs[@]}"
    fi
  done

  # ---------------------------------------------------------------------------
  # Clean up old mac signing artifacts on remote hosts
  # ---------------------------------------------------------------------------
  MAC_CLEANUP_OLD="${MAC_CLEANUP_OLD:-1}"
  MAC_CLEANUP_KEEP="${MAC_CLEANUP_KEEP:-5}"
  MAC_CLEANUP_GLOB="${MAC_CLEANUP_GLOB:-mac-*}"

  if truthy "$MAC_CLEANUP_OLD"; then
    # Helper: keep only the N most recent directories matching a glob.
    # Usage: cleanup_old_dirs <host> <user> <pass> <port> <parent_dir> <glob> <keep>
    cleanup_old_dirs() {
      local h="$1" u="$2" pw="$3" pt="$4" dir="$5" gl="$6" keep="$7"
      local cmd="cd '${dir}' 2>/dev/null && ls -1dt ${gl} 2>/dev/null | awk 'NR>${keep} {print}' | while IFS= read -r d; do echo \"Removing old artifact dir: ${dir}/\$d\"; rm -rf -- \"\$d\"; done"
      ssh_run "$h" "$u" "$pw" "$pt" "$cmd" || true
    }

    # 1) ARM Mac: Mac-signed/ (synced-back signed artifacts)
    MAC_ARM_SIGNED_BASE="${MAC_FETCH_DIR_TEMPLATE%%__BUNDLE_TAG__*}"
    MAC_ARM_SIGNED_BASE="${MAC_ARM_SIGNED_BASE%/}"
    if [[ -n "$MAC_ARM_SIGNED_BASE" ]]; then
      echo "Cleaning old artifacts on ARM Mac: $MAC_ARM_SIGNED_BASE"
      cleanup_old_dirs "$MAC_FETCH_HOST" "$MAC_FETCH_USER" "${MAC_FETCH_PASSWORD:-}" "$MAC_FETCH_PORT" \
        "$MAC_ARM_SIGNED_BASE" "$MAC_CLEANUP_GLOB" "$MAC_CLEANUP_KEEP"
    fi

    # 2) Intel Mac: SIGN_INBOX/<bundle_tag> dirs (unsigned .app bundles sent for signing)
    if [[ -n "${MAC_SIGN_HOST:-}" && -n "${MAC_SIGN_USER:-}" ]]; then
      MAC_SIGN_INBOX_DIR="${MAC_SIGN_INBOX:-}"
      if [[ -z "$MAC_SIGN_INBOX_DIR" && -n "${MAC_SIGN_OUTPUT_DIR:-}" ]]; then
        MAC_SIGN_INBOX_DIR="$(dirname "${MAC_SIGN_OUTPUT_DIR}")"
      fi
      MAC_SIGN_PORT="${MAC_SIGN_PORT:-22}"
      MAC_SIGN_PASSWORD="${MAC_SIGN_PASSWORD:-}"

      if [[ -n "$MAC_SIGN_INBOX_DIR" ]]; then
        echo "Cleaning old unsigned bundles on Intel Mac: $MAC_SIGN_INBOX_DIR"
        cleanup_old_dirs "$MAC_SIGN_HOST" "$MAC_SIGN_USER" "$MAC_SIGN_PASSWORD" "$MAC_SIGN_PORT" \
          "$MAC_SIGN_INBOX_DIR" "$MAC_CLEANUP_GLOB" "$MAC_CLEANUP_KEEP"
      fi

      # 3) Intel Mac: SIGN_OUTPUT_DIR/ (signed .zip/.dmg output bundles)
      if [[ -n "${MAC_SIGN_OUTPUT_DIR:-}" ]]; then
        echo "Cleaning old signed output on Intel Mac: $MAC_SIGN_OUTPUT_DIR"
        cleanup_old_dirs "$MAC_SIGN_HOST" "$MAC_SIGN_USER" "$MAC_SIGN_PASSWORD" "$MAC_SIGN_PORT" \
          "$MAC_SIGN_OUTPUT_DIR" "$MAC_CLEANUP_GLOB" "$MAC_CLEANUP_KEEP"
      fi
    fi
  fi
fi

run_windows_flow

generate_update_metadata

if truthy "${GH_UPLOAD_RELEASE:-0}" || truthy "${GH_PUBLISH_RELEASE:-0}" || truthy "${GH_CREATE_DRAFT:-0}"; then
  require_cmd gh
  GH_REPO="${GH_REPO:-45Drives/45Flow}"
  GH_REPO="${GH_REPO//$'\r'/}"
  GH_TITLE_RAW="${GH_TITLE:-$RELEASE_TAG}"
  GH_TITLE="${GH_TITLE_RAW//__VERSION__/${VERSION}}"
  GH_TITLE="${GH_TITLE//$'\r'/}"
  GH_NOTES_RAW="${GH_NOTES:-}"
  GH_NOTES="${GH_NOTES_RAW//__VERSION__/${VERSION}}"
  GH_NOTES="${GH_NOTES//$'\r'/}"
  GH_ENSURE_TAG="${GH_ENSURE_TAG:-1}"
  GH_MARK_LATEST="${GH_MARK_LATEST:-1}"
  GH_TAG_REMOTE="${GH_TAG_REMOTE:-origin}"
  GH_TAG_REF="${GH_TAG_REF:-HEAD}"
  GH_TAG_MESSAGE_RAW="${GH_TAG_MESSAGE:-$RELEASE_TAG}"
  GH_TAG_MESSAGE="${GH_TAG_MESSAGE_RAW//__VERSION__/${VERSION}}"
  GH_TAG_MESSAGE="${GH_TAG_MESSAGE//$'\r'/}"

  if [[ -z "${RELEASE_TAG//[[:space:]]/}" ]]; then
    echo "RELEASE_TAG resolved to an empty value; refusing to create/upload release." >&2
    exit 1
  fi

  if truthy "${GH_ENSURE_TAG}"; then
    require_cmd git
    GH_REMOTE_TAG_MATCH="$(git ls-remote --tags "$GH_TAG_REMOTE" "refs/tags/${RELEASE_TAG}" "refs/tags/${RELEASE_TAG}^{}" || true)"
    if [[ -z "$GH_REMOTE_TAG_MATCH" ]]; then
      if git rev-parse -q --verify "refs/tags/${RELEASE_TAG}" >/dev/null 2>&1; then
        echo "Pushing existing local tag '${RELEASE_TAG}' to '${GH_TAG_REMOTE}'."
      else
        echo "Creating tag '${RELEASE_TAG}' at '${GH_TAG_REF}' for release."
        git tag -a "$RELEASE_TAG" "$GH_TAG_REF" -m "$GH_TAG_MESSAGE"
      fi
      git push "$GH_TAG_REMOTE" "refs/tags/${RELEASE_TAG}"
    fi
  fi

  if truthy "${GH_CREATE_DRAFT:-0}"; then
    if ! gh release view "$RELEASE_TAG" --repo "$GH_REPO" >/dev/null 2>&1; then
      gh release create "$RELEASE_TAG" --repo "$GH_REPO" --title "$GH_TITLE" --notes "$GH_NOTES" --draft
    fi
  fi

  GH_RELEASE_TAG_EFFECTIVE="$RELEASE_TAG"
  GH_RELEASE_TAG_JSON="$(gh release view "$RELEASE_TAG" --repo "$GH_REPO" --json tagName --jq '.tagName' 2>/dev/null || true)"
  GH_RELEASE_TAG_JSON="${GH_RELEASE_TAG_JSON//$'\r'/}"
  if [[ -n "${GH_RELEASE_TAG_JSON//[[:space:]]/}" ]]; then
    GH_RELEASE_TAG_EFFECTIVE="$GH_RELEASE_TAG_JSON"
  else
    GH_RELEASE_VIEW_OUTPUT="$(gh release view "$RELEASE_TAG" --repo "$GH_REPO" 2>/dev/null || true)"
    GH_RELEASE_TAG_FROM_URL="$(printf '%s\n' "$GH_RELEASE_VIEW_OUTPUT" | sed -n 's#.*releases/tag/\([^[:space:]]\+\).*#\1#p' | tail -n1)"
    GH_RELEASE_TAG_FROM_URL="${GH_RELEASE_TAG_FROM_URL//$'\r'/}"
    if [[ -n "${GH_RELEASE_TAG_FROM_URL//[[:space:]]/}" ]]; then
      GH_RELEASE_TAG_EFFECTIVE="$GH_RELEASE_TAG_FROM_URL"
    else
      echo "Unable to resolve release key from gh output; defaulting to '$RELEASE_TAG' for upload/publish." >&2
    fi
  fi
  if [[ "$GH_RELEASE_TAG_EFFECTIVE" != "$RELEASE_TAG" ]]; then
    echo "Release key mismatch: requested '$RELEASE_TAG', GitHub release key is '$GH_RELEASE_TAG_EFFECTIVE'." >&2
    echo "Continuing using '$GH_RELEASE_TAG_EFFECTIVE' for upload/publish." >&2
  fi

  if truthy "${GH_UPLOAD_RELEASE:-0}"; then
    mapfile -t assets < <(find "$STAGING_DIR" -maxdepth 4 -type f \
      \( -name '*.yml' -o -name '*.exe' -o -name '*.blockmap' -o -name '*.zip' -o -name '*.dmg' -o -name '*.deb' -o -name '*.rpm' -o -name '*.AppImage' \) | sort)
    if [[ "${#assets[@]}" -eq 0 ]]; then
      echo "No assets found to upload from $STAGING_DIR" >&2
      exit 1
    fi
    gh release upload "$GH_RELEASE_TAG_EFFECTIVE" --repo "$GH_REPO" --clobber "${assets[@]}"
  fi

  if truthy "${GH_PUBLISH_RELEASE:-0}"; then
    if gh release edit "$GH_RELEASE_TAG_EFFECTIVE" --repo "$GH_REPO" --draft=false >/dev/null 2>&1; then
      :
    else
      echo "gh release edit unavailable; falling back to GitHub API publish flow." >&2
      GH_RELEASE_ID="$(gh api "repos/${GH_REPO}/releases/tags/${GH_RELEASE_TAG_EFFECTIVE}" --jq '.id' 2>/dev/null || true)"
      GH_RELEASE_ID="${GH_RELEASE_ID//$'\r'/}"
      if [[ -z "${GH_RELEASE_ID//[[:space:]]/}" ]]; then
        GH_RELEASE_ID="$(gh api "repos/${GH_REPO}/releases/tags/${RELEASE_TAG}" --jq '.id' 2>/dev/null || true)"
        GH_RELEASE_ID="${GH_RELEASE_ID//$'\r'/}"
      fi
      if [[ -z "${GH_RELEASE_ID//[[:space:]]/}" ]]; then
        mapfile -t GH_RELEASE_ROWS < <(
          gh api "repos/${GH_REPO}/releases?per_page=100" \
            --jq '.[] | [.id, (.tag_name // ""), (.name // ""), (if .draft then "true" else "false" end)] | @tsv' \
            2>/dev/null || true
        )
        for row in "${GH_RELEASE_ROWS[@]}"; do
          IFS=$'\t' read -r row_id row_tag row_name row_draft <<< "$row"
          if [[ "$row_tag" == "$GH_RELEASE_TAG_EFFECTIVE" || "$row_tag" == "$RELEASE_TAG" ]]; then
            GH_RELEASE_ID="$row_id"
            break
          fi
        done
        if [[ -z "${GH_RELEASE_ID//[[:space:]]/}" ]]; then
          for row in "${GH_RELEASE_ROWS[@]}"; do
            IFS=$'\t' read -r row_id row_tag row_name row_draft <<< "$row"
            if [[ "$row_name" == "$GH_TITLE" ]]; then
              GH_RELEASE_ID="$row_id"
              break
            fi
          done
        fi
      fi
      if [[ -z "${GH_RELEASE_ID//[[:space:]]/}" ]]; then
        echo "Unable to resolve release id for publish in ${GH_REPO}." >&2
        exit 1
      fi
      gh api -X PATCH "repos/${GH_REPO}/releases/${GH_RELEASE_ID}" -f draft=false >/dev/null
    fi

    if truthy "${GH_MARK_LATEST}"; then
      GH_RELEASE_ID_LATEST="$(gh api "repos/${GH_REPO}/releases/tags/${GH_RELEASE_TAG_EFFECTIVE}" --jq '.id' 2>/dev/null || true)"
      GH_RELEASE_ID_LATEST="${GH_RELEASE_ID_LATEST//$'\r'/}"
      if [[ -z "${GH_RELEASE_ID_LATEST//[[:space:]]/}" ]]; then
        GH_RELEASE_ID_LATEST="$(gh api "repos/${GH_REPO}/releases/tags/${RELEASE_TAG}" --jq '.id' 2>/dev/null || true)"
        GH_RELEASE_ID_LATEST="${GH_RELEASE_ID_LATEST//$'\r'/}"
      fi
      if [[ -z "${GH_RELEASE_ID_LATEST//[[:space:]]/}" ]]; then
        mapfile -t GH_RELEASE_ROWS_LATEST < <(
          gh api "repos/${GH_REPO}/releases?per_page=100" \
            --jq '.[] | [.id, (.tag_name // ""), (.name // "")] | @tsv' \
            2>/dev/null || true
        )
        for row in "${GH_RELEASE_ROWS_LATEST[@]}"; do
          IFS=$'\t' read -r row_id row_tag row_name <<< "$row"
          if [[ "$row_tag" == "$GH_RELEASE_TAG_EFFECTIVE" || "$row_tag" == "$RELEASE_TAG" || "$row_name" == "$GH_TITLE" ]]; then
            GH_RELEASE_ID_LATEST="$row_id"
            break
          fi
        done
      fi
      if [[ -n "${GH_RELEASE_ID_LATEST//[[:space:]]/}" ]]; then
        gh api -X PATCH "repos/${GH_REPO}/releases/${GH_RELEASE_ID_LATEST}" -f make_latest=true >/dev/null || true
      fi
    fi
  fi
fi

echo "Release orchestration complete."
echo "Collected assets under: $STAGING_DIR"
echo "Final builds/release assets under: $RELEASE_BUILDS_DIR"
