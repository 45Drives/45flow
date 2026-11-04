import { app, dialog } from 'electron';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { createHash, X509Certificate } from 'crypto';
import { isIP } from 'net';
import tls from 'tls';
import { NodeSSH } from 'node-ssh';
import type { ServerHostKeyAlgorithm } from 'ssh2';
import { getAgentSocket, resolveSshKeygen } from './crossPlatformSsh';

const execFileAsync = promisify(execFile);
const verifiedCertificates = new Map<string, string>();
const pending = new Map<string, Promise<void>>();

export type SshCertificateOptions = {
    httpsUrl: string;
    host: string;
    username: string;
    port?: number;
    keyPath?: string;
};

type KnownKey = { type: string; key: string; marker?: string };

function portNumber(value: number): number {
    if (!Number.isInteger(value) || value < 1 || value > 65535) throw new Error('Invalid connection port.');
    return value;
}

function hostname(value: string): string {
    return value.replace(/^\[|\]$/g, '').toLowerCase();
}

async function knownKeys(host: string, port: number): Promise<KnownKey[]> {
    const target = port === 22 ? host : `[${host}]:${port}`;
    const files = [
        path.join(os.homedir(), '.ssh', 'known_hosts'),
        ...(process.platform === 'win32' ? [] : ['/etc/ssh/ssh_known_hosts']),
        path.join(app.getPath('userData'), 'ssh-known-hosts'),
    ];
    const keys: KnownKey[] = [];
    for (const file of files) {
        try { await fs.promises.access(file, fs.constants.R_OK); }
        catch (error) {
            if (error instanceof Error && 'code' in error && error.code === 'ENOENT') continue;
            throw error;
        }
        const executable = await resolveSshKeygen();
        let output: string;
        try {
            output = (await execFileAsync(executable, ['-F', target, '-f', file], {
                windowsHide: true, timeout: 5000, maxBuffer: 1024 * 1024,
            })).stdout;
        } catch (error) {
            // ssh-keygen exits 1 when this host has no entry.
            if (error instanceof Error && 'code' in error && error.code === 1) continue;
            throw error;
        }
        for (const line of output.split(/\r?\n/)) {
            const fields = line.trim().split(/\s+/);
            if (!fields[0] || fields[0].startsWith('#')) continue;
            const marker = fields[0].startsWith('@') ? fields.shift() : undefined;
            if (fields.length < 3) throw new Error(`Invalid SSH known_hosts entry in ${file}.`);
            keys.push({ type: fields[1], key: fields[2], marker });
        }
    }
    return keys;
}

function hostAlgorithms(keys: KnownKey[]): ServerHostKeyAlgorithm[] {
    const supported: ServerHostKeyAlgorithm[] = [
        'ssh-ed25519', 'ecdsa-sha2-nistp256', 'ecdsa-sha2-nistp384', 'ecdsa-sha2-nistp521',
        'rsa-sha2-512', 'rsa-sha2-256', 'ssh-rsa',
    ];
    return supported.filter(type => keys.some(key =>
        key.type === type || (key.type === 'ssh-rsa' && type.startsWith('rsa-sha2-'))));
}

async function verifyHost(host: string, port: number, key: Buffer, keys: KnownKey[]): Promise<void> {
    const encoded = key.toString('base64');
    if (keys.some(known => known.marker === '@revoked' && known.key === encoded)) {
        throw new Error(`SSH host key for ${host}:${port} is revoked. Automatic HTTPS trust is blocked.`);
    }
    if (keys.some(known => !known.marker && known.key === encoded)) return;
    if (keys.length) {
        throw new Error(`SSH host key for ${host}:${port} differs from known_hosts or uses an unsupported host authority. Verify the server identity before updating SSH trust.`);
    }
    const fingerprint = `SHA256:${createHash('sha256').update(key).digest('base64').replace(/=+$/, '')}`;
    const result = await dialog.showMessageBox({
        type: 'question',
        message: 'Trust this SSH server?',
        detail: `Host: ${host}:${port}\nSSH host-key fingerprint: ${fingerprint}\n\nVerify this fingerprint using the server console or another trusted source. 45Flow will remember this SSH identity and use it to verify the server's HTTPS certificate automatically.`,
        buttons: ['Cancel', 'Trust SSH server'], cancelId: 0, defaultId: 0, noLink: true,
    });
    if (result.response !== 1) throw new Error('SSH server trust was cancelled. No HTTPS request was sent.');
    if (key.length < 4) throw new Error('Invalid SSH host key.');
    const length = key.readUInt32BE(0);
    if (length < 1 || length > key.length - 4) throw new Error('Invalid SSH host key type.');
    const type = key.subarray(4, 4 + length).toString('ascii');
    if (!/^[a-zA-Z0-9@._+-]+$/.test(type)) throw new Error('Invalid SSH host key type.');
    const target = port === 22 ? host : `[${host}]:${port}`;
    const file = path.join(app.getPath('userData'), 'ssh-known-hosts');
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    await fs.promises.appendFile(file, `${target} ${type} ${encoded}\n`, { mode: 0o600 });
}

