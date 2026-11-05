// Server certificate trust for the desktop app's HTTPS connection to a Broadcaster (B2 #1).
//
// The desktop app reaches every server it manages over SSH. For those servers the HTTPS
// certificate is trusted only if it is the certificate nginx presents when read through that
// SSH connection. A match is pinned, so later app launches connect without SSH; a different
// certificate (for example after switching to Let's Encrypt) is checked over SSH again.
import fs from 'fs'
import path from 'path'

export type SshTrust = {
  host: string
  httpsPort: number
  sshPort: number
  username: string
  keyPath?: string
}

export type TrustDeps = {
  getSshVerifiedCertificates: (host: string) => string[] | undefined
  prepareSshCertificate: (options: { httpsUrl: string; host: string; username: string; port: number; keyPath?: string }) => Promise<void>
  getPin: (host: string) => { fingerprint: string } | undefined
  rememberPin: (host: string, fingerprint: string) => void
  keyDir: () => string
}

type CertificateRequest = { hostname: string; certificate: { fingerprint: string } }

const trusts = new Map<string, SshTrust>()
const inflight = new Map<string, Promise<void>>()
const failedAt = new Map<string, number>()
// Chromium verifies every new TLS connection; do not open an SSH session for each one after a failure.
export const RETRY_AFTER_FAILURE_MS = 30_000

function normalize(host: string) {
  return String(host || '').replace(/^\[|\]$/g, '').toLowerCase()
}

function port(value: unknown, fallback: number) {
  const n = Number(value ?? fallback)
  if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error('Invalid port')
  return n
}

export function httpsOrigin(host: string, httpsPort: number) {
  const name = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host
  return `https://${name}${httpsPort === 443 ? '' : `:${httpsPort}`}`
}

/** Remember how to reach a server over SSH so its HTTPS certificate can be verified on demand. */
export function registerSshTrust(input: Partial<SshTrust>) {
  const host = normalize(input?.host ?? '')
  if (!host || !/^[a-z0-9._:%-]+$/.test(host) || host.startsWith('-')) throw new Error('Invalid server host')
  if (typeof input.username !== 'string' || !input.username) throw new Error('An SSH username is required')
  const trust: SshTrust = {
    host,
    httpsPort: port(input.httpsPort, 443),
    sshPort: port(input.sshPort, 22),
    username: input.username,
    keyPath: typeof input.keyPath === 'string' && input.keyPath ? input.keyPath : undefined,
  }
  trusts.set(host, trust)
  failedAt.delete(host)
  return trust
}

export function getSshTrust(host: string) {
  return trusts.get(normalize(host))
}

export function clearSshTrusts() {
  trusts.clear()
  inflight.clear()
  failedAt.clear()
}

/** The app's own key (installed by ensure-ssh-ready) when a saved connection did not record one. */
function defaultKeyPath(deps: TrustDeps) {
  for (const name of ['id_ed25519', 'id_rsa']) {
    const file = path.join(deps.keyDir(), name)
    if (fs.existsSync(file)) return file
  }
  return undefined
}

function verifyOverSsh(trust: SshTrust, deps: TrustDeps) {
  let operation = inflight.get(trust.host)
  if (!operation) {
    operation = deps.prepareSshCertificate({
      httpsUrl: httpsOrigin(trust.host, trust.httpsPort),
      host: trust.host,
      username: trust.username,
      port: trust.sshPort,
      keyPath: trust.keyPath ?? defaultKeyPath(deps),
    }).finally(() => inflight.delete(trust.host))
    inflight.set(trust.host, operation)
  }
  return operation
}

/**
 * Certificate verdict for a server registered with SSH trust: 0 accept, -2 reject.
 * Returns null for any other host, which keeps the existing verifier behaviour.
 */
export function verifyWithSshTrust(req: CertificateRequest, deps: TrustDeps): Promise<0 | -2> | null {
  const trust = getSshTrust(req.hostname)
  if (!trust) return null
  const presented = req.certificate.fingerprint
  return (async () => {
    const verified = deps.getSshVerifiedCertificates(trust.host)
    if (verified?.includes(presented)) {
      // Pinned so the next app launch can connect before it has reached the server over SSH.
      if (deps.getPin(trust.host)?.fingerprint !== presented) deps.rememberPin(trust.host, presented)
      return 0 as const
    }
    // A pin is only used before this app session has read the certificate over SSH.
    if (!verified && deps.getPin(trust.host)?.fingerprint === presented) return 0 as const
    if (Date.now() - (failedAt.get(trust.host) ?? 0) < RETRY_AFTER_FAILURE_MS) return -2 as const
    try {
      await verifyOverSsh(trust, deps)
      failedAt.delete(trust.host)
    } catch {
      failedAt.set(trust.host, Date.now())
      return -2 as const
    }
    if (!deps.getSshVerifiedCertificates(trust.host)?.includes(presented)) return -2 as const
    deps.rememberPin(trust.host, presented)
    return 0 as const
  })()
}
