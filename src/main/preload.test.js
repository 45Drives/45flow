// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const electron = vi.hoisted(() => ({
  exposed: {},
  ipcRenderer: {
    invoke: vi.fn(async () => 'handled'),
    send: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    removeListener: vi.fn(),
    removeAllListeners: vi.fn(),
  },
}))
vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: (key, value) => { electron.exposed[key] = value } },
  ipcRenderer: electron.ipcRenderer,
  webUtils: { getPathForFile: () => '' },
}))

const here = path.dirname(fileURLToPath(import.meta.url))
let bridge

beforeAll(async () => {
  await import('./preload')
  bridge = electron.exposed.electron.ipcRenderer
})
beforeEach(() => vi.clearAllMocks())

describe('preload IPC allowlist', () => {
  it('forwards allowed invoke channels and rejects everything else without calling main', async () => {
    await expect(bridge.invoke('probe-health', 'http://server')).resolves.toBe('handled')
    expect(electron.ipcRenderer.invoke).toHaveBeenCalledWith('probe-health', 'http://server')

    for (const channel of ['secureToken:get', 'log:info', 'get-client-ident', 'anything', undefined]) {
      await expect(bridge.invoke(channel)).rejects.toThrow('IPC channel not allowed')
    }
    expect(electron.ipcRenderer.invoke).toHaveBeenCalledTimes(1)
  })

  it('drops sends to channels outside the allowlist', () => {
    bridge.send('renderer-ready')
    bridge.send('IPCMessage', { type: 'action' })
    bridge.send('http-upload:start', { src: '/etc/passwd' })
    bridge.send('action', 'show_dashboard')
    expect(electron.ipcRenderer.send.mock.calls.map(([channel]) => channel)).toEqual(['renderer-ready', 'IPCMessage'])
  })

  it('subscribes only to allowed push channels and never exposes the real IPC event', () => {
    const listener = vi.fn()
    bridge.on('notification', listener)
    bridge.on(`upload:ingest:abc123`, listener)
    bridge.once('update:downloaded', listener)
    bridge.on('secureToken:status', listener)
    expect(electron.ipcRenderer.on.mock.calls.map(([channel]) => channel)).toEqual(['notification', 'upload:ingest:abc123'])
    expect(electron.ipcRenderer.once).toHaveBeenCalledTimes(1)

    const realEvent = { sender: electron.ipcRenderer, senderId: 1 }
    electron.ipcRenderer.on.mock.calls[0][1](realEvent, { message: 'hi' })
    const [event, payload] = listener.mock.calls[0]
    expect(event).not.toBe(realEvent)
    expect(event.sender).toBeUndefined()
    expect(payload).toEqual({ message: 'hi' })
  })

  it('every allowed invoke channel has a handler registered in main', () => {
    const preload = fs.readFileSync(path.join(here, 'preload.ts'), 'utf8')
    const block = preload.slice(preload.indexOf('const INVOKE_CHANNELS'), preload.indexOf('const SEND_CHANNELS'))
    const channels = [...block.matchAll(/'([^']+)'/g)].map(match => match[1])
    const sourceFiles = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
      const file = path.join(dir, entry.name)
      if (entry.isDirectory()) return entry.name === 'static' ? [] : sourceFiles(file)
      return /\.ts$/.test(entry.name) && entry.name !== 'preload.ts' ? [file] : []
    })
    const mainSources = sourceFiles(here).map(file => fs.readFileSync(file, 'utf8')).join('\n')
    const missing = channels.filter(channel => channel !== 'backup:isFirstRunNeeded' &&
      !new RegExp(`ipcMain\\.handle\\(\\s*['"\`]${channel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"\`]`).test(mainSources))
    expect(missing).toEqual([])
  })
})

describe('window hardening', () => {
  const main = fs.readFileSync(path.join(here, 'main.ts'), 'utf8')

  it('runs the renderer sandboxed with context isolation', () => {
    expect(main).toContain('sandbox: true')
    expect(main).not.toContain('sandbox: false')
    expect(main).toContain('contextIsolation: true')
    expect(main).toContain('nodeIntegration: false')
  })

  it('blocks navigation away from the bundled renderer', () => {
    expect(main).toMatch(/contents\.on\('will-navigate'/)
    expect(main).toMatch(/if \(isRendererUrl\(url\)\) return;\s*event\.preventDefault\(\);/)
  })

  it('applies the blocked-key check to the default session, the updater session and Node TLS', () => {
    expect(main).toContain('installNodeTlsBlocklist();')
    expect(main).toMatch(/session\.defaultSession\.setCertificateVerifyProc\(\(req, cb\) => \{\s*if \(usesBlockedKey\(req\)\)/)
    expect(main).toMatch(/fromPartition\('electron-updater', \{ cache: false \}\)\.setCertificateVerifyProc/)
  })

  it('does not allow inline scripts in the renderer CSP', () => {
    const html = fs.readFileSync(path.join(here, '..', 'renderer', 'index.html'), 'utf8')
    const csp = html.match(/Content-Security-Policy" content="([^"]+)"/)[1]
    expect(csp).toContain("script-src 'self'")
    expect(csp).not.toContain('unsafe-inline')
    expect(csp).toContain("object-src 'none'")
  })
})
