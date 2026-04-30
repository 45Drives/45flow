#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

BUMP_TYPE=""
CONFIG_FILE=""

show_help() {
  cat <<'HELP'
Usage: bash scripts/release/release.sh [OPTIONS]

Studio Share release script for building and publishing releases.

OPTIONS:
  --bump <type>           Bump package.json version before build.
                          Values: patch | minor | major
                          
  --config <file>         Use specific config file instead of default.
                          Default: .env.orchestrator
  
  --os <platform>         Build for specific OS (can specify multiple times).
                          Values: linux | windows | mac | all
                          Default: all
  
  --stage                 Stage builds only (useful for Windows signing workflow).
  
  --finalize              Finalize Windows builds (fetch signed executables).
  
  --dry-run               Show what would be done without making changes.
  
  --help, -h              Show this help message.

EXAMPLES:
  # Bump patch version and build all platforms
  bash scripts/release/release.sh --bump patch --os all
  
  # Build for mac only (no version bump)
  bash scripts/release/release.sh --os mac
  
  # Stage Windows build for manual signing
  bash scripts/release/release.sh --os windows --stage
  
  # Finalize Windows build after signing
  bash scripts/release/release.sh --os windows --finalize

NOTES:
  - Version is always read from package.json
  - Releases are published to 45Drives/studio-share
HELP
}

bump_version() {
  local bump_type="$1"
  
  if ! command -v node &>/dev/null; then
    echo "Error: node not found. Cannot bump version." >&2
    exit 1
  fi
  
  local current_version
  current_version="$(node -p "require('./package.json').version")"
  
  echo "Current version: $current_version"
  
  IFS='.' read -r major minor patch <<< "$current_version"
  
  case "$bump_type" in
    major)
      major=$((major + 1))
      minor=0
      patch=0
      ;;
    minor)
      minor=$((minor + 1))
      patch=0
      ;;
    patch)
      patch=$((patch + 1))
      ;;
    *)
      echo "Error: Invalid bump type: $bump_type" >&2
      echo "Must be: major | minor | patch" >&2
      exit 1
      ;;
  esac
  
  local new_version="${major}.${minor}.${patch}"
  echo "New version: $new_version"
  
  # Update package.json using node
  node -e "
    const fs = require('fs');
    const pkg = require('./package.json');
    pkg.version = '$new_version';
    fs.writeFileSync('./package.json', JSON.stringify(pkg, null, 2) + '\n');
  "
  
  echo "✓ Version bumped to $new_version"
  
  # Commit and push so remote build machines can pull the new version
  git add package.json
  git commit -m "Bump version to $new_version"
  git push
  echo "✓ Committed and pushed v$new_version"
}

parse_args() {
  local stage_mode=""
  local finalize_mode=""
  local os_specified=0
  local run_linux=0
  local run_windows=0
  local run_mac=0
  
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --bump)
        if [[ $# -lt 2 ]]; then
          echo "Error: --bump requires an argument (patch|minor|major)" >&2
          exit 1
        fi
        BUMP_TYPE="$2"
        shift 2
        ;;
      --config)
        if [[ $# -lt 2 ]]; then
          echo "Error: --config requires a file path" >&2
          exit 1
        fi
        CONFIG_FILE="$2"
        shift 2
        ;;
      --os)
        if [[ $# -lt 2 ]]; then
          echo "Error: --os requires an argument (linux|windows|mac|all)" >&2
          exit 1
        fi
        os_specified=1
        case "$2" in
          linux)
            run_linux=1
            ;;
          windows)
            run_windows=1
            ;;
          mac)
            run_mac=1
            ;;
          all)
            run_linux=1
            run_windows=1
            run_mac=1
            ;;
          *)
            echo "Error: Invalid OS: $2" >&2
            exit 1
            ;;
        esac
        shift 2
        ;;
      --stage)
        stage_mode="1"
        shift
        ;;
      --finalize)
        finalize_mode="1"
        shift
        ;;
      --dry-run)
        DRY_RUN=1
        shift
        ;;
      --help|-h)
        show_help
        exit 0
        ;;
      *)
        echo "Error: Unknown option: $1" >&2
        echo "Use --help for usage information" >&2
        exit 1
        ;;
    esac
  done
  
  # If no OS specified, default to all
  if [[ $os_specified -eq 0 ]]; then
    run_linux=1
    run_windows=1
    run_mac=1
  fi
  
  # Build environment overrides for orchestrator
  [[ $run_linux -eq 1 ]] && export RUN_LINUX_BUILD=1 || export RUN_LINUX_BUILD=0
  [[ $run_windows -eq 1 ]] && export RUN_WINDOWS_BUILD=1 || export RUN_WINDOWS_BUILD=0
  [[ $run_mac -eq 1 ]] && export RUN_MAC_BUILD=1 || export RUN_MAC_BUILD=0
  
  # Handle stage/finalize for Windows
  if [[ -n "$stage_mode" ]]; then
    export WIN_PHASE=stage
  elif [[ -n "$finalize_mode" ]]; then
    export WIN_PHASE=finalize
  fi
}

