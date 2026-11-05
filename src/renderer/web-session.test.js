import { beforeEach, describe, expect, it, vi } from 'vitest'

const ORIGIN = 'https://nas.example'
const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body })
const session = { ok: true, user: { name: 'root', admin: true }, csrfToken: 'csrf-1', idleTimeoutSeconds: 900, idleRemainingSeconds: 900, expiresAt: '2999-01-01T00:00:00Z' }

let mod
let native
let wrapped

beforeEach(async () => {
  vi.resetModules()
  native = vi.fn()
  mod = await import('./web-session')
  wrapped = mod.createSessionFetch(native, ORIGIN)
  vi.stubGlobal('fetch', wrapped)
})

const lastCall = () => {
  const [url, init] = native.mock.calls.at(-1)
  return { url, init, headers: new Headers(init?.headers) }
}

describe('session-aware fetch', () => {
  it('drops the placeholder bearer token and always sends cookies for same-origin API calls', async () => {
    native.mockResolvedValue(json({}))

    await wrapped(`${ORIGIN}/api/links`, { headers: { Authorization: `Bearer ${mod.WEB_SESSION_TOKEN}` } })

    const { headers, init } = lastCall()
    expect(headers.has('Authorization')).toBe(false)
    expect(init.credentials).toBe('same-origin')
  })

  it('leaves real bearer tokens alone', async () => {
    native.mockResolvedValue(json({}))

    await wrapped(`${ORIGIN}/api/links`, { headers: { Authorization: 'Bearer real.jwt.token' } })

    expect(lastCall().headers.get('Authorization')).toBe('Bearer real.jwt.token')
  })

  it('adds the CSRF token to unsafe methods only, after sign-in', async () => {
    native.mockResolvedValueOnce(json(session))
    await mod.signInWithSession('root', 'pw')
    native.mockResolvedValue(json({}))

    await wrapped(`${ORIGIN}/api/links`, { method: 'GET' })
    expect(lastCall().headers.has('X-CSRF-Token')).toBe(false)
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      await wrapped('/api/links/1', { method })
      expect(lastCall().headers.get('X-CSRF-Token')).toBe('csrf-1')
    }
  })

  it('does not touch other origins or non-API paths', async () => {
    native.mockResolvedValueOnce(json(session))
    await mod.signInWithSession('root', 'pw')
    native.mockResolvedValue(json({}))
    const init = { method: 'POST', headers: { Authorization: `Bearer ${mod.WEB_SESSION_TOKEN}` } }

    await wrapped('https://other.example/api/x', init)
    expect(native).toHaveBeenLastCalledWith('https://other.example/api/x', init)
    await wrapped(`${ORIGIN}/assets/app.js`, init)
    expect(native).toHaveBeenLastCalledWith(`${ORIGIN}/assets/app.js`, init)
  })
})

