import fs from 'fs'
import path from 'path'
import { app, safeStorage, ipcMain } from 'electron'
import type { IpcMainInvokeEvent, WebContents } from 'electron'
import { pathToFileURL } from 'url'
import type { ConnectionCredentials } from '../shared/secureTokens'

function validateId(id: unknown): asserts id is string {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(id)) {
    throw new Error('Invalid credential connection ID')
  }
}

function validateCredentials(value: unknown): asserts value is ConnectionCredentials {
  if (!value || typeof value !== 'object' || !('token' in value) ||
      typeof value.token !== 'string' || value.token.length > 65536 ||
      ('savedPassword' in value && value.savedPassword !== undefined &&
        (typeof value.savedPassword !== 'string' || value.savedPassword.length > 65536))) {
    throw new Error('Invalid connection credentials')
  }
}

export class SecureTokenStore {
  private readonly memory = new Map<string, ConnectionCredentials>()

  constructor(
    private readonly directory: string,
    private readonly encryption: Pick<typeof safeStorage,
      'isEncryptionAvailable' | 'getSelectedStorageBackend' | 'encryptString' | 'decryptString'> = safeStorage,
    private readonly platform: NodeJS.Platform = process.platform,
  ) {}

  status() {
    const persistent = this.encryption.isEncryptionAvailable() &&
      (this.platform !== 'linux' ||
        ['gnome_libsecret', 'kwallet', 'kwallet5', 'kwallet6'].includes(this.encryption.getSelectedStorageBackend()))
    return { persistent }
  }

  private filename(id: string) {
    validateId(id)
    return path.join(this.directory, `${id}.bin`)
  }

  get(id: string): ConnectionCredentials | null {
    const filename = this.filename(id)
    const cached = this.memory.get(id)
    if (cached) return { ...cached }
    if (!this.status().persistent) return null
    let encrypted: Buffer
    try {
      encrypted = fs.readFileSync(filename)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }
    const credentials: unknown = JSON.parse(this.encryption.decryptString(encrypted))
    validateCredentials(credentials)
    const result = { token: credentials.token, savedPassword: credentials.savedPassword }
    this.memory.set(id, result)
    return { ...result }
  }

  set(id: string, credentials: ConnectionCredentials) {
    const filename = this.filename(id)
    validateCredentials(credentials)
    const value = { token: credentials.token, savedPassword: credentials.savedPassword }
    // Keep a usable session even if persistent storage fails.
    this.memory.set(id, value)
    const status = this.status()
    if (!status.persistent) {
      this.removeFile(filename)
      return status
    }
    const encrypted = this.encryption.encryptString(JSON.stringify(value))
    fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 })
    fs.chmodSync(this.directory, 0o700)
    const temporary = `${filename}.tmp`
    try {
      fs.writeFileSync(temporary, encrypted, { mode: 0o600, flag: 'w' })
      fs.chmodSync(temporary, 0o600)
      fs.renameSync(temporary, filename)
    } finally {
      this.removeFile(temporary)
    }
    return status
  }

  clear(id: string) {
    const filename = this.filename(id)
    this.memory.delete(id)
    this.removeFile(filename)
  }

  private removeFile(filename: string) {
    try {
      fs.unlinkSync(filename)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
}

export function isTrustedCredentialSender(event: IpcMainInvokeEvent, contents: WebContents | null, rendererUrl: string) {
  if (!contents || contents.isDestroyed() || event.sender !== contents ||
      !event.senderFrame || event.senderFrame !== contents.mainFrame) return false
  const actual = new URL(event.senderFrame.url)
  const expected = new URL(rendererUrl)
  return actual.origin === expected.origin && actual.protocol === expected.protocol &&
    actual.host === expected.host && actual.pathname === expected.pathname
}

export function registerSecureTokenHandlers(getContents: () => WebContents | null) {
  const store = new SecureTokenStore(path.join(app.getPath('userData'), 'secure-tokens'))
  const rendererUrl = process.env.NODE_ENV === 'development'
    ? `http://localhost:${process.env.ELECTRON_RENDERER_PORT || process.argv[2]}/`
    : pathToFileURL(path.join(app.getAppPath(), 'renderer', 'index.html')).href
  const authorize = (event: IpcMainInvokeEvent) => {
    if (!isTrustedCredentialSender(event, getContents(), rendererUrl)) {
      console.error('[secureToken] rejected untrusted IPC sender')
      throw new Error('Credential access denied')
    }
  }
  const handle = (channel: string, operation: (id: string, credentials: ConnectionCredentials) => unknown) => {
    ipcMain.handle(channel, (event, id, credentials) => {
      try {
        authorize(event)
        return operation(id, credentials)
      } catch {
        console.error(`[secureToken] ${channel} failed`)
        throw new Error('Secure credential storage operation failed')
      }
    })
  }
  handle('secureToken:status', () => store.status())
  handle('secureToken:get', id => store.get(id))
  handle('secureToken:set', (id, credentials) => store.set(id, credentials))
  handle('secureToken:clear', id => store.clear(id))
}
