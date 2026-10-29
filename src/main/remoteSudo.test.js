// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

vi.mock('electron', () => ({ app: { getPath: () => '/unused' } }))
vi.mock('./crossPlatformSsh', () => ({
  getKeyDir: () => '/unused/keys',
  getAgentSocket: () => undefined,
  ensureKeyPair: vi.fn(async () => {}),
  regeneratePemKeyPair: vi.fn(async () => {}),
}))
const setupMocks = vi.hoisted(() => ({ ssh: null }))
vi.mock('./setupSsh', async (importOriginal) => ({
  ...(await importOriginal()),
  checkSSH: vi.fn(async () => true),
  setupSshKey: vi.fn(async () => {}),
  connectWithKey: vi.fn(async () => setupMocks.ssh),
  ensure45DrivesCommunityRepoViaScript: vi.fn(async () => {}),
  ensureBroadcasterInstalled: vi.fn(async () => {}),
}))

import { RUN_ROOT_PRELUDE, execWithSudo } from './remoteSudo'
import { installServerDepsRemotely } from './installServerDeps'

const { ensureBroadcasterInstalled, ensure45DrivesCommunityRepoViaScript } = await vi.importActual('./setupSsh')
const here = path.dirname(fileURLToPath(import.meta.url))

const PASSWORD = `p@ss w'o"rd $HOME \`id\``
const unix = process.platform !== 'win32'

function fakeSsh(stdout = '') {
  const calls = []
  return {
    calls,
    dispose: vi.fn(),
    execCommand: vi.fn(async (command, options = {}) => {
      calls.push({ command, stdin: options.stdin })
      return { code: 0, stdout, stderr: '' }
    }),
  }
}

let dir
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), '45flow-remote-sudo-'))
})
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

// Runs a captured `bash -lc '<script>'` command locally with a fake sudo that
// refuses `-n` (so the password path is taken) and logs its argv and stdin.
function runWithFakeSudo(command, stdin, extraBin = {}) {
  const bin = path.join(dir, 'bin')
  fs.mkdirSync(bin, { recursive: true })
  const tools = {
    sudo: `#!/bin/sh
[ "$1" = "-n" ] && exit 1
printf '%s\\n' "$*" >> "$LOG/args"
IFS= read -r pw
printf '%s' "$pw" > "$LOG/stdin"
shift 3
if [ "$1" = bash ] && [ -f "$2" ]; then
  printf '%s\\n' "$2" > "$LOG/script-path"
  ls -ln "$2" | awk '{print $1, $3}' > "$LOG/script-mode"
fi
exit 0
`,
    ...extraBin,
  }
  for (const [name, body] of Object.entries(tools)) {
    fs.writeFileSync(path.join(bin, name), body, { mode: 0o755 })
  }
  const home = path.join(dir, 'home')
  fs.mkdirSync(home, { recursive: true })
  const result = spawnSync('bash', ['-c', command], {
    input: stdin,
    encoding: 'utf8',
    env: { PATH: `${bin}:${process.env.PATH}`, HOME: home, LOG: dir },
  })
  const read = (f) => (fs.existsSync(path.join(dir, f)) ? fs.readFileSync(path.join(dir, f), 'utf8') : null)
  return { result, args: read('args'), sudoStdin: read('stdin'), scriptPath: read('script-path'), scriptMode: read('script-mode') }
}

function expectNoPasswordInCommands(calls) {
  for (const { command } of calls) {
    expect(command).not.toContain(PASSWORD)
    expect(command).not.toMatch(/\bPW=/)
  }
}

describe('execWithSudo', () => {
  it('sends the password on stdin and keeps it out of the command', async () => {
    const ssh = fakeSsh()
    await execWithSudo(ssh, 'run_root true', PASSWORD, { cwd: '/srv' })
    expect(ssh.calls).toEqual([{ command: `bash -lc 'run_root true'`, stdin: `${PASSWORD}\n` }])
    expect(ssh.execCommand.mock.calls[0][1].cwd).toBe('/srv')
  })

  it('sends an empty line when there is no password', async () => {
    const ssh = fakeSsh()
    await execWithSudo(ssh, 'true', undefined)
    expect(ssh.calls[0].stdin).toBe('\n')
  })

  it.skipIf(!unix)('delivers the password to sudo -S without exposing it as an argument', async () => {
    const ssh = fakeSsh()
    await execWithSudo(ssh, `set -euo pipefail\n${RUN_ROOT_PRELUDE}\nrun_root echo ok`, PASSWORD)
    const run = runWithFakeSudo(ssh.calls[0].command, ssh.calls[0].stdin)
    expect(run.result.status, run.result.stderr).toBe(0)
    expect(run.sudoStdin).toBe(PASSWORD)
    expect(run.args).toBe("-S -p  echo ok\n")
    expect(run.args).not.toContain('p@ss')
  })
})

