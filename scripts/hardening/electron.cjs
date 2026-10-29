// Runs inside Electron next to the real built 45Flow main process and checks the hardening end to end.
// Started by scripts/test-hardening.cjs; never shipped.
const { app, BrowserWindow, ipcMain, session, shell } = require('electron')
const fs = require('fs')
const https = require('https')
const path = require('path')
const { pathToFileURL } = require('url')

const config = JSON.parse(fs.readFileSync(process.env.HARDENING_QA_CONFIG, 'utf8'))
const checks = []
const consoleMessages = []
const openedExternally = []
const windowEvents = { preloadErrors: [], crashes: [], failedLoads: [] }
let stage = 'starting'
let finished = false

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const truncate = (value, length = 400) => String(value ?? '').slice(0, length)
const record = (name, ok, detail) => checks.push({ name, status: ok ? 'pass' : 'fail', detail: truncate(detail, 1500) })
const block = (name, detail) => checks.push({ name, status: 'blocked', detail })

async function waitFor(probe, timeout, interval = 250) {
  const deadline = Date.now() + timeout
  for (;;) {
    let value
    try { value = await probe() } catch { value = undefined }
    if (value) return value
    if (Date.now() > deadline) return undefined
    await sleep(interval)
  }
}

// Navigation and window.open must never launch a real browser during QA.
shell.openExternal = async url => { openedExternally.push(String(url)) }
const wasOpenedExternally = url => openedExternally.some(opened => opened === url)

app.on('browser-window-created', (_event, window) => {
  const contents = window.webContents
  contents.on('console-message', (event, legacyLevel, legacyMessage) => {
    const level = event?.level ?? ['verbose', 'info', 'warning', 'error'][legacyLevel] ?? String(legacyLevel)
    consoleMessages.push({ level, message: truncate(event?.message ?? legacyMessage, 600), stage })
  })
  contents.on('preload-error', (_e, preloadPath, error) => windowEvents.preloadErrors.push(`${preloadPath}: ${error}`))
  contents.on('render-process-gone', (_e, details) => windowEvents.crashes.push(details.reason))
  contents.on('did-fail-load', (_e, code, description, url, isMainFrame) => {
    if (isMainFrame) windowEvents.failedLoads.push(`${code} ${description} ${truncate(url, 200)}`)
  })
})

function finish(error) {
  if (finished) return
  finished = true
  if (error) checks.push({ name: `harness (${stage})`, status: 'fail', detail: truncate(error?.stack || error, 1500) })
  const status = !checks.length || checks.some(check => check.status === 'fail') ? 'fail'
    : checks.some(check => check.status === 'blocked') ? 'blocked' : 'pass'
  const result = {
    status,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    platform: `${process.platform}-${process.arch}`,
    checks,
    consoleErrors: consoleMessages.filter(m => m.level === 'error' || m.level === 'warning').slice(0, 40),
    openedExternally,
    windowEvents,
  }
  fs.writeFileSync(config.result, JSON.stringify(result, null, 2))
  app.exit(status === 'pass' ? 0 : 1)
}

setTimeout(() => finish(new Error(`Timed out after ${config.timeoutMs} ms`)), config.timeoutMs).unref()
process.on('uncaughtException', finish)
process.on('unhandledRejection', finish)

async function checkWindow() {
  stage = 'waiting for the app window'
  const window = await waitFor(() => BrowserWindow.getAllWindows()[0], 30000)
  if (!window) throw new Error('The app never created a window.')
  const contents = window.webContents
  const rendererUrl = pathToFileURL(path.join(app.getAppPath(), 'renderer', 'index.html')).href
  await waitFor(() => !contents.isLoading() && contents.getURL().startsWith(rendererUrl), 30000)
  record('loads-bundled-renderer', contents.getURL().startsWith(rendererUrl), contents.getURL())

  const prefs = contents.getLastWebPreferences() || {}
  const shown = { sandbox: prefs.sandbox, contextIsolation: prefs.contextIsolation, nodeIntegration: prefs.nodeIntegration, webviewTag: prefs.webviewTag }
  record('sandboxed-web-preferences', prefs.sandbox === true && prefs.contextIsolation === true &&
    prefs.nodeIntegration === false && prefs.webviewTag === false, JSON.stringify(shown))
  return { window, contents, rendererUrl, js: code => contents.executeJavaScript(code, true) }
}

