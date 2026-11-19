// @vitest-environment node
// P2P8: the main-process proxy against an in-process host (node-datachannel peer running the real
// bridge, copied as a fixture), a fake handshake service, and a fixture HTTP/WebSocket server.
import { it, expect, beforeAll, afterAll } from 'vitest'
import http from 'node:http'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'
import type { AddressInfo } from 'node:net'
import { createP2pProxy, CANT_CONNECT_MESSAGE, type P2pProxy } from './proxy'
import { createClient } from './protocol'
import { startP2p, stopAllP2p } from './index'

const require = createRequire(import.meta.url)
const ndc = require('node-datachannel')
const { WebSocketServer, WebSocket } = require('ws')
const { createBridge } = require('./fixtures/bridge.cjs')

const ADDRESS = 'https://abcdefghijklmnop.p2p.example.test'

let fixture: http.Server
let fixtureUrl: string
let wsEcho: any
let signaling: any
let signalUrl: string
let bridge: any
let hostPc: any
let proxy: P2pProxy | null = null
let direct: P2pProxy | null = null
const hits: string[] = []
const uploads: Array<{ sha: string; n: number; auth: string | undefined }> = []

const listen = (s: http.Server) => new Promise<number>((r) => s.listen(0, '127.0.0.1', () => r((s.address() as AddressInfo).port)))

// Minimal handshake service: welcomes the viewer and relays signals to one in-process host peer.
function startSignaling() {
  signaling = new WebSocketServer({ port: 0, host: '127.0.0.1', path: '/__p2p/signal' })
  signaling.on('connection', (ws: any) => {
    ws.on('message', (raw: Buffer) => {
      const m = JSON.parse(raw.toString())
      if (m.t === 'viewer') return ws.send(JSON.stringify({ v: 1, t: 'welcome', id: 'abcdefghijklmnop', hostOnline: true }))
      if (m.t !== 'signal') return
      if (!hostPc) {
        hostPc = new ndc.PeerConnection('host', { iceServers: [] })
        hostPc.onLocalDescription((sdp: string, type: string) => ws.send(JSON.stringify({ v: 1, t: 'signal', data: { type, sdp } })))
        hostPc.onLocalCandidate((candidate: string, mid: string) => ws.send(JSON.stringify({ v: 1, t: 'signal', data: { candidate, mid } })))
        hostPc.onDataChannel((dc: any) => bridge.attach(dc))
      }
      if (m.data.sdp) hostPc.setRemoteDescription(m.data.sdp, m.data.type)
      else hostPc.addRemoteCandidate(m.data.candidate, m.data.mid)
    })
  })
  return new Promise<void>((r) => signaling.on('listening', () => { signalUrl = `ws://127.0.0.1:${signaling.address().port}/__p2p/signal`; r() }))
}

beforeAll(async () => {
  fixture = http.createServer((req, res) => {
    hits.push(`${req.method} ${req.url}`)
    if (req.url === '/api/hello') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ hello: 'world', auth: req.headers.authorization || null }))
    } else if (req.url === '/upload') {
      const h = crypto.createHash('sha256')
      let n = 0
      req.on('data', (c) => { h.update(c); n += c.length })
      req.on('end', () => { uploads.push({ sha: h.digest('hex'), n, auth: req.headers.authorization }); res.end('stored') })
    } else {
      res.writeHead(404).end()
    }
  })
  wsEcho = new WebSocketServer({ server: fixture, path: '/ws' })
  wsEcho.on('connection', (ws: any) => ws.on('message', (d: Buffer, bin: boolean) => ws.send(bin ? d : `echo:${d}`, { binary: bin })))
  fixtureUrl = `http://127.0.0.1:${await listen(fixture)}`
  bridge = createBridge({ target: fixtureUrl })
  await startSignaling()
  proxy = createP2pProxy({ address: ADDRESS, signalUrl, iceServers: [], connectTimeoutMs: 15000 })
}, 60000)

