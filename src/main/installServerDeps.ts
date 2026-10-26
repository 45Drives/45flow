// installServerDeps.ts
import path from "path";
import { NodeSSH } from "node-ssh";
import { checkSSH, setupSshKey, ensureBroadcasterInstalled, connectWithKey, ensure45DrivesCommunityRepoViaScript } from "./setupSsh";
import { getAgentSocket, getKeyDir, ensureKeyPair, regeneratePemKeyPair } from "./crossPlatformSsh";
import { RUN_ROOT_PRELUDE, execWithSudo, shellQuote } from "./remoteSudo";

type ProgressFn = (p: { step: string; label: string }) => void;

export async function installServerDepsRemotely(opts: {
    host: string; username: string; password: string; sshPort?: number; bcastPort?: number, httpsPort?: number, sshKeyComment?: string; onProgress?: ProgressFn;
}) {
    const { host, username, password, sshPort, bcastPort, httpsPort, sshKeyComment, onProgress } = opts;
    const apiPort = bcastPort ?? 9095;
    const send = (step: string, label: string) => onProgress?.({ step, label });
    const shQ = shellQuote;
    try {
        let port = sshPort ?? 22;

        send("probe", `Probing ${host}:${port}…`);
        let reachable = await checkSSH(host, 3000, port);

        // If user did not specify a port and 22 is closed, try a few common alternatives
        if (!reachable && sshPort == null) {
            const candidates = [2222, 2200, 2022];
            for (const cand of candidates) {
                send("probe", `Probing ${host}:${cand}…`);
                if (await checkSSH(host, 3000, cand)) {
                    port = cand;
                    reachable = true;
                    break;
                }
            }
        }

        if (!reachable) {
            return { success: false, error: `Host ${host}:${port} not reachable.` };
        }

        // Try agent first, else plant key via password
        let hasAuth = false;
        const agentSock = getAgentSocket();
        if (agentSock) {
            send("auth", "Trying SSH agent…");
            const trial = new NodeSSH();
            try {
                await trial.connect({ host, username, agent: agentSock, port, tryKeyboard: false });
                hasAuth = true;
            } catch {
                // ignore agent failure
            }
            trial.dispose();
        }

        send("connect", "Connecting via SSH…");
        const keyDir = getKeyDir();
        const priv = path.join(keyDir, "id_ed25519");
        await ensureKeyPair(priv, `${priv}.pub`);

        if (!hasAuth) {
            send("key", "Creating/planting SSH key…");
            await setupSshKey(host, username, password, undefined, sshKeyComment, port);
        }

        async function tryConnectWithCurrentKey() {
            return hasAuth
                ? await connectWithKey({ host, username, privateKey: priv, agent: agentSock!, port})
                : await connectWithKey({ host, username, privateKey: priv, port });
        }

        let ssh: NodeSSH;
        try {
            ssh = await tryConnectWithCurrentKey();
        } catch (e: any) {
            const m = String(e?.message || e);
            if (/unsupported key format/i.test(m)) {
                // Fallback: regenerate PEM and retry
                send("key", "Regenerating SSH key (PEM)…");
                await regeneratePemKeyPair(priv);
                ssh = await tryConnectWithCurrentKey();
            } else {
                throw e; // real failure
            }
        }

        try {
            // 1) Repo
            send("repo", "Setting up 45Drives repo…");
            await ensure45DrivesCommunityRepoViaScript(ssh, { password });

            // 1.5) Write app config BEFORE install so bootstrap knows which app to set up.
            //      If broadcaster is already installed and we added a new app, re-bootstrap.
            send("config", "Registering app with server…");
            const configResult = await writeAppConfigRemotely(ssh, {
                password,
                app: '45flow',
                bcastPort: bcastPort ?? 9095,
                httpsPort: httpsPort ?? 443,
            });

            // 2) Install Broadcaster (skips if already installed)
            send("install", "Installing Broadcaster…");
            await ensureBroadcasterInstalled(ssh, { password });

            // 2.5) If broadcaster was already installed and we added a new app, force re-bootstrap
            if (configResult.alreadyInstalled && configResult.appAdded) {
                send("bootstrap", "Re-running bootstrap for new app…");
                await forceRebootstrap(ssh, { password });
            }

            // 3) Optional port overrides
            if (bcastPort != null || httpsPort != null) {
                const envLines: string[] = [];

                // Always write all three so the file is self-contained and predictable
                const effectiveBcast = bcastPort ?? 9095;
                const effectiveHttps = httpsPort ?? 443;
                const effectiveHttp = 80; // add an httpPort param later?

                envLines.push(`BCAST_PORT=${effectiveBcast}`);
                envLines.push(`HTTP_PORT=${effectiveHttp}`);
                envLines.push(`HTTPS_PORT=${effectiveHttps}`);

                const payload = envLines.join("\n");

                const script = `
set -euo pipefail

${RUN_ROOT_PRELUDE}

# 1) Write env files with new ports
payload=${shQ(payload)}

for f in /etc/default/houston-broadcaster /etc/sysconfig/houston-broadcaster; do
  run_root mkdir -p "$(dirname "$f")"
  printf '%s\\n' "$payload" | run_root tee "$f" >/dev/null
done

run_root systemctl daemon-reload || true

# 2) Open firewall + SELinux for internal API port
BCAST_PORT=${effectiveBcast}

if command -v firewall-cmd >/dev/null 2>&1; then
  run_root firewall-cmd --permanent --add-port="$BCAST_PORT"/tcp >/dev/null 2>&1 || true
  # Optional: close the old default 9095 if you want to be strict
  # if [ "$BCAST_PORT" != "9095" ]; then
  #   run_root firewall-cmd --permanent --remove-port=9095/tcp >/dev/null 2>&1 || true
  # fi
  run_root firewall-cmd --reload || true
elif command -v ufw >/dev/null 2>&1; then
  run_root ufw allow "$BCAST_PORT"/tcp || true
fi

if command -v getenforce >/dev/null 2>&1 && [ "$(getenforce)" = "Enforcing" ]; then
  run_root setsebool -P httpd_can_network_connect 1 || true
  if command -v semanage >/dev/null 2>&1; then
    if ! semanage port -l | awk '$1=="http_port_t" {print $0}' | grep -qE "(^| )$BCAST_PORT(/tcp)?( |$)"; then
      run_root semanage port -a -t http_port_t -p tcp "$BCAST_PORT" 2>/dev/null || \
      run_root semanage port -m -t http_port_t -p tcp "$BCAST_PORT" || true
    fi
  fi
fi

# 3) Keep nginx upstream in sync with BCAST_PORT when Houston vhost exists.
# This prevents 443 -> stale upstream port drift (e.g., old 9095 while app runs on 9096).
NGINX_CONF="/etc/nginx/conf.d/houston-broadcaster.conf"
if [ -f "$NGINX_CONF" ]; then
  run_root sed -E -i \
    '/^[[:space:]]*upstream[[:space:]]+houston_broadcaster_upstream[[:space:]]*\\{/,/^[[:space:]]*\\}[[:space:]]*$/ s/(server[[:space:]]+127\\.0\\.0\\.1:)[0-9]+;/\\1'"$BCAST_PORT"';/' \
    "$NGINX_CONF" || true

  run_root chmod 0644 "$NGINX_CONF" || true
  if command -v restorecon >/dev/null 2>&1; then
    run_root restorecon "$NGINX_CONF" >/dev/null 2>&1 || true
  fi

  if command -v nginx >/dev/null 2>&1; then
    if run_root nginx -t >/dev/null 2>&1; then
      run_root systemctl reload nginx >/dev/null 2>&1 || run_root systemctl restart nginx >/dev/null 2>&1 || true
    else
      run_root nginx -t || true
    fi
  fi
fi
`.trim();

                send("config", "Configuring broadcaster ports, firewall, and nginx…");
                const res = await execWithSudo(ssh, script, password);
                if ((res.code ?? 0) !== 0) {
                    throw new Error(
                        res.stderr ||
                        res.stdout ||
                        "Failed to configure broadcaster ports / firewall / nginx"
                    );
                }
            }



            // 4) Enable + start service
            send("enable", "Enabling & starting service…");
            const enableRes = await ssh.execCommand(
                `bash -lc 'sudo systemctl enable houston-broadcaster || true; sudo systemctl restart houston-broadcaster || sudo systemctl start houston-broadcaster || true'`
            );
            if ((enableRes.code ?? 0) !== 0) {
                // Non-fatal, but worth surfacing to logs/telemetry via step
                send(
                    "warn",
                    "Service enable/start returned non-zero; continuing…"
                );
            }

            // 5) Wait for health / bootstrap completion with bounded time
            //    Bootstrap can take 5-10 min on fresh installs (installs Node, nginx,
            //    ClamAV, ffmpeg, certs, etc.). Use a two-phase approach:
            //    Phase 1: Quick health check (service might already be ready)
            //    Phase 2: Watch bootstrap-houston-broadcaster journal for completion,
            //             then re-check health.
            send("wait", "Waiting for service health…");
            const health = await ssh.execCommand(
                `bash -lc 'for i in {1..30}; do curl -fsS http://127.0.0.1:${apiPort}/healthz >/dev/null 2>&1 && exit 0; sleep 2; done; exit 1;'`
            );

            if ((health.code ?? 1) !== 0) {
                // Health not yet OK — bootstrap is likely still running.
                // Watch the bootstrap service journal for up to 10 minutes.
                send(
                    "wait",
                    "Bootstrap in progress (installing dependencies)…"
                );

                const journal = await ssh.execCommand(
                    `bash -lc 'for i in {1..300}; do journalctl -u bootstrap-houston-broadcaster -o cat --since "15 min ago" 2>/dev/null | grep -qE "(Bootstrap already at version|OK[.] external_base=|OK[.] DB initialized)" && exit 0; sleep 2; done; exit 1;'`
                );

                if ((journal.code ?? 1) !== 0) {
                    // Check if the service itself came up while we were waiting
                    const retryHealth = await ssh.execCommand(
                        `bash -lc 'curl -fsS http://127.0.0.1:${apiPort}/healthz >/dev/null 2>&1 && exit 0; exit 1;'`
                    );
                    if ((retryHealth.code ?? 1) === 0) {
                        return { success: true };
                    }
                    send("error", "Timed out waiting for bootstrap to finish.");
                    return {
                        success: false,
                        error: "Timed out waiting for bootstrap to finish. Check server logs: journalctl -u bootstrap-houston-broadcaster",
                    };
                }

                // Bootstrap finished — give the main service a moment to start,
                // then verify health.
                send("wait", "Bootstrap complete; starting service…");
                await ssh.execCommand(
                    `bash -lc 'sudo systemctl restart houston-broadcaster 2>/dev/null || true'`
                );

                const postBootHealth = await ssh.execCommand(
                    `bash -lc 'for i in {1..30}; do curl -fsS http://127.0.0.1:${apiPort}/healthz >/dev/null 2>&1 && exit 0; sleep 2; done; exit 1;'`
                );

                if ((postBootHealth.code ?? 1) !== 0) {
                    send("error", "Bootstrap finished but service health check failed.");
                    return {
                        success: false,
                        error: "Bootstrap completed but houston-broadcaster service did not become healthy. Check: journalctl -u houston-broadcaster",
                    };
                }
            }

            // If we got here: health check succeeded.
            return { success: true };
        } finally {
            ssh.dispose();
        }
    } catch (err: any) {
        return { success: false, error: err?.message || String(err) };
    }
}

