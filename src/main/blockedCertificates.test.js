// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import https from 'node:https'
import os from 'node:os'
import path from 'node:path'
import tls from 'node:tls'
import {
  BLOCKED_SPKI_SHA256, chromiumChain, hasBlockedKey, installNodeTlsBlocklist, peerChain, spkiSha256,
} from './blockedCertificates'

const hasOpenssl = spawnSync('openssl', ['version']).status === 0
let dir
const pki = {}

function openssl(...args) {
  execFileSync('openssl', args, { cwd: dir, stdio: 'pipe' })
}

function issue(name, subject, issuer, extensions) {
  fs.writeFileSync(path.join(dir, `${name}.ext`), extensions)
  openssl('req', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256', '-nodes',
    '-keyout', `${name}.key`, '-out', `${name}.csr`, '-subj', subject)
  openssl('x509', '-req', '-in', `${name}.csr`, '-CA', `${issuer}.pem`, '-CAkey', `${issuer}.key`,
    '-set_serial', String(Date.now()), '-days', '2', '-extfile', `${name}.ext`, '-out', `${name}.pem`)
}

beforeAll(() => {
  if (!hasOpenssl) return
  dir = fs.mkdtempSync(path.join(os.tmpdir(), '45flow-blocked-certs-'))
  openssl('req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256', '-nodes',
    '-keyout', 'root.key', '-out', 'root.pem', '-subj', '/CN=45Flow Test Root', '-days', '2',
    '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign,cRLSign')
  issue('intermediate', '/CN=45Flow Test Intermediate', 'root',
    'basicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\n')
  issue('leaf', '/CN=localhost', 'intermediate',
    'basicConstraints=CA:FALSE\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:localhost\n')
  for (const name of ['root', 'intermediate', 'leaf']) {
    pki[name] = fs.readFileSync(path.join(dir, `${name}.pem`), 'utf8')
  }
  pki.leafKey = fs.readFileSync(path.join(dir, 'leaf.key'))
})

afterAll(() => {
  if (dir) fs.rmSync(dir, { recursive: true, force: true })
})

describe('blocked certificate keys', () => {
  it('carries the eight eMudhra SPKI hashes from Electron 42.11.16', () => {
    expect(BLOCKED_SPKI_SHA256.size).toBe(8)
    for (const hash of BLOCKED_SPKI_SHA256) expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it.skipIf(!hasOpenssl)('hashes the DER SubjectPublicKeyInfo like OpenSSL and Chromium pins', () => {
    const der = execFileSync('sh', ['-c', 'openssl x509 -in intermediate.pem -pubkey -noout | openssl pkey -pubin -outform der'], { cwd: dir })
    expect(spkiSha256(pki.intermediate)).toBe(createHash('sha256').update(der).digest('hex'))
    expect(spkiSha256('not a certificate')).toBeNull()
  })

  it.skipIf(!hasOpenssl)('walks Chromium and Node certificate chains without looping', () => {
    const root = { data: pki.root }
    root.issuerCert = root
    const chain = chromiumChain({ data: pki.leaf, issuerCert: { data: pki.intermediate, issuerCert: root } })
    expect(chain).toEqual([pki.leaf, pki.intermediate, pki.root])

    const nodeRoot = { raw: Buffer.from('root') }
    nodeRoot.issuerCertificate = nodeRoot
    expect(peerChain({ raw: Buffer.from('leaf'), issuerCertificate: nodeRoot })).toHaveLength(2)

    const blocked = new Set([spkiSha256(pki.intermediate)])
    expect(hasBlockedKey(chain, blocked)).toBe(true)
    expect(hasBlockedKey([pki.leaf, pki.root], blocked)).toBe(false)
  })

  it.skipIf(!hasOpenssl)('rejects Node TLS and HTTPS connections whose chain uses a blocked key', async () => {
    const blocked = new Set()
    installNodeTlsBlocklist(blocked)
    const server = tls.createServer({ key: pki.leafKey, cert: pki.leaf + pki.intermediate }, socket => {
      socket.end('HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok')
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    const port = server.address().port
    const connect = () => new Promise((resolve, reject) => {
      const socket = tls.connect({ host: '127.0.0.1', port, servername: 'localhost', ca: pki.root })
      socket.once('secureConnect', () => { socket.destroy(); resolve('connected') })
      socket.once('error', reject)
    })
    const get = () => new Promise((resolve, reject) => {
      https.get({ host: '127.0.0.1', port, servername: 'localhost', ca: pki.root, agent: new https.Agent() }, res => {
        res.resume()
        res.on('end', () => resolve(res.statusCode))
      }).once('error', reject)
    })
    try {
      await expect(connect()).resolves.toBe('connected')
      await expect(get()).resolves.toBe(200)
      blocked.add(spkiSha256(pki.intermediate))
      await expect(connect()).rejects.toMatchObject({ code: 'ERR_TLS_CERT_BLOCKED' })
      await expect(get()).rejects.toMatchObject({ code: 'ERR_TLS_CERT_BLOCKED' })
    } finally {
      server.close()
    }
  })
})
