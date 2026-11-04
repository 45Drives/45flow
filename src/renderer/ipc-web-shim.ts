import type { ConnectionCredentials } from '../shared/secureTokens'
import { createWebUploadApi } from './web-upload'

type Listener = (event: { type: string }, payload: unknown) => void

const WEB_API_BASE = ''

function installWebIPCShim() {
    if (typeof window === 'undefined' || window.electron) return

    const listeners = new Map<string, Set<Listener>>()
    const credentials = new Map<string, ConnectionCredentials>()
    let discoveryStream: EventSource | undefined

    async function readHttpError(response: Response) {
        const requestId = response.headers.get('x-request-id') || ''
        const raw = await response.text()
        let body: { error?: unknown; message?: unknown; requestId?: unknown } | null = null
        try {
            body = raw ? JSON.parse(raw) : null
        } catch {
            body = null
        }
        const message = (typeof body?.message === 'string' && body.message)
            || (typeof body?.error === 'string' && body.error)
            || raw
            || `HTTP ${response.status}`
        const id = typeof body?.requestId === 'string' ? body.requestId : requestId
        return id && !message.includes(id) ? `${message} (request ${id})` : message
    }

    async function requestJson(path: string, init?: RequestInit) {
        const response = await fetch(`${WEB_API_BASE}${path}`, init)
        if (!response.ok) throw new Error(await readHttpError(response))
        return response.status === 204 ? undefined : response.json()
    }

    function notifyUnsupported(capability: string): never {
        throw new Error(`${capability} is not available in the browser. Open 45Flow Desktop to use this feature.`)
    }

    function emit(channel: string, payload: unknown) {
        for (const listener of listeners.get(channel) ?? []) {
            listener({ type: channel }, payload)
        }
    }

    function ensureDiscoveryStream() {
        if (discoveryStream) return
        discoveryStream = new EventSource(`${WEB_API_BASE}/api/discovery/stream`)
        discoveryStream.addEventListener('message', (event) => {
            try {
                const message = JSON.parse((event as MessageEvent).data)
                if (typeof message?.type === 'string') emit(message.type, message.payload)
            } catch (error) {
                console.error('[browser discovery] invalid event payload', error)
            }
        })
        discoveryStream.addEventListener('discovered-servers', (event) => {
            try {
                emit('discovered-servers', JSON.parse((event as MessageEvent).data))
            } catch (error) {
                console.error('[browser discovery] invalid server list', error)
            }
        })
        discoveryStream.onerror = (error) => {
            console.error('[browser discovery] event stream failed; browser will retry', error)
        }
    }

    const upload = createWebUploadApi(emit)

    const electron = {
        isWeb: true,
        secureToken: {
            status: async () => ({ persistent: false }),
            get: async (id: string) => credentials.get(id) ?? null,
            set: async (id: string, value: ConnectionCredentials) => {
                credentials.set(id, { token: value.token })
                return { persistent: false }
            },
            clear: async (id: string) => { credentials.delete(id) },
        },
        ipcRenderer: {
            on(channel: string, listener: Listener) {
                if (!listeners.has(channel)) listeners.set(channel, new Set())
                listeners.get(channel)!.add(listener)
                if (channel === 'discovered-servers') ensureDiscoveryStream()
            },
            once(channel: string, listener: Listener) {
                const wrapped: Listener = (event, payload) => {
                    electron.ipcRenderer.removeListener(channel, wrapped)
                    listener(event, payload)
                }
                electron.ipcRenderer.on(channel, wrapped)
            },
            removeListener(channel: string, listener: Listener) {
                listeners.get(channel)?.delete(listener)
            },
            removeAllListeners(channel: string) {
                listeners.delete(channel)
            },
            async invoke(channel: string, ...args: unknown[]) {
                switch (channel) {
                    case 'scan-network-fallback': {
                        await requestJson('/api/discovery/scan', { method: 'POST' })
                        const result = await requestJson('/api/discovery')
                        return Array.isArray(result?.servers) ? result.servers : []
                    }
                    case 'get-os':
                        return 'browser'
                    case 'is-appimage':
                    case 'is-dev':
                        return false
                    case 'ensure-ssh-ready':
                    case 'remote-check-broadcaster':
                    case 'run-remote-bootstrap':
                        return notifyUnsupported('SSH setup and server bootstrap')
                    case 'probe-health':
                    case 'verify-nginx-certificate-over-ssh':
                        return notifyUnsupported('Desktop network and SSH verification')
                    case 'logs:read-client':
                        return notifyUnsupported('Desktop client logs')
                    case 'transcode:get-capabilities':
                    case 'transcode:start':
                    case 'transcode:cancel':
                    case 'transcode:cancel-all-active':
                    case 'transcode:full-start':
                    case 'transcode:full-cancel':
                    case 'transcode-output-upload':
                    case 'transcode:cleanup-temp':
                    case 'transcode:cleanup-watermark':
                        return notifyUnsupported('Local video transcoding')
                    case 'watermark:download':
                        return notifyUnsupported('Watermark file operations')
                    case 'dialog:openFolder':
                    case 'dialog:pickFiles':
                    case 'dialog:pickFolder':
                    case 'dialog:pickWatermark':
                        return notifyUnsupported('Desktop file picker')
                    case 'backup:isFirstRunNeeded':
                    case 'update:check':
                    case 'update:download':
                    case 'update:install':
                        return notifyUnsupported('Desktop-only operation')
                    default:
                        throw new Error(`Unsupported browser IPC channel: ${channel}`)
                }
            },
            send(channel: string, payload?: unknown) {
                if (channel === 'renderer-ready' || channel === 'license:update-eligible') return
                if (channel === 'IPCMessage') return notifyUnsupported('Desktop message routing')
                throw new Error(`Unsupported browser IPC channel: ${channel}`)
            },
        },
        selectFolder: async () => notifyUnsupported('Desktop folder selection'),
        getOS: async () => 'browser',
        isFirstRunNeeded: async () => notifyUnsupported('Desktop backup setup'),
        ensureSshReady: async () => notifyUnsupported('SSH setup'),
        pickFiles: upload.pickFiles,
        pickFolder: upload.pickFolder,
        pickWatermark: upload.pickWatermark,
        httpUploadStart: upload.httpUploadStart,
        httpUploadCancel: upload.httpUploadCancel,
        transcodeStart: async () => notifyUnsupported('Local video transcoding'),
        transcodeCancel: () => notifyUnsupported('Local video transcoding'),
        transcodeCancelAllActive: async () => notifyUnsupported('Local video transcoding'),
        fullTranscodeStart: async () => notifyUnsupported('Local video transcoding'),
        fullTranscodeCancel: () => notifyUnsupported('Local video transcoding'),
        uploadTranscodeOutput: async () => notifyUnsupported('Local video transcoding'),
        cleanupTranscodeTemp: async () => notifyUnsupported('Local video transcoding'),
        cleanupWatermarkTemp: async () => notifyUnsupported('Local video transcoding'),
        downloadWatermark: async () => notifyUnsupported('Watermark file operations'),
        getTranscodeCapabilities: async () => notifyUnsupported('Local video transcoding'),
        getPathForFile: upload.getPathForFile,
    }

    window.electron = electron as typeof window.electron
    window.appLog = {
        info: (event, data) => console.info(`[45Flow] ${event}`, data ?? ''),
        warn: (event, data) => console.warn(`[45Flow] ${event}`, data ?? ''),
        error: (event, data) => console.error(`[45Flow] ${event}`, data ?? ''),
    }
}

installWebIPCShim()
