// Chunked upload to houston-broadcaster's /api/local-upload endpoints.
// Shared by the desktop main process (reads from disk) and the browser (reads a File);
// each host only supplies how to read a byte range.

export interface HttpUploadOpts {
  src: string             // local file path (desktop) or synthetic browser-file:// path
  apiBase: string         // e.g. http://192.168.123.5:9095
  apiToken: string        // JWT bearer token
  dest: string            // relative destination path on server
  chunkSize?: number      // bytes per chunk (default 5MB)
  // Pre-registered file IDs (from /api/local-upload/register)
  fileId?: number
  assetVersionId?: number
  // Transcode options (passed to /complete)
  clientTranscode?: boolean  // true = client handles transcodes, skip server queue
  proxy?: boolean
  proxyQualities?: string[]
  hls?: boolean
  watermark?: boolean
  watermarkFile?: string
  watermarkSettings?: any
}

export interface HttpUploadProgress {
  phase?: 'uploading' | 'scanning' | 'finalizing' | 'complete'
  message?: string
  percent: number
  bytesTransferred: number
  totalBytes: number
  rate?: string
  eta?: string
  chunksCompleted: number
  totalChunks: number
}

export interface HttpUploadResult {
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

export interface UploadIngest {
  fileId: number
  assetVersionId: number | null
  transcodes: Array<{
    assetVersionId: number
    jobs: { queuedKinds: string[]; skippedKinds: string[] }
  }>
}

export interface ChunkedUploadSource {
  name: string
  size: number
  mime: string
  /** Bytes start..end, inclusive. */
  readChunk(start: number, end: number): BodyInit | Promise<BodyInit>
}

export interface ChunkedUploadHooks {
  /** Aborting stops the upload and deletes the server session. */
  signal: AbortSignal
  onProgress(progress: HttpUploadProgress): void
  /** Fired once the server has the file, so the UI can follow its transcodes. */
  onIngest(ingest: UploadIngest): void
}

const DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024 // 5 MB
const MAX_RETRIES_PER_CHUNK = 3
const RETRY_DELAY_MS = 1000

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function formatRate(bytesPerSec: number): string {
  if (bytesPerSec >= 1024 * 1024 * 1024) return `${(bytesPerSec / (1024 * 1024 * 1024)).toFixed(1)} GB/s`
  if (bytesPerSec >= 1024 * 1024) return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`
  if (bytesPerSec >= 1024) return `${(bytesPerSec / 1024).toFixed(0)} KB/s`
  return `${bytesPerSec.toFixed(0)} B/s`
}

export function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return ''
  if (seconds < 60) return `${Math.ceil(seconds)}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.ceil(seconds % 60)}s`
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
}

export async function runChunkedUpload(
  opts: HttpUploadOpts,
  source: ChunkedUploadSource,
  { signal, onProgress, onIngest }: ChunkedUploadHooks,
): Promise<HttpUploadResult> {
  const { apiBase, apiToken, dest } = opts
  const fileSize = source.size
  const auth = { Authorization: `Bearer ${apiToken}` }
  const headers = { ...auth, 'Content-Type': 'application/json' }
  const dropSession = async (sessionId: string) => {
    try {
      await fetch(`${apiBase}/api/local-upload/${sessionId}`, { method: 'DELETE', headers: auth })
    } catch { /* best effort */ }
  }

  // 1) Initialize session — file allocated directly at final destination
  let sessionId: string
  let serverChunkSize: number
  let totalChunks: number
  let scansOnComplete = false
  try {
    const initRes = await fetch(`${apiBase}/api/local-upload/init`, {
      method: 'POST',
      headers,
      signal,
      body: JSON.stringify({
        filename: source.name,
        fileSize,
        dest,
        chunkSize: opts.chunkSize || DEFAULT_CHUNK_SIZE,
        fileId: opts.fileId,
        assetVersionId: opts.assetVersionId,
      }),
    })
    const initBody = await initRes.json()
    if (!initRes.ok || !initBody.ok) {
      return { ok: false, error: initBody.error || `Init failed (${initRes.status})` }
    }
    sessionId = initBody.sessionId
    serverChunkSize = initBody.chunkSize
    totalChunks = initBody.totalChunks
    scansOnComplete = initBody.malwareScan === true
  } catch (e: any) {
    if (signal.aborted) return { ok: false, error: 'canceled' }
    return { ok: false, error: `Failed to initialize upload: ${e?.message || String(e)}` }
  }

  // 2) Upload chunks
  let bytesTransferred = 0
  const startTime = Date.now()
  for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
    if (signal.aborted) {
      await dropSession(sessionId)
      return { ok: false, error: 'canceled' }
    }

    const start = chunkIdx * serverChunkSize
    const end = Math.min(start + serverChunkSize, fileSize) - 1
    const length = end - start + 1
    const body = await source.readChunk(start, end)

    let lastErr = ''
    let success = false
    for (let attempt = 0; attempt < MAX_RETRIES_PER_CHUNK; attempt++) {
      if (signal.aborted) break
      try {
        const res = await fetch(`${apiBase}/api/local-upload/${sessionId}`, {
          method: 'PATCH',
          headers: {
            ...auth,
            'Content-Type': 'application/octet-stream',
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          },
          signal,
          body,
        })
        if (res.ok) {
          success = true
          break
        }
        const errBody = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        lastErr = errBody.error || `HTTP ${res.status}`
        // Don't retry on client errors (except 429)
        if (res.status >= 400 && res.status < 500 && res.status !== 429) break
      } catch (e: any) {
        lastErr = e?.message || String(e)
      }
      if (attempt < MAX_RETRIES_PER_CHUNK - 1 && !signal.aborted) {
        await sleep(RETRY_DELAY_MS * (attempt + 1))
      }
    }

    if (signal.aborted) {
      await dropSession(sessionId)
      return { ok: false, error: 'canceled' }
    }
    if (!success) {
      await dropSession(sessionId)
      return { ok: false, error: `Chunk ${chunkIdx} failed: ${lastErr}` }
    }

    bytesTransferred += length
    const elapsed = (Date.now() - startTime) / 1000
    const rate = elapsed > 0 ? bytesTransferred / elapsed : 0
    const etaSec = rate > 0 ? (fileSize - bytesTransferred) / rate : 0
    onProgress({
      phase: 'uploading',
      percent: Math.round((bytesTransferred / fileSize) * 100),
      bytesTransferred,
      totalBytes: fileSize,
      rate: formatRate(rate),
      eta: formatEta(etaSec),
      chunksCompleted: chunkIdx + 1,
      totalChunks,
    })
  }

  // The completion request includes queueing/scanning, then server finalization.
  onProgress({
    phase: scansOnComplete ? 'scanning' : 'finalizing',
    message: scansOnComplete ? 'Scanning for malware (queued or running)…' : 'Finalizing upload…',
    percent: 100,
    bytesTransferred,
    totalBytes: fileSize,
    chunksCompleted: totalChunks,
    totalChunks,
  })

  try {
    const completeRes = await fetch(`${apiBase}/api/local-upload/${sessionId}/complete`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        clientTranscode: opts.clientTranscode,
        proxy: opts.proxy,
        proxyQualities: opts.proxyQualities,
        hls: opts.hls,
        watermark: opts.watermark,
        watermarkFile: opts.watermarkFile,
        watermarkSettings: opts.watermarkSettings,
      }),
    })
    const completeBody = await completeRes.json()
    if (!completeRes.ok || !completeBody.ok) {
      return { ok: false, error: completeBody.error || `Finalize failed (${completeRes.status})` }
    }

    // Check abort AFTER /complete — if cancelled during finalize/scan, cancel any queued transcodes
    if (signal.aborted) {
      const avId = completeBody.assetVersionId || opts.assetVersionId
      if (avId && completeBody.transcodes?.queued?.length) {
        for (const kind of completeBody.transcodes.queued) {
          try {
            await fetch(`${apiBase}/api/transcodes/${avId}/${kind}`, { method: 'DELETE', headers: auth })
          } catch { /* best effort */ }
        }
      }
      return { ok: false, error: 'canceled' }
    }

    const security = completeBody.security
    onProgress({
      phase: 'complete',
      message: security?.scannerSkipped === true
        ? 'Malware scan skipped: scanner unavailable'
        : security?.scanner ? 'Malware scan passed' : 'Upload finalized',
      percent: 100,
      bytesTransferred,
      totalBytes: fileSize,
      chunksCompleted: totalChunks,
      totalChunks,
    })

    const fileId = completeBody.fileId || opts.fileId
    const assetVersionId = completeBody.assetVersionId || opts.assetVersionId
    if (fileId) {
      onIngest({
        fileId,
        assetVersionId: assetVersionId || null,
        transcodes: assetVersionId ? [{
          assetVersionId,
          jobs: {
            queuedKinds: completeBody.transcodes?.queued || [],
            skippedKinds: completeBody.transcodes?.skipped || [],
          },
        }] : [],
      })
    }

    return {
      ok: true,
      file: {
        id: fileId,
        assetId: completeBody.assetId,
        assetVersionId,
        savedAs: completeBody.filename,
        name: completeBody.filename,
        size: fileSize,
        mime: source.mime,
        relDir: dest,
      },
      transcodes: completeBody.transcodes,
    }
  } catch (e: any) {
    return { ok: false, error: `Failed to finalize upload: ${e?.message || String(e)}` }
  }
}
