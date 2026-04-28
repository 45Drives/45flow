#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

if [[ "${1:-}" == "--" ]]; then
  shift
fi

ENV_FILE_ARG=""
if [[ "${1:-}" == "--env-file" || "${1:-}" == "-e" ]]; then
  ENV_FILE_ARG="${2:-}"
  shift 2 || true
elif [[ -n "${1:-}" ]]; then
  ENV_FILE_ARG="$1"
  shift
fi

if [[ "$#" -gt 0 ]]; then
  echo "Unexpected arguments: $*" >&2
  echo "Usage: yarn release:publish-from-builds -- [ENV_FILE]" >&2
  echo "   or: yarn release:publish-from-builds -- --env-file ENV_FILE" >&2
  exit 1
fi

ENV_FILE="${ENV_FILE_ARG:-${RELEASE_ENV_FILE:-}}"
if [[ -n "${ENV_FILE:-}" ]]; then
  if [[ ! -f "$ENV_FILE" ]]; then
    echo "Env file not found: $ENV_FILE" >&2
    exit 1
  fi
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

require_cmd() {
  local c="$1"
  command -v "$c" >/dev/null 2>&1 || {
    echo "Required command not found: $c" >&2
    exit 1
  }
}

truthy() {
  local v="${1:-}"
  [[ "$v" == "1" || "$v" == "true" || "$v" == "TRUE" || "$v" == "yes" || "$v" == "YES" ]]
}

require_cmd node
require_cmd yarn

RELEASE_DIR="${RELEASE_DIR:-${ROOT_DIR}/builds/release}"
VERSION="${RELEASE_VERSION:-$(node -p "require('./package.json').version")}"
RELEASE_TAG="${RELEASE_TAG:-v${VERSION}}"
GH_REPO="${GH_REPO:-45Drives/45Flow}"
GH_CREATE_DRAFT="${GH_CREATE_DRAFT:-1}"
GH_UPLOAD_RELEASE="${GH_UPLOAD_RELEASE:-1}"
GH_PUBLISH_RELEASE="${GH_PUBLISH_RELEASE:-0}"
REQUIRE_ALL_PLATFORMS="${REQUIRE_ALL_PLATFORMS:-1}"
GH_TITLE="${GH_TITLE:-$RELEASE_TAG}"
GH_NOTES="${GH_NOTES:-}"
PUBLISH_WINDOWS="${PUBLISH_WINDOWS:-1}"
PUBLISH_MAC="${PUBLISH_MAC:-1}"
PUBLISH_LINUX="${PUBLISH_LINUX:-1}"

if truthy "$GH_CREATE_DRAFT" || truthy "$GH_UPLOAD_RELEASE" || truthy "$GH_PUBLISH_RELEASE"; then
  require_cmd gh
fi

if [[ ! -d "$RELEASE_DIR" ]]; then
  echo "RELEASE_DIR not found: $RELEASE_DIR" >&2
  exit 1
fi

echo "Release dir: $RELEASE_DIR"
echo "Version: $VERSION"
echo "Tag: $RELEASE_TAG"
echo "Repo: $GH_REPO"
echo "Platforms: windows=$PUBLISH_WINDOWS mac=$PUBLISH_MAC linux=$PUBLISH_LINUX"

mapfile -t WIN_EXES < <(find "$RELEASE_DIR" -maxdepth 1 -type f -name "*${VERSION}*win*.exe" | sort)
if [[ "${#WIN_EXES[@]}" -eq 0 ]]; then
  mapfile -t WIN_EXES < <(find "$RELEASE_DIR" -maxdepth 1 -type f -name "*win*.exe" | sort)
fi
mapfile -t WIN_BLOCKMAPS < <(find "$RELEASE_DIR" -maxdepth 1 -type f -name "*.exe.blockmap" | sort)

mapfile -t MAC_ZIPS < <(find "$RELEASE_DIR" -maxdepth 1 -type f -name "*${VERSION}*mac*.zip" | sort)
if [[ "${#MAC_ZIPS[@]}" -eq 0 ]]; then
  mapfile -t MAC_ZIPS < <(find "$RELEASE_DIR" -maxdepth 1 -type f -name "*mac*.zip" | sort)
fi
mapfile -t MAC_DMGS < <(find "$RELEASE_DIR" -maxdepth 1 -type f -name "*${VERSION}*mac*.dmg" | sort)
if [[ "${#MAC_DMGS[@]}" -eq 0 ]]; then
  mapfile -t MAC_DMGS < <(find "$RELEASE_DIR" -maxdepth 1 -type f -name "*mac*.dmg" | sort)
fi
mapfile -t MAC_BLOCKMAPS < <(find "$RELEASE_DIR" -maxdepth 1 -type f \( -name "*.dmg.blockmap" -o -name "*.zip.blockmap" \) | sort)

mapfile -t LINUX_DEBS < <(find "$RELEASE_DIR" -maxdepth 1 -type f -name "*${VERSION}*linux*.deb" | sort)
if [[ "${#LINUX_DEBS[@]}" -eq 0 ]]; then
  mapfile -t LINUX_DEBS < <(find "$RELEASE_DIR" -maxdepth 1 -type f -name "*linux*.deb" | sort)
fi
mapfile -t LINUX_RPMS < <(find "$RELEASE_DIR" -maxdepth 1 -type f -name "*${VERSION}*linux*.rpm" | sort)
if [[ "${#LINUX_RPMS[@]}" -eq 0 ]]; then
  mapfile -t LINUX_RPMS < <(find "$RELEASE_DIR" -maxdepth 1 -type f -name "*linux*.rpm" | sort)
