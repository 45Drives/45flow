#!/usr/bin/env node
// Launches the real built 45Flow app in a throwaway profile and checks the Electron hardening:
// sandbox, IPC allowlist, navigation guards, CSP and the blocked-certificate checks.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync, spawnSync } = require('node:child_process')
const { runProcess, sanitizeDiagnostic, summaryStatus } = require('./test-security-hygiene.cjs')

const root = path.resolve(__dirname, '..')
const mainEntry = path.join(root, 'build', 'main', 'src', 'main', 'main.js')
const rendererDir = path.join(root, 'build', 'renderer')
const routes = ['#/', '#/home', '#/upload-file', '#/create-link']

function parseArgs(args) {
  const options = {
    timeout: 180,
    output: path.join(root, 'qa-results', `hardening-${new Date().toISOString().replace(/[:.]/g, '-')}.json`),
  }
  for (let i = 0; i < args.length; i++) {
    const name = args[i]
    if (name === '--help' || name === '-h') return { help: true }
    const value = args[++i]
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${name}`)
    if (name === '--timeout') options.timeout = Number(value)
    else if (name === '--output') options.output = path.resolve(value)
    else throw new Error(`Unknown option: ${name}`)
  }
  if (!Number.isInteger(options.timeout) || options.timeout < 30 || options.timeout > 900) {
    throw new Error('Timeout must be an integer from 30 to 900 seconds')
  }
  return options
}

function newestMtime(paths) {
  return Math.max(...paths.filter(file => fs.existsSync(file)).map(file => fs.statSync(file).mtimeMs))
}

function staleBuildWarning() {
  const sources = [
    ...fs.readdirSync(path.join(root, 'src', 'main')).filter(file => file.endsWith('.ts')).map(file => path.join(root, 'src', 'main', file)),
    path.join(root, 'src', 'renderer', 'index.html'),
  ]
  return newestMtime(sources) > fs.statSync(mainEntry).mtimeMs
    ? 'Sources are newer than build/. Results reflect the last build; run `yarn test:hardening` to rebuild first.'
    : undefined
}

function makeTestPki(directory) {
  if (spawnSync('openssl', ['version'], { stdio: 'ignore' }).status !== 0) return null
  fs.mkdirSync(directory, { mode: 0o700 })
  const openssl = (...args) => execFileSync('openssl', args, { cwd: directory, stdio: 'pipe' })
  const ec = ['-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256', '-nodes']
  fs.writeFileSync(path.join(directory, 'ca.ext'), 'basicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\n')
  fs.writeFileSync(path.join(directory, 'leaf.ext'),
    'basicConstraints=CA:FALSE\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:localhost,IP:127.0.0.1\n')
  openssl('req', '-x509', ...ec, '-keyout', 'root.key', '-out', 'root.pem', '-subj', '/CN=45Flow Hardening QA Root', '-days', '2',
    '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign,cRLSign')
  let serial = 1
  const issue = (name, issuer, extensions) => {
    openssl('req', ...ec, '-keyout', `${name}.key`, '-out', `${name}.csr`, '-subj', `/CN=45Flow Hardening QA ${name}`)
    openssl('x509', '-req', '-in', `${name}.csr`, '-CA', `${issuer}.pem`, '-CAkey', `${issuer}.key`,
      '-set_serial', String(serial++), '-days', '2', '-extfile', extensions, '-out', `${name}.pem`)
  }
  issue('int-blocked', 'root', 'ca.ext')
  issue('int-control', 'root', 'ca.ext')
  for (const [leaf, issuer] of [['leaf-a', 'int-blocked'], ['leaf-b', 'int-control'], ['leaf-c', 'int-blocked'],
    ['leaf-d', 'int-control'], ['leaf-e', 'int-blocked'], ['leaf-f', 'int-control']]) issue(leaf, issuer, 'leaf.ext')
  return directory
}

async function main(args = process.argv.slice(2)) {
  const options = parseArgs(args)
  if (options.help) {
    console.log(`45Flow Electron hardening QA

node scripts/test-hardening.cjs [options]     (or: yarn test:hardening, which rebuilds first)
  --timeout SECONDS   Whole run; default 180, range 30-900
  --output PATH       New JSON report; default qa-results/hardening-<timestamp>.json

Starts the real built app (build/main + build/renderer) in a temporary profile, so it does the
same network discovery it does at every launch. A 45Flow window opens briefly. Needs a desktop
session and openssl on PATH (for the certificate checks). Run as your normal user, not sudo.
Exit 0 = all checks pass; 1 = failure; 2 = blocked prerequisites.`)
    return 0
  }

  const report = { tool: '45flow-hardening-qa', startedAt: new Date().toISOString(), platform: `${process.platform}-${process.arch}` }
  const finishReport = (status, extra) => {
    Object.assign(report, { status, finishedAt: new Date().toISOString() }, extra)
    fs.mkdirSync(path.dirname(options.output), { recursive: true })
    fs.writeFileSync(options.output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
    return report
  }

  if (!fs.existsSync(mainEntry) || !fs.existsSync(path.join(rendererDir, 'index.html'))) {
    const detail = 'No app build found. Run `yarn test:hardening` (builds first) or `yarn build:common && node scripts/build.js`.'
    console.log(`BLOCKED ${detail}`)
    finishReport('blocked', { detail })
    return 2
  }
  if (process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
    const detail = 'No desktop session (DISPLAY/WAYLAND_DISPLAY unset). Run from a desktop terminal or under xvfb-run.'
    console.log(`BLOCKED ${detail}`)
    finishReport('blocked', { detail })
    return 2
  }

  const warning = staleBuildWarning()
  if (warning) console.log(`WARNING ${warning}`)
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), '45flow-hardening-'))
  let status = 'fail'
  try {
    const appDirectory = path.join(temporary, 'app')
    fs.mkdirSync(appDirectory, { mode: 0o700 })
    fs.writeFileSync(path.join(appDirectory, 'package.json'),
      JSON.stringify({ name: '45flow-hardening-qa', productName: '45Flow Hardening QA', version: '1.0.0', main: 'main.cjs' }))
    fs.copyFileSync(path.join(__dirname, 'hardening', 'electron.cjs'), path.join(appDirectory, 'main.cjs'))
    fs.cpSync(rendererDir, path.join(appDirectory, 'renderer'), { recursive: true })
    const resultFile = path.join(temporary, 'result.json')
    const configFile = path.join(temporary, 'config.json')
    fs.writeFileSync(configFile, JSON.stringify({
      mainEntry, result: resultFile, routes, timeoutMs: (options.timeout - 10) * 1000,
      pki: makeTestPki(path.join(temporary, 'pki')),
    }), { mode: 0o600 })

    const profile = path.join(temporary, 'profile')
    fs.mkdirSync(profile, { mode: 0o700 })
    const env = {
      ...process.env, NODE_ENV: 'production', HARDENING_QA_CONFIG: configFile, ELECTRON_USER_DATA_DIR: profile,
    }
    delete env.ELECTRON_RUN_AS_NODE
    delete env.NODE_OPTIONS
    console.log('Starting the built app in a temporary profile (a 45Flow window will open briefly)...')
    const execution = await runProcess(require('electron'), [appDirectory], { env, timeout: options.timeout * 1000 })
    const redactions = { temporary }
    if (!fs.existsSync(resultFile)) {
      finishReport('fail', {
        warning, detail: execution.timedOut ? 'Timed out before the harness reported.' : 'Electron exited before the harness reported.',
        diagnostics: {
          exitCode: execution.code, signal: execution.signal, timedOut: execution.timedOut, launchErrorCode: execution.launchErrorCode,
          stderr: sanitizeDiagnostic(execution.stderr, redactions), stdout: sanitizeDiagnostic(execution.stdout, redactions),
        },
      })
      console.log(`FAIL    ${report.detail}`)
      if (report.diagnostics.stderr) console.log(report.diagnostics.stderr)
    } else {
      const result = JSON.parse(fs.readFileSync(resultFile, 'utf8'))
      status = summaryStatus(result.checks)
      if (status === 'pass' && execution.code !== 0) status = 'fail'
      finishReport(status, { warning, ...result, status })
      for (const check of result.checks) {
        console.log(`${check.status.toUpperCase().padEnd(7)} ${check.name}`)
        if (check.status !== 'pass') console.log(`        ${String(check.detail).split('\n').join('\n        ')}`)
      }
      if (result.consoleErrors.length) {
        console.log(`\n${result.consoleErrors.length} other console warning/error(s) recorded in the report (not failures; review them for regressions).`)
      }
    }
  } finally {
    // Delete only the unique temporary directory created by this invocation.
    try { fs.rmSync(temporary, { recursive: true, force: true }) } catch {}
  }
  console.log(`Report: ${options.output}`)
  console.log('PASS covers automated checks only; still smoke-test a packaged build per OS before release.')
  return status === 'pass' ? 0 : status === 'blocked' ? 2 : 1
}

module.exports = { parseArgs, main }
if (require.main === module) {
  main().then(code => { process.exitCode = code }).catch(error => {
    console.error(`Hardening QA: ${error.message}`)
    process.exitCode = 1
  })
}
