// Browser replacement for the desktop's client log file.
//
// Keeps a bounded log of this tab's events and errors, mirrors it to
// sessionStorage so a reload does not lose the error that caused it, and hands
// it to the Log Viewer in the same shape the desktop log reader uses.

export type WebLogEntry = {
    id: string
    timestamp: string
    level: 'info' | 'warn' | 'error'
    event: string
    summary: string
    details?: string
    data?: Record<string, unknown>
}

const STORAGE_KEY = '45flow_web_log_v1'
const MAX_ENTRIES = 500
const MAX_STRING = 500
const MAX_DEPTH = 4
const SENSITIVE_KEY = /pass|token|secret|authorization|cookie|csrf|credential|session/i

/** Make a value safe to keep and export: no secrets, bounded size, no cycles. */
export function sanitize(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
    if (value instanceof Error) {
        return { name: value.name, message: value.message, stack: String(value.stack || '').split('\n').slice(0, 6).join('\n') }
    }
    if (typeof value === 'string') return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value
    if (value === null || typeof value !== 'object') return value
    if (seen.has(value) || depth >= MAX_DEPTH) return '[truncated]'
    seen.add(value)
    if (Array.isArray(value)) return value.slice(0, 20).map(item => sanitize(item, depth + 1, seen))
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 40)) {
        out[key] = SENSITIVE_KEY.test(key) ? '[redacted]' : sanitize(item, depth + 1, seen)
    }
    return out
}

function summarize(event: string, data?: Record<string, unknown>) {
    const text = data?.message ?? data?.error
    return typeof text === 'string' && text ? text : event
}

function safeStorage(): Storage | null {
    try { return window.sessionStorage } catch { return null }
}

export function createWebLog(storage: Storage | null = safeStorage()) {
    let counter = 0
    let entries: WebLogEntry[] = load()

    function load(): WebLogEntry[] {
        try {
            const parsed = JSON.parse(storage?.getItem(STORAGE_KEY) || '[]')
            return Array.isArray(parsed) ? parsed.slice(-MAX_ENTRIES) : []
        } catch {
            return []
        }
    }

    function save() {
        try { storage?.setItem(STORAGE_KEY, JSON.stringify(entries)) } catch { /* storage full or blocked: keep memory only */ }
    }

    function record(level: WebLogEntry['level'], event: string, data?: unknown) {
        const clean = data === undefined ? undefined : sanitize(data)
        const payload = clean && typeof clean === 'object' && !Array.isArray(clean)
            ? clean as Record<string, unknown>
            : clean === undefined ? undefined : { value: clean }
        entries.push({
            id: `web:${Date.now()}:${counter++}`,
            timestamp: new Date().toISOString(),
            level,
            event,
            summary: summarize(event, payload),
            details: payload && Object.keys(payload).length ? JSON.stringify(payload, null, 2) : undefined,
            data: payload,
        })
        if (entries.length > MAX_ENTRIES) entries = entries.slice(-MAX_ENTRIES)
        save()
    }

    return {
        info: (event: string, data?: unknown) => record('info', event, data),
        warn: (event: string, data?: unknown) => record('warn', event, data),
        error: (event: string, data?: unknown) => record('error', event, data),
        /** Newest first, matching the desktop log reader. */
        read(limit = 600) {
            return {
                ok: true,
                entries: entries.slice(-Math.max(1, limit)).reverse(),
                file: 'This browser tab',
                logDir: 'Kept for this tab only (cleared when the tab closes)',
            }
        },
        /** One JSON object per line, oldest first: what support asks for. */
        exportText() {
            return entries.map(entry => JSON.stringify(entry)).join('\n')
        },
        clear() {
            entries = []
            save()
        },
    }
}

export type WebLog = ReturnType<typeof createWebLog>

/** Record uncaught errors and rejected promises, which otherwise vanish in a browser. */
export function captureGlobalErrors(log: WebLog, target: Window = window) {
    target.addEventListener('error', (event) => {
        log.error('window.error', { message: event.message, source: event.filename, line: event.lineno, error: event.error })
    })
    target.addEventListener('unhandledrejection', (event) => {
        log.error('window.unhandledrejection', { reason: event.reason })
    })
}
