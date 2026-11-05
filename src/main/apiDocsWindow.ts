import { BrowserWindow, session, shell, type Session } from 'electron'

/** In-memory partition (no "persist:" prefix): nothing from the docs window is written to disk. */
const PARTITION = 'api-docs'
const TOKEN_PATTERN = /^[A-Za-z0-9._~+/=-]{1,8192}$/

type CertificateRequest = {
  hostname: string
  certificate: { fingerprint: string }
}

export type CertificateTrust = {
  isBlocked: (req: any) => boolean
  getPin: (host: string) => { fingerprint: string } | undefined
  getSshVerifiedCertificates: (host: string) => string[] | undefined
}

export function apiDocsTarget(baseUrl: unknown): URL {
  if (typeof baseUrl !== 'string' || !baseUrl) throw new Error('Connect to a server to view its API docs.')
  let url: URL
  try { url = new URL(baseUrl) } catch { throw new Error('The server address is not valid.') }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) {
    throw new Error('The server address is not valid.')
  }
  return new URL('/api-docs/', url.origin)
}

/** The login header is only ever attached to the docs pages of the server that was asked for. */
export function isApiDocsRequest(requestUrl: string, origin: string): boolean {
  try {
    const url = new URL(requestUrl)
    return url.origin === origin &&
      (url.pathname === '/api-docs' || url.pathname.startsWith('/api-docs/') || url.pathname === '/api-docs.json')
  } catch {
    return false
  }
}

export function isUsableToken(token: unknown): token is string {
  return typeof token === 'string' && TOKEN_PATTERN.test(token)
}

/**
 * Trust only what the main window already trusts (an SSH-verified or pinned certificate) and
 * never prompt from here: 0 accept, -2 reject, -3 Chromium's own verification.
 */
export function certificateVerdict(req: CertificateRequest, trust: CertificateTrust): 0 | -2 | -3 {
  if (trust.isBlocked(req)) return -2
  const presented = req.certificate.fingerprint
  const sshVerified = trust.getSshVerifiedCertificates(req.hostname)
  if (sshVerified) return sshVerified.includes(presented) ? 0 : -2
  const pin = trust.getPin(req.hostname)
  if (pin) return pin.fingerprint === presented ? 0 : -2
  return -3
}

const STATUS_MESSAGES: Record<number, string> = {
  401: 'Your sign-in has ended. Sign in to the server again, then reopen the API docs.',
  403: 'The API docs are only available to server administrators.',
}

let docsWindow: BrowserWindow | null = null
let docsSession: Session | null = null

function getDocsSession(trust: CertificateTrust): Session {
  if (docsSession) return docsSession
  docsSession = session.fromPartition(PARTITION, { cache: false })
  docsSession.setCertificateVerifyProc((req, cb) => cb(certificateVerdict(req, trust)))
  docsSession.setPermissionRequestHandler((_contents, _permission, cb) => cb(false))
  docsSession.setPermissionCheckHandler(() => false)
  return docsSession
}

/**
 * Show the server's Swagger docs in a sandboxed window with no preload. The desktop token goes in
 * an Authorization header on docs requests only, so it never appears in a URL or another site.
 */
export async function openApiDocsWindow(baseUrl: unknown, token: unknown, trust: CertificateTrust): Promise<void> {
  const target = apiDocsTarget(baseUrl)
  if (!isUsableToken(token)) throw new Error('Sign in to the server to view its API docs.')
  const docs = getDocsSession(trust)

  docs.webRequest.onBeforeSendHeaders((details, cb) => {
    const requestHeaders = { ...details.requestHeaders }
    for (const name of Object.keys(requestHeaders)) {
      if (name.toLowerCase() === 'authorization') delete requestHeaders[name]
    }
    if (isApiDocsRequest(details.url, target.origin)) requestHeaders.Authorization = `Bearer ${token}`
    cb({ requestHeaders })
  })

  if (!docsWindow || docsWindow.isDestroyed()) {
    docsWindow = new BrowserWindow({
      width: 1100,
      height: 800,
      title: 'API Docs',
      autoHideMenuBar: true,
      webPreferences: {
        partition: PARTITION,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webviewTag: false,
        webSecurity: true,
      },
    })
    docsWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) shell.openExternal(url)
      return { action: 'deny' }
    })
    docsWindow.on('closed', () => {
      docsWindow = null
      docs.webRequest.onBeforeSendHeaders(null)
      void docs.clearStorageData()
    })
  }

  const win = docsWindow
  let status = 0
  const onNavigate = (_event: unknown, _url: string, httpResponseCode: number) => { status = httpResponseCode }
  win.webContents.on('did-navigate', onNavigate)
  try {
    await win.loadURL(target.href)
  } catch {
    win.close()
    throw new Error('Could not open the API docs. Check that the server is reachable and its certificate is trusted.')
  } finally {
    win.webContents.removeListener('did-navigate', onNavigate)
  }
  if (STATUS_MESSAGES[status]) {
    win.close()
    throw new Error(STATUS_MESSAGES[status])
  }
  win.show()
  win.focus()
}