main() {
  DRY_RUN=0
  
  parse_args "$@"
  
  cd "$ROOT_DIR"
  
  echo "========================================="
  echo "  Studio Share Release"
  echo "========================================="
  echo "Root dir: $ROOT_DIR"
  echo ""
  
  # Handle version bump if requested
  if [[ -n "$BUMP_TYPE" ]]; then
    echo "Bumping version ($BUMP_TYPE)..."
    if [[ $DRY_RUN -eq 1 ]]; then
      echo "[DRY RUN] Would bump version: $BUMP_TYPE"
    else
      bump_version "$BUMP_TYPE"
    fi
    echo ""
  fi
  
  # Determine config file
  if [[ -z "$CONFIG_FILE" ]]; then
    CONFIG_FILE="${SCRIPT_DIR}/.env.orchestrator"
  fi
  
  # Check if config exists
  if [[ ! -f "$CONFIG_FILE" ]]; then
    echo "Error: Config file not found: $CONFIG_FILE"
    echo "Copy from scripts/release/.env.orchestrator.example" >&2
    exit 1
  fi
  
  # Set GitHub repo
  export GH_REPO="45Drives/studio-share"
  
  echo "Config: $CONFIG_FILE"
  echo "Target GitHub repo: $GH_REPO"
  echo "Build Linux: ${RUN_LINUX_BUILD:-1}"
  echo "Build Windows: ${RUN_WINDOWS_BUILD:-1}"
  echo "Build Mac: ${RUN_MAC_BUILD:-1}"
  [[ -n "${WIN_PHASE:-}" ]] && echo "Windows phase: $WIN_PHASE"
  echo ""
  
  if [[ $DRY_RUN -eq 1 ]]; then
    echo "[DRY RUN] Would run orchestrator with config: $CONFIG_FILE"
    echo "[DRY RUN] GH_REPO=$GH_REPO"
    echo "[DRY RUN] Command would be:"
    echo "  bash scripts/release/orchestrate-release.sh --env-file $CONFIG_FILE"
    exit 0
  fi
  
  echo "Starting orchestrated release..."
  echo ""
  
  # Run the orchestrator
  bash "${SCRIPT_DIR}/orchestrate-release.sh" --env-file "$CONFIG_FILE"
  
  echo ""
  echo "========================================="
  echo "  Release Complete!"
  echo "========================================="
  
  # Tag the release now that the build succeeded
  if [[ -n "$BUMP_TYPE" ]]; then
    local new_version
    new_version="$(node -p "require('./package.json').version")"
    git tag -a "v$new_version" -m "Release v$new_version"
    git push --tags
    echo ""
    echo "Released and tagged v$new_version"
  fi
}

main "$@"