async function checkPage({ js }) {
  stage = 'checking the page'
  const mounted = await waitFor(() => js(`(document.querySelector('#app')?.children.length || 0) > 0`), 20000)
  record('renderer-mounted', Boolean(mounted), mounted ? 'Vue app mounted' : 'Nothing rendered into #app within 20s')

  const page = await js(`({
    require: typeof require, process: typeof process, module: typeof module,
    api: window.electron ? Object.keys(window.electron).sort() : null,
    bridge: window.electron?.ipcRenderer ? Object.keys(window.electron.ipcRenderer).sort() : null,
    appLog: Boolean(window.appLog),
  })`)
  record('no-node-in-page', page.require === 'undefined' && page.process === 'undefined' && page.module === 'undefined',
    JSON.stringify({ require: page.require, process: page.process, module: page.module }))
  const expected = ['cleanupTranscodeTemp', 'cleanupWatermarkTemp', 'downloadWatermark', 'ensureSshReady',
    'fullTranscodeCancel', 'fullTranscodeStart', 'getOS', 'getPathForFile', 'getTranscodeCapabilities',
    'httpUploadCancel', 'httpUploadStart', 'ipcRenderer', 'isFirstRunNeeded', 'pickFiles', 'pickFolder',
    'pickWatermark', 'secureToken', 'selectFolder', 'transcodeCancel', 'transcodeCancelAllActive',
    'transcodeStart', 'uploadTranscodeOutput']
  const missing = expected.filter(key => !page.api?.includes(key))
  record('preload-api-complete', missing.length === 0 && page.appLog,
    missing.length ? `Missing: ${missing.join(', ')}` : `${page.api.length} functions and appLog exposed`)
}

async function checkIpc({ contents, js }) {
  stage = 'checking the IPC allowlist'
  let probeInvoked = 0
  let probeSent = 0
  ipcMain.handle('qa:probe-invoke', () => { probeInvoked++; return 'reached' })
  ipcMain.on('qa:probe-send', () => { probeSent++ })
  const result = await js(`(async () => {
    const bridge = window.electron.ipcRenderer
    const outcome = promise => promise.then(value => 'resolved:' + value, error => 'rejected:' + error.message)
    const r = {
      allowed: await outcome(bridge.invoke('is-dev')),
      registeredButUnlisted: await outcome(bridge.invoke('get-client-ident')),
      probe: await outcome(bridge.invoke('qa:probe-invoke')),
    }
    bridge.send('qa:probe-send', 'x')
    return r
  })()`)
  await sleep(500)
  record('ipc-allowed-invoke-works', result.allowed === 'resolved:false', result.allowed)
  record('ipc-unlisted-invoke-rejected', /not allowed/.test(result.registeredButUnlisted) && /not allowed/.test(result.probe) &&
    probeInvoked === 0, JSON.stringify({ ...result, probeHandlerCalls: probeInvoked }))
  record('ipc-unlisted-send-dropped', probeSent === 0, `qa:probe-send reached main ${probeSent} time(s)`)

  const channel = `upload:ingest:qa-${Date.now()}`
  await js(`window.__hardeningQaEvent = null
    window.electron.ipcRenderer.once(${JSON.stringify(channel)}, (event, payload) => {
      window.__hardeningQaEvent = { keys: Object.keys(event || {}), sender: typeof (event && event.sender), payload }
    }); true`)
  contents.send(channel, { qa: true })
  const event = await waitFor(() => js('window.__hardeningQaEvent'), 5000)
  record('ipc-event-has-no-sender', event?.sender === 'undefined' && event?.payload?.qa === true,
    event ? JSON.stringify(event) : 'Listener never fired')
  ipcMain.removeHandler('qa:probe-invoke')
  ipcMain.removeAllListeners('qa:probe-send')
}

async function checkNavigation({ contents, js }) {
  stage = 'checking navigation guards'
  const before = contents.getURL()
  const remote = 'https://qa-navigation.invalid/away'
  await js(`location.href = ${JSON.stringify(remote)}; true`).catch(() => {})
  await sleep(1500)
  record('remote-navigation-blocked', contents.getURL() === before && wasOpenedExternally(remote),
    `URL now ${truncate(contents.getURL(), 200)}; opened externally: ${wasOpenedExternally(remote)}`)

  const otherFile = pathToFileURL(path.join(app.getAppPath(), 'package.json')).href
  await js(`location.href = ${JSON.stringify(otherFile)}; true`).catch(() => {})
  await sleep(1500)
  record('local-file-navigation-blocked', contents.getURL() === before && !wasOpenedExternally(otherFile),
    `URL now ${truncate(contents.getURL(), 200)}`)

  const windows = BrowserWindow.getAllWindows().length
  const popup = 'https://qa-popup.invalid/x'
  await js(`window.open(${JSON.stringify(popup)}); true`).catch(() => {})
  await sleep(1000)
  record('window-open-goes-to-browser', BrowserWindow.getAllWindows().length === windows && wasOpenedExternally(popup),
    `windows ${windows} -> ${BrowserWindow.getAllWindows().length}; opened externally: ${wasOpenedExternally(popup)}`)
}

async function checkRoutes({ contents, js, rendererUrl }) {
  const visited = []
  for (const route of config.routes) {
    stage = `visiting ${route}`
    await js(`location.hash = ${JSON.stringify(route)}; true`).catch(() => {})
    await sleep(2500)
    const state = await js(`({ hash: location.hash, mounted: (document.querySelector('#app')?.children.length || 0) > 0 })`)
      .catch(error => ({ error: error.message }))
    visited.push({ route, ...state, inApp: contents.getURL().startsWith(rendererUrl) })
  }
  record('routes-render', visited.every(v => v.mounted && v.inApp), JSON.stringify(visited))
}