fi

if ! truthy "$PUBLISH_WINDOWS"; then
  WIN_EXES=()
  WIN_BLOCKMAPS=()
fi
if ! truthy "$PUBLISH_MAC"; then
  MAC_ZIPS=()
  MAC_DMGS=()
  MAC_BLOCKMAPS=()
fi
if ! truthy "$PUBLISH_LINUX"; then
  LINUX_DEBS=()
  LINUX_RPMS=()
fi

missing_any=0
if truthy "$PUBLISH_WINDOWS" && [[ "${#WIN_EXES[@]}" -eq 0 ]]; then
  echo "Missing Windows .exe in $RELEASE_DIR"
  missing_any=1
fi
if truthy "$PUBLISH_MAC" && [[ "${#MAC_ZIPS[@]}" -eq 0 ]]; then
  echo "Missing macOS .zip in $RELEASE_DIR"
  missing_any=1
fi
if truthy "$PUBLISH_LINUX" && [[ "${#LINUX_DEBS[@]}" -eq 0 && "${#LINUX_RPMS[@]}" -eq 0 ]]; then
  echo "Missing Linux .deb/.rpm in $RELEASE_DIR"
  missing_any=1
fi
if [[ "$missing_any" -eq 1 ]] && truthy "$REQUIRE_ALL_PLATFORMS"; then
  echo "Required artifacts missing. Set REQUIRE_ALL_PLATFORMS=0 to continue anyway." >&2
  exit 1
fi

if [[ "${#WIN_EXES[@]}" -gt 0 ]]; then
  echo "Generating latest.yml"
  WIN_GEN=(node "$ROOT_DIR/scripts/release/generate-update-yml.mjs" --version "$VERSION" --output "$RELEASE_DIR/latest.yml")
  for f in "${WIN_EXES[@]}" "${WIN_BLOCKMAPS[@]}"; do
    WIN_GEN+=(--file "$f")
  done
  "${WIN_GEN[@]}"
fi

if [[ "${#MAC_ZIPS[@]}" -gt 0 ]]; then
  echo "Generating latest-mac.yml"
  MAC_PRIMARY_ZIP="$(basename "${MAC_ZIPS[0]}")"
  MAC_GEN=(
    node "$ROOT_DIR/scripts/release/generate-update-yml.mjs"
    --version "$VERSION"
    --output "$RELEASE_DIR/latest-mac.yml"
    --path "$MAC_PRIMARY_ZIP"
  )
  for f in "${MAC_ZIPS[@]}" "${MAC_DMGS[@]}" "${MAC_BLOCKMAPS[@]}"; do
    MAC_GEN+=(--file "$f")
  done
  "${MAC_GEN[@]}"
fi

if [[ "${#LINUX_DEBS[@]}" -gt 0 || "${#LINUX_RPMS[@]}" -gt 0 ]]; then
  echo "Generating latest-linux.yml"
  LINUX_GEN=(node "$ROOT_DIR/scripts/release/generate-update-yml.mjs" --version "$VERSION" --output "$RELEASE_DIR/latest-linux.yml")
  for f in "${LINUX_DEBS[@]}" "${LINUX_RPMS[@]}"; do
    LINUX_GEN+=(--file "$f")
  done
  "${LINUX_GEN[@]}"
fi

if truthy "$GH_CREATE_DRAFT"; then
  if gh release view "$RELEASE_TAG" --repo "$GH_REPO" >/dev/null 2>&1; then
    echo "Release $RELEASE_TAG already exists; skipping create."
  else
    echo "Creating draft release $RELEASE_TAG"
    gh release create "$RELEASE_TAG" \
      --repo "$GH_REPO" \
      --draft \
      --title "$GH_TITLE" \
      --notes "$GH_NOTES"
  fi
fi

if truthy "$GH_UPLOAD_RELEASE"; then
  echo "Uploading assets to $RELEASE_TAG"
  RELEASE_ASSETS=()
  if truthy "$PUBLISH_WINDOWS"; then
    mapfile -t _win_assets < <(find "$RELEASE_DIR" -maxdepth 1 -type f \( -name "*.exe" -o -name "*.exe.blockmap" -o -name "latest.yml" \) | sort)
    RELEASE_ASSETS+=("${_win_assets[@]}")
  fi
  if truthy "$PUBLISH_MAC"; then
    mapfile -t _mac_assets < <(find "$RELEASE_DIR" -maxdepth 1 -type f \( -name "*.zip" -o -name "*.zip.blockmap" -o -name "*.dmg" -o -name "*.dmg.blockmap" -o -name "latest-mac.yml" \) | sort)
    RELEASE_ASSETS+=("${_mac_assets[@]}")
  fi
  if truthy "$PUBLISH_LINUX"; then
    mapfile -t _linux_assets < <(find "$RELEASE_DIR" -maxdepth 1 -type f \( -name "*.deb" -o -name "*.rpm" -o -name "latest-linux.yml" \) | sort)
    RELEASE_ASSETS+=("${_linux_assets[@]}")
  fi

  if [[ "${#RELEASE_ASSETS[@]}" -eq 0 ]]; then
    echo "No release assets found in $RELEASE_DIR" >&2
    exit 1
  fi

  gh release upload "$RELEASE_TAG" --repo "$GH_REPO" --clobber "${RELEASE_ASSETS[@]}"
fi

if truthy "$GH_PUBLISH_RELEASE"; then
  echo "Publishing release $RELEASE_TAG"
  gh release edit "$RELEASE_TAG" --repo "$GH_REPO" --draft=false
fi

echo "Done."
