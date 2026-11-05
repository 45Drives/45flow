import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('browser Electron compatibility shim', () => {
  beforeEach(() => {
    vi.resetModules()
    delete window.electron
    delete window.appLog
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    sessionStorage.clear()
  })

  it('has nothing to discover: the browser only talks to the server that hosts it', async () => {
    const fetch = vi.fn()
    const EventSource = vi.fn()
    vi.stubGlobal('fetch', fetch)
    vi.stubGlobal('EventSource', EventSource)
    await import('./ipc-web-shim')

    window.electron.ipcRenderer.on('discovered-servers', vi.fn())
    await expect(window.electron.ipcRenderer.invoke('scan-network-fallback')).resolves.toEqual([])

    expect(fetch).not.toHaveBeenCalled()
    expect(EventSource).not.toHaveBeenCalled()
  })

  it('serves the Log Viewer from a redacted in-tab log', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await import('./ipc-web-shim')

    window.appLog.info('login.success', { host: 'nas', password: 'hunter2', token: 'abc' })
    window.appLog.error('upload.failed', { error: 'disk full' })
    const log = await window.electron.ipcRenderer.invoke('logs:read-client', { limit: 10 })

    expect(log.ok).toBe(true)
    expect(log.entries.map((e) => e.event)).toEqual(['upload.failed', 'login.success'])
    expect(log.entries[0]).toMatchObject({ level: 'error', summary: 'disk full' })
    expect(window.electron.exportClientLogs()).not.toMatch(/hunter2|abc/)
    expect(window.electron.exportClientLogs()).toContain('[redacted]')
  })

  it('records failed API calls without query strings, but not the signed-out probe', async () => {
    const native = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500, headers: new Headers({ 'x-request-id': 'req-9' }) })
      .mockResolvedValueOnce({ ok: false, status: 401, headers: new Headers() })
    vi.stubGlobal('fetch', native)
    await import('./ipc-web-shim')

    await window.fetch('/api/links?token=secret-link-token')
    await window.fetch('/api/session')

    const entries = (await window.electron.ipcRenderer.invoke('logs:read-client')).entries
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ event: 'http.error', data: { path: '/api/links', status: 500, requestId: 'req-9' } })
    expect(JSON.stringify(entries)).not.toContain('secret-link-token')
  })

  it('rejects unknown IPC instead of forwarding arbitrary channels to the server', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    await import('./ipc-web-shim')

    await expect(window.electron.ipcRenderer.invoke('arbitrary-channel'))
      .rejects.toThrow('Unsupported browser IPC channel: arbitrary-channel')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('opens the API docs on this server in a new tab, signed in by the page cookie, never with a token', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    await import('./ipc-web-shim')

    await expect(window.electron.ipcRenderer.invoke('api-docs:open', { baseUrl: 'http://evil.example', token: 'abc' }))
      .resolves.toBe(true)
    expect(open).toHaveBeenCalledWith(`${window.location.origin}/api-docs/`, '_blank', 'noopener,noreferrer')
  })

  it('keeps browser credentials in memory and drops saved passwords', async () => {
    await import('./ipc-web-shim')

    expect(window.electron.isWeb).toBe(true)
    await expect(window.electron.secureToken.status()).resolves.toEqual({ persistent: false })
    await window.electron.secureToken.set('connection-1', { token: 'jwt', savedPassword: 'secret' })
    await expect(window.electron.secureToken.get('connection-1')).resolves.toEqual({ token: 'jwt' })
    await window.electron.secureToken.clear('connection-1')
    await expect(window.electron.secureToken.get('connection-1')).resolves.toBeNull()
  })
})
