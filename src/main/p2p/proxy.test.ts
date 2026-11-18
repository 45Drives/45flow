// @vitest-environment node
// P2P8: the main-process proxy against an in-process host (node-datachannel peer running the real
// bridge, copied as a fixture), a fake handshake service, and a fixture HTTP/WebSocket server.
import { it, expect, beforeAll, afterAll } from 'vitest'
import http from 'node:http'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'
import type { AddressInfo } from 'node:net'
import { createP2pProxy, CANT_CONNECT_MESSAGE, type P2pProxy } from './proxy'

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
  expect(started.baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)

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

  // A page on the web may not ride the proxy, and a rebinding Host is refused.
  expect((await call(started.baseUrl, '/api/hello', { headers: { origin: 'https://evil.example' } })).status).toBe(403)
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
