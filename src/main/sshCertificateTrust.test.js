// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import tls from 'node:tls'
import { execFileSync } from 'node:child_process'
import { createHash, generateKeyPairSync, X509Certificate } from 'node:crypto'
import { Server } from 'ssh2'

const mocks = vi.hoisted(() => ({ userData: '', home: '', dialog: vi.fn() }))
vi.mock('electron', () => ({
    app: { getPath: () => mocks.userData },
    dialog: { showMessageBox: (...args) => mocks.dialog(...args) },
}))
vi.mock('./crossPlatformSsh', () => ({
    getAgentSocket: () => undefined,
    resolveSshKeygen: async () => 'ssh-keygen',
}))
vi.mock('os', async importOriginal => {
    const actual = await importOriginal()
    return { ...actual, default: { ...actual.default, homedir: () => mocks.home } }
})
import { getSshVerifiedCertificates, prepareSshCertificate } from './sshCertificateTrust'

let directory
let sshServer
let httpsServer
let options
let publicKey
let fingerprint
let forwards = 0
let denyForward = false
const sockets = new Set()
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const keyPair = () => generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
})

beforeAll(async () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), '45flow-ssh-cert-'))
    const certFile = path.join(directory, 'nginx.crt')
    const tlsKeyFile = path.join(directory, 'nginx.key')
    execFileSync('openssl', [
        'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
        '-subj', '/CN=45Flow-test', '-keyout', tlsKeyFile, '-out', certFile,
    ], { stdio: 'ignore' })
    const certificate = fs.readFileSync(certFile)
    fingerprint = `sha256/${createHash('sha256').update(new X509Certificate(certificate).raw).digest('base64')}`
    httpsServer = tls.createServer({ key: fs.readFileSync(tlsKeyFile), cert: certificate })
    httpsServer.on('connection', socket => {
        sockets.add(socket)
        socket.on('close', () => sockets.delete(socket))
        socket.on('error', () => {})
    })
    await listen(httpsServer)
    const hostKeyFile = path.join(directory, 'ssh-host-key')
    fs.writeFileSync(hostKeyFile, keyPair().privateKey, { mode: 0o600 })
    publicKey = execFileSync('ssh-keygen', ['-y', '-f', hostKeyFile], { encoding: 'utf8' }).trim()
    const keyPath = path.join(directory, 'client-key')
    fs.writeFileSync(keyPath, keyPair().privateKey, { mode: 0o600 })
    sshServer = new Server({ hostKeys: [fs.readFileSync(hostKeyFile)] }, client => {
        client.on('error', () => {})
        client.on('authentication', context => {
            if (context.method === 'publickey') context.accept()
            else context.reject(['publickey'])
        })
        client.on('tcpip', (accept, _reject, details) => {
            forwards++
            if (denyForward) { _reject(); return }
            const channel = accept()
            const upstream = net.connect(details.destPort, details.destIP)
            sockets.add(upstream)
            upstream.on('close', () => sockets.delete(upstream))
            upstream.on('error', () => channel.destroy())
            channel.on('error', () => upstream.destroy())
            channel.on('close', () => upstream.destroy())
            upstream.pipe(channel).pipe(upstream)
        })
    })
    await listen(sshServer)
    options = {
        httpsUrl: `https://127.0.0.1:${httpsServer.address().port}`,
        host: '127.0.0.1', port: sshServer.address().port, username: 'admin', keyPath,
    }
})

beforeEach(() => {
    mocks.userData = fs.mkdtempSync(path.join(directory, 'profile-'))
    mocks.home = fs.mkdtempSync(path.join(directory, 'home-'))
    fs.mkdirSync(path.join(mocks.home, '.ssh'))
    mocks.dialog.mockReset().mockResolvedValue({ response: 1 })
    forwards = 0
    denyForward = false
})

afterAll(async () => {
    for (const socket of sockets) socket.destroy()
    if (sshServer) await new Promise(resolve => sshServer.close(resolve))
    if (httpsServer) await new Promise(resolve => httpsServer.close(resolve))
    if (directory) fs.rmSync(directory, { recursive: true, force: true })
})

function knownHost(key = publicKey, marker = '') {
    const file = path.join(mocks.home, '.ssh', 'known_hosts')
    fs.writeFileSync(file, `${marker}[127.0.0.1]:${options.port} ${key}\n`)
    return file
}

