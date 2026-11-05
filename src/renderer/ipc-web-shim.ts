import type { ConnectionCredentials } from '../shared/secureTokens'
import { createWebUploadApi } from './web-upload'
import { createSessionFetch } from './web-session'
import { captureGlobalErrors, createWebLog } from './web-log'

type Listener = (event: { type: string }, payload: unknown) => void

function installWebIPCShim() {
    if (typeof window === 'undefined' || window.electron) return

    const webLog = createWebLog()
    captureGlobalErrors(webLog)
    window.fetch = createSessionFetch(window.fetch.bind(window), window.location.origin, (failure) =>
        (failure.status && failure.status < 500 ? webLog.warn : webLog.error)('http.error', failure))

    const listeners = new Map<string, Set<Listener>>()
    const credentials = new Map<string, ConnectionCredentials>()

    function notifyUnsupported(capability: string): never {
        throw new Error(`${capability} is not available in the browser. Open 45Flow Desktop to use this feature.`)
    }

    function emit(channel: string, payload: unknown) {
        for (const listener of listeners.get(channel) ?? []) {
            listener({ type: channel }, payload)
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
                    // The browser only ever talks to the server that hosts it, so there is nothing to discover.
                    case 'scan-network-fallback':
                        return []
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
                        return webLog.read(Number((args[0] as { limit?: number } | undefined)?.limit) || undefined)
                    // The page's own session cookie signs the docs in; no token is passed.
                    case 'api-docs:open':
                        window.open(new URL('/api-docs/', window.location.origin).href, '_blank', 'noopener,noreferrer')
                        return true
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
        exportClientLogs: () => webLog.exportText(),
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
        info: (event, data) => { console.info(`[45Flow] ${event}`, data ?? ''); webLog.info(event, data) },
        warn: (event, data) => { console.warn(`[45Flow] ${event}`, data ?? ''); webLog.warn(event, data) },
        error: (event, data) => { console.error(`[45Flow] ${event}`, data ?? ''); webLog.error(event, data) },
    }
}

installWebIPCShim()
