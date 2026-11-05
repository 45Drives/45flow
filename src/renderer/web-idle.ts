// Keeps a browser session alive while the user is active, and warns before it ends.
//
// The server only sees requests, but reading, typing and watching send none. This
// turns real user activity into a light keepalive, and asks the server (without
// extending the session) how long is left before showing a warning.

export type IdleMonitorOptions = {
    idleSeconds: number
    /** Show the warning this long before expiry. */
    leadSeconds?: number
    /** Send at most one keepalive per this interval while the user is active. */
    pingEverySeconds?: number
    /** Check the server at most this often while the warning window is open. */
    verifyEverySeconds?: number
    /** Extend the session. Resolves false when the session has already ended. */
    keepAlive: () => Promise<boolean>
    /** Ask how long is left without extending it. Resolves null when it has ended. */
    checkIdle: () => Promise<{ idleRemainingSeconds: number } | null>
    /** Seconds left while the warning is showing, or null when it should be hidden. */
    onWarning: (secondsLeft: number | null) => void
    onExpired: () => void
    now?: () => number
}

export function createIdleMonitor(options: IdleMonitorOptions) {
    const now = options.now ?? Date.now
    const idleMs = options.idleSeconds * 1000
    const leadMs = Math.min(options.leadSeconds ?? 120, options.idleSeconds / 4) * 1000
    // Keepalives must come well inside the timeout, or a short idle setting would expire between them.
    const pingEveryMs = Math.min(options.pingEverySeconds ?? 60, options.idleSeconds / 3) * 1000
    const verifyEveryMs = (options.verifyEverySeconds ?? 10) * 1000

    let lastTouch = now()
    let lastVerify = 0
    let warning = false
    let busy = false
    let stopped = false

    function showWarning(secondsLeft: number | null) {
        warning = secondsLeft !== null
        options.onWarning(secondsLeft)
    }

    function expire() {
        if (stopped) return
        stopped = true
        showWarning(null)
        options.onExpired()
    }

    /** The server counted activity at `at`. */
    function touched(at = now()) {
        lastTouch = Math.max(lastTouch, at)
        if (warning && idleMs - (now() - lastTouch) > leadMs) showWarning(null)
    }

    async function ping() {
        if (busy || stopped) return
        busy = true
        try {
            if (await options.keepAlive()) touched()
            else expire()
        } catch {
            // Network trouble is not the end of the session; the next check decides.
        } finally {
            busy = false
        }
    }

    async function verify() {
        if (busy || stopped) return
        busy = true
        lastVerify = now()
        try {
            const status = await options.checkIdle()
            if (!status) return expire()
            lastTouch = now() - (options.idleSeconds - status.idleRemainingSeconds) * 1000
            showWarning(status.idleRemainingSeconds > leadMs / 1000 ? null : status.idleRemainingSeconds)
        } catch {
            // Keep the local estimate until the server can be reached again.
        } finally {
            busy = false
        }
    }

    return {
        /** Call on input (mouse, keys, touch). Sends a keepalive when one is due. */
        userActivity() {
            if (stopped || now() - lastTouch < pingEveryMs) return
            void ping()
        },
        /** Call for requests the server counts as activity, including from other tabs. */
        apiActivity: touched,
        /** Call periodically and when the tab becomes visible. */
        async tick() {
            if (stopped) return
            const remainingMs = idleMs - (now() - lastTouch)
            if (remainingMs > leadMs) {
                if (warning) showWarning(null)
                return
            }
            if (remainingMs <= 0 || now() - lastVerify >= verifyEveryMs) await verify()
            else if (warning) showWarning(Math.max(0, Math.ceil(remainingMs / 1000)))
        },
        /** The user chose to stay signed in. */
        stay: ping,
        stop() {
            stopped = true
        },
    }
}

export type IdleMonitor = ReturnType<typeof createIdleMonitor>

const SHARED_TOUCH_KEY = 'flow_session_touch'
const INPUT_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const

/**
 * Connect a monitor to the page: input events, a timer, tab visibility, and other tabs
 * (which share the same session cookie, so their activity counts here too).
 */
export function attachIdleMonitor(
    monitor: IdleMonitor,
    subscribeToApiActivity: (listener: () => void) => () => void,
    win: Window = window,
) {
    let lastMove = 0
    let lastShared = 0
    const onInput = () => monitor.userActivity()
    const onMove = () => {
        const t = Date.now()
        if (t - lastMove < 1000) return
        lastMove = t
        monitor.userActivity()
    }
    const onVisible = () => { if (win.document.visibilityState === 'visible') void monitor.tick() }
    const onStorage = (event: StorageEvent) => {
        if (event.key === SHARED_TOUCH_KEY && event.newValue) monitor.apiActivity(Number(event.newValue))
    }

    for (const name of INPUT_EVENTS) win.addEventListener(name, onInput, { capture: true, passive: true })
    win.addEventListener('pointermove', onMove, { passive: true })
    win.addEventListener('storage', onStorage)
    win.document.addEventListener('visibilitychange', onVisible)
    win.addEventListener('focus', onVisible)

    const unsubscribe = subscribeToApiActivity(() => {
        monitor.apiActivity()
        const t = Date.now()
        if (t - lastShared < 5000) return
        lastShared = t
        try { win.localStorage.setItem(SHARED_TOUCH_KEY, String(t)) } catch { /* other tabs just verify with the server */ }
    })
    const timer = win.setInterval(() => void monitor.tick(), 5000)

    return () => {
        monitor.stop()
        win.clearInterval(timer)
        unsubscribe()
        for (const name of INPUT_EVENTS) win.removeEventListener(name, onInput, { capture: true } as EventListenerOptions)
        win.removeEventListener('pointermove', onMove)
        win.removeEventListener('storage', onStorage)
        win.document.removeEventListener('visibilitychange', onVisible)
        win.removeEventListener('focus', onVisible)
    }
}
