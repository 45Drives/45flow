// preload.ts
import { contextBridge, ipcRenderer, IpcRendererEvent, webUtils } from 'electron'

const genId = () => Math.random().toString(36).slice(2)

/** ===== Shared Types ===== */
export type UploadResult = { ok?: boolean; path?: string; error?: string }
export type ProgressPayload = { percent: number; speed?: string; eta?: string }

export type RsyncProgress = {
  percent?: number
  rate?: string
  eta?: string
  bytesTransferred?: number
  raw?: string
}

export type RsyncOpts = {
  /** local source path (file or directory) */
  src: string
  host: string
  user: string
  destDir: string
  port?: number
  /** path to a private key file; omit to use ssh-agent */
  keyPath?: string
  /** optional bandwidth limit in KB/s */
  bwlimitKb?: number
  /** extra rsync flags */
  extraArgs?: string[]
  /** request proxy transcode after ingest */
  transcodeProxy?: boolean
  /** requested proxy qualities (e.g. ['720p','1080p','original']) */
  proxyQualities?: string[]
  /** request watermark for video files */
  watermark?: boolean
  /** watermark image filename already present in destDir */
  watermarkFileName?: string
  /** qualities that should receive watermark (defaults to proxyQualities) */
  watermarkProxyQualities?: string[]
  /** skip ingest/register step after transfer (useful for helper assets like watermark images) */
  noIngest?: boolean
  /** JWT token for authenticated ingest/register calls */
  apiToken?: string
  /** file was transcoded on client side, skip server transcode */
  clientTranscoded?: boolean
  clientWatermarked?: boolean
}

export type RsyncResult = { ok?: boolean; error?: string }

export type TranscodeOptions = {
  inputPath: string
  quality: 'original' | '1080p' | '720p'
  outputFormat: 'mp4' | 'hevc'
  useHardwareAccel: boolean
  preset?: 'fast' | 'balanced' | 'quality'
  watermarkPath?: string
}

export type TranscodeProgress = {
  percent: number
  fps: number
  speed: string
  eta: string
  message: string
}

export type TranscodeResult = { ok?: boolean; outputPath?: string; error?: string }

/** Shape exposed on window.electron */
export type ElectronApi = {
  ipcRenderer: {
    send: (channel: string, data?: any) => void
    on: (channel: string, listener: (event: IpcRendererEvent, ...args: any[]) => void) => void
    invoke: (channel: string, ...args: any[]) => Promise<any>
    once: (channel: string, listener: (event: IpcRendererEvent, ...args: any[]) => void) => void
    removeListener: (channel: string, listener: (...args: any[]) => void) => void
    removeAllListeners: (channel: string) => void
  }

  // dialogs / misc
  selectFolder: () => Promise<string | null>
  getOS: () => Promise<string>
  isFirstRunNeeded: (host: string, share: string, smbUser: string) => Promise<boolean>

  // local picks
  pickFiles: () => Promise<Array<{ path: string; name: string; size: number }>>
  pickFolder: () => Promise<Array<{ path: string; name: string; size: number }>>
  pickWatermark: () => Promise<{ path: string; name: string; size: number; dataUrl?: string | null } | null>

  // New: rsync over SSH
  rsyncStart: (
    opts: RsyncOpts,
    onProgress?: (p: RsyncProgress) => void
  ) => Promise<{ id: string; done: Promise<RsyncResult> }>

  rsyncCancel: (id: string) => void

  // Persisted uploads (detached rsync)
  listPersistedUploads: () => Promise<Array<{
    id: string
    fileName: string
    fileSize?: number
    host: string
    destDir: string
    startedAt: number
    status: string
  }>>

  /** Subscribe to progress for an already-running detached rsync */
  listenUploadProgress: (id: string, onProgress: (p: RsyncProgress) => void) => () => void

  /** ========== Client-side Transcoding ========== */
  /** Transcode a video file on the client machine (using local hardware acceleration) */
  transcodeStart: (
    options: TranscodeOptions,
    onProgress?: (p: TranscodeProgress) => void
  ) => Promise<{ jobId: string; done: Promise<TranscodeResult> }>

  /** Cancel an active transcode job */
  transcodeCancel: (jobId: string) => void

  /** Download a watermark image from the server to a local temp file */
  downloadWatermark: (opts: { apiBase: string; token: string; relPath: string }) => Promise<string | null>

  /** Get hardware acceleration capabilities for transcode */
  getTranscodeCapabilities: () => Promise<{
    hasHardwareAccel: boolean
    bestCodecH264: string
    bestCodecHevc: string
    hardwareDescription: string
    ffmpegSource: 'system' | 'bundled'
    ffmpegVersion: string
    probeResults: Record<string, boolean>
  }>

  /** Get the real filesystem path for a File from drag-and-drop */
  getPathForFile: (file: File) => string

  /** Persist queued upload items so they survive app restart */
  persistUploadQueue: (items: Array<{
    src: string
    fileName: string
    fileSize?: number
    host: string
    user: string
    destDir: string
    port?: number
    keyPath?: string
    shareRoot?: string
    knownHostsPath?: string
    transcodeProxy?: boolean
    proxyQualities?: string[]
    watermark?: boolean
    watermarkFileName?: string
    watermarkProxyQualities?: string[]
    noIngest?: boolean
  }>) => Promise<void>
}

