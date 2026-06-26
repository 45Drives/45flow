// preload.ts
import { contextBridge, ipcRenderer, IpcRendererEvent, webUtils } from 'electron'

const genId = () => Math.random().toString(36).slice(2)

/** ===== Shared Types ===== */
export type UploadResult = { ok?: boolean; path?: string; error?: string }
export type ProgressPayload = { percent: number; speed?: string; eta?: string }

export type HttpUploadOpts = {
  src: string
  apiBase: string
  apiToken: string
  dest: string
  chunkSize?: number
  fileId?: number
  assetVersionId?: number
  clientTranscode?: boolean
  proxy?: boolean
  proxyQualities?: string[]
  hls?: boolean
  watermark?: boolean
  watermarkFile?: string
  watermarkSettings?: WatermarkSettings
}

export type HttpUploadProgress = {
  percent: number
  bytesTransferred: number
  totalBytes: number
  rate?: string
  eta?: string
  chunksCompleted: number
  totalChunks: number
}

export type HttpUploadResult = {
  ok: boolean
  error?: string
  file?: {
    id: number
    assetId: number
    assetVersionId: number
    savedAs: string
    name: string
    size: number
    mime: string
    relDir: string
  }
  transcodes?: {
    queued: string[]
    skipped: string[]
  }
}

export type WatermarkSettings = {
  position: {
    x: number
    y: number
    xUnit: '%' | 'px'
    yUnit: '%' | 'px'
    anchor: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center'
  }
  scale: number
  opacity: number
  rotation: number
}

export type TranscodeOptions = {
  inputPath: string
  quality: 'original' | '1080p' | '720p'
  outputFormat: 'mp4' | 'hevc'
  useHardwareAccel: boolean
  preset?: 'fast' | 'balanced' | 'quality'
  watermarkPath?: string
  watermarkSettings?: WatermarkSettings | null
}

export type TranscodeProgress = {
  percent: number
  fps: number
  speed: string
  eta: string
  message: string
}

export type TranscodeResult = { ok?: boolean; outputPath?: string; error?: string }

export type FullTranscodeOptions = {
  inputPath: string
  proxyQualities: ('720p' | '1080p' | 'original')[]
  generateHls: boolean
  /** When true with generateHls, skip proxy MP4 generation (only generate HLS) */
  generateProxy?: boolean
  watermarkPath?: string
  watermarkSettings?: WatermarkSettings | null
  useHardwareAccel: boolean
  preset?: 'fast' | 'balanced' | 'quality'
}

export type FullTranscodeProgress = {
  phase: 'probe' | 'proxy' | 'hls'
  activeQuality?: string
  perQualityProgress: Record<string, number>
  overallPercent: number
  fps: number
  speed: string
  eta: string
  message: string
  encoder?: string
}