describe('session lifecycle', () => {
  it('signs in without ever receiving a bearer token', async () => {
    native.mockResolvedValue(json({ ...session, entitlement: { x: 1 } }))

    const result = await mod.signInWithSession('root', 'pw', '2026-11-04')

    const { url, init } = lastCall()
    expect([url, init.method]).toEqual(['/api/session', 'POST'])
    expect(JSON.parse(init.body)).toEqual({ username: 'root', password: 'pw', clientBuildDate: '2026-11-04' })
    expect(result).toMatchObject({ user: { name: 'root', admin: true }, idleTimeoutSeconds: 900, entitlement: { x: 1 } })
    expect(result.token).toBeUndefined()
    expect(mod.isWebSessionAdmin()).toBe(true)
  })

  it('reports the server message and status when sign-in fails', async () => {
    native.mockResolvedValue(json({ error: 'Invalid credentials' }, 401))

    await expect(mod.signInWithSession('root', 'bad')).rejects.toMatchObject({ message: 'Invalid credentials', status: 401 })
    expect(mod.getWebSession()).toBeNull()
  })

  it('restores a session after reload and reports signed-out as null', async () => {
    native.mockResolvedValueOnce(json(session))
    await expect(mod.restoreSession()).resolves.toMatchObject({ user: { name: 'root' } })

    native.mockResolvedValueOnce(json({ error: 'session_required' }, 401))
    await expect(mod.restoreSession()).resolves.toBeNull()
    expect(mod.getWebSession()).toBeNull()
    expect(mod.isWebSessionAdmin()).toBe(false)
  })

  it('treats an expired session as not an administrator', async () => {
    native.mockResolvedValueOnce(json({ ...session, expiresAt: '2000-01-01T00:00:00Z' }))
    await mod.signInWithSession('root', 'pw')

    expect(mod.isWebSessionAdmin()).toBe(false)
  })

  it('signs out on the server and clears local state, even if the request fails', async () => {
    native.mockResolvedValueOnce(json(session))
    await mod.signInWithSession('root', 'pw')
    native.mockRejectedValueOnce(new Error('offline'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    await mod.signOutSession()

    const { url, init, headers } = lastCall()
    expect([url, init.method]).toEqual(['/api/session', 'DELETE'])
    expect(headers.get('X-CSRF-Token')).toBe('csrf-1')
    expect(mod.getWebSession()).toBeNull()
  })
})

describe('admin check', () => {
  it('uses the session for the placeholder token and the JWT for real tokens', async () => {
    const { isAdminSession } = await import('./composables/adminSession')
    native.mockResolvedValueOnce(json(session))
    await mod.signInWithSession('root', 'pw')

    expect(isAdminSession(mod.WEB_SESSION_TOKEN)).toBe(true)
    expect(isAdminSession('not.a.jwt')).toBe(false)
  })
})

describe('session activity', () => {
  const counted = (body = {}, status = 200) => ({ ...json(body, status), headers: new Headers({ 'x-session-activity': 'counted' }) })
  const background = (body = {}) => ({ ...json(body), headers: new Headers({ 'x-session-activity': 'background' }) })

  it('reports activity only for responses the server says counted', async () => {
    const listener = vi.fn()
    mod.onApiActivity(listener)

    native.mockResolvedValueOnce(counted())
    await wrapped('/api/links')
    expect(listener).toHaveBeenCalledTimes(1)

    native.mockResolvedValueOnce(background())
    await wrapped('/api/progress/active', { headers: { 'X-Background-Request': '1' } })
    native.mockResolvedValueOnce(json({})) // no header at all: an older server, or not an API call that counts
    await wrapped('/api/session?passive=1')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('ignores other origins, static files and failures', async () => {
    const listener = vi.fn()
    mod.onApiActivity(listener)

    native.mockResolvedValue(counted())
    await wrapped('https://other.example/api/x')
    await wrapped('/assets/app.js')
    expect(listener).not.toHaveBeenCalled()

    native.mockResolvedValueOnce({ ...json({ error: 'session_expired' }, 401), headers: new Headers() })
    await wrapped('/api/links')
    expect(listener).not.toHaveBeenCalled()
  })

  it('stops reporting after unsubscribe', async () => {
    const listener = vi.fn()
    const off = mod.onApiActivity(listener)
    off()
    native.mockResolvedValue(counted())

    await wrapped('/api/links')

    expect(listener).not.toHaveBeenCalled()
  })

  it('keeps the session alive with a normal request and reads time left with a passive one', async () => {
    native.mockResolvedValueOnce(json(session))
    await expect(mod.keepSessionAlive()).resolves.toBe(true)
    expect(lastCall().url).toBe('/api/session')

    native.mockResolvedValueOnce(json({ ...session, idleRemainingSeconds: 42 }))
    await expect(mod.checkSessionIdle()).resolves.toEqual({ idleRemainingSeconds: 42 })
    expect(lastCall().url).toBe('/api/session?passive=1')

    native.mockResolvedValueOnce(json({ error: 'session_expired' }, 401))
    await expect(mod.checkSessionIdle()).resolves.toBeNull()
    native.mockResolvedValueOnce(json({ error: 'session_expired' }, 401))
    await expect(mod.keepSessionAlive()).resolves.toBe(false)
  })
})
