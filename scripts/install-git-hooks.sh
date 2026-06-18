#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" != "--enable-downstream-sync" ]]; then
	echo "Downstream sync hook installation is disabled by default."
	echo "Reference hook retained at: scripts/git-hooks/pre-push"
	echo "To install anyway: bash scripts/install-git-hooks.sh --enable-downstream-sync"
	exit 0
fi

mkdir -p .git/hooks
cp scripts/git-hooks/pre-push .git/hooks/pre-push
chmod +x .git/hooks/pre-push

echo "Installed downstream sync pre-push hook."