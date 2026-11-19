// Local proxy for P2P connections. The app's HTTP and WebSocket traffic (renderer fetch, main-process
// uploads, live updates) goes to http://127.0.0.1:<port>; the proxy carries it over the P2P data
// channel, or straight to the server's direct address when P2P cannot connect.
import crypto from 'crypto'
import http from 'http'
import https from 'https'
import type { AddressInfo } from 'net'
import type { Duplex } from 'stream'
import WebSocket, { WebSocketServer } from 'ws'
import { isForwardablePath, type HeaderPairs, type P2pClient } from './protocol'
import { connectP2p, DEFAULT_CONNECT_TIMEOUT_MS, parseP2pAddress, type P2pConnection } from './signaling'

export const CANT_CONNECT_MESSAGE =
  "Can't connect to this server from this network. Check the address and your internet connection, then try again."

export type ProxyMode = 'p2p' | 'direct'

export interface P2pProxyOptions {
  /** The P2P address staff entered: https://<server-id>.<domain>. */
  address: string
  /** The server's own address, used only when P2P cannot connect. */
  directUrl?: string
  signalUrl?: string
  iceServers?: string[]
  connectTimeoutMs?: number
  /** Listen on this port when free (keeps saved connections valid across restarts); otherwise any port. */
  preferredPort?: number
  /** Override how a P2P connection is made (tests). */
  connect?: (opts: Parameters<typeof connectP2p>[0]) => Promise<P2pConnection>
  log?: (event: string, data?: Record<string, unknown>) => void
}

export interface P2pProxy {
  start(): Promise<{ baseUrl: string; mode: ProxyMode }>
  readonly mode: ProxyMode | null
  readonly baseUrl: string | null
  close(): Promise<void>
}

