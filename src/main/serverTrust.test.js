// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { clearSshTrusts, getSshTrust, httpsOrigin, registerSshTrust, verifyWithSshTrust } from './serverTrust'

const req = (fingerprint, hostname = '192.168.1.50') => ({ hostname, certificate: { fingerprint } })

function deps(overrides = {}) {
  const verified = new Map()
  const pins = new Map()
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), '45flow-keys-'))
  return {
    verified, pins, dir,
    getSshVerifiedCertificates: vi.fn(host => verified.get(host)),
    prepareSshCertificate: vi.fn(async ({ host }) => { verified.set(host, ['sha256/NGINX']) }),
    getPin: vi.fn(host => pins.get(host)),
    rememberPin: vi.fn((host, fingerprint) => pins.set(host, { fingerprint })),
    keyDir: () => dir,
    ...overrides,
  }
}

const trust = { host: '192.168.1.50', httpsPort: 443, sshPort: 22, username: 'root' }

describe('server certificate trust over SSH', () => {
  beforeEach(() => clearSshTrusts())

  it('leaves servers without SSH trust to the existing verifier', () => {
    expect(verifyWithSshTrust(req('sha256/X'), deps())).toBeNull()
  })

  it('accepts the certificate nginx presents over SSH and pins it', async () => {
    registerSshTrust(trust)
    const d = deps()
    await expect(verifyWithSshTrust(req('sha256/NGINX'), d)).resolves.toBe(0)
    expect(d.prepareSshCertificate).toHaveBeenCalledWith(expect.objectContaining({
      httpsUrl: 'https://192.168.1.50', host: '192.168.1.50', username: 'root', port: 22,
    }))
    expect(d.rememberPin).toHaveBeenCalledWith('192.168.1.50', 'sha256/NGINX')
  })

  it('pins a certificate this session already read over SSH', async () => {
    registerSshTrust(trust)
    const d = deps()
    d.verified.set('192.168.1.50', ['sha256/NGINX'])
    await expect(verifyWithSshTrust(req('sha256/NGINX'), d)).resolves.toBe(0)
    expect(d.prepareSshCertificate).not.toHaveBeenCalled()
    expect(d.rememberPin).toHaveBeenCalledWith('192.168.1.50', 'sha256/NGINX')
  })

  it('rejects a certificate that differs from the one seen over SSH', async () => {
    registerSshTrust(trust)
    const d = deps()
    await expect(verifyWithSshTrust(req('sha256/ATTACKER'), d)).resolves.toBe(-2)
    expect(d.rememberPin).not.toHaveBeenCalled()
  })

  it('uses a pin from an earlier SSH check without opening SSH, until this session has checked', async () => {
    registerSshTrust(trust)
    const d = deps()
    d.pins.set('192.168.1.50', { fingerprint: 'sha256/NGINX' })
    await expect(verifyWithSshTrust(req('sha256/NGINX'), d)).resolves.toBe(0)
    expect(d.prepareSshCertificate).not.toHaveBeenCalled()

    // Once SSH has been read this session, only that result counts, not an older pin.
    d.verified.set('192.168.1.50', ['sha256/NEW'])
    d.pins.set('192.168.1.50', { fingerprint: 'sha256/OLD' })
    d.prepareSshCertificate.mockImplementation(async () => {})
    await expect(verifyWithSshTrust(req('sha256/OLD'), d)).resolves.toBe(-2)
  })

  it('re-checks over SSH when the certificate changes (for example a new Let\'s Encrypt certificate)', async () => {
    registerSshTrust(trust)
    const d = deps()
    d.verified.set('192.168.1.50', ['sha256/OLD'])
    d.prepareSshCertificate.mockImplementation(async ({ host }) => { d.verified.set(host, ['sha256/RENEWED']) })
    await expect(verifyWithSshTrust(req('sha256/RENEWED'), d)).resolves.toBe(0)
    expect(d.prepareSshCertificate).toHaveBeenCalledTimes(1)
  })

  it('shares one SSH check between concurrent connections', async () => {
    registerSshTrust(trust)
    const d = deps()
    const results = await Promise.all([1, 2, 3].map(() => verifyWithSshTrust(req('sha256/NGINX'), d)))
    expect(results).toEqual([0, 0, 0])
    expect(d.prepareSshCertificate).toHaveBeenCalledTimes(1)
  })

  it('rejects without retrying SSH on every connection after a failure', async () => {
    registerSshTrust(trust)
    const d = deps({ prepareSshCertificate: vi.fn(async () => { throw new Error('SSH host key mismatch') }) })
    await expect(verifyWithSshTrust(req('sha256/NGINX'), d)).resolves.toBe(-2)
    await expect(verifyWithSshTrust(req('sha256/NGINX'), d)).resolves.toBe(-2)
    expect(d.prepareSshCertificate).toHaveBeenCalledTimes(1)
  })

  it('falls back to the app\'s own SSH key when a saved connection did not record one', async () => {
    registerSshTrust(trust)
    const d = deps()
    fs.writeFileSync(path.join(d.dir, 'id_ed25519'), 'key')
    await verifyWithSshTrust(req('sha256/NGINX'), d)
    expect(d.prepareSshCertificate).toHaveBeenCalledWith(expect.objectContaining({ keyPath: path.join(d.dir, 'id_ed25519') }))
  })

  it('validates what it registers', () => {
    expect(() => registerSshTrust({ ...trust, host: '-oProxyCommand=x' })).toThrow('Invalid server host')
    expect(() => registerSshTrust({ ...trust, username: '' })).toThrow('username')
    expect(() => registerSshTrust({ ...trust, httpsPort: 70000 })).toThrow('Invalid port')
    registerSshTrust({ ...trust, host: 'NAS.local', httpsPort: 8443 })
    expect(getSshTrust('nas.local')).toMatchObject({ host: 'nas.local', httpsPort: 8443 })
  })

  it('builds HTTPS origins, omitting the default port', () => {
    expect(httpsOrigin('192.168.1.50', 443)).toBe('https://192.168.1.50')
    expect(httpsOrigin('nas.local', 8443)).toBe('https://nas.local:8443')
    expect(httpsOrigin('fd00::50', 443)).toBe('https://[fd00::50]')
  })
})
