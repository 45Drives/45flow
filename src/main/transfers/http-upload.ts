// src/main/transfers/http-upload.ts
// Desktop host for the shared chunked upload: reads the file from disk and relays progress to the renderer.
import * as fs from 'fs'
import * as path from 'path'
import { ipcMain } from 'electron'
import {
  runChunkedUpload,
  type HttpUploadOpts,
  type HttpUploadResult,
} from '../../shared/chunkedUpload'

export type { HttpUploadOpts, HttpUploadProgress, HttpUploadResult } from '../../shared/chunkedUpload'

const inflightUploads = new Map<string, AbortController>()

async function runHttpUpload(opts: HttpUploadOpts, id: string, signal: AbortSignal, sender: Electron.WebContents): Promise<HttpUploadResult> {
  const { src, apiBase } = opts

  let stat: fs.Stats
  try {
    stat = fs.statSync(src)
    if (!stat.isFile()) {
      return { ok: false, error: 'Source is not a file' }
    }
  } catch (e: any) {
    return { ok: false, error: `Cannot access source file: ${e?.message || String(e)}` }
  }

  const filename = path.basename(src)
  const fd = fs.openSync(src, 'r')
  try {
    return await runChunkedUpload(
      opts,
      {
        name: filename,
        size: stat.size,
        mime: guessMimeFromExt(filename),
        readChunk: (start, end) => {
          const buffer = Buffer.alloc(end - start + 1)
          fs.readSync(fd, buffer, 0, buffer.length, start)
          return buffer
        },
      },
      {
        signal,
        onProgress: progress => sender.send(`http-upload:progress:${id}`, progress),
        // The renderer's waitForIngestAndStartTranscode listens for this event.
        onIngest: ingest => sender.send(`upload:ingest:${id}`, {
          ok: true,
          ...ingest,
          host: new URL(apiBase).hostname,
          apiPort: parseInt(new URL(apiBase).port) || 9095,
        }),
      },
    )
  } finally {
    fs.closeSync(fd)
  }
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
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xls: 'application/vnd.ms-excel',
    ods: 'application/vnd.oasis.opendocument.spreadsheet',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    doc: 'application/msword',
  }
  return map[ext] || 'application/octet-stream'
}

export function registerHttpUploadHandlers() {
  ipcMain.on('http-upload:start', async (event, opts: HttpUploadOpts & { id: string }) => {
    const { id } = opts
    const doneChannel = `http-upload:done:${id}`

    const controller = new AbortController()
    inflightUploads.set(id, controller)

    try {
      const result = await runHttpUpload(opts, id, controller.signal, event.sender)
      event.sender.send(doneChannel, result)
    } catch (e: any) {
      event.sender.send(doneChannel, { ok: false, error: e?.message || 'Upload failed' })
    } finally {
      inflightUploads.delete(id)
    }
  })

  ipcMain.on('http-upload:cancel', (_event, id: string) => {
    inflightUploads.get(id)?.abort()
  })
}
