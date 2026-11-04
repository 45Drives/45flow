// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ipc = vi.hoisted(() => ({ handlers: new Map() }))
vi.mock('electron', () => ({
  app: { getPath: () => '/unused', getAppPath: () => '/application' },
  safeStorage: {},
  ipcMain: { handle: (name, handler) => ipc.handlers.set(name, handler) },
}))
import { SecureTokenStore, isTrustedCredentialSender, registerSecureTokenHandlers } from './secureTokens'

let directory
let encryption
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), '45flow-secure-tokens-'))
  const key = randomBytes(32)
  encryption = {
    isEncryptionAvailable: vi.fn(() => true),
    getSelectedStorageBackend: vi.fn(() => 'gnome_libsecret'),
    encryptString: vi.fn(value => {
      const iv = randomBytes(12)
      const cipher = createCipheriv('aes-256-gcm', key, iv)
      const body = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
      return Buffer.concat([iv, cipher.getAuthTag(), body])
    }),
    decryptString: vi.fn(value => {
      const decipher = createDecipheriv('aes-256-gcm', key, value.subarray(0, 12), { authTagLength: 16 })
      decipher.setAuthTag(value.subarray(12, 28))
      return Buffer.concat([decipher.update(value.subarray(28)), decipher.final()]).toString('utf8')
    }),
  }
})
afterEach(() => fs.rmSync(directory, { recursive: true }))

describe('secure desktop credential store', () => {
  it('persists only ciphertext, restores across instances and clears individual connections', () => {
    const credentials = { token: 'admin-jwt-secret', savedPassword: 'admin-password-secret' }
    const store = new SecureTokenStore(directory, encryption, 'linux')
    expect(store.set('connection-one', credentials)).toEqual({ persistent: true })
    store.set('connection-two', { token: 'another-token' })
    const ciphertext = fs.readFileSync(path.join(directory, 'connection-one.bin'))
    expect(ciphertext.includes(Buffer.from(credentials.token))).toBe(false)
    expect(ciphertext.includes(Buffer.from(credentials.savedPassword))).toBe(false)
    if (process.platform !== 'win32') {
      expect(fs.statSync(directory).mode & 0o777).toBe(0o700)
      expect(fs.statSync(path.join(directory, 'connection-one.bin')).mode & 0o777).toBe(0o600)
    }
    const restarted = new SecureTokenStore(directory, encryption, 'linux')
    expect(restarted.get('connection-one')).toEqual(credentials)
    restarted.clear('connection-one')
    expect(restarted.get('connection-one')).toBeNull()
    expect(restarted.get('connection-two')).toEqual({ token: 'another-token', savedPassword: undefined })
  })

  it.each(['basic_text', 'unknown'])('rejects %s even when Electron reports encryption available', backend => {
    encryption.getSelectedStorageBackend.mockReturnValue(backend)
    const store = new SecureTokenStore(directory, encryption, 'linux')
    expect(store.set('connection-one', { token: 'memory-token' })).toEqual({ persistent: false })
    expect(store.get('connection-one')?.token).toBe('memory-token')
    expect(fs.readdirSync(directory)).toEqual([])
    expect(encryption.encryptString).not.toHaveBeenCalled()
    expect(new SecureTokenStore(directory, encryption, 'linux').get('connection-one')).toBeNull()
  })

  it('leaves encrypted data intact during a temporarily locked keyring and supports logout while locked', () => {
    new SecureTokenStore(directory, encryption, 'linux').set('connection-one', { token: 'original' })
    encryption.isEncryptionAvailable.mockReturnValue(false)
    const locked = new SecureTokenStore(directory, encryption, 'linux')
    expect(locked.get('connection-one')).toBeNull()
    expect(fs.readdirSync(directory)).toEqual(['connection-one.bin'])
    locked.clear('connection-one')
    encryption.isEncryptionAvailable.mockReturnValue(true)
    expect(new SecureTokenStore(directory, encryption, 'linux').get('connection-one')).toBeNull()
  })

  it('removes stale ciphertext when credentials change in memory-only mode', () => {
    const store = new SecureTokenStore(directory, encryption, 'linux')
    store.set('connection-one', { token: 'old' })
    encryption.isEncryptionAvailable.mockReturnValue(false)
    store.set('connection-one', { token: 'replacement' })
    expect(fs.readdirSync(directory)).toEqual([])
    expect(store.get('connection-one')?.token).toBe('replacement')
  })

  it.each(['darwin', 'win32'])('uses the OS-backed encryption API on %s', platform => {
    const store = new SecureTokenStore(directory, encryption, platform)
    expect(store.set('connection-one', { token: 'token' }).persistent).toBe(true)
    expect(encryption.getSelectedStorageBackend).not.toHaveBeenCalled()
  })

  it('rejects path traversal, invalid credentials and corrupt ciphertext explicitly', () => {
    const store = new SecureTokenStore(directory, encryption, 'linux')
    expect(() => store.get('../outside')).toThrow('Invalid credential connection ID')
    expect(() => store.clear('')).toThrow('Invalid credential connection ID')
    expect(() => store.set('valid', { token: 42 })).toThrow('Invalid connection credentials')
    fs.writeFileSync(path.join(directory, 'corrupt.bin'), 'not encrypted')
    expect(() => store.get('corrupt')).toThrow()
    expect(fs.readFileSync(path.join(directory, 'corrupt.bin'), 'utf8')).toBe('not encrypted')
  })

  it('surfaces encryption/write errors without ever writing plaintext', () => {
    const store = new SecureTokenStore(directory, encryption, 'linux')
    encryption.encryptString.mockImplementation(() => { throw new Error('keyring locked') })
    expect(() => store.set('valid', { token: 'sensitive' })).toThrow('keyring locked')
    expect(fs.readdirSync(directory)).toEqual([])
    expect(store.get('valid')?.token).toBe('sensitive')
    encryption.encryptString.mockReturnValue(Buffer.from('ciphertext'))
    const notDirectory = path.join(directory, 'not-directory')
    fs.writeFileSync(notDirectory, 'file')
    expect(() => new SecureTokenStore(notDirectory, encryption, 'linux')
      .set('valid', { token: 'sensitive' })).toThrow()
  })
})