/** ===== Implementation ===== */
const api: ElectronApi = {
  ipcRenderer: {
    send: (channel, data) => ipcRenderer.send(channel, data),
    on: (channel, listener) => ipcRenderer.on(channel, (_e, ...args) => listener(_e, ...args)),
    invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
    once: (channel, listener) => ipcRenderer.once(channel, (_e, ...args) => listener(_e, ...args)),
    removeListener: (channel, listener) => ipcRenderer.removeListener(channel, listener),
    removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
  },

  // dialogs / misc
  selectFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  getOS: () => ipcRenderer.invoke('get-os'),
  isFirstRunNeeded: (host, share, smbUser) => ipcRenderer.invoke('backup:isFirstRunNeeded', host, share, smbUser),

  // local picks
  pickFiles: () => ipcRenderer.invoke('dialog:pickFiles'),
  pickFolder: () => ipcRenderer.invoke('dialog:pickFolder'),
  pickWatermark: () => ipcRenderer.invoke('dialog:pickWatermark'),


  /** ========== rsync over SSH ========== */
  rsyncStart: (opts, onProgress) => {
    const id = genId()
    const pch = `upload:progress:${id}`
    const dch = `upload:done:${id}`

    const ph = (_: IpcRendererEvent, payload: RsyncProgress) => {
      try { onProgress?.(payload) } catch {}
    }
    ipcRenderer.on(pch, ph)

    ipcRenderer.send('upload:start', { id, ...opts })

    const done: Promise<RsyncResult> = new Promise((resolve) => {
      ipcRenderer.once(dch, (_ev, res: RsyncResult) => {
        ipcRenderer.removeAllListeners(pch)
        resolve(res)
      })
    })

    return Promise.resolve({ id, done })
  },

  rsyncCancel: (id) => ipcRenderer.send('upload:cancel', { id }),

  listPersistedUploads: () => ipcRenderer.invoke('upload:list-persisted'),

  persistUploadQueue: (items) => ipcRenderer.invoke('upload:persist-queue', items),

  listenUploadProgress: (id: string, onProgress: (p: RsyncProgress) => void) => {
    const ch = `upload:progress:${id}`
    const handler = (_: IpcRendererEvent, payload: RsyncProgress) => {
      try { onProgress(payload) } catch {}
    }
    ipcRenderer.on(ch, handler)
    return () => ipcRenderer.removeListener(ch, handler)
  },

  /** ========== Client-side Transcoding ========== */
  transcodeStart: (options: TranscodeOptions, onProgress?: (p: TranscodeProgress) => void) => {
    const jobId = genId()
    const pch = `transcode:progress:${jobId}`
    const dch = `transcode:done:${jobId}`
    const fch = `transcode:failed:${jobId}`

    if (onProgress) {
      const ph = (_: IpcRendererEvent, payload: TranscodeProgress) => {
        try { onProgress(payload) } catch {}
      }
      ipcRenderer.on(pch, ph)
    }

    const done: Promise<TranscodeResult> = new Promise((resolve) => {
      ipcRenderer.once(dch, (_ev, res: TranscodeResult) => {
        ipcRenderer.removeAllListeners(pch)
        ipcRenderer.removeAllListeners(fch)
        resolve(res)
      })
      ipcRenderer.once(fch, (_ev, res: TranscodeResult) => {
        ipcRenderer.removeAllListeners(pch)
        ipcRenderer.removeAllListeners(dch)
        resolve(res)
      })
    })

    ipcRenderer.invoke('transcode:start', { jobId, options }).catch((err: any) => {
      // If invoke rejects AND the failed event wasn't already sent,
      // resolve done with the error so the caller handles it.
      console.error('[transcode] invoke rejected:', err?.message || err)
    })

    return Promise.resolve({ jobId, done })
  },

  transcodeCancel: (jobId: string) => ipcRenderer.invoke('transcode:cancel', { jobId }),

  downloadWatermark: (opts: { apiBase: string; token: string; relPath: string }) =>
    ipcRenderer.invoke('watermark:download', opts),

  getTranscodeCapabilities: () => ipcRenderer.invoke('transcode:get-capabilities'),

  getPathForFile: (file: File) => webUtils.getPathForFile(file),
}

contextBridge.exposeInMainWorld('electron', api)

contextBridge.exposeInMainWorld('appLog', {
  info: (event: string, data?: any) => ipcRenderer.send('log:info', { event, data }),
  warn: (event: string, data?: any) => ipcRenderer.send('log:warn', { event, data }),
  error: (event: string, data?: any) => ipcRenderer.send('log:error', { event, data }),
})
