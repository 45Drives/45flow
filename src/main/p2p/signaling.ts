// Signaling client: joins a Houston server's P2P address through the handshake service and
// opens the data channel the bridge protocol runs on. Message shapes follow
// handshake/protocol.js (every message carries { v, t }); the `data` of a signal is opaque to the
// service, so the viewer and host agree on { type, sdp } for descriptions and { candidate, mid }
// for ICE candidates.
import WebSocket from 'ws'
import { CHANNEL_LABEL, PROTOCOL_VERSION, createClient, type Channel, type P2pClient } from './protocol'

const SIGNAL_VERSION = 1
const SIGNAL_PATH = '/__p2p/signal'
const ID_PATTERN = /^[a-z2-7]{16}$/
const STUN_PORT = 3478

export const DEFAULT_CONNECT_TIMEOUT_MS = 20_000

export interface P2pAddress {
  /** https://<server-id>.<domain>[:port], as entered. */
  url: string
  serverId: string
  host: string
}

/** Parse `https://<server-id>.<domain>`; null when the text is not a P2P address. */
export function parseP2pAddress(text: string): P2pAddress | null {
  let u: URL
  try { u = new URL(text.trim()) } catch { return null }
  if (u.protocol !== 'https:') return null
  const [serverId, ...rest] = u.hostname.split('.')
  if (!ID_PATTERN.test(serverId) || rest.length === 0) return null
  return { url: u.origin, serverId, host: u.host }
}

export interface P2pConnection {
  client: P2pClient
  close(): void
  onClosed(cb: () => void): void
}

export interface ConnectOptions {
  address: P2pAddress
  /** Override the signaling endpoint (default wss://<address host>/__p2p/signal). */
  signalUrl?: string
  iceServers?: string[]
  timeoutMs?: number
  /** Override the native module (tests). */
  ndc?: any
}

function loadNdc(): any {
  // Loaded on first use so an unavailable native module only disables P2P, never the app.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('node-datachannel')
}

const ERROR_TEXT: Record<string, string> = {
  unknown_server: 'This server is not online at the moment.',
  too_many: 'This server has reached its viewer limit.',
  version_mismatch: 'This app and the connection service are on different versions. Update 45Flow and try again.',
}

export function connectP2p(opts: ConnectOptions): Promise<P2pConnection> {
  const { address } = opts
  const timeoutMs = opts.timeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS
  const signalUrl = opts.signalUrl ?? `wss://${address.host}${SIGNAL_PATH}`
  const domain = address.host.split('.').slice(1).join('.').replace(/:\d+$/, '')
  const iceServers = opts.iceServers ?? [`stun:${domain}:${STUN_PORT}`]

  return new Promise<P2pConnection>((resolve, reject) => {
    let settled = false
    let ws: WebSocket | null = null
    let pc: any = null
    let ndc: any
    const closedCbs: Array<() => void> = []
    let torn = false

    const teardown = () => {
      if (torn) return
      torn = true
      try { ws?.close() } catch { /* already closed */ }
      try { pc?.close() } catch { /* already closed */ }
      for (const cb of closedCbs) { try { cb() } catch { /* listener failed */ } }
    }
    const fail = (message: string) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      teardown()
      reject(new Error(message))
    }
    const timer = setTimeout(() => fail('timed out reaching the server'), timeoutMs)

    try { ndc = opts.ndc ?? loadNdc() } catch (e: any) { return fail(`P2P is unavailable in this app (${e?.message || e})`) }

    const send = (m: object) => { try { ws?.send(JSON.stringify({ v: SIGNAL_VERSION, ...m })) } catch { /* socket closing */ } }

    try {
      ws = new WebSocket(signalUrl, { maxPayload: 64 * 1024 })
    } catch (e: any) { return fail(e?.message || 'bad signaling address') }
    ws.on('error', (e) => fail(`signaling failed: ${e.message}`))
    ws.on('close', () => { if (!settled) fail('signaling closed'); else if (!dcOpen) teardown() })
    ws.on('open', () => send({ t: 'viewer' }))

    let dcOpen = false
    const startPeer = () => {
      pc = new ndc.PeerConnection(`viewer-${address.serverId}`, { iceServers })
      pc.onLocalDescription((sdp: string, type: string) => send({ t: 'signal', data: { type, sdp } }))
      pc.onLocalCandidate((candidate: string, mid: string) => send({ t: 'signal', data: { candidate, mid } }))
      pc.onStateChange((state: string) => {
        if (state === 'failed') fail('could not open a direct connection')
        else if (state === 'closed' || state === 'disconnected') teardown()
      })
      const dc = pc.createDataChannel(CHANNEL_LABEL)
      const client = createClient(dc as Channel)
      dc.onClosed(teardown)
      dc.onOpen(() => {
        dcOpen = true
        // The host sends hello as soon as its bridge attaches; wait for it so a version mismatch
        // is reported here and not as a broken request later.
        const started = Date.now()
        const poll = setInterval(() => {
          if (settled) return clearInterval(poll)
          if (client.hello) {
            clearInterval(poll)
            if (client.hello.v !== PROTOCOL_VERSION) return fail(ERROR_TEXT.version_mismatch)
            settled = true
            clearTimeout(timer)
            resolve({
              client,
              close: () => { client.closeAll('connection closed'); teardown() },
              onClosed: (cb) => { if (torn) cb(); else closedCbs.push(cb) },
            })
          } else if (Date.now() - started > timeoutMs) { clearInterval(poll); fail('the server did not answer') }
        }, 10)
      })
    }

    ws.on('message', (raw, isBinary) => {
      if (isBinary) return
      let m: any
      try { m = JSON.parse(raw.toString('utf8')) } catch { return }
      if (!m || typeof m !== 'object') return
      if (m.t === 'welcome') {
        if (m.hostOnline === false) return fail(ERROR_TEXT.unknown_server)
        startPeer()
      } else if (m.t === 'signal' && pc && m.data && typeof m.data === 'object') {
        try {
          if (typeof m.data.sdp === 'string' && typeof m.data.type === 'string') pc.setRemoteDescription(m.data.sdp, m.data.type)
          else if (typeof m.data.candidate === 'string') pc.addRemoteCandidate(m.data.candidate, typeof m.data.mid === 'string' ? m.data.mid : '0')
        } catch { /* a stray candidate must not end the attempt */ }
      } else if (m.t === 'error') {
        fail(ERROR_TEXT[m.code] || m.message || 'the connection service refused the request')
      } else if (m.t === 'host-left') {
        if (!settled) fail(ERROR_TEXT.unknown_server); else teardown()
      }
    })
  })
}
