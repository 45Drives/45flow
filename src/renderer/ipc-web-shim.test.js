import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('browser Electron compatibility shim', () => {
  beforeEach(() => {
    vi.resetModules()
    delete window.electron
    delete window.appLog
    vi.restoreAllMocks()
  })

  it('maps discovery scanning to the explicit server API endpoints', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 204 })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ servers: [{ ip: '192.168.1.20' }] }),
      })
    vi.stubGlobal('fetch', fetch)
    await import('./ipc-web-shim')

    await expect(window.electron.ipcRenderer.invoke('scan-network-fallback'))
      .resolves.toEqual([{ ip: '192.168.1.20' }])
    expect(fetch.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([
      ['/api/discovery/scan', 'POST'],
      ['/api/discovery', undefined],
    ])
  })

  it('forwards only discovery events from the server event stream', async () => {
    const handlers = new Map()
    class MockEventSource {
      addEventListener(name, callback) { handlers.set(name, callback) }
    }
    vi.stubGlobal('EventSource', MockEventSource)
    await import('./ipc-web-shim')
    const listener = vi.fn()
    window.electron.ipcRenderer.on('discovered-servers', listener)
    handlers.get('discovered-servers')({ data: JSON.stringify([{ ip: '192.168.1.20' }]) })

    expect(listener).toHaveBeenCalledWith(
      { type: 'discovered-servers' },
      [{ ip: '192.168.1.20' }],
    )
  })

  it('rejects unknown IPC instead of forwarding arbitrary channels to the server', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    await import('./ipc-web-shim')

    await expect(window.electron.ipcRenderer.invoke('arbitrary-channel'))
      .rejects.toThrow('Unsupported browser IPC channel: arbitrary-channel')
    expect(fetch).not.toHaveBeenCalled()
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
