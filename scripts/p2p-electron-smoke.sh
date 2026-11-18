#!/usr/bin/env bash
# P2P8 G4: package the Linux app directory the repo's way (build.js, then electron-builder --linux --dir)
# and load node-datachannel from inside the packaged app. Last line on success:
#   node-datachannel loaded in packaged app
# Environment: local dev machine only; nothing is published or signed.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [ ! -d houston-common/houston-common-lib/dist ]; then
  yarn build:common
fi
node scripts/build.js
rm -rf dist/linux-unpacked
npx electron-builder --linux --dir --publish never

APP_DIR="$ROOT/dist/linux-unpacked"
BIN="$APP_DIR/45flow"
[ -x "$BIN" ] || BIN="$(find "$APP_DIR" -maxdepth 1 -type f -perm -u+x ! -name '*.so*' ! -name chrome_crashpad_handler ! -name chrome-sandbox | head -n1)"
RES="$APP_DIR/resources"

# The native module must sit outside the asar so the OS loader can open it.
if ! find "$RES/app.asar.unpacked" -name '*.node' -path '*node-datachannel*' | grep -q .; then
  echo "node-datachannel native module is not unpacked from app.asar" >&2
  exit 1
fi

# The packaged binary runs as plain Node (ELECTRON_RUN_AS_NODE) with the asar-aware loader, so this
# loads the module exactly where the app does, and opens and closes a peer connection.
ELECTRON_RUN_AS_NODE=1 "$BIN" -e '
const path = require("path");
const ndc = require(path.join(process.argv[1], "app.asar", "node_modules", "node-datachannel"));
const pc = new ndc.PeerConnection("smoke", { iceServers: [] });
pc.close();
ndc.cleanup();
' "$RES"

echo "node-datachannel loaded in packaged app"
