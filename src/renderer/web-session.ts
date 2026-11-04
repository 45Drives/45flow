// Browser session client (B-10). See houston-broadcaster docs/browser-session-contract.md.
//
// The browser holds no bearer token: the server's httpOnly cookie identifies it.
// This module keeps the CSRF token in memory and makes same-origin API requests
// carry it, so the rest of the app can keep calling fetch() as it always has.

/**
 * Stored as the connection's `token` in browser mode so existing "am I signed in"
 * checks keep working. It is never sent: the fetch wrapper removes it.
 */
export const WEB_SESSION_TOKEN = 'browser-session'

export type WebSessionInfo = {
    user: { name: string; admin: boolean }
    idleTimeoutSeconds: number
    idleRemainingSeconds: number
    expiresAt: string
}

type Fetch = typeof fetch

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

let csrfToken = ''
let current: WebSessionInfo | null = null
const activityListeners = new Set<() => void>()

/** Called whenever the page makes a request the server counts as session activity. */
export function onApiActivity(listener: () => void): () => void {
    activityListeners.add(listener)
    return () => { activityListeners.delete(listener) }
}

function emitActivity() {
    for (const listener of activityListeners) listener()
}

function remember(body: any): WebSessionInfo {
    csrfToken = String(body.csrfToken || '')
    current = {
        user: { name: String(body.user?.name || ''), admin: body.user?.admin === true },
        idleTimeoutSeconds: Number(body.idleTimeoutSeconds) || 0,
        idleRemainingSeconds: Number(body.idleRemainingSeconds) || 0,
        expiresAt: String(body.expiresAt || ''),
    }
    return current
}

function forget() {
    csrfToken = ''
    current = null
}

export function getWebSession(): WebSessionInfo | null {
    return current
}

/** UX hint only; the server enforces administrator access on every request. */
export function isWebSessionAdmin(): boolean {
    return current?.user.admin === true && Date.parse(current.expiresAt) > Date.now()
}

/**
 * Wrap fetch so same-origin /api requests drop the placeholder bearer token and
 * carry the CSRF token on unsafe methods. Cookies already travel with same-origin requests.
 */
export type ApiFailure = { method: string; path: string; status?: number; error?: string; requestId?: string }

export function createSessionFetch(
    nativeFetch: Fetch,
    origin = window.location.origin,
    onFailure?: (failure: ApiFailure) => void,
): Fetch {
    return (input, init) => {
        const request = input instanceof Request ? input : null
        const url = new URL(request ? request.url : String(input), origin)
        if (url.origin !== origin || !url.pathname.startsWith('/api/')) return nativeFetch(input, init)

        const method = String(init?.method ?? request?.method ?? 'GET').toUpperCase()
        const headers = new Headers(init?.headers ?? request?.headers)
        if (headers.get('Authorization') === `Bearer ${WEB_SESSION_TOKEN}`) headers.delete('Authorization')
        if (UNSAFE_METHODS.has(method) && csrfToken) headers.set('X-CSRF-Token', csrfToken)
        const outcome = nativeFetch(input, { ...init, headers, credentials: 'same-origin' })

        // Only the path is reported: query strings can carry link tokens.
        const base = { method, path: url.pathname }
        return outcome.then((res) => {
            const signedOutProbe = url.pathname === '/api/session' && res.status === 401
            // The server decides what counts (polling and passive checks do not), so there is no list to keep in sync.
            if (res.headers?.get?.('x-session-activity') === 'counted') emitActivity()
            if (onFailure && !res.ok && !signedOutProbe) {
                onFailure({ ...base, status: res.status, requestId: res.headers.get('x-request-id') ?? undefined })
            }
            return res
        }, (error) => {
            if (onFailure && error?.name !== 'AbortError') onFailure({ ...base, error: String(error?.message || error) })
            throw error
        })
    }
}

async function failure(res: Response): Promise<Error> {
    const body = await res.json().catch(() => null)
    const message = body?.message || body?.error || `HTTP ${res.status}`
    return Object.assign(new Error(String(message)), { status: res.status, code: body?.error })
}

export async function signInWithSession(username: string, password: string, clientBuildDate?: string): Promise<WebSessionInfo & { entitlement?: unknown }> {
    const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, clientBuildDate }),
    })
    if (!res.ok) throw await failure(res)
    const body = await res.json()
    return { ...remember(body), entitlement: body.entitlement }
}

/** The signed-in session after a reload, or null when there is none. */
export async function restoreSession(): Promise<WebSessionInfo | null> {
    const res = await fetch('/api/session', { headers: { Accept: 'application/json' } })
    if (res.status === 401) {
        forget()
        return null
    }
    if (!res.ok) throw await failure(res)
    return remember(await res.json())
}

/** Revoke the session on the server. Always clears local state, even if the request fails. */
export async function signOutSession(): Promise<void> {
    try {
        await fetch('/api/session', { method: 'DELETE' })
    } catch (error) {
        console.warn('[session] sign-out request failed; the session will expire on its own', error)
    } finally {
        forget()
    }
}

/** Keep the session alive while the user is active. Counts as activity. */
export async function keepSessionAlive(): Promise<boolean> {
    const res = await fetch('/api/session', { headers: { Accept: 'application/json' } })
    if (res.status === 401) return false
    if (!res.ok) throw await failure(res)
    remember(await res.json())
    return true
}

/** How long the session has left, without extending it. `null` means it has ended. */
export async function checkSessionIdle(): Promise<{ idleRemainingSeconds: number } | null> {
    const res = await fetch('/api/session?passive=1', { headers: { Accept: 'application/json' } })
    if (res.status === 401) return null
    if (!res.ok) throw await failure(res)
    const body = await res.json()
    return { idleRemainingSeconds: Number(body.idleRemainingSeconds) || 0 }
}
