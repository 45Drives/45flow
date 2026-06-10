// installServerDeps.ts
import path from "path";
import { NodeSSH } from "node-ssh";
import { checkSSH, setupSshKey, ensureBroadcasterInstalled, connectWithKey, ensure45DrivesCommunityRepoViaScript } from "./setupSsh";
import { getAgentSocket, getKeyDir, ensureKeyPair, regeneratePemKeyPair } from "./crossPlatformSsh";

type ProgressFn = (p: { step: string; label: string }) => void;

export async function installServerDepsRemotely(opts: {
    host: string; username: string; password: string; sshPort?: number; bcastPort?: number, httpsPort?: number, sshKeyComment?: string; onProgress?: ProgressFn;
}) {
    const { host, username, password, sshPort, bcastPort, httpsPort, sshKeyComment, onProgress } = opts;
    const apiPort = bcastPort ?? 9095;
    const send = (step: string, label: string) => onProgress?.({ step, label });
    const shQ = (s: string) => `'${s.replace(/'/g, `'\"'\"'`)}'`;
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
            send("repo", "Setting up 45Drives community repo…");
            await ensure45DrivesCommunityRepoViaScript(ssh, { password });

            // 2) Install Broadcaster
            send("install", "Installing Broadcaster…");
            await ensureBroadcasterInstalled(ssh, { password });

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

                const pw = password ?? "";
                const script = `
set -euo pipefail

PW=${shQ(pw)}

have_sudo() { sudo -n true 2>/dev/null; }
run_root() {
  if have_sudo; then sudo "$@"; else printf '%s\\n' "$PW" | sudo -S -p '' "$@"; fi
}

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
                const res = await ssh.execCommand(`bash -lc ${shQ(script)}`);
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
            send("wait", "Waiting for service health…");
            const health = await ssh.execCommand(
                `bash -lc 'for i in {1..30}; do curl -fsS http://127.0.0.1:${apiPort}/healthz >/dev/null 2>&1 && exit 0; sleep 1; done; exit 1;'`
            );

            if ((health.code ?? 1) !== 0) {
                // Health not yet OK — fall back to watching logs for bootstrap completion,
                // but treat total failure as a real timeout error (not success).
                send(
                    "wait",
                    "Health not yet OK; watching logs for bootstrap completion…"
                );

                const journal = await ssh.execCommand(
                    `bash -lc 'for i in {1..60}; do journalctl -u houston-broadcaster -o cat --since "5 min ago" | grep -q "Finished Houston Broadcaster first-run bootstrap" && exit 0; sleep 1; done; exit 1;'`
                );

                if ((journal.code ?? 1) !== 0) {
                    send("error", "Timed out waiting for bootstrap to finish.");
                    return {
                        success: false,
                        error: "Timed out waiting for bootstrap to finish",
                    };
                }

                // Journal saw the bootstrap-finished marker even though health loop failed.
                // At this point, the renderer will probe /healthz again anyway.
                send("wait", "Bootstrap finished; waiting for UI health probe…");
            }

            // If we got here: either health loop succeeded OR journal loop saw completion.
            return { success: true };
        } finally {
            ssh.dispose();
        }
    } catch (err: any) {
        return { success: false, error: err?.message || String(err) };
    }
}
