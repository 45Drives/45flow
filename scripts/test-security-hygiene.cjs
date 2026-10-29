#!/usr/bin/env node
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { randomBytes } = require('node:crypto')
const { createRequire } = require('node:module')

const root = path.resolve(__dirname, '..')
const scopes = ['all', 'desktop', 'server']
const backends = ['kwallet5', 'gnome-libsecret', 'basic', 'kwallet6']
const phases = ['seed', 'migrate', 'restore', 'logout', 'remove', 'final']

function parseArgs(args) {
  const options = {
    scope: 'all', linuxBackends: ['kwallet5', 'gnome-libsecret', 'basic'], timeout: 90,
    serverRepo: path.resolve(root, '..', 'houston-broadcaster'),
    output: path.join(root, 'qa-results', `security-hygiene-${new Date().toISOString().replace(/[:.]/g, '-')}.json`),
  }
  for (let i = 0; i < args.length; i++) {
    const name = args[i]
    if (name === '--help' || name === '-h') return { help: true }
    const value = args[++i]
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${name}`)
    if (name === '--scope') options.scope = value
    else if (name === '--linux-backends') options.linuxBackends = value.split(',')
    else if (name === '--timeout') options.timeout = Number(value)
    else if (name === '--server-repo') options.serverRepo = path.resolve(value)
    else if (name === '--output') options.output = path.resolve(value)
    else throw new Error(`Unknown option: ${name}`)
  }
  if (!scopes.includes(options.scope)) throw new Error('Scope must be all, desktop or server')
  if (!Number.isInteger(options.timeout) || options.timeout < 10 || options.timeout > 600) {
    throw new Error('Timeout must be an integer from 10 to 600 seconds per process')
  }
  if (!options.linuxBackends.length || options.linuxBackends.some(backend => !backends.includes(backend)) ||
      new Set(options.linuxBackends).size !== options.linuxBackends.length) {
    throw new Error('Linux backends must be unique entries from kwallet5,gnome-libsecret,basic,kwallet6')
  }
  return options
}

function runProcess(command, args, { cwd = root, env = process.env, timeout = 90000 } = {}) {
  return new Promise(resolve => {
    let stdout = '', stderr = '', timedOut = false, launchError = false, launchErrorCode = null
    // A dedicated process group lets a timeout stop only this helper and its children.
    const child = spawn(command, args, {
      cwd, env, windowsHide: true, shell: false, detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const append = (current, chunk) => (current + chunk.toString()).slice(-32768)
    child.stdout.on('data', chunk => { stdout = append(stdout, chunk) })
    child.stderr.on('data', chunk => { stderr = append(stderr, chunk) })
    const timer = setTimeout(() => {
      timedOut = true
      // The child is this runner's own bounded helper, never a user's app.
      if (!child.pid) return
      if (process.platform === 'win32') {
        const taskkill = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe')
        const killer = spawn(taskkill, ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, shell: false, stdio: 'ignore' })
        killer.on('error', () => child.kill('SIGKILL'))
        killer.on('close', code => { if (code !== 0) child.kill('SIGKILL') })
      } else {
        try { process.kill(-child.pid, 'SIGKILL') } catch (error) {
          if (error.code !== 'ESRCH') child.kill('SIGKILL')
        }
      }
    }, timeout)
    child.on('error', error => {
      launchError = true
      launchErrorCode = error.code || 'UNKNOWN'
    })
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      resolve({ code, signal, stdout, stderr, timedOut, launchError, launchErrorCode })
    })
  })
}

function sanitizeDiagnostic(value, { secret, temporary, home = os.homedir() } = {}) {
  let text = String(value || '')
  // Remove the generated canary before retaining any child output or error text.
  for (const [needle, replacement] of [
    [secret, '[REDACTED_QA_SECRET]'], [temporary, '[QA_TEMP]'], [home, '[HOME]'],
  ]) {
    if (needle) text = text.split(needle).join(replacement)
  }
  return text.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').slice(-8192)
}

function nativeDiagnostics(execution, startup, redactions) {
  return {
    exitCode: execution.code,
    signal: execution.signal,
    timedOut: execution.timedOut,
    launchErrorCode: execution.launchErrorCode,
    lastStage: startup?.stage || 'Before the Electron QA entry point',
    electron: startup?.electron,
    electronArchitecture: startup?.architecture,
    error: startup?.error ? sanitizeDiagnostic(startup.error, redactions) : undefined,
    stderr: sanitizeDiagnostic(execution.stderr, redactions),
    stdout: sanitizeDiagnostic(execution.stdout, redactions),
  }
}

async function secretServiceProvider() {
  const execution = await runProcess('busctl', [
    '--user', '--no-pager', 'call', 'org.freedesktop.DBus', '/org/freedesktop/DBus',
    'org.freedesktop.DBus', 'GetConnectionUnixProcessID', 's', 'org.freedesktop.secrets',
  ], { timeout: 5000 })
  const match = execution.code === 0 && /^u ([0-9]+)\s*$/.exec(execution.stdout.trim())
  if (!match) return { verifiedGnomeKeyring: false, detail: 'Cannot identify Secret Service owner. Ensure busctl and the user D-Bus session are available.' }
  try {
    const executable = fs.readlinkSync(`/proc/${match[1]}/exe`)
    const provider = path.basename(executable)
    return { provider, verifiedGnomeKeyring: provider === 'gnome-keyring-daemon' }
  } catch {
    return { verifiedGnomeKeyring: false, detail: 'Cannot inspect Secret Service owner executable under /proc.' }
  }
}

function summaryStatus(results) {
  if (!results.length || results.some(result => !['pass', 'fail', 'blocked'].includes(result.status))) return 'fail'
  if (results.some(result => result.status === 'fail')) return 'fail'
  if (results.some(result => result.status === 'blocked')) return 'blocked'
  return 'pass'
}

async function regressionSuite(repo, tests, temporary, label, timeout) {
  const requireFromRepo = createRequire(path.join(repo, 'package.json'))
  let vitest
  try { vitest = path.join(path.dirname(requireFromRepo.resolve('vitest/package.json')), 'vitest.mjs') } catch {
    return { name: label, status: 'blocked', detail: 'Vitest is missing in this checkout. Restore its dependencies and rerun.' }
  }
  const report = path.join(temporary, `${label}.json`)
  const execution = await runProcess(process.execPath, [
    vitest, 'run', ...tests, '--reporter=json', `--outputFile=${report}`,
  ], { cwd: repo, timeout })
  if (execution.timedOut) return { name: label, status: 'blocked', detail: 'Regression process timed out.' }
  if (!fs.existsSync(report)) return {
    name: label, status: 'fail', detail: 'Regression runner failed before writing its report. Run the documented focused test command for diagnostics.',
  }
  const data = JSON.parse(fs.readFileSync(report, 'utf8'))
  const testsFound = (data.testResults || []).flatMap(file => file.assertionResults || [])
  if (!testsFound.length) return { name: label, status: 'fail', detail: 'No test assertions were discovered.' }
  return {
    name: label,
    status: execution.code === 0 && data.success && testsFound.every(test => test.status === 'passed') ? 'pass' : 'fail',
    tests: testsFound.map(test => ({ name: test.fullName || test.title, status: test.status })),
    passed: testsFound.filter(test => test.status === 'passed').length,
    total: testsFound.length,
    detail: 'Source regression tests; not a live deployed-server or installed-app test.',
  }
}

async function buildHarness(temporary) {
  const esbuild = require('esbuild')
  const appDirectory = path.join(temporary, 'app')
  fs.mkdirSync(path.join(appDirectory, 'renderer'), { recursive: true, mode: 0o700 })
  fs.writeFileSync(path.join(appDirectory, 'package.json'), JSON.stringify({
    name: '45flow-hygiene-qa', productName: '45Flow Hygiene QA', version: '1.0.0', main: 'main.cjs',
  }))
  fs.copyFileSync(path.join(__dirname, 'hygiene', 'electron.cjs'), path.join(appDirectory, 'main.cjs'))
  fs.writeFileSync(path.join(appDirectory, 'renderer', 'index.html'),
    '<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\'; connect-src \'none\'"></head><body><script src="qa.js"></script></body></html>')
  await Promise.all([
    esbuild.build({
      entryPoints: [path.join(root, 'src/main/secureTokens.ts')],
      outfile: path.join(appDirectory, 'store.cjs'), bundle: true, platform: 'node', format: 'cjs', external: ['electron'],
    }),
    esbuild.build({
      entryPoints: [path.join(root, 'src/main/preload.ts')],
      outfile: path.join(appDirectory, 'preload.cjs'), bundle: true, platform: 'node', format: 'cjs', external: ['electron'],
    }),
    esbuild.build({
      entryPoints: [path.join(__dirname, 'hygiene/renderer.js')],
      outfile: path.join(appDirectory, 'renderer', 'qa.js'), bundle: true, platform: 'browser', format: 'iife',
      define: { 'process.env.NODE_ENV': '"production"' },
    }),
  ])
  return appDirectory
}

async function nativeBackend(backend, temporary, appDirectory, timeout) {
  const name = `native-${backend}`
  const profile = path.join(temporary, name)
  fs.mkdirSync(profile, { mode: 0o700 })
  const secret = randomBytes(24).toString('hex')
  const results = []
  let providerEvidence
  const electron = require('electron')
  for (const phase of phases) {
    console.log(`  ${name}: ${phase} (a keyring permission/unlock prompt may appear)`)
    const configFile = path.join(temporary, `${name}-${phase}-config.json`)
    const result = path.join(temporary, `${name}-${phase}-result.json`)
    const startupFile = path.join(temporary, `${name}-${phase}-startup.json`)
    fs.writeFileSync(configFile, JSON.stringify({ profile, backend, phase, result, appDirectory, startupFile }), { mode: 0o600 })
    const env = { ...process.env, NODE_ENV: 'production', HYGIENE_QA_CONFIG: configFile, HYGIENE_QA_SECRET: secret }
    delete env.ELECTRON_RUN_AS_NODE
    delete env.NODE_OPTIONS
    delete env.ELECTRON_USER_DATA_DIR
    const execution = await runProcess(electron, [appDirectory], { env, timeout })
    const startup = fs.existsSync(startupFile) ? JSON.parse(fs.readFileSync(startupFile, 'utf8')) : null
    const diagnostics = nativeDiagnostics(execution, startup, { secret, temporary })
    if (!fs.existsSync(result)) {
      results.push({
        phase, status: 'blocked',
        detail: execution.timedOut ? 'Timed out waiting for Electron/keyring. Unlock/authorize the requested service and rerun.'
          : 'Electron exited before producing a result. See diagnostics for the exit code, signal, startup stage and sanitized child output. No security bypass was applied.',
        diagnostics,
      })
      break
    }
    const data = JSON.parse(fs.readFileSync(result, 'utf8'))
    if (data.phase !== phase || !['pass', 'fail', 'blocked'].includes(data.status) ||
        !Array.isArray(data.checks) || data.checks.some(check => typeof check !== 'string') ||
        (data.status === 'pass' && !data.checks.length)) {
      results.push({ phase, status: 'fail', detail: 'Native helper produced an invalid result shape.' })
      break
    }
    if (data.status === 'pass' && execution.code !== 0) {
      data.status = 'fail'
      data.detail = 'Electron result and process exit status disagree.'
    }
    if (data.status !== 'pass') data.diagnostics = diagnostics
    results.push(data)
    if (data.status !== 'pass') break
    if (backend === 'gnome-libsecret' && phase === 'seed') {
      providerEvidence = await secretServiceProvider()
      if (!providerEvidence.verifiedGnomeKeyring) {
        results.push({
          phase: 'provider-verification', status: 'blocked',
          detail: providerEvidence.provider
            ? `Libsecret selected, but Secret Service is provided by ${providerEvidence.provider}, not GNOME Keyring.`
            : providerEvidence.detail,
        })
        break
      }
    }
  }
  return { name, status: summaryStatus(results), providerEvidence, phases: results, detail: 'Real Electron backend, production store/preload/composable, separate process for each phase.' }
}

async function main(args = process.argv.slice(2)) {
  const options = parseArgs(args)
  if (options.help) {
    console.log(`45Flow token/cookie/key hygiene QA (Node.js 22+)

node scripts/test-security-hygiene.cjs [options]
  --scope all|desktop|server       Default: all
  --linux-backends kwallet5,gnome-libsecret,basic
                                  Default: all three; optional kwallet6
  --server-repo PATH              Default: sibling houston-broadcaster checkout
  --timeout SECONDS               Per helper process; default 90, range 10-600
  --output PATH                   New JSON report; default qa-results/timestamp.json

Run as your regular logged-in desktop user, not sudo. No packages are installed,
no keyring services are started/stopped, no live server settings are changed.
Exit 0 = selected automated checks pass; 1 = failure; 2 = blocked prerequisites.
See docs/security-hygiene-qa.md for scope and remaining live/manual checks.`)
    return 0
  }
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Node.js 22 or newer is required')
  if (process.platform !== 'win32' && process.getuid?.() === 0) {
    throw new Error('Run as your normal desktop user, not root/sudo')
  }
  if (fs.existsSync(options.output)) throw new Error('Refusing to overwrite an existing report')
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), '45flow-hygiene-qa-'))
  const results = []
  const report = {
    schemaVersion: 1, startedAt: new Date().toISOString(), platform: process.platform,
    architecture: process.arch, osRelease: os.release(), node: process.versions.node, scope: options.scope,
    linuxBackends: process.platform === 'linux' ? options.linuxBackends : undefined,
    results,
    notAutomated: [
      'Installed signed-app identity, OS reboot and cross-user DPAPI/Keychain isolation.',
      'Actually locked/denied keyring: simulated failure paths run in regression tests only.',
      'Live admin-password reauthentication: HTTP behavior is mocked in source regression tests.',
      'Live nginx headers, recipient browser restoration, deployed link expiry/disablement.',
      'Real Certbot/ACME renewal, deployment hooks and live SPKI continuity; source tests use isolated fixtures.',
      'Live licensed/unlicensed deployment matrix; native storage uses unlicensed synthetic connections.',
    ],
  }
  try {
    const timeout = options.timeout * 1000
    if (options.scope !== 'server') {
      console.log('Running desktop source regressions...')
      results.push(await regressionSuite(root, [
        'src/main/secureTokens.test.js', 'src/renderer/composables/useConnections.test.js', 'src/renderer/composables/useApi.test.js',
      ], temporary, 'desktop-regression', timeout))
      if (process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
        results.push({ name: 'native-desktop', status: 'blocked', detail: 'A graphical desktop session is required for native keyring checks.' })
      } else {
        let appDirectory
        try { appDirectory = await buildHarness(temporary) } catch {
          results.push({ name: 'native-build', status: 'blocked', detail: 'Cannot build native harness. Restore Electron/esbuild/Vue dependencies and rerun.' })
        }
        if (appDirectory) {
          for (const backend of process.platform === 'linux' ? options.linuxBackends : ['os-default']) {
            try {
              results.push(await nativeBackend(backend, temporary, appDirectory, timeout))
            } catch {
              results.push({ name: `native-${backend}`, status: 'fail', detail: 'Native harness orchestration failed.' })
            }
          }
        }
      }
    }
    if (options.scope !== 'desktop') {
      if (process.platform !== 'linux') {
        results.push({ name: 'server-regression', status: 'blocked', detail: 'Server certificate/bootstrap suites require Linux. Run --scope server on the Linux server checkout; desktop native checks still run here.' })
      } else if (!fs.existsSync(path.join(options.serverRepo, 'server/test/cert-key-hygiene.test.js'))) {
        results.push({ name: 'server-regression', status: 'blocked', detail: 'Updated houston-broadcaster checkout missing. Pass --server-repo PATH.' })
      } else {
        console.log('Running isolated server cookie/proxy/certificate regressions...')
        results.push(await regressionSuite(options.serverRepo, [
          'test/access.test.js', 'test/access-token-status.test.js', 'test/trusted-proxy.test.js',
          'test/cert-key-hygiene.test.js', 'test/certbot-key-reuse.test.js',
        ], temporary, 'server-regression', timeout))
      }
    }
  } catch {
    results.push({ name: 'runner', status: 'fail', detail: 'QA runner failed; verify dependencies and filesystem permissions.' })
  } finally {
    // Delete only the unique temporary directory created by this invocation.
    try { fs.rmSync(temporary, { recursive: true, force: true }) } catch {
      results.push({ name: 'cleanup', status: 'fail', detail: 'Temporary QA profile cleanup failed. Synthetic test data may remain in the OS temporary directory.' })
    }
  }
  report.status = summaryStatus(results)
  report.finishedAt = new Date().toISOString()
  fs.mkdirSync(path.dirname(options.output), { recursive: true })
  fs.writeFileSync(options.output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
  for (const result of results) {
    console.log(`${result.status.toUpperCase().padEnd(7)} ${result.name}${result.total ? ` (${result.passed}/${result.total} assertions)` : ''}`)
    if (result.status !== 'pass') {
      const problem = result.phases?.find(phase => phase.status !== 'pass') || result
      console.log(`        ${problem.failedCheck || problem.detail || 'See JSON report.'}`)
      if (problem.diagnostics) {
        const diagnostic = problem.diagnostics
        console.log(`        exit=${diagnostic.exitCode} signal=${diagnostic.signal || 'none'} launch=${diagnostic.launchErrorCode || 'ok'} stage=${diagnostic.lastStage}`)
        if (diagnostic.error) console.log(`        ${diagnostic.error}`)
        if (diagnostic.stderr) console.log(diagnostic.stderr)
      }
    }
  }
  console.log(`Report: ${options.output}`)
  console.log('PASS covers selected automated checks only; see report.notAutomated before release sign-off.')
  return report.status === 'pass' ? 0 : report.status === 'blocked' ? 2 : 1
}

module.exports = { parseArgs, runProcess, summaryStatus, sanitizeDiagnostic, nativeDiagnostics, main }
if (require.main === module) {
  main().then(code => { process.exitCode = code }).catch(error => {
    console.error(`Hygiene QA: ${error.message}`)
    process.exitCode = 1
  })
}
