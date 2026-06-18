// src/renderer/composables/useApi.ts
import { inject, computed } from 'vue'
import { useRouter } from 'vue-router'
import type { Ref } from 'vue'
import type { Server, ConnectionMeta } from '../types'
import { currentServerInjectionKey, connectionMetaInjectionKey } from '../keys/injection-keys'
import { pushNotification, Notification } from '@45drives/houston-common-ui'
import { clearLastSession } from './useSessionPersistence'
import { useConnections } from './useConnections'
import type { Connection } from './useConnections'

export type ServerResult<T = any> = {
    connectionId: string
    serverName: string
    serverIp: string
    success: boolean
    data?: T
    error?: string
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'
type ApiInit = RequestInit & {
    timeoutMs?: number
    retry?: number
    retryDelayMs?: number
    parse?: 'json' | 'text' | 'auto' | 'blob'
    suppressAuthRedirect?: boolean
}

const DEFAULT_TIMEOUT = 12_000

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

function shouldLogApiInfo(method?: string) {
    const m = String(method || 'GET').toUpperCase() as HttpMethod
    return !['GET', 'HEAD', 'OPTIONS'].includes(m)
}

function shouldRetry(method?: string, err?: any) {
    const m = String(method || 'GET').toUpperCase() as HttpMethod
    if (!['GET', 'HEAD', 'OPTIONS'].includes(m)) return false
    return !err || !('status' in err) // network/timeout errors (no Response)
}

async function parseAuto(res: Response, mode: 'json' | 'text' | 'auto' = 'auto') {
    if (mode === 'text') return res.text()
    if (mode === 'json') {
        if (res.status === 204) return undefined
        const t = await res.text()
        return t ? JSON.parse(t) : undefined
    }
    const ct = res.headers.get('content-type') || ''
    if (ct.includes('application/json')) {
        if (res.status === 204) return undefined
        const t = await res.text()
        return t ? JSON.parse(t) : undefined
    }
    return res.text()
}

let authRedirectInFlight = false

/**
 * Create API client for a specific connection (or active connection if not specified)
 * @param connectionId - Optional connection ID. If not provided, uses active connection.
 */
export function useApi(connectionId?: string) {
    const router = useRouter()
    const { activeConnection, getConnection, updateConnection } = useConnections()

    // Resolve connection: use specified ID or fall back to active
    const connection = computed<Connection | null>(() => {
        if (connectionId) {
            return getConnection(connectionId)
        }
        return activeConnection.value
    })

    const baseUrl = computed(() => connection.value?.baseUrl ?? '')
    const token = computed(() => connection.value?.token ?? '')

    // Build a ConnectionMeta-compatible object from Connection for compatibility
    const meta = computed<ConnectionMeta>(() => {
        if (!connection.value) {
            return { port: 9095 }
        }
        return {
            token: connection.value.token,
            port: connection.value.apiPort,
            httpsHost: connection.value.baseUrl ? new URL(connection.value.baseUrl).hostname : undefined,
            apiBase: connection.value.baseUrl,
            ssh: connection.value.ssh
        }
    })

    async function apiFetch(path: string, init: ApiInit = {}) {
        const conn = connection.value
        if (!conn) throw new Error('No connection selected')
        if (!baseUrl.value) throw new Error('API base URL is not set')

        const headers = new Headers(init.headers || {})
        if (init.body && !headers.has('Content-Type') && !(init.body instanceof FormData)) {
            headers.set('Content-Type', 'application/json')
        }
        if (token.value && !headers.has('Authorization')) {
            headers.set('Authorization', `Bearer ${token.value}`)
        }

        const urlPath = path.startsWith('/') ? path : `/${path}`
        const url = `${baseUrl.value}${urlPath}`

        const method = (init.method || 'GET').toUpperCase()
        const retry = init.retry ?? 1
        const retryDelay = init.retryDelayMs ?? 500
        const parseMode = init.parse ?? 'auto'

        let lastErr: any

        for (let attempt = 0; attempt <= retry; attempt++) {
            const ctrl = new AbortController()
            const timeoutMs = init.timeoutMs ?? DEFAULT_TIMEOUT
            const timer = setTimeout(() => ctrl.abort(new DOMException('Timeout', 'AbortError')), timeoutMs)

            try {
                if (shouldLogApiInfo(method)) {
                    window.appLog?.info('api.request', { url, method, attempt, connectionId: conn.connectionId })
                }
                const res = await fetch(url, { ...init, method, headers, signal: ctrl.signal })
                if (shouldLogApiInfo(method)) {
                    window.appLog?.info('api.response', { url, status: res.status, connectionId: conn.connectionId })
                }

                if (res.status === 401) {
                    // If caller wants to handle auth failure itself (polling), don't global-logout
                    if (init.suppressAuthRedirect) {
                        clearTimeout(timer)
                        const e = Object.assign(new Error('Unauthorized'), { status: 401 })
                        throw e
                    }

                    // Mark this connection as disconnected
                    updateConnection(conn.connectionId, { 
                        status: 'disconnected',
                        lastError: 'Session expired'
                    })

                    // Clear old session storage (legacy cleanup)
                    clearLastSession()

                    if (!authRedirectInFlight) {
                        authRedirectInFlight = true
                        pushNotification(new Notification('Session expired', `Please log in again to ${conn.name}.`, 'warning', 8000))
                        router.push({ name: 'server-selection' }).finally(() => {
                            setTimeout(() => { authRedirectInFlight = false }, 500)
                        })
                    }

                    clearTimeout(timer)
                    const e = Object.assign(new Error('Unauthorized'), { status: 401 })
                    throw e
                }

                // Handle 403 premium_required — show friendly notification instead of raw error
                if (res.status === 403) {
                    const body = await res.text().catch(() => '')
                    let parsed: any = null
                    try { parsed = body ? JSON.parse(body) : null } catch { parsed = null }

                    if (parsed?.error === 'premium_required') {
                        clearTimeout(timer)
                        pushNotification(new Notification(
                            'Pro Feature',
                            parsed.message || 'This feature requires a Pro license. Go to Settings → Go Pro to activate.',
                            'warning',
                            8000
                        ))
                        const e = Object.assign(new Error(parsed.message || 'Premium license required'), {
                            status: 403,
                            code: 'premium_required',
                        })
                        throw e
                    }
                    // Fall through to generic error handling for other 403s
                }

                if (!res.ok) {
                    const requestIdHeader = res.headers.get('x-request-id') || ''
                    const detail = await res.text().catch(() => res.statusText)
                    let parsed: any = null
                    try { parsed = detail ? JSON.parse(detail) : null } catch { parsed = null }

                    if (parsed && typeof parsed === 'object' && 'security' in parsed) {
                        window.appLog?.warn?.('api.security', {
                            url,
                            status: res.status,
                            security: (parsed as any).security,
                            connectionId: conn.connectionId
                        })
                    }

                    const requestIdBody = parsed && typeof parsed.requestId === 'string' ? parsed.requestId : ''
                    const requestId = requestIdBody || requestIdHeader
                    const parsedError = parsed && typeof parsed.error === 'string' ? parsed.error : ''
                    const parsedMessage = parsed && typeof parsed.message === 'string' ? parsed.message : ''
                    const baseMessage = res.status >= 500
                        ? 'Internal server error'
                        : (parsedError || parsedMessage || detail || `HTTP ${res.status}`)
                    const withRequestId = requestId && !baseMessage.includes(requestId)
                        ? `${baseMessage} (request ${requestId})`
                        : baseMessage

                    const e = Object.assign(new Error(withRequestId), {
                        status: res.status,
                        requestId: requestId || undefined,
                        code: parsed && typeof parsed.code === 'string' ? parsed.code : undefined,
                    })
                    throw e
                }

                clearTimeout(timer)
                
                // Handle blob parsing separately
                if (parseMode === 'blob') {
                    return await res.blob()
                }
                
                const parsed = await parseAuto(res, parseMode)
                if (parsed && typeof parsed === 'object' && 'security' in (parsed as any)) {
                    window.appLog?.info?.('api.security', {
                        url,
                        status: res.status,
                        security: (parsed as any).security,
                        connectionId: conn.connectionId
                    })
                }
                return parsed

            } catch (err: any) {
                clearTimeout(timer)
                lastErr = err
                const aborted = err?.name === 'AbortError'
                const networkish = aborted || (err instanceof TypeError && !('status' in err))
                const canRetry = attempt < retry && (networkish || shouldRetry(method, err))

                window.appLog?.warn?.('api.request.error', {
                    url,
                    status: err?.status,
                    code: err?.code,
                    requestId: err?.requestId,
                    message: String(err?.message || err),
                    attempt,
                    willRetry: canRetry,
                    connectionId: conn.connectionId
                })

                if (!canRetry) break
                await sleep(retryDelay * Math.pow(2, attempt))
            }
        }

        throw lastErr
    }

    return { baseUrl, apiFetch, meta, connection }
}

/**
 * Fetch from multiple servers in parallel
 * Returns results from all servers, including errors for unreachable ones
 * @param connections - Array of connections to fetch from
 * @param path - API path to fetch
 * @param init - Fetch options
 * @returns Array of ServerResult objects with success/error status per server
 */
export async function apiFetchAll<T = any>(
    connections: Connection[],
    path: string,
    init: ApiInit = {}
): Promise<ServerResult<T>[]> {
    if (!connections.length) {
        return []
    }

    // Fetch from each connection directly without using useApi() composable
    const promises = connections.map(async (conn): Promise<ServerResult<T>> => {
        try {
            if (!conn.baseUrl || !conn.token) {
                throw new Error('Invalid connection: missing baseUrl or token')
            }

            const headers = new Headers(init.headers || {})
            if (init.body && !headers.has('Content-Type') && !(init.body instanceof FormData)) {
                headers.set('Content-Type', 'application/json')
            }
            if (conn.token && !headers.has('Authorization')) {
                headers.set('Authorization', `Bearer ${conn.token}`)
            }

            const urlPath = path.startsWith('/') ? path : `/${path}`
            const url = `${conn.baseUrl}${urlPath}`
            const method = (init.method || 'GET').toUpperCase()
            const timeoutMs = init.timeoutMs ?? DEFAULT_TIMEOUT

            const ctrl = new AbortController()
            const timer = setTimeout(() => ctrl.abort(new DOMException('Timeout', 'AbortError')), timeoutMs)

            try {
                const res = await fetch(url, { ...init, method, headers, signal: ctrl.signal })
                clearTimeout(timer)

                if (res.status === 401) {
                    throw Object.assign(new Error('Unauthorized'), { status: 401 })
                }

                if (!res.ok) {
                    const detail = await res.text().catch(() => res.statusText)
                    let parsed: any = null
                    try { parsed = detail ? JSON.parse(detail) : null } catch { parsed = null }
                    
                    const parsedError = parsed && typeof parsed.error === 'string' ? parsed.error : ''
                    const parsedMessage = parsed && typeof parsed.message === 'string' ? parsed.message : ''
                    const baseMessage = parsedError || parsedMessage || detail || `HTTP ${res.status}`
                    
                    throw Object.assign(new Error(baseMessage), { status: res.status })
                }

                const parseMode = init.parse ?? 'auto'
                let data: any

                if (parseMode === 'text') {
                    data = await res.text()
                } else if (parseMode === 'blob') {
                    data = await res.blob()
                } else {
                    const ct = res.headers.get('Content-Type') || ''
                    if (/json/.test(ct)) {
                        data = await res.json()
                    } else if (/text/.test(ct)) {
                        data = await res.text()
                    } else if (res.status === 204) {
                        data = null
                    } else {
                        data = await res.text()
                    }
                }

                return {
                    connectionId: conn.connectionId,
                    serverName: conn.name,
                    serverIp: conn.serverIp,
                    success: true,
                    data
                }
            } finally {
                clearTimeout(timer)
            }
        } catch (err: any) {
            return {
                connectionId: conn.connectionId,
                serverName: conn.name,
                serverIp: conn.serverIp,
                success: false,
                error: err?.message || 'Request failed'
            }
        }
    })

    return Promise.all(promises)
}

