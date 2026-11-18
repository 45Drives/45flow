// Main-process owner of the P2P proxies, one per server address. The renderer asks for one when
// staff connect to (or reopen a connection to) a P2P address and uses the returned baseUrl.
import { createP2pProxy, type P2pProxy, type ProxyMode } from './proxy'
import { parseP2pAddress } from './signaling'

export interface P2pStartResult {
  baseUrl: string
  mode: ProxyMode
}

type Log = (event: string, data?: Record<string, unknown>) => void

const proxies = new Map<string, { proxy: P2pProxy; directUrl?: string }>()

// A stable port per server keeps a saved connection's baseUrl valid across restarts.
function preferredPortFor(serverId: string): number {
  let h = 0
  for (const ch of serverId) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return 41000 + (h % 20000)
}

// One start at a time per address, so concurrent calls end with one proxy and one peer connection.
const starting = new Map<string, Promise<P2pStartResult>>()

export function startP2p(input: { address?: unknown; directUrl?: unknown }, log?: Log): Promise<P2pStartResult> {
  const address = typeof input?.address === 'string' ? parseP2pAddress(input.address) : null
  if (!address) return Promise.reject(new Error('Enter the server address as https://<server-id>.<domain>.'))
  const directUrl = typeof input.directUrl === 'string' && input.directUrl.trim() ? input.directUrl.trim() : undefined
  const key = address.url
  const pending = starting.get(key)
  // Queue behind the in-flight start: it is reused when it matches, and replaced when the direct address differs.
  const run = (pending ? pending.catch(() => {}).then(() => doStart(address, directUrl, log)) : doStart(address, directUrl, log))
    .finally(() => { if (starting.get(key) === run) starting.delete(key) })
  starting.set(key, run)
  return run
}

async function doStart(address: { url: string; serverId: string }, directUrl: string | undefined, log?: Log): Promise<P2pStartResult> {
  const existing = proxies.get(address.url)
  if (existing && existing.directUrl === directUrl && existing.proxy.baseUrl && existing.proxy.mode) {
    return { baseUrl: existing.proxy.baseUrl, mode: existing.proxy.mode }
  }
  if (existing) { proxies.delete(address.url); await existing.proxy.close() }
  const proxy = createP2pProxy({ address: address.url, directUrl, preferredPort: preferredPortFor(address.serverId), log })
  try {
    const result = await proxy.start()
    proxies.set(address.url, { proxy, directUrl })
    return result
  } catch (e) {
    await proxy.close()
    throw e
  }
}

export async function stopAllP2p(): Promise<void> {
  const all = [...proxies.values()]
  proxies.clear()
  await Promise.all(all.map((p) => p.proxy.close()))
}
