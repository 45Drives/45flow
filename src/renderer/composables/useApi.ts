// src/renderer/composables/useApi.ts
import { inject, computed } from 'vue'
import { useRouter } from 'vue-router'
import type { Ref } from 'vue'
import type { Server, ConnectionMeta } from '../types'
import { currentServerInjectionKey, connectionMetaInjectionKey } from '../keys/injection-keys'
import { pushNotification, Notification } from '@45drives/houston-common-ui'
import { clearLastSession } from './useSessionPersistence'

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'
type ApiInit = RequestInit & {
    timeoutMs?: number
    retry?: number
    retryDelayMs?: number
    parse?: 'json' | 'text' | 'auto'
    suppressAuthRedirect?: boolean // ADD
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

export function useApi() {
    const router = useRouter() // ← use the live router instance

    const currentServer = inject<Ref<Server | null>>(currentServerInjectionKey)!
    const meta = inject<Ref<ConnectionMeta>>(connectionMetaInjectionKey)!

    const baseUrl = computed(() => meta.value.apiBase ?? '')

    async function apiFetch(path: string, init: ApiInit = {}) {
        if (!currentServer.value) throw new Error('No server selected')
        if (!baseUrl.value) throw new Error('API base URL is not set')

        const headers = new Headers(init.headers || {})
        if (init.body && !headers.has('Content-Type') && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json')
        if (meta.value.token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${meta.value.token}`)

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
                    window.appLog?.info('api.request', { url, method, attempt })
                }
                const res = await fetch(url, { ...init, method, headers, signal: ctrl.signal })
                if (shouldLogApiInfo(method)) {
                    window.appLog?.info('api.response', { url, status: res.status })
                }

                if (res.status === 401) {
                    // If caller wants to handle auth failure itself (polling), don't global-logout
                    if (init.suppressAuthRedirect) {
                        clearTimeout(timer)
                        const e = Object.assign(new Error('Unauthorized'), { status: 401 })
                        throw e
                    }

                    // existing behavior:
                    clearLastSession()
                    meta.value = { ...meta.value, token: undefined }

                    if (!authRedirectInFlight) {
                        authRedirectInFlight = true
                        pushNotification(new Notification('Session expired', 'Please log in again.', 'warning', 8000))
                        router.push({ name: 'server-selection' }).finally(() => {
                            setTimeout(() => { authRedirectInFlight = false }, 500)
                        })
                    }

                    clearTimeout(timer)
                    const e = Object.assign(new Error('Unauthorized'), { status: 401 })
                    throw e
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
                            security: (parsed as any).security
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
                const parsed = await parseAuto(res, parseMode)
                if (parsed && typeof parsed === 'object' && 'security' in (parsed as any)) {
                    window.appLog?.info?.('api.security', {
                        url,
                        status: res.status,
                        security: (parsed as any).security
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
                    willRetry: canRetry
                })

                if (!canRetry) break
                await sleep(retryDelay * Math.pow(2, attempt))
            }
        }

        throw lastErr
    }

    return { baseUrl, apiFetch, meta }
}
