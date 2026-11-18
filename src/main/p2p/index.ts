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

export async function startP2p(input: { address?: unknown; directUrl?: unknown }, log?: Log): Promise<P2pStartResult> {
  const address = typeof input?.address === 'string' ? parseP2pAddress(input.address) : null
  if (!address) throw new Error('Enter the server address as https://<server-id>.<domain>.')
  const directUrl = typeof input.directUrl === 'string' && input.directUrl.trim() ? input.directUrl.trim() : undefined
  const existing = proxies.get(address.url)
  if (existing && existing.directUrl === directUrl && existing.proxy.baseUrl && existing.proxy.mode) {
    return { baseUrl: existing.proxy.baseUrl, mode: existing.proxy.mode }
  }
  if (existing) await existing.proxy.close()
  const proxy = createP2pProxy({ address: address.url, directUrl, preferredPort: preferredPortFor(address.serverId), log })
  const result = await proxy.start()
  proxies.set(address.url, { proxy, directUrl })
  return result
}

export async function stopAllP2p(): Promise<void> {
  const all = [...proxies.values()]
  proxies.clear()
  await Promise.all(all.map((p) => p.proxy.close()))
}
