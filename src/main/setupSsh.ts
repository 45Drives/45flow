// setupSsh.ts
import fs from "fs";
import net from "net";
import path from "path";
import { NodeSSH } from "node-ssh";
import { scrubSecrets } from './scrubSecrets';
import { getKeyDir } from "./crossPlatformSsh";

/** Quick TCP probe for an SSH port (default 22) */
export function checkSSH(host: string, timeout = 3000, port = 22): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    sock.setTimeout(timeout);
    sock.once("connect", () => { sock.destroy(); resolve(true); });
    sock.once("error", () => { sock.destroy(); resolve(false); });
    sock.once("timeout", () => { sock.destroy(); resolve(false); });
    sock.connect(port, host);
  });
}


/** password auth (one-time) to plant our pubkey */
export async function connectWithPassword(args: { host: string; username: string; password: string; port?: number }) {
  const { host, username, password, port } = args;
  const ssh = new NodeSSH();
  try {
    await ssh.connect({
      host,
      username,
      password,
      port: port ?? 22,
      tryKeyboard: true,
      onKeyboardInteractive(_n, _i, _l, prompts, finish) {
        finish(prompts.map(() => password));
      },
      readyTimeout: 20_000,
    });
    return ssh;
  } catch (err: any) {
    const msg = err?.message || String(err);
    console.error(`[SSH] Password auth failed for ${username}@${host}:${port ?? 22} - ${msg}`);
    throw err;
  }
}


/** key/agent auth */
export async function connectWithKey(args: { host: string; username: string; privateKey: string; agent?: string; port?: number }) {
  const { host, username, privateKey, agent, port } = args;

  const keyData = privateKey.includes('BEGIN ')
    ? privateKey
    : fs.readFileSync(privateKey, 'utf8');

  const ssh = new NodeSSH();
  await ssh.connect({
    host,
    username,
    privateKey: keyData,
    agent,
    port: port ?? 22,
    tryKeyboard: false,
    readyTimeout: 20_000,
    debug: (m: string) => console.debug(`ssh.debug ${scrubSecrets(m)}`),
  });
  return ssh;
}


