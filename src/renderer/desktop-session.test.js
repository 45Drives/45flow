import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDesktopKeepalive, revokeDesktopSession, sessionIdOf } from './desktop-session'

const b64 = (o) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const jwt = (claims) => `${b64({ alg: 'HS256' })}.${b64(claims)}.sig`
const sessionToken = jwt({ sub: 'root', sid: 'abc123', jti: 'j1' })
const legacyToken = jwt({ sub: 'root' })
const reply = (body, status = 200) => ({ ok: status < 400, status, json: async () => body })

let clock
let fetchImpl
let onToken
let transfers
let conns
let keepalive

beforeEach(() => {
  clock = 1_000_000
  fetchImpl = vi.fn().mockResolvedValue(reply({ ok: true }))
  onToken = vi.fn()
  transfers = false
  conns = [{ connectionId: 'c1', baseUrl: 'https://nas', token: sessionToken, status: 'connected' }]
  keepalive = createDesktopKeepalive({
    connections: () => conns, transfersActive: () => transfers, onToken, fetchImpl, now: () => clock,
  })
})

const advance = (s) => { clock += s * 1000 }
const bodyOf = (call) => JSON.parse(call[1].body)

describe('sessionIdOf', () => {
  it('reads the session id, and returns null for tokens without one or for junk', () => {
    expect(sessionIdOf(sessionToken)).toBe('abc123')
    expect(sessionIdOf(legacyToken)).toBeNull()
    expect(sessionIdOf('not-a-jwt')).toBeNull()
    expect(sessionIdOf('')).toBeNull()
  })
})

describe('keepalive on user activity', () => {
  it('refreshes once a minute at most, using the connection token', async () => {
    advance(61)
    keepalive.userActivity()
    keepalive.userActivity()
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1))

    expect(fetchImpl.mock.calls[0][0]).toBe('https://nas/api/session/refresh')
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe(`Bearer ${sessionToken}`)
    await new Promise((resolve) => setTimeout(resolve, 0)) // let the first refresh finish
    advance(10)
    keepalive.userActivity()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    advance(61)
    keepalive.userActivity()
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2))
  })

  it('skips disconnected connections and tokens that predate sessions', async () => {
    conns = [
      { connectionId: 'a', baseUrl: 'https://a', token: sessionToken, status: 'disconnected' },
      { connectionId: 'b', baseUrl: 'https://b', token: legacyToken, status: 'connected' },
      { connectionId: 'c', baseUrl: 'https://c', token: '', status: 'connected' },
    ]

    await keepalive.run()

    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('keeps every connected server alive, not only the active one', async () => {
    conns.push({ connectionId: 'c2', baseUrl: 'https://other', token: jwt({ sid: 'zzz' }), status: 'connected' })

    await keepalive.run()

    expect(fetchImpl.mock.calls.map((c) => c[0]).sort()).toEqual(['https://nas/api/session/refresh', 'https://other/api/session/refresh'])
  })
})

describe('a short server idle timeout', () => {
  it('learns the timeout from the first refresh and then refreshes within it', async () => {
    fetchImpl.mockResolvedValue(reply({ ok: true, idleTimeoutSeconds: 45 }))
    await keepalive.run()
    await new Promise((resolve) => setTimeout(resolve, 0))

    advance(14) // under a third of 45 seconds: not yet
    keepalive.userActivity()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    advance(2) // now over it
    keepalive.userActivity()
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2))
  })
})

describe('token rotation', () => {
  it('hands over the replacement token together with the token it replaces', async () => {
    fetchImpl.mockResolvedValue(reply({ ok: true, token: 'new.jwt.token' }))

    await keepalive.run()

    expect(bodyOf(fetchImpl.mock.calls[0])).toEqual({ rotate: true })
    expect(onToken).toHaveBeenCalledWith('c1', sessionToken, 'new.jwt.token')
  })

  it('asks the server to defer rotation while a transfer is running', async () => {
    transfers = true

    await keepalive.run()

    expect(bodyOf(fetchImpl.mock.calls[0])).toEqual({ rotate: false })
  })

  it('reports an ended session with the token it used, and ignores network errors', async () => {
    const onSessionEnded = vi.fn()
    keepalive = createDesktopKeepalive({
      connections: () => conns, transfersActive: () => transfers, onToken, onSessionEnded, fetchImpl, now: () => clock,
    })
    fetchImpl.mockResolvedValueOnce(reply({ error: 'session_expired' }, 401))
    await keepalive.run()
    expect(onSessionEnded).toHaveBeenCalledWith('c1', sessionToken)

    fetchImpl.mockResolvedValueOnce(reply({ error: 'no_session_token' }, 409))
    await keepalive.run()
    fetchImpl.mockRejectedValueOnce(new Error('offline'))
    await keepalive.run()

    expect(onSessionEnded).toHaveBeenCalledOnce()
    expect(onToken).not.toHaveBeenCalled()
  })

  it('does not overlap refreshes', async () => {
    let release
    fetchImpl.mockReturnValueOnce(new Promise((resolve) => { release = () => resolve(reply({ ok: true })) }))

    const first = keepalive.run()
    await keepalive.run()
    release()
    await first

    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})

describe('server-side sign-out', () => {
  it('revokes a session token', async () => {
    await revokeDesktopSession('https://nas', sessionToken, fetchImpl)

    const [url, init] = fetchImpl.mock.calls[0]
    expect([url, init.method, init.headers.Authorization]).toEqual(['https://nas/api/session', 'DELETE', `Bearer ${sessionToken}`])
  })

  it('does nothing for old tokens or an empty token, and never throws', async () => {
    await revokeDesktopSession('https://nas', legacyToken, fetchImpl)
    await revokeDesktopSession('https://nas', '', fetchImpl)
    expect(fetchImpl).not.toHaveBeenCalled()

    fetchImpl.mockRejectedValueOnce(new Error('offline'))
    await expect(revokeDesktopSession('https://nas', sessionToken, fetchImpl)).resolves.toBeUndefined()
  })
})
