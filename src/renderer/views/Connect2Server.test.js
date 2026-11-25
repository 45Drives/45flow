import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, reactive, ref } from 'vue'
import Connect2Server from './Connect2Server.vue'
import { useConnections } from '../composables/useConnections'
import { currentServerInjectionKey, discoveryStateInjectionKey, connectionMetaInjectionKey } from '../keys/injection-keys'

const mocks = vi.hoisted(() => ({ to: vi.fn() }))
vi.mock('vue-router', () => ({ useRoute: () => ({ query: { skipAutoLogin: 'true' } }) }))
vi.mock('../composables/useHeader', () => ({ useHeader: vi.fn() }))
vi.mock('../composables/useResilientNav', () => ({ useResilientNav: () => ({ to: mocks.to }) }))
vi.mock('../composables/useContextTour', () => ({ useContextTour: vi.fn() }))
vi.mock('@45drives/houston-common-ui', () => ({
  pushNotification: vi.fn(), Notification: class {}, useDarkModeState: () => ref(false),
}))
vi.mock('../components/modals/PortForwardingModal.vue', () => ({ default: { template: '<div />' } }))
vi.mock('../components/modals/StaffMfaEnrollModal.vue', () => ({ default: { template: '<div />' } }))

let app, host
afterEach(() => {
  app?.unmount()
  host?.remove()
  vi.unstubAllGlobals()
})

describe('existing server connection', () => {
  it('explains the existing user and opens that session instead of signing in again', async () => {
    vi.stubGlobal('electron', { isWeb: false, ipcRenderer: { invoke: vi.fn() } })
    const store = useConnections()
    store.addConnection({
      connectionId: 'connected-server', name: 'f8x1', serverIp: '192.168.123.5',
      baseUrl: 'https://192.168.123.5', username: 'bossman', token: 'existing',
      apiPort: 9095, tokenIssuedAt: Date.now(), lastConnectedAt: Date.now(),
      licensed: false, licenseFallback: false, status: 'connected', isActive: true,
    })
    host = document.createElement('div')
    document.body.appendChild(host)
    app = createApp(Connect2Server)
    app.provide(discoveryStateInjectionKey, reactive({ servers: [{ ip: '192.168.123.5', name: 'f8x1' }] }))
    app.provide(currentServerInjectionKey, ref(null))
    app.provide(connectionMetaInjectionKey, ref({ port: 9095 }))
    app.mount(host)
    await nextTick()
    expect(host.textContent).toContain('already connected as bossman')
    expect(host.querySelector('button[type="submit"]').disabled).toBe(true)
    const open = [...host.querySelectorAll('button')].find(button => button.textContent.includes('Open existing connection'))
    open.click()
    await nextTick()
    expect(store.activeConnection.value.connectionId).toBe('connected-server')
    expect(mocks.to).toHaveBeenCalledWith('dashboard')
    expect(window.electron.ipcRenderer.invoke).not.toHaveBeenCalled()
    store.updateConnection('connected-server', { token: '', status: 'disconnected' })
    await nextTick()
    expect(host.textContent).not.toContain('already connected as bossman')
    expect(host.querySelector('button[type="submit"]').disabled).toBe(false)
    store.removeConnection('connected-server')
  })
})
