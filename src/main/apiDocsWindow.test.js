// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const electron = vi.hoisted(() => {
  const state = { windows: [], session: null, status: 200, loadError: null }
  class FakeWindow {
    constructor(options) {
      this.options = options
      this.handlers = {}
      this.destroyed = false
      this.webContents = {
        listeners: {},
        setWindowOpenHandler: vi.fn((fn) => { this.openHandler = fn }),
        on: (name, fn) => { this.webContents.listeners[name] = fn },
        removeListener: vi.fn(),
      }
      state.windows.push(this)
    }
    on(name, fn) { this.handlers[name] = fn }
    isDestroyed() { return this.destroyed }
    async loadURL(url) {
      this.loaded = url
      if (state.loadError) throw state.loadError
      this.webContents.listeners['did-navigate']?.({}, url, state.status)
    }
    close() { this.destroyed = true; this.handlers.closed?.() }
    show() {}
    focus() {}
  }
  const session = {
    setCertificateVerifyProc: vi.fn(),
    setPermissionRequestHandler: vi.fn(),
    setPermissionCheckHandler: vi.fn(),
    clearStorageData: vi.fn(async () => {}),
    webRequest: { onBeforeSendHeaders: vi.fn((fn) => { session.beforeSend = fn }) },
  }
  state.session = session
  return {
    state,
    module: {
      BrowserWindow: FakeWindow,
      session: { fromPartition: vi.fn(() => session) },
      shell: { openExternal: vi.fn() },
    },
  }
})
vi.mock('electron', () => electron.module)

const { apiDocsTarget, certificateVerdict, isApiDocsRequest, isUsableToken, openApiDocsWindow } = await import('./apiDocsWindow')

const trust = { isBlocked: () => false, getPin: () => undefined, getSshVerifiedCertificates: () => undefined }

function headersFor(url, requestHeaders = {}) {
  let sent
  electron.state.session.beforeSend({ url, requestHeaders }, ({ requestHeaders: out }) => { sent = out })
  return sent
}

describe('API docs window', () => {
  beforeEach(() => {
    electron.state.status = 200
    electron.state.loadError = null
    for (const win of electron.state.windows) if (!win.destroyed) win.close()
    electron.state.windows.length = 0
  })

  it('always opens the docs page of the connected server, never another path', () => {
    expect(apiDocsTarget('http://192.168.1.50:9095').href).toBe('http://192.168.1.50:9095/api-docs/')
    expect(apiDocsTarget('https://nas.local/some/path?x=1').href).toBe('https://nas.local/api-docs/')
    for (const bad of ['', null, 'file:///etc/passwd', 'javascript:alert(1)', 'http://user:pw@nas.local', 'not a url']) {
      expect(() => apiDocsTarget(bad)).toThrow()
    }
  })

  it('accepts only JWT-shaped tokens, so nothing can be injected into the header', () => {
    expect(isUsableToken('aaa.bbb.ccc')).toBe(true)
    for (const bad of ['', 'a\r\nX-Evil: 1', 'a b', 42, undefined]) expect(isUsableToken(bad)).toBe(false)
  })

  it('matches docs URLs on the same origin only', () => {
    const origin = 'http://192.168.1.50:9095'
    expect(isApiDocsRequest(`${origin}/api-docs/`, origin)).toBe(true)
    expect(isApiDocsRequest(`${origin}/api-docs/swagger-ui-init.js`, origin)).toBe(true)
    expect(isApiDocsRequest(`${origin}/api-docs.json`, origin)).toBe(true)
    expect(isApiDocsRequest(`${origin}/api/links`, origin)).toBe(false)
    expect(isApiDocsRequest(`${origin}/api-docsevil`, origin)).toBe(false)
    expect(isApiDocsRequest('http://192.168.1.51:9095/api-docs/', origin)).toBe(false)
    expect(isApiDocsRequest('https://192.168.1.50:9095/api-docs/', origin)).toBe(false)
  })

  it('opens a sandboxed window and sends the login only to the docs pages', async () => {
    await openApiDocsWindow('http://192.168.1.50:9095', 'aaa.bbb.ccc', trust)
    const [win] = electron.state.windows
    expect(win.loaded).toBe('http://192.168.1.50:9095/api-docs/')
    expect(win.options.webPreferences).toMatchObject({
      partition: 'api-docs', sandbox: true, contextIsolation: true, nodeIntegration: false, webviewTag: false,
    })
    expect(win.options.webPreferences.preload).toBeUndefined()

    expect(headersFor('http://192.168.1.50:9095/api-docs/swagger-ui.css').Authorization).toBe('Bearer aaa.bbb.ccc')
    expect(headersFor('http://192.168.1.50:9095/api/links').Authorization).toBeUndefined()
    expect(headersFor('https://evil.example/api-docs/', { authorization: 'Bearer leaked' })).toEqual({})
    expect(win.openHandler({ url: 'https://swagger.io' })).toEqual({ action: 'deny' })
  })

  it('denies every permission and stops sending the login once the window closes', async () => {
    await openApiDocsWindow('http://192.168.1.50:9095', 'aaa.bbb.ccc', trust)
    const deny = vi.fn()
    electron.state.session.setPermissionRequestHandler.mock.calls[0][0]({}, 'media', deny)
    expect(deny).toHaveBeenCalledWith(false)

    electron.state.windows[0].close()
    expect(electron.state.session.webRequest.onBeforeSendHeaders).toHaveBeenLastCalledWith(null)
    expect(electron.state.session.clearStorageData).toHaveBeenCalled()
  })

  it.each([
    [401, 'sign-in has ended'],
    [403, 'only available to server administrators'],
  ])('closes the window and explains a %s', async (status, message) => {
    electron.state.status = status
    await expect(openApiDocsWindow('http://192.168.1.50:9095', 'aaa.bbb.ccc', trust)).rejects.toThrow(message)
    expect(electron.state.windows[0].destroyed).toBe(true)
  })

  it('reports an unreachable server or untrusted certificate', async () => {
    electron.state.loadError = new Error('ERR_CERT_AUTHORITY_INVALID')
    await expect(openApiDocsWindow('https://nas.local', 'aaa.bbb.ccc', trust)).rejects.toThrow('certificate is trusted')
  })

  it('trusts only certificates the main window already trusts, without prompting', () => {
    const req = (fingerprint) => ({ hostname: 'nas.local', certificate: { fingerprint } })
    expect(certificateVerdict(req('A'), trust)).toBe(-3)
    expect(certificateVerdict(req('A'), { ...trust, getPin: () => ({ fingerprint: 'A' }) })).toBe(0)
    expect(certificateVerdict(req('B'), { ...trust, getPin: () => ({ fingerprint: 'A' }) })).toBe(-2)
    expect(certificateVerdict(req('A'), { ...trust, getSshVerifiedCertificates: () => ['A'] })).toBe(0)
    // An SSH-verified host never falls back to a pin.
    expect(certificateVerdict(req('B'), {
      ...trust, getSshVerifiedCertificates: () => ['A'], getPin: () => ({ fingerprint: 'B' }),
    })).toBe(-2)
    expect(certificateVerdict(req('A'), { ...trust, isBlocked: () => true, getPin: () => ({ fingerprint: 'A' }) })).toBe(-2)
  })
})