function checkConsole() {
  stage = 'checking console output'
  const blockedIpc = consoleMessages.filter(m => /IPC channel not allowed/.test(m.message))
  const csp = consoleMessages.filter(m => /Content Security Policy|Refused to (execute|load|apply|evaluate|frame)/i.test(m.message))
  record('no-blocked-ipc-during-use', blockedIpc.length === 0,
    blockedIpc.length ? blockedIpc.map(m => `[${m.stage}] ${m.message}`).join('\n') : 'No app code hit a blocked channel')
  record('no-csp-violations', csp.length === 0,
    csp.length ? csp.map(m => `[${m.stage}] ${m.message}`).join('\n') : 'No Content Security Policy violations')
  record('no-preload-errors-or-crashes', !windowEvents.preloadErrors.length && !windowEvents.crashes.length && !windowEvents.failedLoads.length,
    JSON.stringify(windowEvents))
}

async function checkCertificates() {
  stage = 'checking the blocked-key certificate checks'
  if (!config.pki) {
    for (const name of ['node-tls-blocks-key', 'default-session-blocks-key', 'updater-session-blocks-key']) {
      block(name, 'openssl was not found on PATH, so no test certificates could be generated.')
    }
    return
  }
  // Same module instance the app loaded, so adding a test key exercises the app's real checks.
  const blocklist = require(path.join(path.dirname(config.mainEntry), 'blockedCertificates.js'))
  const read = name => fs.readFileSync(path.join(config.pki, name), 'utf8')
  blocklist.BLOCKED_SPKI_SHA256.add(blocklist.spkiSha256(read('int-blocked.pem')))
  const servers = []
  const serve = (leaf, intermediate) => new Promise((resolve, reject) => {
    const server = https.createServer({ key: read(`${leaf}.key`), cert: read(`${leaf}.pem`) + read(`${intermediate}.pem`) },
      (_req, res) => res.end('ok'))
    servers.push(server)
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve(server.address().port))
  })
  const ports = {
    nodeBlocked: await serve('leaf-a', 'int-blocked'),
    nodeControl: await serve('leaf-b', 'int-control'),
    defaultBlocked: await serve('leaf-c', 'int-blocked'),
    defaultControl: await serve('leaf-d', 'int-control'),
    updaterBlocked: await serve('leaf-e', 'int-blocked'),
    updaterControl: await serve('leaf-f', 'int-control'),
  }
  try {
    const nodeGet = port => new Promise(resolve => {
      https.get({ host: 'localhost', port, ca: read('root.pem'), agent: new https.Agent() }, res => {
        res.resume()
        res.on('end', () => resolve(`status ${res.statusCode}`))
      }).once('error', error => resolve(error.code || error.message))
    })
    const nodeBlocked = await nodeGet(ports.nodeBlocked)
    const nodeControl = await nodeGet(ports.nodeControl)
    record('node-tls-blocks-key', nodeBlocked === 'ERR_TLS_CERT_BLOCKED' && nodeControl === 'status 200',
      `blocked chain: ${nodeBlocked}; control chain: ${nodeControl}`)

    // A rejection from the app's verifier surfaces as ERR_FAILED; an unblocked chain falls through to
    // Chromium, which rejects the untrusted test root with ERR_CERT_AUTHORITY_INVALID.
    const chromiumGet = (target, port) => target.fetch(`https://localhost:${port}/`).then(() => 'ok', error => error.message)
    const updater = session.fromPartition('electron-updater', { cache: false })
    const results = {
      defaultBlocked: await chromiumGet(session.defaultSession, ports.defaultBlocked),
      defaultControl: await chromiumGet(session.defaultSession, ports.defaultControl),
      updaterBlocked: await chromiumGet(updater, ports.updaterBlocked),
      updaterControl: await chromiumGet(updater, ports.updaterControl),
    }
    await sleep(1500)
    const logs = path.join(app.getPath('userData'), 'logs')
    const logText = fs.existsSync(logs) ? fs.readdirSync(logs).map(file => fs.readFileSync(path.join(logs, file), 'utf8')).join('\n') : ''
    const logged = logText.split('\n').filter(line => line.includes('cert.verify.blocked-key'))
    record('default-session-blocks-key', /ERR_FAILED/.test(results.defaultBlocked) && /ERR_CERT_AUTHORITY_INVALID/.test(results.defaultControl) &&
      logged.some(line => !line.includes('electron-updater')), `blocked chain: ${results.defaultBlocked}; control chain: ${results.defaultControl}`)
    record('updater-session-blocks-key', /ERR_FAILED/.test(results.updaterBlocked) && /ERR_CERT_AUTHORITY_INVALID/.test(results.updaterControl) &&
      logged.some(line => line.includes('electron-updater')), `blocked chain: ${results.updaterBlocked}; control chain: ${results.updaterControl}`)
  } finally {
    for (const server of servers) server.close()
  }
}

process.env.NODE_ENV = 'production'
require(config.mainEntry)

app.whenReady().then(async () => {
  const context = await checkWindow()
  await checkPage(context)
  await checkIpc(context)
  await checkNavigation(context)
  await checkRoutes(context)
  checkConsole()
  await checkCertificates()
  finish()
}).catch(finish)