describe('remote setup scripts', () => {
  it('ensureBroadcasterInstalled passes the password on stdin only', async () => {
    const ssh = fakeSsh()
    await ensureBroadcasterInstalled(ssh, { password: PASSWORD })
    expectNoPasswordInCommands(ssh.calls)
    expect(ssh.calls[0].stdin).toBe(`${PASSWORD}\n`)
  })

  it('ensure45DrivesCommunityRepoViaScript passes the password on stdin only', async () => {
    const ssh = fakeSsh()
    await ensure45DrivesCommunityRepoViaScript(ssh, { password: PASSWORD })
    expectNoPasswordInCommands(ssh.calls)
    const setup = ssh.calls.find((c) => c.command.includes('run_root'))
    expect(setup.stdin).toBe(`${PASSWORD}\n`)
  })

  it('installServerDepsRemotely sends no password in any command', async () => {
    const ssh = fakeSsh('APP_ADDED=true\nALREADY_INSTALLED=true')
    setupMocks.ssh = ssh
    const result = await installServerDepsRemotely({
      host: '192.0.2.10', username: 'admin', password: PASSWORD, bcastPort: 9096, httpsPort: 8443,
    })
    expect(result).toEqual({ success: true })
    expectNoPasswordInCommands(ssh.calls)
    const sudoScripts = ssh.calls.filter((c) => c.command.includes('run_root'))
    // Port/firewall config, app registration and forced re-bootstrap.
    expect(sudoScripts).toHaveLength(3)
    for (const call of sudoScripts) expect(call.stdin).toBe(`${PASSWORD}\n`)
  })

  it.skipIf(!unix)('forced re-bootstrap runs as root with the password on stdin', async () => {
    const ssh = fakeSsh('APP_ADDED=true\nALREADY_INSTALLED=true')
    setupMocks.ssh = ssh
    await installServerDepsRemotely({ host: '192.0.2.10', username: 'admin', password: PASSWORD })
    const call = ssh.calls.find((c) => c.command.includes('FORCE_BOOTSTRAP'))
    const run = runWithFakeSudo(call.command, call.stdin)
    expect(run.result.status, run.result.stderr).toBe(0)
    expect(run.sudoStdin).toBe(PASSWORD)
    expect(run.args).toContain('env FORCE_BOOTSTRAP=1 /opt/45drives/houston-broadcaster/scripts/bootstrap-studio-share.sh')
  })

  // The repo script runs on the Linux server (GNU sed -i), so only exercise it on Linux.
  it.skipIf(process.platform !== 'linux')('repo setup runs root from a private mktemp file and removes it', async () => {
    const ssh = fakeSsh()
    await ensure45DrivesCommunityRepoViaScript(ssh, { password: PASSWORD })
    const call = ssh.calls.find((c) => c.command.includes('run_root'))
    expect(call.command).not.toContain('/tmp/45drives-repo-setup.sh')
    // Fake find so host repo files never short-circuit the script.
    const run = runWithFakeSudo(call.command, call.stdin, { find: '#!/bin/sh\nexit 0\n' })
    expect(run.result.status, run.result.stderr).toBe(0)
    expect(run.sudoStdin).toBe(PASSWORD)
    const scriptPath = run.scriptPath.trim()
    expect(scriptPath).toMatch(/^\/tmp\/45drives-repo-setup\.[A-Za-z0-9]{10}$/)
    const [mode, uid] = run.scriptMode.trim().split(' ')
    expect(mode).toBe('-rw-------')
    expect(Number(uid)).toBe(process.getuid())
    expect(fs.existsSync(scriptPath)).toBe(false)
  })
})

describe('Electron webview hardening', () => {
  const mainSource = fs.readFileSync(path.join(here, 'main.ts'), 'utf8')

  it('disables the webview tag and blocks webview attachment', () => {
    expect(mainSource).toContain('webviewTag: false')
    expect(mainSource).not.toContain('webviewTag: true')
    expect(mainSource).not.toContain('webview-preload')
    expect(mainSource).toMatch(/will-attach-webview', \(event\) => \{\s*event\.preventDefault\(\);/)
    expect(fs.existsSync(path.join(here, 'webview-preload.js'))).toBe(false)
  })
})
