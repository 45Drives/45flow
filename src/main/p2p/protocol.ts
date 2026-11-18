// Viewer side of the P2P bridge protocol (docs/p2p-protocol.md in houston-broadcaster, version 1).
// HTTP and WebSocket traffic share one WebRTC data channel, multiplexed by a viewer-chosen id.
// This file is an independent implementation of the viewer; there is no cross-repo import.

export const PROTOCOL_VERSION = 1
export const CHANNEL_LABEL = 'http'
export const CHUNK = 64 * 1024 - 4
export const WINDOW = 4 * 1024 * 1024
export const BUFFER_HIGH = 8 * 1024 * 1024

export type HeaderPairs = Array<[string, string]>

/** The slice of a node-datachannel DataChannel the client needs. */
export interface Channel {
  sendMessage(msg: string): boolean
  sendMessageBinary(buf: Buffer): boolean
  bufferedAmount(): number
  onMessage(cb: (msg: string | Buffer | ArrayBuffer) => void): void
  onClosed(cb: () => void): void
}

export interface RequestHandlers {
  head?(f: { status: number; statusText?: string; headers: HeaderPairs }): void
  data?(chunk: Buffer): void
  end?(): void
  err?(message: string): void
}

export interface WebSocketHandlers {
  opened?(f: { protocol: string }): void
  text?(data: string): void
  binary?(data: Buffer): void
  close?(code: number, reason: string): void
  err?(message: string): void
}

export interface RequestControl {
  id: number
  /** Tell the host this many response bytes were consumed (flow control). */
  ack(n: number): void
  abort(): void
  /** Send request body bytes, waiting on the host's acks. Resolves when the bytes are queued. */
  write(buf: Buffer): Promise<void>
  /** End the request body. */
  endBody(): void
}

export interface WebSocketControl {
  id: number
  sendText(data: string): void
  sendBinary(buf: Buffer): void
  close(code?: number, reason?: string): void
}

export function encodeData(id: number, payload: Buffer): Buffer {
  const out = Buffer.allocUnsafe(4 + payload.length)
  out.writeUInt32BE(id >>> 0, 0)
  payload.copy(out, 4)
  return out
}

export function decodeData(msg: Buffer | ArrayBuffer): { id: number; payload: Buffer } | null {
  const buf = Buffer.isBuffer(msg) ? msg : Buffer.from(msg)
  if (buf.length < 4) return null
  return { id: buf.readUInt32BE(0), payload: buf.subarray(4) }
}

function decodeFrame(text: string): any | null {
  try {
    const f = JSON.parse(text)
    return f && typeof f === 'object' && typeof f.t === 'string' ? f : null
  } catch {
    return null
  }
}

/** Same rule the host enforces: origin-relative paths only. Checking here gives a clear local error. */
export function isForwardablePath(url: unknown): url is string {
  if (typeof url !== 'string' || !url.startsWith('/') || url.startsWith('//')) return false
  if (/[\\\x00-\x1f\x7f]/.test(url)) return false
  try {
    const base = new URL('http://bridge.invalid')
    return new URL(url, base).origin === base.origin
  } catch {
    return false
  }
}

export interface P2pClient {
  readonly hello: { v: number } | null
  request(
    opts: { method?: string; url: string; headers?: HeaderPairs; body?: boolean },
    handlers: RequestHandlers,
  ): RequestControl
  openWebSocket(
    opts: { url: string; protocols?: string[]; headers?: HeaderPairs },
    handlers: WebSocketHandlers,
  ): WebSocketControl
  /** Fail every in-flight request and socket (used when the channel dies). */
  closeAll(message: string): void
}