afterAll(async () => {
  await proxy?.close()
  await direct?.close()
  try { hostPc?.close() } catch { /* closed */ }
  bridge?.close()
  signaling?.close()
  fixture.closeAllConnections?.()
  await new Promise((r) => fixture.close(r))
  ndc.cleanup()
})

function call(base: string, path: string, opts: http.RequestOptions & { body?: Buffer[] } = {}) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = http.request(base + path, { method: opts.method, headers: opts.headers }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode || 0, body: Buffer.concat(chunks).toString() }))
    })
    req.on('error', reject)
    for (const c of opts.body ?? []) req.write(c)
    req.end()
  })
}

it('P8 HTTP and uploads pass through the proxy', async () => {
  const started = await proxy!.start()
  expect(started.mode).toBe('p2p')
  expect(started.baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/p2p-[0-9a-f]{48}$/)

  const got = await call(started.baseUrl, '/api/hello', { headers: { authorization: 'Bearer t0k' } })
  expect(got.status).toBe(200)
  expect(JSON.parse(got.body)).toEqual({ hello: 'world', auth: 'Bearer t0k' })
  expect((await call(started.baseUrl, '/missing')).status).toBe(404)

  // Streamed (chunked) upload larger than one data message, like the main-process transcode upload.
  const pieces = Array.from({ length: 6 }, () => crypto.randomBytes(300 * 1024))
  const sha = crypto.createHash('sha256')
  pieces.forEach((p) => sha.update(p))
  const up = await call(started.baseUrl, '/upload', { method: 'POST', headers: { authorization: 'Bearer t0k' }, body: pieces })
  expect(up.body).toBe('stored')
  expect(uploads).toEqual([{ sha: sha.digest('hex'), n: 6 * 300 * 1024, auth: 'Bearer t0k' }])

  // A rebinding Host is refused.
  expect((await call(started.baseUrl, '/api/hello', { headers: { host: 'evil.example' } })).status).toBe(403)
}, 60000)

it('P8 WebSocket passes through the proxy', async () => {
  const { baseUrl } = await proxy!.start()
  const ws = new WebSocket(baseUrl.replace('http', 'ws') + '/ws')
  const got: Array<string | Buffer> = []
  await new Promise<void>((resolve, reject) => {
    ws.on('error', reject)
    ws.on('open', () => { ws.send('hi'); ws.send(Buffer.from([1, 2, 3]), { binary: true }) })
    ws.on('message', (d: Buffer, bin: boolean) => { got.push(bin ? d : d.toString()); if (got.length === 2) resolve() })
  })
  expect(got[0]).toBe('echo:hi')
  expect(Buffer.from(got[1] as Buffer)).toEqual(Buffer.from([1, 2, 3]))
  await new Promise<void>((r) => { ws.on('close', () => r()); ws.close(1000) })
}, 30000)

it('P8 falls back to the direct address when P2P cannot connect', async () => {
  // Nothing listens at the signaling address, so P2P cannot connect.
  const dead = { address: ADDRESS, signalUrl: 'ws://127.0.0.1:1/__p2p/signal', iceServers: [], connectTimeoutMs: 3000 }

  direct = createP2pProxy({ ...dead, directUrl: fixtureUrl })
  const started = await direct.start()
  expect(started.mode).toBe('direct')
  const before = hits.length
  const got = await call(started.baseUrl, '/api/hello')
  expect(JSON.parse(got.body).hello).toBe('world')
  expect(hits.length).toBe(before + 1)

  // No direct address (or one that does not answer): the can't-connect message.
  const none = createP2pProxy(dead)
  await expect(none.start()).rejects.toThrow(CANT_CONNECT_MESSAGE)
  const unreachable = createP2pProxy({ ...dead, directUrl: 'http://127.0.0.1:1' })
  await expect(unreachable.start()).rejects.toThrow(CANT_CONNECT_MESSAGE)
}, 60000)


