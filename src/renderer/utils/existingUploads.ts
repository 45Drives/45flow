type UploadFile = { name: string; size: number }
type ApiFetch = (path: string, init: { method: string }) => Promise<unknown>

export type ExistingUploadMatch = {
  /** Name the server gives this upload (before any "(1)" collision suffix). */
  serverName: string
  /** A file with that name is already in the destination folder. */
  exists: boolean
  /** Same name and same size: treated as the file that is already there. */
  identical: boolean
}

// Mirrors houston-broadcaster's safeBaseName() plus the lower-cased extension,
// which is how /api/local-upload names the file it saves.
export function serverUploadName(original: string): string {
  const base = String(original || '').split(/[\\/]/).pop() || ''
  const dot = base.lastIndexOf('.')
  const stem = dot > 0 ? base.slice(0, dot) : base
  const ext = dot > 0 ? base.slice(dot).toLowerCase() : ''
  const cleaned = stem
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N} ._()-]+/gu, '_')
    .replace(/\s+/g, ' ')
    .trim()
  return `${cleaned.slice(0, 120) || 'file'}${ext}`
}

function listedFiles(response: unknown): Map<string, number> {
  const out = new Map<string, number>()
  const entries = typeof response === 'object' && response !== null && 'entries' in response
    ? (response as { entries: unknown }).entries
    : null
  if (!Array.isArray(entries)) return out
  for (const raw of entries) {
    if (!raw || typeof raw !== 'object') continue
    const entry = raw as { name?: unknown; size?: unknown; isDir?: unknown }
    if (entry.isDir) continue
    if (typeof entry.name === 'string' && typeof entry.size === 'number' && Number.isFinite(entry.size)) {
      out.set(entry.name, entry.size)
    }
  }
  return out
}

/**
 * Looks at the destination folder before anything is registered, transcoded or uploaded.
 * If the folder can't be read, every file is reported as new so the caller keeps its normal path.
 */
export async function findExistingUploads(
  apiFetch: ApiFetch,
  files: readonly UploadFile[],
  dest: string,
): Promise<ExistingUploadMatch[]> {
  const dir = String(dest || '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '')
  let listed = new Map<string, number>()
  try {
    listed = listedFiles(await apiFetch(`/api/files?dir=${encodeURIComponent(dir || '.')}`, { method: 'GET' }))
  } catch {
    // Treat as "nothing there"; the upload itself still never replaces a server file.
  }
  return files.map(file => {
    const serverName = serverUploadName(file.name)
    const size = listed.get(serverName)
    const exists = size !== undefined
    return { serverName, exists, identical: exists && size === file.size }
  })
}

export type ExistingOutputs = {
  exists: boolean
  /** The server's current version of the file; null when it isn't registered yet. */
  assetVersionId: number | null
  /** Proxy files / stream playlists / watermarked image already made for that version. */
  outputs: string[]
}

type JsonApiFetch = (path: string, init: { method: string; body?: string; headers?: Record<string, string> }) => Promise<unknown>

/**
 * Asks the server which of these share paths already have review outputs (the same check
 * POST /api/magic-link answers with 409 outputs_exist), before anything is uploaded.
 * Returns null when the server can't answer (older servers have no such endpoint).
 */
export async function checkExistingOutputs(
  apiFetch: JsonApiFetch,
  filePaths: readonly string[],
  opts: { proxyQualities: string[]; hls: boolean; watermark: boolean },
): Promise<ExistingOutputs[] | null> {
  try {
    const res = await apiFetch('/api/magic-link/existing-outputs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePaths, ...opts }),
    }) as { ok?: boolean; items?: unknown } | null
    if (!res?.ok || !Array.isArray(res.items) || res.items.length !== filePaths.length) return null
    return res.items.map((raw) => {
      const item = (raw ?? {}) as { exists?: unknown; assetVersionId?: unknown; outputs?: unknown }
      const id = Number(item.assetVersionId)
      return {
        exists: item.exists === true,
        assetVersionId: Number.isFinite(id) && id > 0 ? id : null,
        outputs: Array.isArray(item.outputs) ? item.outputs.filter((o): o is string => typeof o === 'string') : [],
      }
    })
  } catch {
    return null
  }
}
