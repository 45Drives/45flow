#!/usr/bin/env bash
set -euo pipefail

client_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
server_dir="${HOUSTON_BROADCASTER_DIR:-"$client_dir/../houston-broadcaster"}"

if [[ ! -f "$server_dir/package.json" ]]; then
    printf '%s\n' 'houston-broadcaster checkout not found. Set HOUSTON_BROADCASTER_DIR to its directory.' >&2
    exit 1
fi

if [[ "${1:-}" == '--help' || "${1:-}" == '-h' ]]; then
    cd -- "$server_dir"
    exec yarn test:admin-networks:live "$@"
fi

cd -- "$client_dir"
yarn test src/renderer/components/AdminNetworksPanel.test.js src/renderer/composables/useApi.test.js src/main/sshCertificateTrust.test.js

cd -- "$server_dir"
yarn test:admin-networks

if (( $# )); then
    exec yarn test:admin-networks:live "$@"
fi

printf '%s\n' 'Regression checks passed. No live server was tested.' \
    'Pass --url https://SERVER[:PORT] and live-runner options to test a deployed server.'
