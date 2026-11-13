#!/usr/bin/env bash
# One command for a fully working local 45Flow: builds, deploys and restarts
# the web app, the Houston Broadcaster backend and the share player, laid out
# the way a real server is:
#
#   https://<this-machine>/app/        web app   (nginx -> /opt/45drives/45flow-web)
#   https://<this-machine>/link/<tok>  share links (nginx -> backend -> player)
#   backend on 127.0.0.1:9095, data in $FLOW_DEV_STATE (default ~/.local/state/45flow-dev)
#
# Usage: scripts/dev/dev.sh [command]
#   up      (default) install deps if changed, build everything, deploy, restart
#   vite    also start the Vite dev server with hot reload on https://<lan-ip>:8081
#   restart restart the backend only (no build or deploy)
#   stop    stop the backend and the Vite dev server
#   status  show what's running and where
#   logs    follow the backend log
#   setup   (re)run the one-time sudo setup: nginx, HTTPS cert, web-app folder
#
# Settings live in $FLOW_DEV_STATE/dev.env (created on first run; edit freely).
# The Houston Broadcaster checkout is expected next to this repo; override with
# HB_DIR=/path/to/houston-broadcaster.
set -euo pipefail

FLOW_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HB_DIR="${HB_DIR:-$(cd "$FLOW_DIR/.." && pwd)/houston-broadcaster}"
PLAYER_DIR="$HB_DIR/studiosharevideoplayer"
STATE="${FLOW_DEV_STATE:-${XDG_STATE_HOME:-$HOME/.local/state}/45flow-dev}"
WEB_ROOT="/opt/45drives/45flow-web"
NGINX_CONF="/etc/nginx/conf.d/houston-broadcaster.conf"
BCAST_PORT=9095
VITE_PORT=8081

say()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mwarning:\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

lan_ip() { hostname -I 2>/dev/null | awk '{print $1}'; }

# ── state & settings ────────────────────────────────────────────────────────
init_state() {
  mkdir -p "$STATE"/{db,etc,logs,uploads,quarantine,run}
  chmod 700 "$STATE" "$STATE/etc"

  if [[ ! -f "$STATE/dev.env" ]]; then
    cat > "$STATE/dev.env" <<EOF
# 45Flow dev settings, read by scripts/dev/dev.sh on every run.
# Folder the backend may browse and share from. Keep it off network mounts:
# the backend searches it for watermarks on its only thread.
ROOT_DIR="$HOME/Downloads"
# ClamAV is optional in dev; set to true once clamscan is installed.
REQUIRE_MALWARE_SCAN=false
# Local server is unlicensed; keep the web app open.
WEB_APP_LICENSE_GATE=off
EOF
    say "Created $STATE/dev.env (edit it to change the shared folder etc.)"
  fi

  # Fallback login for when the system password check (PAM) is slow or fails.
  # Only honoured outside production.
  if [[ ! -s "$STATE/etc/dev-login" ]]; then
    umask 077
    printf '%s\n%s\n' "$(id -un)" "$(openssl rand -base64 18)" > "$STATE/etc/dev-login"
    umask 022
  fi

  if [[ ! -s "$STATE/db/studioShare.db" ]]; then
    say "Creating database"
    python3 -I "$HB_DIR/system_files/opt/45drives/houston-broadcaster/scripts/init_db.py" \
      --db "$STATE/db/studioShare.db" >/dev/null
  fi
}

# ── dependencies (only when lockfiles or the common submodule change) ───────
stamp_changed() { # name value -> true when different from last time
  local f="$STATE/run/$1.stamp"
  [[ -f "$f" && "$(cat "$f")" == "$2" ]] && return 1
  return 0
}
stamp_save() { printf '%s' "$2" > "$STATE/run/$1.stamp"; }

ensure_deps() {
  local repo name lock
  for repo in "$FLOW_DIR" "$HB_DIR"; do
    name="deps-$(basename "$repo")"
    lock="$(sha256sum "$repo/yarn.lock" | cut -c1-16)"
    if [[ ! -d "$repo/node_modules" ]] || stamp_changed "$name" "$lock"; then
      say "Installing dependencies in $(basename "$repo")"
      (cd "$repo" && yarn install)
      stamp_save "$name" "$lock"
    fi
  done

  if [[ ! -e "$FLOW_DIR/houston-common/package.json" ]]; then
    say "Fetching houston-common submodule"
    git -C "$FLOW_DIR" submodule update --init houston-common
  fi
  local common
  common="$(git -C "$FLOW_DIR/houston-common" rev-parse HEAD)-$(git -C "$FLOW_DIR/houston-common" status --porcelain | sha256sum | cut -c1-12)"
  if stamp_changed common "$common" || [[ ! -d "$FLOW_DIR/node_modules/@45drives/houston-common-ui/dist" ]]; then
    say "Building houston-common"
    (cd "$FLOW_DIR" && yarn build:common)
    stamp_save common "$common"
  fi
}