async function readCertificate(ssh: NodeSSH, host: string, port: number): Promise<string> {
    const channel = await ssh.forwardOut('127.0.0.1', 0, '127.0.0.1', port);
    return new Promise((resolve, reject) => {
        // The SSH channel authenticates the source; this handshake reads the exact public leaf certificate.
        const socket = tls.connect({
            socket: channel, servername: isIP(host) ? undefined : host, rejectUnauthorized: false,
        });
        socket.once('error', reject);
        socket.once('secureConnect', () => {
            try {
                const raw = socket.getPeerCertificate().raw;
                if (!raw) throw new Error('nginx did not present a certificate.');
                const certificate = new X509Certificate(raw);
                if (Date.now() < Date.parse(certificate.validFrom) || Date.now() > Date.parse(certificate.validTo)) {
                    throw new Error('The nginx HTTPS certificate is expired or not yet valid.');
                }
                resolve(`sha256/${createHash('sha256').update(raw).digest('base64')}`);
            } catch (error) { reject(error); }
            finally { socket.destroy(); }
        });
    });
}

export function getSshVerifiedCertificates(host: string): string[] | undefined {
    // Electron's certificate verifier exposes a hostname, but not a port.
    const prefix = `${hostname(host)}:`;
    const entries = [...verifiedCertificates].filter(([endpoint]) => endpoint.startsWith(prefix));
    return entries.length ? entries.map(([, fingerprint]) => fingerprint).filter(Boolean) : undefined;
}

export async function prepareSshCertificate(options: SshCertificateOptions): Promise<void> {
    if (!options || typeof options.host !== 'string' || typeof options.username !== 'string'
        || typeof options.httpsUrl !== 'string' || !options.username) {
        throw new Error('SSH connection details are required to verify the HTTPS certificate.');
    }
    const url = new URL(options.httpsUrl);
    const host = hostname(options.host);
    if (url.protocol !== 'https:' || url.username || url.password || hostname(url.hostname) !== host
        || !/^[a-zA-Z0-9._:%-]+$/.test(host) || host.startsWith('-')) {
        throw new Error('HTTPS and SSH must refer to the same server host.');
    }
    const port = portNumber(options.port ?? 22);
    const httpsPort = portNumber(Number(url.port || 443));
    const id = `${host}:${httpsPort}`;
    const operationId = JSON.stringify([id, port, options.username, options.keyPath]);
    const existing = pending.get(operationId);
    if (existing) return existing;
    verifiedCertificates.set(id, '');
    const operation = (async () => {
        const keys = await knownKeys(host, port);
        const ssh = new NodeSSH();
        let verificationFailure: unknown;
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            await ssh.connect({
                host, port, username: options.username,
                ...(options.keyPath ? { privateKeyPath: options.keyPath } : {}),
                agent: getAgentSocket(),
                readyTimeout: 120000,
                algorithms: { serverHostKey: { prepend: hostAlgorithms(keys), append: [], remove: [] } },
                hostVerifier: (key: Buffer, done: (valid: boolean) => void) => {
                    verifyHost(host, port, key, keys).then(() => done(true), error => {
                        verificationFailure = error;
                        done(false);
                    });
                },
            });
            const fingerprint = await Promise.race([
                readCertificate(ssh, host, httpsPort),
                new Promise<never>((_resolve, reject) => {
                    timer = setTimeout(() => reject(new Error('Timed out reading nginx certificate over SSH.')), 15000);
                }),
            ]);
            verifiedCertificates.set(id, fingerprint);
        } catch (error) { throw verificationFailure ?? error; }
        finally {
            clearTimeout(timer);
            ssh.dispose();
        }
    })();
    pending.set(operationId, operation);
    try { await operation; } finally { pending.delete(operationId); }
}