it('P8 falls back to the address the server registered', async () => {
  // A handshake service whose welcome carries the server's registered address, then never answers.
  const welcoming = new WebSocketServer({ port: 0, host: '127.0.0.1', path: '/__p2p/signal' })
  welcoming.on('connection', (ws: any) => {
    ws.on('message', (raw: Buffer) => {
      if (JSON.parse(raw.toString()).t === 'viewer') {
        ws.send(JSON.stringify({ v: 1, t: 'welcome', id: 'abcdefghijklmnop', hostOnline: true, directAddress: fixtureUrl }))
      }
    })
  })
  await new Promise<void>((r) => welcoming.on('listening', () => r()))
  try {
    const base = { address: ADDRESS, signalUrl: `ws://127.0.0.1:${(welcoming.address() as AddressInfo).port}/__p2p/signal`, iceServers: [], connectTimeoutMs: 2000 }
    const registered = createP2pProxy(base)
    const started = await registered.start()
    expect(started.mode).toBe('direct')
    const before = hits.length
    expect(JSON.parse((await call(started.baseUrl, '/api/hello')).body).hello).toBe('world')
    expect(hits.length).toBe(before + 1)
    await registered.close()

    // An address the user entered still wins over the registered one.
    const entered = createP2pProxy({ ...base, directUrl: 'http://127.0.0.1:1' })
    await expect(entered.start()).rejects.toThrow(CANT_CONNECT_MESSAGE)
  } finally {
    await new Promise<void>((r) => welcoming.close(() => r()))
  }
}, 60000)


const origin = (baseUrl: string) => new URL(baseUrl).origin

it('P8 a request without the launch secret is refused (HTTP and WebSocket)', async () => {
  const { baseUrl } = await proxy!.start()
  const root = origin(baseUrl)
  const before = hits.length
  for (const bad of ['/api/hello', '/p2p-wrong/api/hello', '/p2p-/api/hello', baseUrl.slice(root.length) + 'x/api/hello']) {
    expect((await call(root, bad)).status).toBe(403)
    // No Origin, a null Origin and a localhost Origin get no more access than any other caller.
    expect((await call(root, bad, { headers: { origin: 'null' } })).status).toBe(403)
    expect((await call(root, bad, { headers: { origin: 'http://localhost:5173' } })).status).toBe(403)
  }
  expect(hits.length).toBe(before)

  for (const path of ['/ws', '/p2p-wrong/ws']) {
    const ws = new WebSocket(root.replace('http', 'ws') + path)
    const status = await new Promise<string>((resolve) => {
      ws.on('unexpected-response', (_req: any, res: http.IncomingMessage) => resolve(String(res.statusCode)))
      ws.on('error', (e: Error) => resolve(e.message))
      ws.on('open', () => resolve('open'))
    })
    expect(status).toMatch(/403/)
  }
}, 30000)

it('P8 answers CORS for the null origin of the app page, including a preflighted sign-in', async () => {
  const { baseUrl } = await proxy!.start()
  const root = origin(baseUrl)
  const prefix = baseUrl.slice(root.length)
  const pre = await new Promise<http.IncomingMessage>((resolve, reject) => {
    http.request(root + prefix + '/api/hello', {
      method: 'OPTIONS',
      headers: { origin: 'null', 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization,content-type' },
    }, resolve).on('error', reject).end()
  })
  pre.resume()
  expect(pre.statusCode).toBe(204)
  expect(pre.headers['access-control-allow-origin']).toBe('null')
  expect(pre.headers['access-control-allow-credentials']).toBe('true')
  expect(pre.headers['access-control-allow-headers']).toBe('authorization,content-type')
  expect(pre.headers['access-control-allow-methods']).toMatch(/POST/)

  const res = await new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }>((resolve, reject) => {
    const r = http.request(baseUrl + '/api/hello', {
      method: 'POST',
      headers: { origin: 'null', authorization: 'Bearer t0k', 'content-type': 'application/json' },
    }, (m) => {
      let body = ''
      m.on('data', (c) => { body += c })
      m.on('end', () => resolve({ status: m.statusCode || 0, headers: m.headers, body }))
    })
    r.on('error', reject)
    r.end(JSON.stringify({ username: 'a' }))
  })
  expect(res.status).toBe(200)
  expect(res.headers['access-control-allow-origin']).toBe('null')
  expect(res.headers['access-control-allow-credentials']).toBe('true')
  expect(JSON.parse(res.body).auth).toBe('Bearer t0k')
}, 30000)

