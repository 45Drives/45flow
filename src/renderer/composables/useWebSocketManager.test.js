import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, reactive, ref } from 'vue'

const state = vi.hoisted(() => ({ connections: null, activeConnection: null }))
vi.mock('./useConnections', () => ({
  useConnections: () => state,
}))
vi.mock('./useApi', () => ({ handleUnauthorized: vi.fn() }))

class TestWebSocket {
  static instances = []
  send = vi.fn()
  close = vi.fn()

  constructor(url) {
    this.url = url
    TestWebSocket.instances.push(this)
  }

  open() { this.onopen?.() }
  message(data) { this.onmessage?.({ data: JSON.stringify(data) }) }
  closed() { this.onclose?.({ code: 1006, reason: '', wasClean: false }) }
}

let scope
let manager
let connection

beforeEach(async () => {
  vi.resetModules()
  vi.useFakeTimers()
  vi.stubGlobal('WebSocket', TestWebSocket)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  TestWebSocket.instances = []
  connection = reactive({
    connectionId: 'server-1', name: 'Server', serverIp: '192.0.2.1',
    baseUrl: 'https://server.example', token: 'token-1', username: 'sam',
  })
  state.connections = reactive([connection])
  state.activeConnection = ref(connection)
  scope = effectScope()
  const { useWebSocketManager } = await import('./useWebSocketManager')
  manager = scope.run(() => useWebSocketManager())
})

afterEach(() => {
  scope.stop()
  manager.disconnect(connection.connectionId)
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('shared WebSocket lifecycle', () => {
  it('shares an in-flight socket across multiple consumers', async () => {
    const { useWebSocketManager } = await import('./useWebSocketManager')
    scope.run(() => useWebSocketManager())
    scope.run(() => useWebSocketManager())
    expect(TestWebSocket.instances).toHaveLength(1)
    expect(TestWebSocket.instances[0].close).not.toHaveBeenCalled()
  })

  it('does not reconnect after an intentional disconnect', () => {
    const socket = TestWebSocket.instances[0]
    socket.open()
    manager.disconnect(connection.connectionId)
    socket.closed()
    vi.advanceTimersByTime(3000)
    expect(TestWebSocket.instances).toHaveLength(1)
    expect(manager.getStatus(connection.connectionId)).toBe('disconnected')
  })

  it('ignores late events from a socket replaced after a token change', () => {
    const oldSocket = TestWebSocket.instances[0]
    oldSocket.open()
    manager.connect({ ...connection, token: 'token-2' })
    expect(TestWebSocket.instances).toHaveLength(2)
    const newSocket = TestWebSocket.instances[1]
    newSocket.open()
    oldSocket.closed()
    expect(manager.getStatus(connection.connectionId)).toBe('open')
    vi.advanceTimersByTime(3000)
    expect(TestWebSocket.instances).toHaveLength(2)
    expect(newSocket.send).toHaveBeenCalledWith(JSON.stringify({ type: 'auth', token: 'token-2' }))
  })

  it('rotates the token once when multiple consumers watch the same connection', async () => {
    const { useWebSocketManager } = await import('./useWebSocketManager')
    scope.run(() => useWebSocketManager())
    TestWebSocket.instances[0].open()
    connection.token = 'token-2'
    await nextTick()
    expect(TestWebSocket.instances).toHaveLength(2)
    TestWebSocket.instances[1].open()
    expect(TestWebSocket.instances[1].send).toHaveBeenCalledWith(JSON.stringify({
      type: 'auth', token: 'token-2',
    }))
  })

  it('preserves subscriptions and callbacks across a reconnect', () => {
    const socket = TestWebSocket.instances[0]
    socket.open()
    socket.message({ type: 'auth_ok', username: 'sam' })
    const callback = vi.fn()
    manager.subscribe(connection.connectionId, 'transcode', 7, callback)
    socket.closed()
    vi.advanceTimersByTime(3000)
    const replacement = TestWebSocket.instances[1]
    replacement.open()
    replacement.message({ type: 'auth_ok', username: 'sam' })
    expect(replacement.send).toHaveBeenCalledWith(JSON.stringify({
      type: 'subscribe', channel: 'transcode', id: 7,
    }))
    replacement.message({ channel: 'transcode', id: 7, data: { progress: 42 } })
    expect(callback).toHaveBeenCalledWith({ progress: 42 })
  })

  it('keeps failed reconnect attempts bounded with exponential backoff', () => {
    TestWebSocket.instances[0].open()
    TestWebSocket.instances[0].closed()
    for (const delay of [3000, 6000, 12000, 24000, 48000]) {
      const count = TestWebSocket.instances.length
      vi.advanceTimersByTime(delay - 1)
      expect(TestWebSocket.instances).toHaveLength(count)
      vi.advanceTimersByTime(1)
      expect(TestWebSocket.instances).toHaveLength(count + 1)
      TestWebSocket.instances.at(-1).closed()
    }
    vi.advanceTimersByTime(100000)
    expect(TestWebSocket.instances).toHaveLength(6)
  })

  it('lets disconnect cancel a pending reconnect', () => {
    TestWebSocket.instances[0].open()
    TestWebSocket.instances[0].closed()
    manager.disconnect(connection.connectionId)
    vi.advanceTimersByTime(3000)
    expect(TestWebSocket.instances).toHaveLength(1)
  })

  it('does not let another consumer bypass a pending reconnect delay', async () => {
    TestWebSocket.instances[0].open()
    TestWebSocket.instances[0].closed()
    const { useWebSocketManager } = await import('./useWebSocketManager')
    scope.run(() => useWebSocketManager())
    expect(TestWebSocket.instances).toHaveLength(1)
    vi.advanceTimersByTime(3000)
    expect(TestWebSocket.instances).toHaveLength(2)
  })

  it('still routes invalid-token errors through session recovery without retrying', async () => {
    const { handleUnauthorized } = await import('./useApi')
    const socket = TestWebSocket.instances[0]
    socket.open()
    socket.message({ type: 'auth_error', error: 'invalid_token', message: 'Session expired' })
    socket.closed()
    expect(handleUnauthorized).toHaveBeenCalledWith(connection.connectionId, connection.token)
    vi.advanceTimersByTime(3000)
    expect(TestWebSocket.instances).toHaveLength(1)
  })
})
