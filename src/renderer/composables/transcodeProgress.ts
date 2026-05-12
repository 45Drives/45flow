// src/renderer/composables/transcodeProgress.ts
export type ProgressJob = {
    id: number
    kind: string
    status: 'queued' | 'running' | 'done' | 'failed' | 'unknown' | string
    progress: number | null
    eta_seconds?: number | null
    speed_x?: number | null
    error: string | null
    created_at: string | null
    updated_at: string | null
    transcoder?: 'client' | 'server'
    encoder?: string
}

export type ProgressItem = {
    fileId: number
    assetVersionId: number | null
    jobs: ProgressJob[]
    summary: { queued: number; running: number; done: number; failed: number }
}

export type VersionProgressItem = {
    assetVersionId: number
    jobs: ProgressJob[]
    summary: { queued: number; running: number; done: number; failed: number }
}

function summarizeJobs(jobs: ProgressJob[]) {
    let queued = 0
    let running = 0
    let done = 0
    let failed = 0

    for (const j of jobs || []) {
        const st = String(j?.status || '').toLowerCase()
        if (st === 'queued') queued++
        else if (st === 'running') running++
        else if (st === 'done') done++
        else if (st === 'failed' || st === 'error' || st === 'missing_output') failed++
    }

    return { queued, running, done, failed }
}

// Fetch jobs for one version (uses the server route you add in transcodes.js)
export async function fetchProgressForVersion(apiFetch: ApiFetch, assetVersionId: number): Promise<VersionProgressItem> {
    const json = await apiFetch(`/api/transcodes/${encodeURIComponent(String(assetVersionId))}/jobs`, {
        method: 'GET',
        parse: 'json',
        suppressAuthRedirect: true,
    })
    if (!json?.ok) throw new Error(json?.error || 'version progress failed')

    const jobs = (json.jobs || []) as ProgressJob[]
    return {
        assetVersionId: Number(assetVersionId),
        jobs,
        summary: summarizeJobs(jobs),
    }
}

// Fetch versions in a single batch request (avoids N individual HTTP calls)
export async function fetchProgressVersionsBatch(apiFetch: ApiFetch, assetVersionIds: number[]): Promise<VersionProgressItem[]> {
    const ids = Array.from(new Set(assetVersionIds.map(Number).filter(n => Number.isFinite(n) && n > 0)))
    if (!ids.length) return []

    // Try the batch endpoint first; fall back to individual fetches if it 404s
    try {
        const json = await apiFetch('/api/progress/versions/batch', {
            method: 'POST',
            body: JSON.stringify({ assetVersionIds: ids }),
            parse: 'json',
            suppressAuthRedirect: true,
        })
        if (json?.ok && Array.isArray(json.items)) {
            return (json.items as any[]).map(it => ({
                assetVersionId: Number(it.assetVersionId),
                jobs: (it.jobs || []) as ProgressJob[],
                summary: it.summary ?? summarizeJobs(it.jobs || []),
            }))
        }
    } catch {
        // Fallback: server may not have the batch route yet
    }

    return Promise.all(ids.map(vId => fetchProgressForVersion(apiFetch, vId)))
}

type ApiFetch = (path: string, init?: any) => Promise<any>

export async function fetchProgressBatch(apiFetch: ApiFetch, fileIds: number[]): Promise<ProgressItem[]> {
    const json = await apiFetch('/api/progress/files/batch', {
        method: 'POST',
        body: JSON.stringify({ fileIds }),
        parse: 'json',
    })
    if (!json?.ok) throw new Error(json?.error || 'progress batch failed')
    return (json.items || []) as ProgressItem[]
}

export function startProgressPolling(opts: {
    apiFetch: ApiFetch

    // Exactly one of these should be provided
    fileIds?: () => number[]
    assetVersionIds?: () => number[]

    intervalMs?: number

    // onUpdate returns either file-items or version-items
    onUpdate: (items: ProgressItem[] | VersionProgressItem[]) => void
    onError?: (err: unknown) => void
}) {
    const intervalMs = Math.max(500, opts.intervalMs ?? 1500)
    let stopped = false
    let timer: any = null

    async function tick() {
        if (stopped) return
        try {
            if (opts.fileIds) {
                const ids = opts.fileIds()
                if (ids.length) {
                    // console.log('[transcode:poll] fileIds request', ids)
                    const items = await fetchProgressBatch(opts.apiFetch, ids)
                    // console.log('[transcode:poll] fileIds response', items)
                    opts.onUpdate(items)
                } else {
                    opts.onUpdate([])
                }
            } else if (opts.assetVersionIds) {
                const ids = opts.assetVersionIds()
                if (ids.length) {
                    // console.log('[transcode:poll] assetVersionIds request', ids)
                    const items = await fetchProgressVersionsBatch(opts.apiFetch, ids)
                    // console.log('[transcode:poll] assetVersionIds response', items)
                    opts.onUpdate(items)
                } else {
                    opts.onUpdate([])
                }
            } else {
                opts.onUpdate([])
            }
        } catch (e) {
            // console.log('[transcode:poll] error', e)
            opts.onError?.(e)
        } finally {
            if (!stopped) timer = setTimeout(tick, intervalMs)
        }
    }

    tick()

    return () => {
        stopped = true
        if (timer) clearTimeout(timer)
    }
}