# ── one-time privileged setup ───────────────────────────────────────────────
setup_done() { [[ -f "$NGINX_CONF" && -w "$WEB_ROOT" ]] && systemctl is-active --quiet nginx; }

run_setup() {
  [[ -f "$HB_DIR/dist/nginx-config.js" ]] || (cd "$HB_DIR" && yarn build:server)
  say "One-time setup (needs sudo): nginx, HTTPS certificate, $WEB_ROOT"
  sudo NODE="$(command -v node)" bash "$HB_DIR/scripts/dev-https-proxy.sh"
}

# ── build & deploy ──────────────────────────────────────────────────────────
build_all() {
  say "Building backend"
  (cd "$HB_DIR" && yarn build:server >/dev/null)
  say "Building share player"
  (cd "$PLAYER_DIR" && yarn run build-only --logLevel warn)
  say "Building web app"
  (cd "$FLOW_DIR" && yarn build:web)
}

deploy_web() {
  say "Deploying web app to $WEB_ROOT"
  rsync -a --delete "$FLOW_DIR/build/web/" "$WEB_ROOT/"
}

# ── backend process ─────────────────────────────────────────────────────────
backend_pid() {
  local pid
  if [[ -f "$STATE/run/backend.pid" ]]; then
    pid="$(cat "$STATE/run/backend.pid")"
    if kill -0 "$pid" 2>/dev/null; then echo "$pid"; return; fi
  fi
  # Also catch a backend started some other way on our port.
  ss -ltnpH "sport = :$BCAST_PORT" 2>/dev/null | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2
}

stop_pid() { # pid label
  local pid="$1" i
  [[ -n "$pid" ]] || return 0
  say "Stopping $2 (pid $pid)"
  kill "$pid" 2>/dev/null || true
  for i in $(seq 1 20); do kill -0 "$pid" 2>/dev/null || return 0; sleep 0.5; done
  # A backend stuck on a network mount ignores SIGTERM.
  kill -9 "$pid" 2>/dev/null || true
}

start_backend() {
  # shellcheck disable=SC1091
  source "$STATE/dev.env"
  [[ -d "$ROOT_DIR" ]] || die "ROOT_DIR '$ROOT_DIR' in $STATE/dev.env does not exist"
  local login_user login_pass
  login_user="$(sed -n 1p "$STATE/etc/dev-login")"
  login_pass="$(sed -n 2p "$STATE/etc/dev-login")"

  say "Starting backend on 127.0.0.1:$BCAST_PORT"
  (
    cd "$HB_DIR"
    export NODE_ENV=development HOST=127.0.0.1 BCAST_PORT ENABLE_BONJOUR=false
    export DB_FILE="$STATE/db/studioShare.db" SW_DB_FILE="$STATE/db/storageWizard.db"
    export HB_SECRETS_PATH="$STATE/etc/secrets.json" HB_CREDENTIALS_KEY_PATH="$STATE/etc/credentials.key"
    export LICENSE_CERT_PATH="$STATE/etc/license-cert.json" LICENSE_SERVER_URL=http://127.0.0.1:9
    export SETUP_JSON="$STATE/etc/setup.json" SERVER_INFO_JSON="$STATE/etc/server_info.json"
    export OPSLOG_DIR="$STATE/logs" UPLOAD_BASE="$STATE/uploads" QUARANTINE_BASE="$STATE/quarantine"
    export ROOT_DIR REQUIRE_MALWARE_SCAN WEB_APP_LICENSE_GATE
    export PUBLIC_DIR="$PLAYER_DIR/dist"
    export AUTH_USER="$login_user" AUTH_PASS="$login_pass"
    setsid nohup node --enable-source-maps dist/server.js >> "$STATE/logs/server.log" 2>&1 < /dev/null &
    echo $! > "$STATE/run/backend.pid"
  )

  local i code
  for i in $(seq 1 60); do
    code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$BCAST_PORT/api/session" || true)"
    [[ "$code" == 401 || "$code" == 200 ]] && return 0
    kill -0 "$(cat "$STATE/run/backend.pid")" 2>/dev/null || break
    sleep 0.5
  done
  tail -n 30 "$STATE/logs/server.log" >&2
  die "Backend did not start; full log: $STATE/logs/server.log"
}

# ── Vite dev server (optional, hot reload) ──────────────────────────────────
vite_pid() { ss -ltnpH "sport = :$VITE_PORT" 2>/dev/null | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2; }