/**
 * Write/update the houston-apps.json config on the remote server via SSH.
 * - If the config doesn't exist: creates it with the specified app.
 * - If the config exists but doesn't have this app: adds it.
 * - If the config already has this app: no-op.
 * 
 * Also detects whether broadcaster is already installed so the caller
 * knows whether to trigger a re-bootstrap.
 */
async function writeAppConfigRemotely(
  ssh: NodeSSH,
  opts: { password?: string; app: string; bcastPort?: number; httpsPort?: number }
): Promise<{ appAdded: boolean; alreadyInstalled: boolean }> {
  const q = shellQuote;
  const app = opts.app;
  const bcastPort = opts.bcastPort ?? 9095;
  const httpsPort = opts.httpsPort ?? 443;

  const script = `
set -euo pipefail

${RUN_ROOT_PRELUDE}
APP=${q(app)}
BCAST_PORT=${bcastPort}
HTTPS_PORT=${httpsPort}

CONFIG="/etc/45drives/houston-apps.json"
APP_ADDED="false"
ALREADY_INSTALLED="false"

# Check if broadcaster is already installed
if command -v rpm >/dev/null 2>&1; then
  rpm -q houston-broadcaster >/dev/null 2>&1 && ALREADY_INSTALLED="true"
elif command -v dpkg >/dev/null 2>&1; then
  dpkg -s houston-broadcaster >/dev/null 2>&1 && ALREADY_INSTALLED="true"
fi

# Ensure config directory
run_root mkdir -p /etc/45drives

if [ -f "\$CONFIG" ]; then
  # Config exists — check if app is already registered
  if command -v python3 >/dev/null 2>&1; then
    RESULT=$(python3 -c "
import json, sys
try:
    with open('\$CONFIG') as f:
        cfg = json.load(f)
    apps = cfg.get('apps', [])
    if '\$APP' in apps:
        print('exists')
    else:
        apps.append('\$APP')
        cfg['apps'] = apps
        if 'registered_at' not in cfg:
            cfg['registered_at'] = {}
        import datetime
        cfg['registered_at']['\$APP'] = datetime.datetime.now().isoformat()
        with open('\$CONFIG', 'w') as f:
            json.dump(cfg, f, indent=2)
        print('added')
except Exception as e:
    print('error:' + str(e), file=sys.stderr)
    sys.exit(1)
" 2>&1) || true

    if [ "\$RESULT" = "added" ]; then
      APP_ADDED="true"
    fi
  else
    # No python3 — can't parse JSON, just leave existing config alone
    :
  fi
else
  # No config — create fresh
  TIMESTAMP=$(date -Iseconds 2>/dev/null || date +%Y-%m-%dT%H:%M:%S)
  run_root tee "\$CONFIG" >/dev/null <<ENDJSON
{
  "apps": ["\$APP"],
  "settings": {
    "http_port": 80,
    "https_port": \$HTTPS_PORT,
    "bcast_port": \$BCAST_PORT,
    "manage_nginx": true,
    "manage_firewall": true,
    "existing_nginx": false,
    "custom_nginx_port": null
  },
  "registered_at": {
    "\$APP": "\$TIMESTAMP"
  }
}
ENDJSON
  APP_ADDED="true"
fi

echo "APP_ADDED=\$APP_ADDED"
echo "ALREADY_INSTALLED=\$ALREADY_INSTALLED"
`.trim();

  const res = await execWithSudo(ssh, script, opts.password);
  const output = res.stdout || '';

  const appAdded = output.includes('APP_ADDED=true');
  const alreadyInstalled = output.includes('ALREADY_INSTALLED=true');

  return { appAdded, alreadyInstalled };
}

/**
 * Force re-run the bootstrap script on a server where broadcaster is already installed.
 * Used when a new app is added to an existing installation.
 */
async function forceRebootstrap(
  ssh: NodeSSH,
  opts: { password?: string }
): Promise<void> {
  const script = `
set -euo pipefail

${RUN_ROOT_PRELUDE}

# Force re-run bootstrap with the updated config
run_root env FORCE_BOOTSTRAP=1 /opt/45drives/houston-broadcaster/scripts/bootstrap-studio-share.sh
`.trim();

  const res = await execWithSudo(ssh, script, opts.password);
  if (res.stdout) console.log('[forceRebootstrap] stdout:', res.stdout);
  if (res.stderr) console.log('[forceRebootstrap] stderr:', res.stderr);
  if ((res.code ?? 1) !== 0) {
    // Non-fatal — log but don't fail the whole install
    console.warn('[forceRebootstrap] non-zero exit code:', res.code);
  }
}
