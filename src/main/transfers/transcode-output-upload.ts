// src/main/transfers/transcode-output-upload.ts
// Upload client-side transcode outputs (HLS segments, proxy MP4s) to the server
// via HTTP.
import * as fs from 'fs'
import * as path from 'path'
import { ipcMain } from 'electron'

export interface TranscodeOutputUploadOpts {
  outputDir: string      // local temp directory with transcode outputs
  targetDir: string      // relative path on server (from transcode-plan, e.g. .45flow/transcodes/31--name)
  apiBase: string        // e.g. http://192.168.123.5:9095
  apiToken: string       // JWT bearer token
  subDir?: string        // optional subdirectory within outputDir to upload (e.g. 'hls')
}

export interface TranscodeOutputUploadResult {
  ok: boolean
  error?: string
  filesUploaded?: number
}

function walkDir(dir: string): string[] {
  const files: string[] = []
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name)
    if (ent.isDirectory()) {
      files.push(...walkDir(full))
    } else if (ent.isFile()) {
      files.push(full)
    }
  }
  return files
}

async function runTranscodeOutputUpload(opts: TranscodeOutputUploadOpts): Promise<TranscodeOutputUploadResult> {
  const { outputDir, targetDir, apiBase, apiToken, subDir } = opts

  const baseDir = subDir ? path.join(outputDir, subDir) : outputDir

  if (!fs.existsSync(baseDir)) {
    return { ok: false, error: `Output directory does not exist: ${baseDir}` }
  }

  const allFiles = walkDir(baseDir)
  if (!allFiles.length) {
    return { ok: false, error: 'No files found in output directory' }
  }

  let uploaded = 0
  for (const filePath of allFiles) {
    // Compute relative path: for subDir='hls', include the subDir prefix
    // e.g. outputDir=/tmp/xyz, subDir='hls', file=/tmp/xyz/hls/v0/seg001.ts
    //   → relPath = 'hls/v0/seg001.ts'
    const relPath = subDir
      ? path.join(subDir, path.relative(baseDir, filePath))
      : path.relative(outputDir, filePath)

    const fileData = fs.readFileSync(filePath)

    try {
      const res = await fetch(`${apiBase}/api/ingest/transcode-upload-file`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(fileData.byteLength),
          'x-target-dir': targetDir,
          'x-rel-path': relPath,
        },
        body: fileData,
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        return { ok: false, error: `Failed to upload ${relPath}: ${body.error || res.status}`, filesUploaded: uploaded }
      }
      uploaded++
    } catch (e: any) {
      return { ok: false, error: `Network error uploading ${relPath}: ${e?.message || String(e)}`, filesUploaded: uploaded }
    }
  }

  return { ok: true, filesUploaded: uploaded }
}

export function registerTranscodeOutputUploadHandlers() {
  ipcMain.handle('transcode-output-upload', async (_event, opts: TranscodeOutputUploadOpts) => {
    return runTranscodeOutputUpload(opts)
  })
}
