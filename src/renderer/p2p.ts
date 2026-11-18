// Desktop connections to a P2P address (https://<server-id>.<domain>). The main process runs a local
// proxy that carries the app's traffic over the P2P channel (src/main/p2p); the connection's
// baseUrl is that proxy, so every request and upload goes through it.

export type P2pMode = 'p2p' | 'direct'

const ID_PATTERN = /^[a-z2-7]{16}$/

/** The normalised P2P address (origin only), or null when the text is not one. */
export function parseP2pAddress(text: string): string | null {
  try {
    const u = new URL(text.trim())
    const [id, ...rest] = u.hostname.split('.')
    return u.protocol === 'https:' && ID_PATTERN.test(id) && rest.length > 0 ? u.origin : null
  } catch {
    return null
  }
}

/** Start (or reuse) the main-process proxy for this address. Throws the can't-connect message. */
export async function startP2pProxy(address: string, directUrl?: string): Promise<{ baseUrl: string; mode: P2pMode }> {
  try {
    return await window.electron.ipcRenderer.invoke('p2p:start', { address, directUrl: directUrl?.trim() || undefined })
  } catch (e: any) {
    // Electron prefixes IPC errors; keep only the sentence meant for staff.
    throw new Error(String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
  }
}