export function createClient(dc: Channel): P2pClient {
  type ReqState = { h: RequestHandlers; acked: number; sent: number; wake: (() => void) | null }
  const reqs = new Map<number, ReqState>()
  const wss = new Map<number, WebSocketHandlers>()
  let nextId = 1
  let hello: { v: number } | null = null
  const sendJson = (f: object) => { dc.sendMessage(JSON.stringify(f)) }

  const closeAll = (message: string) => {
    const r = [...reqs.values()]
    const w = [...wss.values()]
    reqs.clear(); wss.clear()
    for (const s of r) { s.wake?.(); s.h.err?.(message) }
    for (const h of w) h.close?.(1006, message)
  }

  dc.onMessage((msg) => {
    if (typeof msg === 'string') {
      const f = decodeFrame(msg)
      if (!f) return
      if (f.t === 'hello') { hello = f; return }
      const r = reqs.get(f.id)
      const w = wss.get(f.id)
      if (f.t === 'ack') { if (r && Number.isFinite(f.n)) { r.acked += f.n; r.wake?.() } return }
      if (r) {
        if (f.t === 'head') r.h.head?.(f)
        else if (f.t === 'end') { reqs.delete(f.id); r.wake?.(); r.h.end?.() }
        else if (f.t === 'err') { reqs.delete(f.id); r.wake?.(); r.h.err?.(String(f.message)) }
      } else if (w) {
        if (f.t === 'ws-opened') w.opened?.(f)
        else if (f.t === 'ws-text') { if (typeof f.data === 'string') w.text?.(f.data) }
        else if (f.t === 'ws-bin') { if (typeof f.data === 'string') w.binary?.(Buffer.from(f.data, 'base64')) }
        else if (f.t === 'ws-close') { wss.delete(f.id); w.close?.(f.code, f.reason) }
        else if (f.t === 'err') { wss.delete(f.id); w.err?.(String(f.message)) }
      }
      return
    }
    const d = decodeData(msg)
    if (d) reqs.get(d.id)?.h.data?.(Buffer.from(d.payload))
  })
  dc.onClosed(() => closeAll('channel closed'))

  function request(opts: Parameters<P2pClient['request']>[0], handlers: RequestHandlers): RequestControl {
    const id = nextId++
    const state: ReqState = { h: handlers, acked: 0, sent: 0, wake: null }
    reqs.set(id, state)
    sendJson({ t: 'req', id, method: opts.method || 'GET', url: opts.url, headers: opts.headers || [], body: !!opts.body })
    return {
      id,
      ack: (n) => { try { sendJson({ t: 'ack', id, n }) } catch { /* channel gone */ } },
      abort: () => { reqs.delete(id); state.wake?.(); try { sendJson({ t: 'abort', id }) } catch { /* channel gone */ } },
      async write(buf) {
        for (let o = 0; o < buf.length; o += CHUNK) {
          while (reqs.has(id) && (state.sent - state.acked >= WINDOW || dc.bufferedAmount() >= BUFFER_HIGH)) {
            await new Promise<void>((resolve) => {
              state.wake = resolve
              setTimeout(resolve, 20)
            })
          }
          if (!reqs.has(id)) return
          const piece = buf.subarray(o, o + CHUNK)
          dc.sendMessageBinary(encodeData(id, piece))
          state.sent += piece.length
        }
      },
      endBody: () => { if (reqs.has(id)) sendJson({ t: 'bend', id }) },
    }
  }

  function openWebSocket(opts: Parameters<P2pClient['openWebSocket']>[0], handlers: WebSocketHandlers): WebSocketControl {
    const id = nextId++
    wss.set(id, handlers)
    sendJson({ t: 'ws-open', id, url: opts.url, protocols: opts.protocols || [], headers: opts.headers || [] })
    return {
      id,
      sendText: (data) => sendJson({ t: 'ws-text', id, data }),
      sendBinary: (buf) => sendJson({ t: 'ws-bin', id, data: Buffer.from(buf).toString('base64') }),
      close: (code, reason) => { wss.delete(id); try { sendJson({ t: 'ws-close', id, code, reason }) } catch { /* channel gone */ } },
    }
  }

  return { request, openWebSocket, closeAll, get hello() { return hello } }
}