describe('SSH-authenticated nginx certificate verification', () => {
    it('reads the exact live TLS certificate through verified SSH without a popup for known hosts', async () => {
        knownHost()
        await prepareSshCertificate(options)
        expect(getSshVerifiedCertificates('127.0.0.1')).toContain(fingerprint)
        expect(mocks.dialog).not.toHaveBeenCalled()
        expect(forwards).toBe(1)
    })

    it('supports hashed OpenSSH known_hosts entries', async () => {
        const file = knownHost()
        execFileSync('ssh-keygen', ['-H', '-f', file], { stdio: 'ignore' })
        await prepareSshCertificate(options)
        expect(getSshVerifiedCertificates('127.0.0.1')).toContain(fingerprint)
        expect(mocks.dialog).not.toHaveBeenCalled()
    })

    it('asks once for an unknown SSH identity, remembers it, then verifies HTTPS without another prompt', async () => {
        await prepareSshCertificate(options)
        expect(mocks.dialog).toHaveBeenCalledOnce()
        expect(mocks.dialog.mock.calls[0][0]).toMatchObject({
            message: 'Trust this SSH server?', defaultId: 0, cancelId: 0,
        })
        expect(mocks.dialog.mock.calls[0][0].detail).toContain('SHA256:')
        expect(fs.readFileSync(path.join(mocks.userData, 'ssh-known-hosts'), 'utf8')).toContain(publicKey)
        await prepareSshCertificate(options)
        expect(mocks.dialog).toHaveBeenCalledOnce()
        expect(getSshVerifiedCertificates('127.0.0.1')).toContain(fingerprint)
    })

    it('does not read or trust HTTPS when SSH trust is cancelled', async () => {
        mocks.dialog.mockResolvedValue({ response: 0 })
        await expect(prepareSshCertificate(options)).rejects.toThrow('cancelled')
        expect(forwards).toBe(0)
        expect(getSshVerifiedCertificates('127.0.0.1')).toEqual([])
        expect(fs.existsSync(path.join(mocks.userData, 'ssh-known-hosts'))).toBe(false)
    })

    it('blocks changed SSH keys without offering an automatic override', async () => {
        knownHost('ssh-rsa AAAAdifferentKey')
        await expect(prepareSshCertificate(options)).rejects.toThrow('differs from known_hosts')
        expect(mocks.dialog).not.toHaveBeenCalled()
        expect(forwards).toBe(0)
        expect(getSshVerifiedCertificates('127.0.0.1')).toEqual([])
    })

    it('blocks revoked keys even when another entry trusts the same key', async () => {
        const file = knownHost()
        fs.appendFileSync(file, `@revoked [127.0.0.1]:${options.port} ${publicKey}\n`)
        await expect(prepareSshCertificate(options)).rejects.toThrow('revoked')
        expect(mocks.dialog).not.toHaveBeenCalled()
        expect(forwards).toBe(0)
    })

    it('deduplicates simultaneous preparation for the same SSH and HTTPS endpoints', async () => {
        await Promise.all([prepareSshCertificate(options), prepareSshCertificate(options)])
        expect(mocks.dialog).toHaveBeenCalledOnce()
        expect(forwards).toBe(1)
    })

    it('does not trust arbitrary certificates or unrelated hosts', async () => {
        knownHost()
        await prepareSshCertificate(options)
        expect(getSshVerifiedCertificates('127.0.0.1')).not.toContain('sha256/unverified-certificate')
        expect(getSshVerifiedCertificates('192.168.1.99')).toBeUndefined()
    })

    it('blocks HTTPS when SSH forwarding is unavailable, without falling back to manual trust', async () => {
        knownHost()
        denyForward = true
        await expect(prepareSshCertificate(options)).rejects.toThrow()
        expect(getSshVerifiedCertificates('127.0.0.1')).toEqual([])
        expect(mocks.dialog).not.toHaveBeenCalled()
    })

    it('rejects an expired certificate read through an otherwise trusted SSH connection', async () => {
        const expiredFile = path.join(directory, 'expired.crt')
        execFileSync('openssl', [
            'x509', '-in', path.join(directory, 'nginx.crt'), '-signkey', path.join(directory, 'nginx.key'),
            '-days', '-1', '-out', expiredFile,
        ], { stdio: 'ignore' })
        const server = tls.createServer({
            key: fs.readFileSync(path.join(directory, 'nginx.key')),
            cert: fs.readFileSync(expiredFile),
        })
        await listen(server)
        knownHost()
        try {
            await expect(prepareSshCertificate({
                ...options, httpsUrl: `https://127.0.0.1:${server.address().port}`,
            })).rejects.toThrow('expired or not yet valid')
            expect(mocks.dialog).not.toHaveBeenCalled()
        } finally { await new Promise(resolve => server.close(resolve)) }
    })

    it.each([
        { httpsUrl: 'http://127.0.0.1' },
        { httpsUrl: 'https://192.168.1.99' },
        { httpsUrl: 'https://user:password@127.0.0.1' },
        { port: 0 },
        { port: 65536 },
        { username: '' },
    ])('rejects mismatched or invalid connection details %j', async override => {
        await expect(prepareSshCertificate({ ...options, ...override })).rejects.toThrow()
        expect(mocks.dialog).not.toHaveBeenCalled()
        expect(forwards).toBe(0)
    })
})
