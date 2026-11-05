import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchOverHttps, httpsBaseFor, registerServerTrust, trustFor, upgradedBaseUrl, verifyServerCertificate } from './server-trust'

const conn = (baseUrl, extra = {}) => ({
  serverIp: '192.168.1.50', baseUrl, username: 'root', httpsPort: 443,
  ssh: { server: '192.168.1.50', username: 'root', port: 22, keyPath: '/keys/id_ed25519' }, ...extra,
})

describe('desktop HTTPS transport', () => {
  let invoke
  beforeEach(() => {
    invoke = vi.fn(async () => ({ ok: true }))
    window.electron = { isWeb: false, ipcRenderer: { invoke } }
    vi.unstubAllGlobals()
  })

  it('moves saved http://<server>:9095 connections to HTTPS on the saved HTTPS port', () => {
    expect(upgradedBaseUrl(conn('http://192.168.1.50:9095'))).toBe('https://192.168.1.50')
    expect(upgradedBaseUrl(conn('http://192.168.1.50:9095', { httpsPort: 8443 }))).toBe('https://192.168.1.50:8443')
    expect(upgradedBaseUrl(conn('https://192.168.1.50'))).toBeNull()
  })

  it('never rewrites browser connections', () => {
    window.electron.isWeb = true
    expect(upgradedBaseUrl(conn('http://192.168.1.50:9095'))).toBeNull()
  })

  it('registers SSH trust with the main process', async () => {
    await registerServerTrust(trustFor(conn('https://192.168.1.50')))
    expect(invoke).toHaveBeenCalledWith('server-trust:register', {
      host: '192.168.1.50', httpsPort: 443, sshPort: 22, username: 'root', keyPath: '/keys/id_ed25519',
    })
  })

  it('refuses to connect when the certificate cannot be verified over SSH', async () => {
    invoke.mockResolvedValue({ ok: false, error: 'SSH host key differs from known_hosts.' })
    await expect(verifyServerCertificate(trustFor(conn('https://192.168.1.50'))))
      .rejects.toThrow('Could not verify the server\'s HTTPS certificate over SSH: SSH host key differs')
    expect(invoke).toHaveBeenCalledWith('verify-nginx-certificate-over-ssh', expect.objectContaining({
      httpsUrl: 'https://192.168.1.50', host: '192.168.1.50', port: 22,
    }))
  })

  it('explains an unreachable HTTPS port instead of falling back to HTTP', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', fetch)
    await expect(fetchOverHttps(`${httpsBaseFor('192.168.1.50', 8443)}/api/login`, { method: 'POST' }, 8443))
      .rejects.toThrow('Check that HTTPS port 8443 is reachable')
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0][0]).toBe('https://192.168.1.50:8443/api/login')
  })
})
