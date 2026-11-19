import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const conn = { connectionId: 'c1', name: 'srv', serverIp: '1.2.3.4', baseUrl: 'https://abc.example.net', token: 'browser-session' }
vi.mock('./useConnections', () => ({
  useConnections: () => ({ connections: [], activeConnection: ref(undefined) }),
}))
vi.mock('./useApi', () => ({ handleUnauthorized: vi.fn() }))
import { useWebSocketManager } from './useWebSocketManager'

const realParent = Object.getOwnPropertyDescriptor(window, 'parent')

function framedBy(parent: unknown) {
  Object.defineProperty(window, 'parent', { value: parent, configurable: true })
}

function fakeSocket() {
  const s: any = { send: vi.fn(), close: vi.fn(), onopen: null, onmessage: null, onerror: null, onclose: null }
  return s
}

let n = 0
const nextConn = () => ({ ...conn, connectionId: `c${++n}` }) as any

describe('P7 web socket under the P2P loader', () => {
  beforeEach(() => { vi.spyOn(console, 'log').mockImplementation(() => {}) })
  afterEach(() => {
    if (realParent) Object.defineProperty(window, 'parent', realParent)
    else delete (window as any).parent
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('P7 opens /api/ws through the loader tunnel and never creates a real WebSocket', () => {
    const sock = fakeSocket()
    const openWebSocket = vi.fn(() => sock)
    framedBy({ p2pTunnel: { openWebSocket } })
    const RealWs = vi.fn()
    vi.stubGlobal('WebSocket', RealWs)

    const c = nextConn()
    useWebSocketManager().connect(c)

    expect(openWebSocket).toHaveBeenCalledWith('/api/ws')
    expect(RealWs).not.toHaveBeenCalled()
    // The tunnel socket drives the same auth handshake as a real one.
    sock.onopen()
    expect(sock.send).toHaveBeenCalledWith(JSON.stringify({ type: 'auth', session: true }))
  })

  it('P7 opens a normal WebSocket when not framed by the loader', () => {
    const RealWs = vi.fn(function (this: any) { Object.assign(this, fakeSocket()) })
    vi.stubGlobal('WebSocket', RealWs)

    useWebSocketManager().connect(nextConn())

    expect(RealWs).toHaveBeenCalledWith('wss://abc.example.net/api/ws')
  })

  it('P7 opens a normal WebSocket when the parent frame has no tunnel', () => {
    framedBy({})
    const RealWs = vi.fn(function (this: any) { Object.assign(this, fakeSocket()) })
    vi.stubGlobal('WebSocket', RealWs)

    useWebSocketManager().connect(nextConn())

    expect(RealWs).toHaveBeenCalledWith('wss://abc.example.net/api/ws')
  })
})
