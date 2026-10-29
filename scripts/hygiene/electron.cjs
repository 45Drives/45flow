const fs = require('node:fs')
const path = require('node:path')
const config = JSON.parse(fs.readFileSync(process.env.HYGIENE_QA_CONFIG, 'utf8'))
const checks = []
let resultWritten = false
let stage = 'Electron startup'
let app
let startupError

function recordStage(nextStage) {
  stage = nextStage
  fs.writeFileSync(config.startupFile, JSON.stringify({
    stage, electron: process.versions.electron, architecture: process.arch, error: startupError,
  }), { mode: 0o600 })
}

// Record startup before importing bundled production code so bootstrap failures survive.
recordStage('Electron QA entry point reached')
process.on('uncaughtException', fail)
process.on('unhandledRejection', fail)

const electron = require('electron')
app = electron.app
const { BrowserWindow, safeStorage, session } = electron
recordStage('Loading production credential store')
const { SecureTokenStore, registerSecureTokenHandlers } = require('./store.cjs')

recordStage('Configuring isolated Electron application')
app.setName('45Flow Hygiene QA')
app.setPath('userData', config.profile)
app.commandLine.appendSwitch('disable-http-cache')
if (process.platform === 'linux') app.commandLine.appendSwitch('password-store', config.backend)

function assert(condition, name) {
  if (!condition) throw Object.assign(new Error(name), { qaCheck: name })
  checks.push(name)
}

function finish(result) {
  if (resultWritten) return
  resultWritten = true
  fs.writeFileSync(config.result, JSON.stringify({
    phase: config.phase, ...result, checks: [...checks, ...(result.checks || [])],
  }), { mode: 0o600, flag: 'wx' })
  const code = result.status === 'pass' ? 0 : result.status === 'blocked' ? 2 : 1
  if (app) app.exit(code)
  else process.exit(code)
}

// Keep synthetic secrets and potential assertion dumps out of child stdout/stderr.
function fail(error) {
  // Only synthetic test credentials are used; the parent redacts the canary and paths.
  startupError = error instanceof Error ? `${error.name}: ${error.message}` : 'Unknown native startup error'
  recordStage(stage)
  finish({
    status: 'fail', failedCheck: error?.qaCheck || stage,
    detail: 'Native QA assertion/operation failed; see failedCheck and completed check names.',
  })
}
recordStage('Waiting for Electron app readiness')
app.whenReady().then(async () => {
  recordStage('Native secret-store initialization')
  const actualBackend = process.platform === 'linux' ? safeStorage.getSelectedStorageBackend() : process.platform
  const expectedBackend = { basic: 'basic_text', 'gnome-libsecret': 'gnome_libsecret', kwallet5: 'kwallet5', kwallet6: 'kwallet6' }[config.backend]
  const persistent = config.backend !== 'basic'
  if (process.platform === 'linux' && actualBackend !== expectedBackend) {
    finish({ status: 'blocked', actualBackend, detail: `Requested ${expectedBackend}; Electron selected ${actualBackend}. Install/unlock the requested secret service and rerun.` })
    return
  }
  const directory = path.join(config.profile, 'secure-tokens')
  const store = new SecureTokenStore(directory)
  if (store.status().persistent !== persistent) {
    finish({ status: 'blocked', actualBackend, detail: 'Requested native secret store is not usable. Unlock/authorize the keychain or keyring and rerun.' })
    return
  }
  assert(store.status().persistent === persistent, 'Actual OS backend matches required persistence policy')
  // Ensure renderer network activity cannot send synthetic secrets anywhere.
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] },
    (_details, callback) => callback({ cancel: true }))
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(config.appDirectory, 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: false,
    },
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  registerSecureTokenHandlers(() => window.webContents)
  recordStage('Production preload and renderer initialization')
  const page = path.join(config.appDirectory, 'renderer', 'index.html')
  await window.loadFile(page)
  const rendererResult = await window.webContents.executeJavaScript(`window.hygieneQa.run(${JSON.stringify({
    phase: config.phase, canary: process.env.HYGIENE_QA_SECRET, persistent,
  })})`)
  if (rendererResult.failedCheck) {
    throw Object.assign(new Error('Renderer QA failed'), { qaCheck: rendererResult.failedCheck })
  }
  checks.push(...rendererResult.checks)
  recordStage('Credential file and permission verification')
  await session.defaultSession.flushStorageData()
  if (config.phase !== 'seed') {
    const files = fs.existsSync(directory) ? fs.readdirSync(directory) : []
    const expected = persistent && ['migrate', 'restore'].includes(config.phase) ? ['qa-primary.bin']
      : persistent && config.phase === 'logout' ? ['qa-secondary.bin'] : []
    assert(JSON.stringify(files.sort()) === JSON.stringify(expected.sort()),
      'Only expected connection ciphertext files exist')
    if (persistent && expected.length && process.platform !== 'win32') {
      assert((fs.statSync(directory).mode & 0o777) === 0o700, 'Credential directory permissions are 0700')
      for (const file of expected) {
        assert((fs.statSync(path.join(directory, file)).mode & 0o777) === 0o600, 'Credential file permissions are 0600')
      }
    }
    for (const file of files) {
      const bytes = fs.readFileSync(path.join(directory, file))
      assert(!bytes.includes(Buffer.from(process.env.HYGIENE_QA_SECRET)) &&
        !bytes.includes(Buffer.from(process.env.HYGIENE_QA_SECRET, 'utf16le')),
        'Saved credential ciphertext does not contain the synthetic secret')
    }
    if (persistent && config.phase === 'restore') {
      const corruptFile = path.join(directory, 'qa-corrupt.bin')
      fs.writeFileSync(corruptFile, 'invalid ciphertext', { mode: 0o600 })
      let corruptRejected = false
      try { new SecureTokenStore(directory).get('qa-corrupt') } catch { corruptRejected = true }
      assert(corruptRejected, 'Native decryption rejects corrupt ciphertext explicitly')
      assert(fs.readFileSync(corruptFile, 'utf8') === 'invalid ciphertext',
        'Corrupt data is not silently overwritten with a success-shaped fallback')
      fs.unlinkSync(corruptFile)
    }
    let rejected = false
    try { store.get('../outside') } catch { rejected = true }
    assert(rejected, 'Credential store rejects path traversal')

    // Exercise the production preload and IPC authorization after actual navigation.
    await window.webContents.executeJavaScript('window.electron.secureToken.status()')
    checks.push('Production preload and IPC allow the trusted main frame')
    recordStage('Untrusted navigation IPC rejection')
    await window.loadURL('data:text/html,<title>Untrusted QA document</title>')
    const denied = await window.webContents.executeJavaScript(`Promise.all([
      () => window.electron.secureToken.status(),
      () => window.electron.secureToken.get('qa-primary'),
      () => window.electron.secureToken.set('qa-primary', {token: 'untrusted-synthetic'}),
      () => window.electron.secureToken.clear('qa-primary')
    ].map(operation => operation().then(() => false, () => true))).then(results => results.every(Boolean))`)
    assert(denied, 'Production credential IPC rejects an untrusted navigated document')
  }
  finish({ status: 'pass', actualBackend })
}).catch(fail)
