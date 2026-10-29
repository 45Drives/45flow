import { X509Certificate, createHash } from 'crypto'
import tls from 'tls'

// SHA-256 of the SubjectPublicKeyInfo of the compromised eMudhra intermediates
// (GHSA-jr5w-w6x2-84p9). Mirrors the list Electron 42.11.16+ compiles into Chromium and Node,
// so Electron 38 rejects the same chains. Remove once Electron is upgraded.
export const BLOCKED_SPKI_SHA256 = new Set([
  '49dd353dc2b919a3770645117d0e60c16115e7d1bc259eefe734b00ea434fe5f',
  '5c0660a2b164910d8ff589c18e14552e9e0ec237dcefe2cb736d41a4811f81a0',
  '63ecefee431d49523bc1136c4e72d0206a477086caf606cd5cf025686c109cf8',
  '92c063d67e8f14db71d288e11266ffdaf69cbf115f7bab14f3bc2f68d25e0e30',
  'ebed6475c2c2d80fcb199f3fe8dd6e6b3ce60b77eb15d4e42c3dec0c6f5b5105',
  'ec4ffa1ad0ac88081314b7aaffef6a91f97cd57291bb5ba686c5415f5eb4f6b6',
  '43bffa19d6ef651451f6841e019931e96f6f2eaeff28ab4b6f1ce4576de2717b',
  'e0254c7fcdc265e2f0f8a428dabb75ab4ae039b4872d62f5ee57f0877d5a8a41',
])

export function spkiSha256(certificate: string | Buffer): string | null {
  try {
    const key = new X509Certificate(certificate).publicKey.export({ type: 'spki', format: 'der' })
    return createHash('sha256').update(key).digest('hex')
  } catch {
    return null
  }
}

export function hasBlockedKey(certificates: Array<string | Buffer>, blocked: Set<string> = BLOCKED_SPKI_SHA256) {
  return certificates.some(certificate => {
    const hash = spkiSha256(certificate)
    return hash !== null && blocked.has(hash)
  })
}

type ChromiumCertificate = { data: string; issuerCert?: ChromiumCertificate }

export function chromiumChain(certificate?: ChromiumCertificate): string[] {
  const chain: string[] = []
  for (let current = certificate; current && !chain.includes(current.data); current = current.issuerCert) {
    chain.push(current.data)
  }
  return chain
}

type PeerCertificate = { raw?: Buffer; issuerCertificate?: PeerCertificate }

export function peerChain(certificate?: PeerCertificate): Buffer[] {
  const chain: Buffer[] = []
  const seen = new Set<PeerCertificate>()
  for (let current = certificate; current && !seen.has(current); current = current.issuerCertificate) {
    seen.add(current)
    if (current.raw) chain.push(current.raw)
  }
  return chain
}

let nodeTlsInstalled = false

// Node's tls.connect (used by https and fetch) reads tls.checkServerIdentity at connect time,
// so wrapping it covers every main-process TLS connection that does not supply its own check.
export function installNodeTlsBlocklist(blocked: Set<string> = BLOCKED_SPKI_SHA256) {
  if (nodeTlsInstalled) return
  nodeTlsInstalled = true
  const original = tls.checkServerIdentity
  tls.checkServerIdentity = (hostname, certificate) => {
    const error = original(hostname, certificate)
    if (error) return error
    if (hasBlockedKey(peerChain(certificate as PeerCertificate), blocked)) {
      return Object.assign(new Error(`Certificate chain for ${hostname} uses a blocked public key.`), {
        code: 'ERR_TLS_CERT_BLOCKED',
      })
    }
    return undefined
  }
}