it('P8 hostile frames from the host do not throw or crash the proxy', async () => {
  // A peer that answers every request and socket with malformed frames.
  let deliver: (m: string | Buffer) => void = () => {}
  const dc = {
    sendMessage: (m: string) => {
      const f = JSON.parse(m)
      setImmediate(() => reply(f))
      return true
    },
    sendMessageBinary: () => true,
    bufferedAmount: () => 0,
    onMessage: (cb: any) => { deliver = cb },
    onClosed: () => {},
  }
  function reply(f: any) {
    if (f.t === 'req' && f.url === '/api/status') deliver(JSON.stringify({ t: 'head', id: f.id, status: 'x', headers: [] }))
    if (f.t === 'req' && f.url === '/api/headers') {
      deliver(JSON.stringify({ t: 'head', id: f.id, status: 200, headers: { a: 1 } }))
      deliver(JSON.stringify({ t: 'end', id: f.id }))
    }
    if (f.t === 'ws-open') {
      deliver(JSON.stringify({ t: 'ws-opened', id: f.id, protocol: '' }))
      setTimeout(() => deliver(JSON.stringify({ t: 'ws-close', id: f.id, code: { a: 1 }, reason: 'r'.repeat(100000) })), 200)
    }
  }
  const client = createClient(dc as any)
  const hostile = createP2pProxy({
    address: ADDRESS,
    connect: async () => ({ client, close: () => {}, onClosed: () => {} }),
  })
  try {
    const { baseUrl } = await hostile.start()
    const root = origin(baseUrl)
    expect((await call(root, baseUrl.slice(root.length) + '/api/status')).status).toBe(502)
    expect((await call(root, baseUrl.slice(root.length) + '/api/headers')).status).toBe(200)

    const ws = new WebSocket(baseUrl.replace('http', 'ws') + '/ws')
    const closed = await new Promise<number>((resolve, reject) => {
      ws.on('error', reject)
      ws.on('close', (code: number) => resolve(code))
    })
    expect(closed).toBe(1000)
    // Frames that are not even objects are dropped.
    expect(() => deliver('null')).not.toThrow()
    expect(() => deliver('{"t":"head"}')).not.toThrow()
    expect(() => deliver(Buffer.from([1]))).not.toThrow()
  } finally {
    await hostile.close()
  }
}, 30000)

it('P8 concurrent starts for one address return one proxy', async () => {
  const input = { address: ADDRESS, directUrl: fixtureUrl }
  // Nothing listens at the default signaling host, so P2P fails fast and the direct address answers.
  const [a, b, c] = await Promise.all([startP2p(input), startP2p(input), startP2p({ ...input })])
  try {
    expect(b.baseUrl).toBe(a.baseUrl)
    expect(c.baseUrl).toBe(a.baseUrl)
    expect(a.mode).toBe('direct')
    expect((await startP2p(input)).baseUrl).toBe(a.baseUrl)
  } finally {
    await stopAllP2p()
  }
}, 120000)

it('P8 refuses a plain http direct address on another host', async () => {
  const dead = { address: ADDRESS, signalUrl: 'ws://127.0.0.1:1/__p2p/signal', iceServers: [], connectTimeoutMs: 2000 }
  const remote = createP2pProxy({ ...dead, directUrl: 'http://192.0.2.1' })
  await expect(remote.start()).rejects.toThrow(/https:\/\//)
}, 30000)