export type FullTranscodeResult = {
  ok?: boolean
  outputDir?: string
  proxyFiles?: Record<string, string>
  hlsDir?: string | null
  hlsMaster?: string | null
  error?: string
}

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

  // SSH setup
  ensureSshReady: (opts: {
    host: string
    username: string
    password?: string
    sshPort?: number
  }) => Promise<{ ok: boolean; keyPath?: string; via?: string; error?: string }>

  // local picks
  pickFiles: () => Promise<Array<{ path: string; name: string; size: number }>>
  pickFolder: () => Promise<Array<{ path: string; name: string; size: number }>>
  pickWatermark: () => Promise<{ path: string; name: string; size: number; dataUrl?: string | null } | null>

  // HTTP chunked upload)
  httpUploadStart: (
    opts: HttpUploadOpts,
    onProgress?: (p: HttpUploadProgress) => void
  ) => Promise<{ id: string; done: Promise<HttpUploadResult> }>

  httpUploadCancel: (id: string) => void

  /** ========== Client-side Transcoding ========== */
  /** Transcode a video file on the client machine (using local hardware acceleration) */
  transcodeStart: (
    options: TranscodeOptions,
    onProgress?: (p: TranscodeProgress) => void
  ) => Promise<{ jobId: string; done: Promise<TranscodeResult> }>

  /** Cancel an active transcode job */
  transcodeCancel: (jobId: string) => void

  /** Cancel ALL active client transcodes (used when link is disabled) */
  transcodeCancelAllActive: () => Promise<{ canceled: number }>

  /** Full transcode: generate all proxy variants + HLS from one source */
  fullTranscodeStart: (
    options: FullTranscodeOptions,
    onProgress?: (p: FullTranscodeProgress) => void
  ) => Promise<{ jobId: string; done: Promise<FullTranscodeResult> }>

  /** Cancel an active full transcode */
  fullTranscodeCancel: (jobId: string) => void

  /** Upload transcode outputs (HLS segments, proxy MP4s) to the server via HTTP */
  uploadTranscodeOutput: (opts: {
    outputDir: string
    targetDir: string
    apiBase: string
    apiToken: string
    subDir?: string
  }) => Promise<{ ok: boolean; error?: string; filesUploaded?: number }>

  /** Remove a transcode temp directory */
  cleanupTranscodeTemp: (dirPath: string) => Promise<{ ok: boolean; error?: string }>
  /** Remove a downloaded watermark temp file */
  cleanupWatermarkTemp: (filePath: string) => Promise<{ ok: boolean; error?: string }>

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

  // SSH setup
  ensureSshReady: (opts) => ipcRenderer.invoke('ensure-ssh-ready', opts),

  // local picks
  pickFiles: () => ipcRenderer.invoke('dialog:pickFiles'),
  pickFolder: () => ipcRenderer.invoke('dialog:pickFolder'),
  pickWatermark: () => ipcRenderer.invoke('dialog:pickWatermark'),


  /** ========== HTTP chunked upload ========== */
  httpUploadStart: (opts, onProgress) => {
    const id = genId()
    const pch = `http-upload:progress:${id}`
    const dch = `http-upload:done:${id}`

    const ph = (_: IpcRendererEvent, payload: HttpUploadProgress) => {
      try { onProgress?.(payload) } catch {}
    }
    ipcRenderer.on(pch, ph)

    ipcRenderer.send('http-upload:start', { id, ...opts })

    const done: Promise<HttpUploadResult> = new Promise((resolve) => {
      ipcRenderer.once(dch, (_ev, res: HttpUploadResult) => {
        ipcRenderer.removeAllListeners(pch)
        resolve(res)
      })
    })

    return Promise.resolve({ id, done })
  },

  httpUploadCancel: (id) => ipcRenderer.send('http-upload:cancel', id),

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

  transcodeCancelAllActive: () => ipcRenderer.invoke('transcode:cancel-all-active'),

  fullTranscodeStart: (options: FullTranscodeOptions, onProgress?: (p: FullTranscodeProgress) => void) => {
    const jobId = genId()
    const pch = `transcode:full-progress:${jobId}`
    const dch = `transcode:full-done:${jobId}`
    const fch = `transcode:full-failed:${jobId}`

    if (onProgress) {
      const ph = (_: IpcRendererEvent, payload: FullTranscodeProgress) => {
        try { onProgress(payload) } catch {}
      }
      ipcRenderer.on(pch, ph)
    }

    const done: Promise<FullTranscodeResult> = new Promise((resolve) => {
      ipcRenderer.once(dch, (_ev, res: FullTranscodeResult) => {
        ipcRenderer.removeAllListeners(pch)
        ipcRenderer.removeAllListeners(fch)
        resolve(res)
      })
      ipcRenderer.once(fch, (_ev, res: FullTranscodeResult) => {
        ipcRenderer.removeAllListeners(pch)
        ipcRenderer.removeAllListeners(dch)
        resolve(res)
      })
    })

    ipcRenderer.invoke('transcode:full-start', { jobId, options }).catch((err: any) => {
      console.error('[full-transcode] invoke rejected:', err?.message || err)
    })

    return Promise.resolve({ jobId, done })
  },

  fullTranscodeCancel: (jobId: string) => ipcRenderer.invoke('transcode:full-cancel', { jobId }),

  uploadTranscodeOutput: (opts: {
    outputDir: string
    targetDir: string
    apiBase: string
    apiToken: string
    subDir?: string
  }) => ipcRenderer.invoke('transcode-output-upload', opts),

  cleanupTranscodeTemp: (dirPath: string) => ipcRenderer.invoke('transcode:cleanup-temp', { dirPath }),
  cleanupWatermarkTemp: (filePath: string) => ipcRenderer.invoke('transcode:cleanup-watermark', { filePath }),

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
