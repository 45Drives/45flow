// src/main/transfers/http-upload.ts
// Chunked HTTP upload to houston-broadcaster's /api/local-upload endpoints.
// HTTP chunked upload handler for the LocalUpload flow.
import * as fs from 'fs'
import * as path from 'path'
import { ipcMain, BrowserWindow } from 'electron'

export interface HttpUploadOpts {
  id: string
  src: string             // local file path
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

const inflightUploads = new Map<string, { aborted: boolean }>()

const DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024 // 5 MB
const MAX_RETRIES_PER_CHUNK = 3
const RETRY_DELAY_MS = 1000

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function runHttpUpload(opts: HttpUploadOpts, sender: Electron.WebContents): Promise<HttpUploadResult> {
  const { id, src, apiBase, apiToken, dest, chunkSize: requestedChunkSize } = opts
  const progressChannel = `http-upload:progress:${id}`

  // Validate source file
  let stat: fs.Stats
  try {
    stat = fs.statSync(src)
    if (!stat.isFile()) {
      return { ok: false, error: 'Source is not a file' }
    }
  } catch (e: any) {
    return { ok: false, error: `Cannot access source file: ${e?.message || String(e)}` }
  }

  const fileSize = stat.size
  const filename = path.basename(src)
  const mimeType = guessMimeFromExt(filename)

  const headers = {
    'Authorization': `Bearer ${apiToken}`,
    'Content-Type': 'application/json',
  }

  // 1) Initialize session — file allocated directly at final destination
  let sessionId: string
  let serverChunkSize: number
  let totalChunks: number

  try {
    const initRes = await fetch(`${apiBase}/api/local-upload/init`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        filename,
        fileSize,
        dest,
        chunkSize: requestedChunkSize || DEFAULT_CHUNK_SIZE,
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
  } catch (e: any) {
    return { ok: false, error: `Failed to initialize upload: ${e?.message || String(e)}` }
  }

  // 2) Upload chunks
  const state = inflightUploads.get(id)
  const fd = fs.openSync(src, 'r')
  let bytesTransferred = 0
  let startTime = Date.now()

  try {
    for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
      if (state?.aborted) {
        // Cancel the server session
        try {
          await fetch(`${apiBase}/api/local-upload/${sessionId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${apiToken}` },
          })
        } catch {}
        return { ok: false, error: 'canceled' }
      }

      const start = chunkIdx * serverChunkSize
      const end = Math.min(start + serverChunkSize, fileSize) - 1
      const length = end - start + 1

      // Read chunk from file
      const buffer = Buffer.alloc(length)
      fs.readSync(fd, buffer, 0, length, start)

      // Upload with retries
      let lastErr: string = ''
      let success = false
      for (let attempt = 0; attempt < MAX_RETRIES_PER_CHUNK; attempt++) {
        if (state?.aborted) break

        try {
          const res = await fetch(`${apiBase}/api/local-upload/${sessionId}`, {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${apiToken}`,
              'Content-Type': 'application/octet-stream',
              'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            },
            body: buffer,
          })

          if (res.ok) {
            success = true
            break
          }

          const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
          lastErr = body.error || `HTTP ${res.status}`

          // Don't retry on client errors (except 429)
          if (res.status >= 400 && res.status < 500 && res.status !== 429) {
            break
          }
        } catch (e: any) {
          lastErr = e?.message || String(e)
        }

        if (attempt < MAX_RETRIES_PER_CHUNK - 1) {
          await sleep(RETRY_DELAY_MS * (attempt + 1))
        }
      }

      if (!success) {
        // Cleanup server session
        try {
          await fetch(`${apiBase}/api/local-upload/${sessionId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${apiToken}` },
          })
        } catch {}
        return { ok: false, error: `Chunk ${chunkIdx} failed: ${lastErr}` }
      }

      bytesTransferred += length
      const elapsed = (Date.now() - startTime) / 1000
      const rate = elapsed > 0 ? bytesTransferred / elapsed : 0
      const remaining = fileSize - bytesTransferred
      const etaSec = rate > 0 ? remaining / rate : 0

      const progress: HttpUploadProgress = {
        percent: Math.round((bytesTransferred / fileSize) * 100),
        bytesTransferred,
        totalBytes: fileSize,
        rate: formatRate(rate),
        eta: formatEta(etaSec),
        chunksCompleted: chunkIdx + 1,
        totalChunks,
      }

      sender.send(progressChannel, progress)
    }
  } finally {
    fs.closeSync(fd)
  }

  if (state?.aborted) {
    return { ok: false, error: 'canceled' }
  }

  // 3) Complete / finalize — align ownership, queue server transcodes if needed
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

    // Emit ingest event so the renderer's waitForIngestAndStartTranscode picks it up
    const fileId = completeBody.fileId || opts.fileId
    const assetVersionId = completeBody.assetVersionId || opts.assetVersionId
    if (fileId) {
      sender.send(`upload:ingest:${id}`, {
        ok: true,
        fileId,
        assetVersionId: assetVersionId || null,
        host: new URL(apiBase).hostname,
        apiPort: parseInt(new URL(apiBase).port) || 9095,
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
        mime: mimeType,
        relDir: dest,
      },
      transcodes: completeBody.transcodes,
    }
  } catch (e: any) {
    return { ok: false, error: `Failed to finalize upload: ${e?.message || String(e)}` }
  }
}

function formatRate(bytesPerSec: number): string {
  if (bytesPerSec >= 1024 * 1024 * 1024) return `${(bytesPerSec / (1024 * 1024 * 1024)).toFixed(1)} GB/s`
  if (bytesPerSec >= 1024 * 1024) return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`
  if (bytesPerSec >= 1024) return `${(bytesPerSec / 1024).toFixed(0)} KB/s`
  return `${bytesPerSec.toFixed(0)} B/s`
}

function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return ''
  if (seconds < 60) return `${Math.ceil(seconds)}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.ceil(seconds % 60)}s`
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
}

function guessMimeFromExt(filename: string): string {
  const ext = path.extname(filename).toLowerCase().replace('.', '')
  const map: Record<string, string> = {
    mp4: 'video/mp4', mov: 'video/quicktime', mkv: 'video/x-matroska',
    webm: 'video/webm', avi: 'video/x-msvideo', m4v: 'video/mp4',
    mxf: 'application/mxf', r3d: 'video/x-red-r3d', braw: 'video/x-braw',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', webp: 'image/webp', tiff: 'image/tiff', tif: 'image/tiff',
    mp3: 'audio/mpeg', wav: 'audio/wav', flac: 'audio/flac',
    pdf: 'application/pdf', zip: 'application/zip',
  }
  return map[ext] || 'application/octet-stream'
}

export function registerHttpUploadHandlers() {
  ipcMain.on('http-upload:start', async (event, opts: HttpUploadOpts) => {
    const { id } = opts
    const doneChannel = `http-upload:done:${id}`

    const state = { aborted: false }
    inflightUploads.set(id, state)

    try {
      const result = await runHttpUpload(opts, event.sender)
      event.sender.send(doneChannel, result)
    } catch (e: any) {
      event.sender.send(doneChannel, { ok: false, error: e?.message || 'Upload failed' })
    } finally {
      inflightUploads.delete(id)
    }
  })

  ipcMain.on('http-upload:cancel', (_event, id: string) => {
    const state = inflightUploads.get(id)
    if (state) {
      state.aborted = true
    }
  })
}