describe('secure token IPC authorization', () => {
  const url = 'file:///application/renderer/index.html'
  function trusted(urlValue = `${url}#/home`) {
    const frame = { url: urlValue }
    const contents = { mainFrame: frame, isDestroyed: () => false }
    return { contents, event: { sender: contents, senderFrame: frame } }
  }
  it('accepts the app main frame including hash navigation', () => {
    const { contents, event } = trusted()
    expect(isTrustedCredentialSender(event, contents, url)).toBe(true)
  })
  it.each(['https://attacker.invalid/', 'file:///other/index.html', 'file://other/application/renderer/index.html'])(
    'rejects navigation to %s', untrusted => {
      const { contents, event } = trusted(untrusted)
      expect(isTrustedCredentialSender(event, contents, url)).toBe(false)
    })
  it('rejects subframes, guest webviews and other windows', () => {
    const { contents, event } = trusted()
    expect(isTrustedCredentialSender({ ...event, senderFrame: { url } }, contents, url)).toBe(false)
    expect(isTrustedCredentialSender({ ...event, sender: {} }, contents, url)).toBe(false)
    expect(isTrustedCredentialSender(event, null, url)).toBe(false)
  })
  it('registers only guarded handlers and returns non-sensitive errors', () => {
    const { contents } = trusted()
    registerSecureTokenHandlers(() => contents)
    expect([...ipc.handlers.keys()].sort()).toEqual([
      'secureToken:clear', 'secureToken:get', 'secureToken:set', 'secureToken:status',
    ])
    for (const handler of ipc.handlers.values()) {
      expect(() => handler({ sender: {}, senderFrame: null }, 'id', { token: 'secret' }))
        .toThrow('Secure credential storage operation failed')
    }
  })
})
