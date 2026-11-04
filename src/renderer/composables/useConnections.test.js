import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

const STORAGE_KEY = '45flow_connections_v1'
const credentials = { token: 'legacy-admin-jwt', savedPassword: 'legacy-admin-password' }
const connection = () => ({
  connectionId: 'connection-one', name: 'Studio', serverIp: 'server.local',
  baseUrl: 'https://server.local', username: 'admin', apiPort: 9095,
  tokenIssuedAt: Date.now(), lastConnectedAt: Date.now(), isActive: true,
  status: 'connected', licensed: false, licenseFallback: false,
})
let api
beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  sessionStorage.clear()
  api = {
    status: vi.fn(async () => ({ persistent: true })),
    get: vi.fn(async () => null),
    set: vi.fn(async () => ({ persistent: true })),
    clear: vi.fn(async () => {}),
  }
  vi.stubGlobal('electron', { secureToken: api })
})
afterEach(() => vi.unstubAllGlobals())

function seed(connections = [{ ...connection(), ...credentials }]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    connections, activeConnectionId: 'connection-one', _migrated: true,
  }))
}
function expectNoBrowserCredentials() {
  const stored = localStorage.getItem(STORAGE_KEY)
  expect(stored).not.toContain('legacy-admin-jwt')
  expect(stored).not.toContain('legacy-admin-password')
  for (const item of JSON.parse(stored).connections) {
    expect(item).not.toHaveProperty('token')
    expect(item).not.toHaveProperty('savedPassword')
  }
  expect(localStorage.getItem('hb_last_session_v1')).toBeNull()
  expect(sessionStorage.getItem('hb_token')).toBeNull()
}

describe('connection credential migration and persistence', () => {
  it('scrubs both storage surfaces before waiting for a keyring and preserves free connections', async () => {
    seed()
    localStorage.setItem('hb_last_session_v1', JSON.stringify({ token: credentials.token }))
    sessionStorage.setItem('hb_token', credentials.token)
    let release
    api.status.mockReturnValue(new Promise(resolve => { release = resolve }))
    const module = await import('./useConnections')
    const ready = module.initializeConnections()
    expectNoBrowserCredentials()
    release({ persistent: true })
    await ready
    expect(api.set).toHaveBeenCalledWith('connection-one', credentials)
    expect(module.useConnections().activeConnection.value).toMatchObject({
      ...credentials, licensed: false, status: 'disconnected',
    })
    expect(module.initializeConnections()).toBe(ready)
  })

  it('hydrates multiple encrypted connections without writing credentials back to browser storage', async () => {
    seed([connection(), { ...connection(), connectionId: 'connection-two', serverIp: 'other.local' }])
    api.get.mockImplementation(async id => ({ token: `encrypted-${id}` }))
    const module = await import('./useConnections')
    await module.initializeConnections()
    expect(module.useConnections().connections.map(c => c.token))
      .toEqual(['encrypted-connection-one', 'encrypted-connection-two'])
    await module.flushCredentialWrites()
    expect(api.set).not.toHaveBeenCalled()
    expectNoBrowserCredentials()
    const { loadLastSession } = await import('./useSessionPersistence')
    expect(loadLastSession()).toMatchObject({ token: 'encrypted-connection-one', apiBase: 'https://server.local' })
  })

  it('migrates a legacy-only session and cleans stale or malformed legacy entries', async () => {
    localStorage.setItem('hb_last_session_v1', JSON.stringify({
      serverIp: 'server.local', username: 'admin', token: credentials.token, savedAt: Date.now(),
    }))
    const module = await import('./useConnections')
    await module.initializeConnections()
    expect(module.useConnections().connections).toHaveLength(1)
    expect(api.set.mock.calls[0][1]).toEqual({ token: credentials.token, savedPassword: undefined })
    expectNoBrowserCredentials()
  })

  it.each(['not-json', JSON.stringify({ token: 'stale', savedAt: 1 }), JSON.stringify({
    serverIp: 'server.local', token: 'stale', savedAt: 1,
  })])('removes unusable legacy storage: %s', async raw => {
    localStorage.setItem('hb_last_session_v1', raw)
    const module = await import('./useConnections')
    await module.initializeConnections()
    expectNoBrowserCredentials()
    expect(api.set).not.toHaveBeenCalled()
  })

  it('keeps a usable in-memory session and warns when persistence is unavailable', async () => {
    seed()
    api.status.mockResolvedValue({ persistent: false })
    api.set.mockResolvedValue({ persistent: false })
    const module = await import('./useConnections')
    await module.initializeConnections()
    expect(module.useConnections().activeConnection.value.token).toBe(credentials.token)
    expect(module.useConnections().credentialStorageNotice.value).toContain('only for this app session')
    expectNoBrowserCredentials()
  })

  it('warns on migration failure but never retains plaintext as a fallback', async () => {
    seed()
    api.set.mockRejectedValue(new Error('disk unavailable'))
    const module = await import('./useConnections')
    await module.initializeConnections()
    expect(module.useConnections().credentialStorageNotice.value).toContain('could not be saved')
    expect(module.useConnections().activeConnection.value.token).toBe(credentials.token)
    expectNoBrowserCredentials()
  })

  it('serializes token refresh, password opt-out, logout and removal without cross-connection deletion', async () => {
    seed()
    const module = await import('./useConnections')
    await module.initializeConnections()
    api.set.mockClear()
    const store = module.useConnections()
    store.updateConnection('connection-one', { token: 'refreshed', tokenIssuedAt: Date.now() })
    store.updateConnection('connection-one', { savedPassword: undefined })
    store.addConnection({ ...connection(), connectionId: 'connection-two', serverIp: 'other.local', token: 'other' })
    await module.flushCredentialWrites()
    expect(api.set.mock.calls.filter(([id]) => id === 'connection-one').map(([, value]) => value))
      .toEqual([{ token: 'refreshed', savedPassword: credentials.savedPassword }, { token: 'refreshed', savedPassword: undefined }])
    await store.clearConnectionCredentials('connection-one')
    expect(store.activeConnection.value.token).toBe('')
    expect(api.clear).toHaveBeenCalledWith('connection-one')
    store.removeConnection('connection-two')
    await nextTick()
    await module.flushCredentialWrites()
    expect(api.clear).toHaveBeenCalledWith('connection-two')
    expectNoBrowserCredentials()
  })

  it('falls back to memory without routing secrets through the browser IPC web shim', async () => {
    seed()
    vi.stubGlobal('electron', { ipcRenderer: { invoke: vi.fn() } })
    const module = await import('./useConnections')
    await module.initializeConnections()
    module.useConnections().updateConnection('connection-one', { token: 'new' })
    await module.flushCredentialWrites()
    expect(window.electron.ipcRenderer.invoke).not.toHaveBeenCalled()
    expectNoBrowserCredentials()
  })
})