const HOP = new Set(['connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'proxy-connection', 'te', 'trailer', 'host', 'content-length'])
const WS_SKIP = new Set([...HOP, 'sec-websocket-key', 'sec-websocket-version', 'sec-websocket-extensions', 'sec-websocket-protocol'])
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]'])

function headerPairs(raw: string[], skip: Set<string>): HeaderPairs {
  const out: HeaderPairs = []
  for (let i = 0; i < raw.length; i += 2) {
    if (!skip.has(raw[i].toLowerCase())) out.push([raw[i], raw[i + 1]])
  }
  return out
}

function validWsCode(code: unknown): number {
  return typeof code === 'number' && code >= 1000 && code < 5000 && code !== 1005 && code !== 1006 && code !== 1004 && code !== 1015 ? code : 1000
}

/** A WebSocket close reason must be a string of at most 123 bytes. */
function validWsReason(reason: unknown): string {
  return typeof reason === 'string' ? Buffer.from(reason).subarray(0, 123).toString().replace(/\uFFFD/g, '') : ''
}

const CORS_ALLOW_HEADERS = 'authorization, content-type, x-requested-with'
function validStatus(status: unknown): number {
  return typeof status === 'number' && Number.isInteger(status) && status >= 200 && status <= 599 ? status : 502
}

const CORS_SKIP = /^access-control-/i

export function createP2pProxy(options: P2pProxyOptions): P2pProxy {
  const address = parseP2pAddress(options.address)
  // A direct address the user entered wins; otherwise the one the server registered, learned when P2P fails.
  let direct = options.directUrl ? safeUrl(options.directUrl) : null
  const log = options.log ?? (() => {})
  const connect = options.connect ?? connectP2p
  const timeoutMs = options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS

  let mode: ProxyMode | null = null
  let baseUrl: string | null = null
  // Random per launch: only the app knows it, so no web page or local process can use the proxy.
  const secret = crypto.randomBytes(24).toString('hex')
  const prefix = `/p2p-${secret}`
  let server: http.Server | null = null
  let conn: P2pConnection | null = null
  let connecting: Promise<P2pConnection> | null = null
  const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false })
  const sockets = new Set<Duplex>()

  function safeUrl(text: string): URL | null {
    try {
      const u = new URL(text)
      return u.protocol === 'http:' || u.protocol === 'https:' ? u : null
    } catch { return null }
  }

  function getConnection(): Promise<P2pConnection> {
    if (conn) return Promise.resolve(conn)
    if (!address) return Promise.reject(new Error('not a P2P address'))
    connecting ??= connect({ address, signalUrl: options.signalUrl, iceServers: options.iceServers, timeoutMs })
      .then((c) => {
        conn = c
        c.onClosed(() => { if (conn === c) conn = null })
        return c
      })
      .finally(() => { connecting = null })
    return connecting
  }

  // Only the app itself may use the proxy: its address carries a per-launch secret path prefix, and
  // other Host names (DNS rebinding) are refused. Returns the path without the prefix, or null.
  function authorize(req: http.IncomingMessage): string | null {
    const host = (req.headers.host || '').replace(/:\d+$/, '')
    if (!LOOPBACK.has(host)) return null
    const url = req.url || ''
    const given = Buffer.from(url.slice(0, prefix.length))
    if (given.length !== prefix.length || !crypto.timingSafeEqual(given, Buffer.from(prefix))) return null
    const rest = url.slice(prefix.length)
    if (rest === '' || rest[0] === '?') return '/' + rest
    return rest[0] === '/' ? rest : null
  }

  // The renderer is a file:// page (Origin "null") calling this local address, so the proxy answers CORS
  // itself, for the app's own origin only after the secret check, in place of the server's CORS policy.
  function corsHeaders(req: http.IncomingMessage): Record<string, string> {
    const origin = req.headers.origin
    if (typeof origin !== 'string') return {}
    return {
      'access-control-allow-origin': origin,
      'access-control-allow-credentials': 'true',
      'access-control-expose-headers': '*',
      vary: 'Origin',
    }
  }

  function sendError(res: http.ServerResponse, status: number, message: string) {
    if (res.headersSent) { res.destroy(); return }
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: message }))
  }

  // ---- P2P transport ----

  async function p2pHttp(req: http.IncomingMessage, res: http.ServerResponse) {
    let c: P2pConnection
    try { c = await getConnection() } catch (e: any) { return sendError(res, 502, CANT_CONNECT_MESSAGE) }
    const hasBody = req.method !== 'GET' && req.method !== 'HEAD' && (req.headers['content-length'] !== '0')
    let done = false
    const ctl = c.client.request(
      { method: req.method, url: req.url!, headers: headerPairs(req.rawHeaders, HOP), body: hasBody },
      {
        head: (f) => {
          const flat: string[] = []
          for (const [k, v] of f.headers) if (!CORS_SKIP.test(String(k))) flat.push(String(k), String(v))
          if (validStatus(f.status) !== f.status) { ctl.abort(); sendError(res, 502, 'bad response from server'); return }
          try { res.writeHead(f.status, f.statusText || undefined, flat) } catch { ctl.abort() }
        },
        data: (chunk) => { res.write(chunk, () => ctl.ack(chunk.length)) },
        end: () => { done = true; res.end() },
        err: (message) => { done = true; sendError(res, message === 'bad path' ? 400 : 502, message) },
      },
    )
    res.on('close', () => { if (!done) ctl.abort() })
    if (hasBody) {
      try {
        for await (const chunk of req) await ctl.write(chunk as Buffer)
        ctl.endBody()
      } catch { ctl.abort() }
    }
  }

  async function p2pWebSocket(req: http.IncomingMessage, socket: Duplex, head: Buffer) {
    let c: P2pConnection
    try { c = await getConnection() } catch { return refuse(socket, 502) }
    const protocols = String(req.headers['sec-websocket-protocol'] || '').split(',').map((s) => s.trim()).filter(Boolean)
    let client: WebSocket | null = null
    const ctl = c.client.openWebSocket(
      { url: req.url!, protocols, headers: headerPairs(req.rawHeaders, WS_SKIP) },
      {
        opened: () => {
          wss.handleUpgrade(req, socket, head, (ws) => {
            client = ws
            ws.on('message', (data, isBinary) => {
              if (isBinary) ctl.sendBinary(Buffer.from(data as Buffer))
              else ctl.sendText(data.toString())
            })
            ws.on('close', (code, reason) => ctl.close(validWsCode(code), validWsReason(reason.toString())))
            ws.on('error', () => ctl.close(1011, 'proxy error'))
          })
        },
        text: (data) => { if (client?.readyState === WebSocket.OPEN) client.send(data) },
        binary: (data) => { if (client?.readyState === WebSocket.OPEN) client.send(data, { binary: true }) },
        close: (code, reason) => { client ? client.close(validWsCode(code), validWsReason(reason)) : refuse(socket, 502) },
        err: () => { client ? client.close(1011, 'upstream error') : refuse(socket, 502) },
      },
    )
    socket.on('close', () => { if (!client) ctl.close(1001, 'gone') })
  }

  // ---- direct transport ----

  function directHttp(req: http.IncomingMessage, res: http.ServerResponse) {
    const lib = direct!.protocol === 'https:' ? https : http
    const headers: Record<string, string | string[]> = {}
    for (const [k, v] of Object.entries(req.headers)) if (!HOP.has(k) && v !== undefined) headers[k] = v
    headers.host = direct!.host
    if (headers.origin) headers.origin = direct!.origin
    delete headers.referer
    const up = lib.request(new URL(req.url!, direct!), { method: req.method, headers }, (r) => {
      const flat: string[] = []
      for (let i = 0; i < r.rawHeaders.length; i += 2) {
        if (r.rawHeaders[i].toLowerCase() === 'location' && r.rawHeaders[i + 1].startsWith(direct!.origin)) {
          flat.push(r.rawHeaders[i], r.rawHeaders[i + 1].slice(direct!.origin.length) || '/')
        } else if (r.rawHeaders[i].toLowerCase() !== 'connection' && !CORS_SKIP.test(r.rawHeaders[i])) flat.push(r.rawHeaders[i], r.rawHeaders[i + 1])
      }
      res.writeHead(r.statusCode || 502, r.statusMessage, flat)
      r.pipe(res)
      r.on('error', () => res.destroy())
    })
    up.on('error', () => sendError(res, 502, CANT_CONNECT_MESSAGE))
    res.on('close', () => { if (!res.writableFinished) up.destroy() })
    req.pipe(up)
  }

  function directWebSocket(req: http.IncomingMessage, socket: Duplex, head: Buffer) {
    const url = new URL(req.url!, direct!)
    url.protocol = direct!.protocol === 'https:' ? 'wss:' : 'ws:'
    const headers: Record<string, string> = {}
    for (const [k, v] of Object.entries(req.headers)) if (!WS_SKIP.has(k) && typeof v === 'string') headers[k] = v
    if (headers.origin) headers.origin = direct!.origin
    const protocols = String(req.headers['sec-websocket-protocol'] || '').split(',').map((s) => s.trim()).filter(Boolean)
    const up = new WebSocket(url, protocols, { headers, perMessageDeflate: false })
    up.on('open', () => {
      wss.handleUpgrade(req, socket, head, (ws) => {
        ws.on('message', (d, bin) => { if (up.readyState === WebSocket.OPEN) up.send(d, { binary: bin }) })
        up.on('message', (d, bin) => { if (ws.readyState === WebSocket.OPEN) ws.send(d, { binary: bin }) })
        ws.on('close', (code) => up.close(validWsCode(code)))
        up.on('close', (code) => ws.close(validWsCode(code)))
        ws.on('error', () => up.terminate())
        up.on('error', () => ws.terminate())
      })
    })
    up.on('error', () => refuse(socket, 502))
  }

  function refuse(socket: Duplex, status: number) {
    try { socket.end(`HTTP/1.1 ${status} ${status === 403 ? 'Forbidden' : 'Bad Gateway'}\r\nConnection: close\r\n\r\n`) } catch { /* gone */ }
  }

  // ---- server ----

  function onRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    const path = authorize(req)
    if (path === null) return sendError(res, 403, 'forbidden')
    for (const [k, v] of Object.entries(corsHeaders(req))) res.setHeader(k, v)
    if (req.method === 'OPTIONS' && req.headers['access-control-request-method']) {
      res.writeHead(204, {
        'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'access-control-allow-headers': String(req.headers['access-control-request-headers'] || CORS_ALLOW_HEADERS),
        'access-control-max-age': '600',
      })
      return res.end()
    }
    if (!isForwardablePath(path)) return sendError(res, 400, 'bad path')
    req.url = path
    if (mode === 'direct') directHttp(req, res)
    else void p2pHttp(req, res)
  }

  function onUpgrade(req: http.IncomingMessage, socket: Duplex, head: Buffer) {
    const path = authorize(req)
    if (path === null) return refuse(socket, 403)
    if (!isForwardablePath(path)) return refuse(socket, 502)
    req.url = path
    if (mode === 'direct') directWebSocket(req, socket, head)
    else void p2pWebSocket(req, socket, head)
  }

  async function reachable(u: URL): Promise<boolean> {
    return new Promise((resolve) => {
      const lib = u.protocol === 'https:' ? https : http
      const r = lib.request(new URL('/', u), { method: 'GET', timeout: 5000 }, (resp) => { resp.resume(); resolve(true) })
      r.on('timeout', () => { r.destroy(); resolve(false) })
      r.on('error', () => resolve(false))
      r.end()
    })
  }

  function listen(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const s = http.createServer(onRequest)
      s.on('upgrade', onUpgrade)
      s.on('connection', (sock) => { sockets.add(sock); sock.on('close', () => sockets.delete(sock)) })
      s.once('error', reject)
      s.listen(port, '127.0.0.1', () => { server = s; s.removeListener('error', reject); resolve() })
    })
  }

  async function start() {
    if (!address && !direct) throw new Error('Enter the server address as https://<server-id>.<domain>.')
    // P2P first (decision 3); the direct address is used only if P2P cannot connect.
    if (address) {
      try {
        await getConnection()
        mode = 'p2p'
      } catch (e: any) {
        log('p2p.connect.failed', { reason: e?.message })
        if (!direct && typeof e?.directAddress === 'string') {
          const registered = safeUrl(e.directAddress)
          if (registered) direct = registered
        }
      }
    }
    if (!mode) {
      if (direct && direct.protocol === 'http:' && !LOOPBACK.has(direct.hostname)) {
        throw new Error('The direct address must start with https:// unless the server is on this computer.')
      }
      if (direct && await reachable(direct)) {
        mode = 'direct'
        log('p2p.fallback.direct', { host: direct.host })
      } else {
        throw new Error(CANT_CONNECT_MESSAGE)
      }
    }
    if (!server) {
      try { await listen(options.preferredPort ?? 0) } catch { await listen(0) }
    }
    baseUrl = `http://127.0.0.1:${(server!.address() as AddressInfo).port}${prefix}`
    return { baseUrl, mode }
  }

  async function close() {
    conn?.close(); conn = null
    for (const s of sockets) s.destroy()
    wss.clients.forEach((c) => c.terminate())
    await new Promise<void>((r) => (server ? server.close(() => r()) : r()))
    server = null; mode = null; baseUrl = null
  }

  return { start, close, get mode() { return mode }, get baseUrl() { return baseUrl } }
}

export type { P2pClient }
