// Desktop transport to a Broadcaster (B2 #1): every app request goes over HTTPS through nginx.
// The certificate is trusted only if it matches what nginx presents over the app's SSH connection
// (see src/main/serverTrust.ts). Port 9095 is used only for setup, health and discovery.

export type ServerTrust = {
  host: string
  httpsPort?: number
  sshPort?: number
  username: string
  keyPath?: string
}

export function httpsBaseFor(host: string, httpsPort = 443): string {
  const name = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host
  return `https://${name}${httpsPort === 443 ? '' : `:${httpsPort}`}`
}

const isDesktop = () => !!window.electron && !window.electron.isWeb

/** Let the main process verify this server's certificate over SSH. No-op in the browser. */
export async function registerServerTrust(trust: ServerTrust): Promise<void> {
  if (!isDesktop()) return
  await window.electron.ipcRenderer.invoke('server-trust:register', {
    host: trust.host,
    httpsPort: trust.httpsPort ?? 443,
    sshPort: trust.sshPort ?? 22,
    username: trust.username,
    keyPath: trust.keyPath,
  })
}

/** Read the certificate over SSH now, so a failure is reported before any credentials are sent. */
export async function verifyServerCertificate(trust: ServerTrust): Promise<void> {
  if (!isDesktop()) return
  const result = await window.electron.ipcRenderer.invoke('verify-nginx-certificate-over-ssh', {
    httpsUrl: httpsBaseFor(trust.host, trust.httpsPort ?? 443),
    host: trust.host,
    username: trust.username,
    port: trust.sshPort ?? 22,
    keyPath: trust.keyPath,
  })
  if (result?.ok !== true) {
    throw new Error(`Could not verify the server's HTTPS certificate over SSH: ${result?.error || 'unknown error'} No connection was made.`)
  }
}

/** A fetch that reports an unreachable HTTPS port in words a user can act on. */
export async function fetchOverHttps(url: string, init: RequestInit, httpsPort: number): Promise<Response> {
  try {
    return await fetch(url, init)
  } catch {
    throw new Error(`Could not open an encrypted connection to ${new URL(url).host}. Check that HTTPS port ${httpsPort} is reachable from this computer (firewall, port setting under Ports), then try again.`)
  }
}

type UpgradableConnection = {
  serverIp: string
  baseUrl: string
  httpsPort?: number
  username: string
  ssh?: { server: string; username: string; port: number; keyPath?: string }
}

/** Saved desktop connections from before B2 used http://<server>:9095; move them to HTTPS. */
export function upgradedBaseUrl(conn: UpgradableConnection): string | null {
  if (!isDesktop()) return null
  try {
    if (new URL(conn.baseUrl).protocol !== 'http:') return null
  } catch {
    return null
  }
  return httpsBaseFor(conn.serverIp, conn.httpsPort ?? 443)
}

export function trustFor(conn: UpgradableConnection): ServerTrust | null {
  if (!conn.ssh?.username && !conn.username) return null
  return {
    host: conn.ssh?.server || conn.serverIp,
    httpsPort: conn.httpsPort ?? 443,
    sshPort: conn.ssh?.port ?? 22,
    username: conn.ssh?.username || conn.username,
    keyPath: conn.ssh?.keyPath,
  }
}