/** Append public key to remote authorized_keys (idempotent) */
export async function setupSshKey(
  host: string,
  username: string,
  password: string,
  pubPath?: string,
  comment = '45studio@client',
  port = 22,
): Promise<void> {
  const keyDir = getKeyDir();
  const pub = pubPath ?? path.join(keyDir, 'id_ed25519.pub');

  const publicKeyLine = (fs.readFileSync(pub, 'utf8').trim().replace(/["`]/g, '') + ` ${comment}`).trim();
  
  try {
    const ssh = await connectWithPassword({ host, username, password, port });

    const cmd = [
      'mkdir -p ~/.ssh',
      'chmod 700 ~/.ssh',
      `grep -v ' ${comment}$' ~/.ssh/authorized_keys 2>/dev/null > ~/.ssh/authorized_keys.tmp || true`,
      'mv ~/.ssh/authorized_keys.tmp ~/.ssh/authorized_keys 2>/dev/null || true',
      `echo "${publicKeyLine}" >> ~/.ssh/authorized_keys`,
      'chmod 600 ~/.ssh/authorized_keys',
    ].join(' && ');

    await ssh.execCommand(cmd);
    ssh.dispose();
  } catch (err: any) {
    const msg = err?.message || String(err);
    console.error(`[SSH] setupSshKey failed for ${username}@${host}:${port} - ${msg}`);
    throw err;
  }
}


/** Ensure houston-broadcaster is installed on remote */
export async function ensureBroadcasterInstalled(
  ssh: NodeSSH,
  opts: { password?: string }
) {
  const q = (s: string) => `'${s.replace(/'/g, `'\"'\"'`)}'`;
  const PW = opts.password ?? "";

  const script = `
set -euo pipefail

PW=${q(PW)}

have_sudo() { sudo -n true 2>/dev/null; }
run_root() {
  if have_sudo; then sudo "$@"; else printf '%s\\n' "$PW" | sudo -S -p '' "$@"; fi
}

# Check if already installed — skip full install if so
already_installed=false
if command -v rpm >/dev/null 2>&1; then
  rpm -q houston-broadcaster >/dev/null 2>&1 && already_installed=true
elif command -v dpkg >/dev/null 2>&1; then
  dpkg -s houston-broadcaster >/dev/null 2>&1 && already_installed=true
fi

if [ "$already_installed" = true ]; then
  # Package exists — just make sure the service is enabled and running
  run_root systemctl enable --now houston-broadcaster || true
  echo "houston-broadcaster already installed, ensured service is running"
  exit 0
fi

if command -v rpm >/dev/null 2>&1; then
  # --- RHEL/CentOS/Rocky/Fedora family ---
  if command -v dnf >/dev/null 2>&1; then
    run_root dnf -y --refresh install houston-broadcaster
  else
    run_root yum -y install houston-broadcaster
  fi

  run_root systemctl enable --now houston-broadcaster || true
  exit 0

elif command -v dpkg >/dev/null 2>&1; then
  # --- Debian/Ubuntu family ---
  run_root apt-get update -y
  DEBIAN_FRONTEND=noninteractive run_root apt-get install -y houston-broadcaster
  run_root systemctl enable --now houston-broadcaster || true
  exit 0

else
  echo "No supported package manager found" >&2
  exit 2
fi
`.trim();

  const res = await ssh.execCommand(`bash -lc ${q(script)}`);
  if ((res.code ?? 1) !== 0) {
    throw new Error(`install failed: ${res.stderr || res.stdout}`);
  }
}

export async function ensure45DrivesCommunityRepoViaScript(
  ssh: NodeSSH,
  opts: { password?: string }
) {
  const q = (s: string) => `'${s.replace(/'/g, `'\"'\"'`)}'`;
  const PW = opts.password ?? "";

  // 1) Preflight: can we reach repo.45drives.com at all?
  const pingRepoScript = `
set -euo pipefail

curl -fsS --max-time 10 https://repo.45drives.com/key/gpg.asc >/dev/null || {
  echo "ERROR: Unable to reach https://repo.45drives.com over HTTPS. Check firewall/proxy." >&2
  exit 1
}
`.trim();

  const pingRes = await ssh.execCommand(`bash -lc ${q(pingRepoScript)}`);
  if ((pingRes.code ?? 1) !== 0) {
    const msg = pingRes.stderr || pingRes.stdout || "unknown error";
    throw new Error(
      [
        "ensure45DrivesCommunityRepoViaScript failed during connectivity check.",
        "",
        "The remote host could not reach https://repo.45drives.com over HTTPS.",
        "Please check firewall / proxy settings and confirm this works on the server:",
        "",
        "  curl -v https://repo.45drives.com/key/gpg.asc",
        "",
        "Original error:",
        msg,
      ].join("\n")
    );
  }

  // 2) Actual repo-setup script (your original, unchanged logic)
  const script = `
set -euo pipefail

PW=${q(PW)}

have_sudo() { sudo -n true 2>/dev/null; }
run_root() {
  if have_sudo; then sudo "$@"; else printf '%s\\n' "$PW" | sudo -S -p '' "$@"; fi
}

tmp_script="/tmp/45drives-community-setup.sh"

cat >"$tmp_script" << 'EOF'
#!/bin/bash

# 2021 Dawson Della Valle <ddellavalle@45drives.com>
# 2025 Brett Kelly <bkelly@45drives.com>
# v2
# OS Supported
# Rocky 7,8,9
# Ubuntu 20,22
# Debian Bookworm

function get_base_distro() {
    local distro=$(cat /etc/os-release | grep '^ID_LIKE=' | head -1 | sed 's/ID_LIKE=//' | sed 's/"//g' | awk '{print $1}')

    if [ -z "$distro" ]; then
        distro=$(cat /etc/os-release | grep '^ID=' | head -1 | sed 's/ID=//' | sed 's/"//g' | awk '{print $1}')
    fi

    echo $distro
}

function get_distro() {
    local distro=$(cat /etc/os-release | grep '^ID=' | head -1 | sed 's/ID=//' | sed 's/"//g' | awk '{print $1}')
    
    echo $distro
}

function get_version_id() {
    local version_id=$(cat /etc/os-release | grep '^VERSION_ID=' | head -1 | sed 's/VERSION_ID=//' | sed 's/"//g' | awk '{print $1}' | awk 'BEGIN {FS="."} {print $1}')
    
    echo $version_id
}

function get_codename() {
    local distro=$(cat /etc/os-release | grep '^VERSION_CODENAME' | cut -d = -f2)
    
    echo $distro
}

euid=$(id -u)

if [ $euid -ne 0 ]; then
    echo -e '\\nYou must be root to run this utility.\\n'
    exit 1
fi

distro=$(get_base_distro)
custom_distro=$(get_distro)
distro_version=$(get_version_id)
distro_codename=$(get_codename)

if [ "$distro" == "rhel" ] || [ "$distro" == "fedora" ]; then
    echo "Detected RHEL-based distribution. Continuing..."

    items=$(find /etc/yum.repos.d -name '45drives.repo')

    if [[ -z "$items" ]]; then
        echo "There were no existing 45Drives repos found. Setting up the new repo..."
    else
        count=$(echo "$items" | wc -l)
        echo "There were $count 45Drives repo(s) found. Archiving..."

        mkdir -p /opt/45drives/archives/repos

        mv /etc/yum.repos.d/45drives.repo /opt/45drives/archives/repos/45drives-$(date +%Y-%m-%d).repo

        echo "The obsolete repos have been archived to '/opt/45drives/archives/repos'. Setting up the new repo..."
    fi

    # COMMUNITY repo instead of enterprise
    curl -sSL https://repo.45drives.com/repofiles/rocky/45drives-community.repo -o /etc/yum.repos.d/45drives-community.repo

    res=$?

    if [ "$res" -ne "0" ]; then
        echo "Failed to download the new repo file. Please review the above error and try again."
        exit 1
    fi

    el_id="none"

    if [[ "$distro_version" == "7" ]] || [[ "$distro_version" == "8" ]] || [[ "$distro_version" == "9" ]]; then
        el_id=$distro_version
    fi

    if [[ "$el_id" == "none" ]]; then
        echo "Failed to detect the repo that would best suit your system. Please contact repo@45drives.com to get this issue rectified!"
        exit 1
    fi

    res=$?

    if [ "$res" -ne "0" ]; then
        echo "Failed to update the new repo file. Please review the above error and try again."
        exit 1
    fi

    echo "The new COMMUNITY repo file has been downloaded. Updating your package lists..."

    pm_bin=dnf

    command -v dnf > /dev/null 2>&1 || {
        pm_bin=yum
    }

    echo "Using the '$pm_bin' package manager..."

    $pm_bin clean all -y

    res=$?

    if [ "$res" -ne "0" ]; then
        echo "Failed to run '$pm_bin clean all -y'. Please review the above error and try again."
        exit 1
    fi

    echo "Success! Your COMMUNITY repo has been updated to our new server!"
    exit 0
fi

if [ "$distro" == "debian" ]; then
    echo "Detected Debian-based distribution. Continuing..."

    items=$(find /etc/apt/sources.list.d -name 45drives.list)

    if [[ -z "$items" ]]; then
        echo "There were no existing 45Drives repos found. Setting up the new repo..."
    else
        count=$(echo "$items" | wc -l)
        echo "There were $count 45Drives repo(s) found. Archiving..."

        mkdir -p /opt/45drives/archives/repos

        mv /etc/apt/sources.list.d/45drives.list /opt/45drives/archives/repos/45drives-$(date +%Y-%m-%d).list
    
        echo "The obsolete repos have been archived to '/opt/45drives/archives/repos'. Setting up the new repo..."
    fi

    if [[ -f "/etc/apt/sources.list.d/45drives.sources" ]]; then
        rm -f /etc/apt/sources.list.d/45drives.sources
    fi

    echo "Updating ca-certificates to ensure certificate validity..."

    apt update
    apt install ca-certificates -y

    wget -qO - https://repo.45drives.com/key/gpg.asc | gpg --pinentry-mode loopback --batch --yes --dearmor -o /usr/share/keyrings/45drives-archive-keyring.gpg

    res=$?

    if [ "$res" -ne "0" ]; then
        echo "Failed to add the gpg key to the apt keyring. Please review the above error and try again."
        exit 1
    fi

    # COMMUNITY list instead of enterprise
    curl -sSL https://repo.45drives.com/repofiles/$custom_distro/45drives-community-$distro_codename.list -o /etc/apt/sources.list.d/45drives-community-$distro_codename.list

    res=$?

    if [ "$res" -ne "0" ]; then
        echo "Failed to download the new repo file. Please review the above error and try again."
        exit 1
    fi

    if [[ "$distro_codename" != "focal" ]] && [[ "$distro_codename" != "jammy" ]] && [[ "$distro_codename" != "bookworm" ]]; then
        echo "You are on an unsupported version of Debian/Ubuntu. Current repo support is Ubuntu 22 (jammy), Ubuntu 20 (focal), and Debian 12 (bookworm)."
        exit 1
    fi

    echo "The new COMMUNITY repo file has been downloaded. Updating your package lists..."

    pm_bin=apt

    $pm_bin update -y

    res=$?

    if [ "$res" -ne "0" ]; then
        echo "Failed to run '$pm_bin update -y'. Please review the above error and try again."
        exit 1
    fi

    echo "Success! Your COMMUNITY repo has been updated to our new server!"
    exit 0
fi

echo -e "\\nThis command has been run on a distribution that is not supported by the 45Drives Team.\\n\\nIf you believe this is a mistake, please contact our team at repo@45drives.com!\\n"
exit 1
EOF

run_root chmod +x "$tmp_script"
run_root bash "$tmp_script"
run_root rm -f "$tmp_script"
`.trim();

  const res = await ssh.execCommand(`bash -lc ${q(script)}`);
  if ((res.code ?? 1) !== 0) {
    const msg = res.stderr || res.stdout || "unknown error";
    throw new Error(
      [
        "ensure45DrivesCommunityRepoViaScript failed while setting up the repo.",
        "",
        "On RHEL/Rocky-type systems, try on the server:",
        "  sudo dnf clean all && sudo dnf makecache --disablerepo='*' --enablerepo='45drives_community'",
        "",
        "On Debian/Ubuntu systems, try:",
        "  sudo apt update",
        "",
        "Original error:",
        msg,
      ].join("\n")
    );
  }
}