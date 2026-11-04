// remoteSudo.ts
// Runs remote bash scripts that may need sudo without putting the password on
// the remote command line, where `ps` and /proc/*/cmdline would expose it.
import type { NodeSSH, SSHExecCommandOptions, SSHExecCommandResponse } from "node-ssh";

export const shellQuote = (s: string) => `'${s.replace(/'/g, `'"'"'`)}'`;

/**
 * Bash prelude for scripts run with execWithSudo. Reads the password from the
 * first stdin line and defines run_root. printf is a bash builtin, so the
 * password never becomes a process argument.
 */
export const RUN_ROOT_PRELUDE = `
IFS= read -r PW || true
have_sudo() { sudo -n true 2>/dev/null; }
run_root() {
  if have_sudo; then sudo "$@"; else printf '%s\\n' "$PW" | sudo -S -p '' "$@"; fi
}
`.trim();

/** Run `script` with `bash -lc`, sending the sudo password over stdin. */
export function execWithSudo(
  ssh: Pick<NodeSSH, "execCommand">,
  script: string,
  password: string | undefined,
  options: Omit<SSHExecCommandOptions, "stdin"> = {},
): Promise<SSHExecCommandResponse> {
  return ssh.execCommand(`bash -lc ${shellQuote(script)}`, {
    ...options,
    stdin: `${password ?? ""}\n`,
  });
}