# Self-signed cert for the Vite server, covering localhost, every LAN IPv4 and
# the hostname. Regenerated when those addresses change. User-owned, no sudo.
ensure_vite_cert() {
  local -a sans=("DNS:localhost" "IP:127.0.0.1")
  local ip host_name
  for ip in $(hostname -I 2>/dev/null); do
    [[ "$ip" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ && "$ip" != 127.* ]] && sans+=("IP:$ip")
  done
  host_name="$(hostname 2>/dev/null | tr -cd 'A-Za-z0-9.-')"
  [[ -n "$host_name" && "$host_name" != localhost ]] && sans+=("DNS:$host_name")
  local san_list; san_list="$(IFS=,; echo "${sans[*]}")"

  if [[ -s "$STATE/etc/vite.key" && -s "$STATE/etc/vite.crt" ]] && ! stamp_changed vite-cert "$san_list"; then
    return
  fi
  say "Creating HTTPS certificate for the Vite dev server ($san_list)"
  (umask 077; openssl req -x509 -nodes -days 825 -newkey rsa:2048 \
    -keyout "$STATE/etc/vite.key" -out "$STATE/etc/vite.crt" \
    -subj "/CN=45flow-dev" -addext "subjectAltName = $san_list" 2>/dev/null)
  stamp_save vite-cert "$san_list"
}

start_vite() {
  # Always restart so config, certificate and address changes take effect.
  stop_pid "$(vite_pid)" "Vite"
  ensure_vite_cert
  say "Starting Vite dev server on https://$(lan_ip):$VITE_PORT (and https://localhost:$VITE_PORT)"
  # Same shape as start_backend: a separate statement inside the subshell, so
  # this script never ends up as Vite's parent waiting on it.
  (
    cd "$FLOW_DIR"
    export FLOW_DEV_VITE_CERT="$STATE/etc/vite.crt" FLOW_DEV_VITE_KEY="$STATE/etc/vite.key"
    setsid nohup npx vite --config scripts/dev/vite.dev.mjs --mode development \
      >> "$STATE/logs/vite.log" 2>&1 < /dev/null &
  )
  local i
  for i in $(seq 1 40); do curl -sk -o /dev/null "https://localhost:$VITE_PORT/" && return 0; sleep 0.5; done
  warn "Vite did not answer yet; see $STATE/logs/vite.log"
}

# ── commands ────────────────────────────────────────────────────────────────
status() {
  local ip; ip="$(lan_ip)"
  local b; b="$(backend_pid)"
  if [[ -n "$b" ]]; then echo "backend : running (pid $b)   log: $STATE/logs/server.log"
  else echo "backend : stopped   log: $STATE/logs/server.log"; fi
  if setup_done; then echo "nginx   : serving https://${ip}/"; else echo "nginx   : not set up (run: $0 setup)"; fi
  local v; v="$(vite_pid)"
  if [[ -n "$v" ]]; then echo "vite    : running on https://${ip}:$VITE_PORT/ (hot reload)"; else echo "vite    : stopped"; fi
  echo "web app : https://${ip}/app/"
  echo "data    : $STATE"
  echo "fallback login: user '$(sed -n 1p "$STATE/etc/dev-login" 2>/dev/null)', password in $STATE/etc/dev-login (line 2)"
}

cmd_up() {
  command -v node >/dev/null || die "node not found"
  command -v yarn >/dev/null || die "yarn not found"
  [[ -d "$HB_DIR" ]] || die "houston-broadcaster not found at $HB_DIR (set HB_DIR)"
  init_state
  ensure_deps
  build_all
  setup_done || run_setup
  deploy_web
  stop_pid "$(backend_pid)" backend
  start_backend
  [[ "${WITH_VITE:-0}" == 1 ]] && start_vite
  echo
  status
  echo
  echo "Sign in with your Linux username and password. Share links open at https://$(lan_ip)/link/<token>."
  echo "The HTTPS certificate is self-signed, so browsers warn the first time."
}

case "${1:-up}" in
  up)     cmd_up ;;
  vite)   WITH_VITE=1 cmd_up ;;
  restart) init_state; stop_pid "$(backend_pid)" backend; start_backend; status ;;
  stop)   stop_pid "$(backend_pid)" backend; stop_pid "$(vite_pid)" "Vite" ;;
  status) init_state; status ;;
  logs)   exec tail -n 50 -f "$STATE/logs/server.log" ;;
  setup)  init_state; run_setup ;;
  -h|--help|help) sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//' ;;
  *) die "unknown command '$1' (try: up, vite, restart, stop, status, logs, setup)" ;;
esac
