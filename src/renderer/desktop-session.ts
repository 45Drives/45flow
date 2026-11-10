// Desktop session upkeep (B-23). See houston-broadcaster docs/browser-session-contract.md.
//
// A signed-in desktop connection is backed by a server-side session that ends after
// 15 idle minutes. Requests count as activity, but reading or typing sends none, so
// while the user is active this sends a light refresh at most once a minute. The
// refresh also receives a replacement token when the server rotates it; rotation is
// deferred while transfers run, because those use the token they started with.

export type KeepaliveConnection = { connectionId: string; baseUrl: string; token: string; status?: string }

/** The session id a desktop token is bound to, or null for tokens issued before sessions existed. */
export function sessionIdOf(token: string): string | null {
    try {
        const encoded = (token || '').split('.')[1]
        if (!encoded) return null
        const payload = JSON.parse(atob(encoded.replace(/-/g, '+').replace(/_/g, '/')))
        return typeof payload.sid === 'string' ? payload.sid : null
    } catch {
        return null
    }
}

export type KeepaliveDeps = {
    connections: () => KeepaliveConnection[]
    transfersActive: () => boolean
    /** Called with the token that was used and its replacement. */
    onToken: (connectionId: string, usedToken: string, newToken: string) => void
    /** Called when the server says the session behind `usedToken` has ended (401). */
    onSessionEnded?: (connectionId: string, usedToken: string) => void
    fetchImpl?: typeof fetch
    now?: () => number
    minGapMs?: number
}

export function createDesktopKeepalive(deps: KeepaliveDeps) {
    const call = deps.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args))
    const now = deps.now ?? Date.now
    const defaultGapMs = deps.minGapMs ?? 60_000
    let minGapMs = defaultGapMs
    let last = 0
    let running = false

    async function refreshOne(conn: KeepaliveConnection) {
        try {
            const res = await call(`${conn.baseUrl}/api/session/refresh`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${conn.token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ rotate: !deps.transfersActive() }),
            })
            // 409 (no session) is left to the next real request.
            if (res.status === 401) {
                deps.onSessionEnded?.(conn.connectionId, conn.token)
                return
            }
            if (!res.ok) return
            const body = await res.json().catch(() => null)
            // Keep refreshes well inside the server's idle timeout, even when an operator sets it short.
            if (typeof body?.idleTimeoutSeconds === 'number' && body.idleTimeoutSeconds > 0) {
                minGapMs = Math.min(defaultGapMs, (body.idleTimeoutSeconds * 1000) / 3)
            }
            if (typeof body?.token === 'string' && body.token) deps.onToken(conn.connectionId, conn.token, body.token)
        } catch {
            // Offline or restarting: the next activity tries again.
        }
    }

    async function run() {
        if (running) return
        running = true
        last = now()
        try {
            const due = deps.connections().filter(c => c.token && c.status !== 'disconnected' && sessionIdOf(c.token))
            await Promise.all(due.map(refreshOne))
        } finally {
            running = false
        }
    }

    return {
        /** Call on input. Sends a refresh when one is due. */
        userActivity() {
            if (now() - last >= minGapMs) void run()
        },
        run,
    }
}

/** Best-effort server-side sign-out so the token stops working immediately. */
export async function revokeDesktopSession(baseUrl: string, token: string, call: typeof fetch = (...a) => fetch(...a)) {
    if (!token || !sessionIdOf(token)) return
    try {
        await call(`${baseUrl}/api/session`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(3000),
        })
    } catch {
        // The session still ends on its own after the idle timeout.
    }
}
