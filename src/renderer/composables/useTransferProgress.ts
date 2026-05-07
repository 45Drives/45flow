// src/renderer/composables/useTransferProgress.ts
import { computed, reactive, watch } from 'vue'
import type { ProgressItem, VersionProgressItem } from './transcodeProgress'
import { startProgressPolling } from './transcodeProgress'

type UploadStatus = 'queued' | 'uploading' | 'done' | 'canceled' | 'error'
type TranscodeStatus = 'queued' | 'running' | 'done' | 'failed' | 'unknown'

export type TransferContext = {
    source: 'link' | 'upload'
    groupId?: string          // stable id shared by upload+transcode for same action
    linkUrl?: string
    linkTitle?: string
    destDir?: string          // for uploads
    file?: string             // single file for this specific task (preferred for grouping)
    files?: string[]          // optional; avoid using this for per-file grouping
    proxyQualities?: string[] // requested proxy qualities snapshot for cumulative progress math
}
export type TransferTask =
    | {
        taskId: string
        kind: 'upload'
        title: string
        detail?: string
        status: UploadStatus
        progress: number
        speed?: string | null
        eta?: string | null
        error?: string | null
        startedAt?: number
        completedAt?: number
        cancel?: () => void
        context?: TransferContext
    }
    | {
        taskId: string
        kind: 'transcode'
        title: string
        detail?: string
        status: TranscodeStatus
        progress: number
        speed?: string | null
        eta?: string | null
        error?: string | null

        // exactly one of these should be set
        fileIds?: number[]
        assetVersionIds?: number[]

        // can be either file-based or version-based items
        items?: Array<ProgressItem | VersionProgressItem>

        startedAt?: number
        completedAt?: number
        stop?: () => void
        _apiFetch?: (path: string, init?: any) => Promise<any>
        jobKind?: 'proxy_mp4' | 'hls' | 'any'
        context?: TransferContext
    }

type PlaybackProgressSnapshot = {
    status?: string
    progress?: number | null
    items?: any[]
    qualityOrder?: string[]
    activeQuality?: string
    perQualityProgress?: Record<string, number>
}

function now() {
    return Date.now()
}

function clampPct(n: any) {
    const v = Number(n)
    if (!Number.isFinite(v)) return 0
    return Math.max(0, Math.min(100, v))
}

function normalizeProgressPercent(n: any) {
    const v = Number(n)
    if (!Number.isFinite(v)) return 0
    // Some backends report [0..1], others [0..100]
    const pct = (v > 0 && v <= 1) ? v * 100 : v
    return clampPct(pct)
}

function normalizeEtaSeconds(v: any): number | null {
    const n = Number(v)
    if (!Number.isFinite(n) || n < 0) return null
    return Math.max(0, Math.round(n))
}

function normalizeSpeedX(v: any): number | null {
    const n = Number(v)
    if (!Number.isFinite(n) || n <= 0) return null
    return n
}

function formatEta(seconds: number | null) {
    const sec = normalizeEtaSeconds(seconds)
    if (sec == null) return null
    const h = Math.floor(sec / 3600)
    const m = Math.floor((sec % 3600) / 60)
    const s = sec % 60
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    return `${m}:${String(s).padStart(2, '0')}`
}

function formatSpeed(speedX: number | null) {
    const sx = normalizeSpeedX(speedX)
    if (sx == null) return null
    return `${sx.toFixed(sx >= 10 ? 1 : 2)}x`
}

function estimateEtaFromProgress(progressPct: number, elapsedMs: number): number | null {
    const p = Number(progressPct)
    if (!Number.isFinite(p) || p <= 0 || p >= 100) return null
    const elapsedSec = Math.max(0, Number(elapsedMs) / 1000)
    if (!Number.isFinite(elapsedSec) || elapsedSec <= 0) return null
    const remainSec = elapsedSec * ((100 - p) / p)
    return Number.isFinite(remainSec) && remainSec >= 0 ? Math.round(remainSec) : null
}

function parseMs(v: any): number {
    if (v == null) return 0
    const t = Date.parse(String(v))
    return Number.isFinite(t) ? t : 0
}

function normalizeJobStatus(v: any) {
    return String(v || '').toLowerCase()
}

function isActiveishJobStatus(v: any) {
    const s = normalizeJobStatus(v)
    return s === 'queued' || s === 'running' || s === 'processing' || s === 'pending' || s === 'started'
}

function proxyJobKey(j: any) {
    const q = proxyQualityFromJob(j)
    return q ? `proxy_mp4:${q}` : 'proxy_mp4'
}

function jobLogicalKey(j: any) {
    const kind = String(j?.kind || '').toLowerCase()
    if (!kind) return 'unknown'
    if (isProxyJobKind(kind)) return proxyJobKey(j)
    return kind
}

function latestJobsForSummary(jobs: any[]) {
    const byKey = new Map<string, any>()
    for (const j of Array.isArray(jobs) ? jobs : []) {
        const key = jobLogicalKey(j)
        const prev = byKey.get(key)
        if (!prev) {
            byKey.set(key, j)
            continue
        }

        const prevId = Number(prev?.id)
        const curId = Number(j?.id)
        const prevTs = Math.max(
            parseMs(prev?.updated_at),
            parseMs(prev?.finished_at),
            parseMs(prev?.started_at),
            parseMs(prev?.created_at),
        )
        const curTs = Math.max(
            parseMs(j?.updated_at),
            parseMs(j?.finished_at),
            parseMs(j?.started_at),
            parseMs(j?.created_at),
        )

        if (Number.isFinite(curId) && Number.isFinite(prevId) && curId !== prevId) {
            if (curId > prevId) byKey.set(key, j)
            continue
        }
        if (curTs !== prevTs) {
            if (curTs > prevTs) byKey.set(key, j)
            continue
        }
        if (isActiveishJobStatus(j?.status) && !isActiveishJobStatus(prev?.status)) {
            byKey.set(key, j)
            continue
        }
    }
    return Array.from(byKey.values())
}

function collectMetricsFromJobs(
    jobs: any[],
    wantedKind: 'proxy_mp4' | 'hls' | 'any' = 'any'
) {
    const relevant = latestJobsForSummary(jobs).filter((j) => kindMatchesForSummary(j?.kind, wantedKind))
    if (!relevant.length) return { etaSeconds: null as number | null, speedX: null as number | null }

    const running = relevant.filter((j) => normalizeJobStatus(j?.status) === 'running')
    const pool = running.length ? running : relevant

    const etaVals = pool
        .map((j) => normalizeEtaSeconds(j?.eta_seconds))
        .filter((n): n is number => Number.isFinite(n as number))
    const speedVals = pool
        .map((j) => normalizeSpeedX(j?.speed_x))
        .filter((n): n is number => Number.isFinite(n as number))

    const etaSeconds = etaVals.length ? Math.max(...etaVals) : null
    const speedX = speedVals.length
        ? (speedVals.reduce((a, b) => a + b, 0) / speedVals.length)
        : null

    return { etaSeconds, speedX }
}

function hasRunningJobForKind(jobs: any[], wantedKind: 'proxy_mp4' | 'hls' | 'any' = 'any') {
    const relevant = latestJobsForSummary(jobs).filter((j) => kindMatchesForSummary(j?.kind, wantedKind))
    return relevant.some((j) => normalizeJobStatus(j?.status) === 'running')
}

function pickMetricsFromItems(
    items: Array<ProgressItem | VersionProgressItem>,
    wantedKind: 'proxy_mp4' | 'hls' | 'any' = 'any'
) {
    let fallback: { etaSeconds: number | null; speedX: number | null } | null = null
    for (const it of items || []) {
        const jobs = (it as any)?.jobs || []
        const m = collectMetricsFromJobs(jobs, wantedKind)
        if (m.etaSeconds == null && m.speedX == null) continue
        if (hasRunningJobForKind(jobs, wantedKind)) return m
        if (!fallback) fallback = m
    }
    return fallback || { etaSeconds: null, speedX: null }
}

function makeId(prefix: string) {
    return `${prefix}_${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}`
}

function extractTranscodeError(
    items: Array<ProgressItem | VersionProgressItem>,
    jobKind: 'proxy_mp4' | 'hls' | 'any' = 'any'
) {
    for (const it of items || []) {
        const jobs = latestJobsForSummary((it as any)?.jobs || [])
        for (const j of jobs) {
            if (!kindMatchesForSummary(j?.kind, jobKind)) continue
            const st = String(j?.status || '').toLowerCase()
            if (st !== 'failed' && st !== 'error' && st !== 'missing_output') continue
            const msg = String(j?.error || '').trim()
            if (msg) return msg
            const kind = String(j?.kind || '').trim() || 'transcode'
            return `${kind} failed`
        }
    }
    return null
}

function qualityLabel(q: string) {
    const s = String(q || '').trim().toLowerCase()
    if (!s) return ''
    if (s === 'original') return 'Full Res'
    return s
}

function proxyDetailFromProgress(progress: number, qualities?: string[]) {
    const list = normalizeQualityList(qualities)
    if (!list.length) return 'Tracking review copy'
    const chunk = 100 / list.length
    const p = clampPct(progress)
    const idx = Math.min(list.length - 1, Math.floor(p / chunk))
    const current = qualityLabel(list[idx])
    return current ? `Tracking review copy (${current})` : 'Tracking review copy'
}

function proxyDetailFromActiveQuality(activeQuality?: string, progress?: number, qualities?: string[]) {
    const q = qualityLabel(activeQuality || '')
    if (q) return `Tracking review copy (${q})`
    return proxyDetailFromProgress(progress ?? 0, qualities)
}

function proxyActiveQualityProgress(activeQuality: any, perQualityProgress: any): number | null {
    const key = String(activeQuality || '').trim().toLowerCase()
    if (!key || !perQualityProgress || typeof perQualityProgress !== 'object') return null
    const raw = (perQualityProgress as any)[key]
    const pct = normalizeProgressPercent(raw)
    if (!Number.isFinite(pct)) return null
    return pct
}

const proxyQualityOrder = ['720p', '1080p', 'original'] as const

function normalizeQualityList(list: unknown): string[] {
    const seen = new Set<string>()
    const out: string[] = []
    for (const raw of Array.isArray(list) ? list : []) {
        const q = String(raw || '').trim().toLowerCase()
        if (!q || seen.has(q)) continue
        seen.add(q)
        out.push(q)
    }
    out.sort((a, b) => {
        const ia = proxyQualityOrder.indexOf(a as any)
        const ib = proxyQualityOrder.indexOf(b as any)
        const sa = ia === -1 ? Number.MAX_SAFE_INTEGER : ia
        const sb = ib === -1 ? Number.MAX_SAFE_INTEGER : ib
        if (sa !== sb) return sa - sb
        return a.localeCompare(b)
    })
    return out
}

function isProxyJobKind(kind: unknown) {
    const k = String(kind || '').toLowerCase()
    return k === 'proxy_mp4' || k.startsWith('proxy_mp4:')
}

function isTerminalTranscodeStatus(status: TranscodeStatus) {
    return status === 'done' || status === 'failed'
}

function isAuthPollingError(err: any) {
    const s = Number(err?.status)
    return s === 401 || s === 403 || s === 428
}

function kindMatchesForSummary(kind: unknown, wanted: 'proxy_mp4' | 'hls' | 'any') {
    if (wanted === 'any') return true
    const k = String(kind || '').toLowerCase()
    if (wanted === 'proxy_mp4') return isProxyJobKind(k)
    return k === wanted
}

function proxyQualityFromJob(j: any): string | null {
    const rawQuality = j?.quality
        ?? j?.proxyQuality
        ?? j?.targetQuality
        ?? j?.outputQuality
        ?? j?.meta?.quality
        ?? j?.metadata?.quality
        ?? j?.payload?.quality
        ?? j?.params?.quality
        ?? j?.options?.quality
        ?? j?.job_data?.quality

    const direct = String(rawQuality || '').trim().toLowerCase()
    if (direct) return direct

    const kind = String(j?.kind || '').toLowerCase()
    const m = kind.match(/^proxy_mp4[:_/-]([a-z0-9]+p?|original)$/i)
    if (m?.[1]) return String(m[1]).toLowerCase()

    return null
}

function proxyJobProgress(j: any) {
    const st = String(j?.status || '').toLowerCase()
    if (st === 'done') return 100
    return normalizeProgressPercent(j?.progress)
}

function summarizeProxyCumulativeProgress(jobs: any[], expectedQualities?: string[]) {
    const proxyJobs = latestJobsForSummary(jobs || []).filter(j => isProxyJobKind(j?.kind))
    if (!proxyJobs.length) return null

    const expected = normalizeQualityList(expectedQualities)
    const found = normalizeQualityList(proxyJobs.map(proxyQualityFromJob).filter(Boolean))
    const qualities = expected.length ? expected : found

    // If the backend doesn't expose quality labels yet, fall back to previous behavior.
    if (!qualities.length) {
        const ps = proxyJobs
            .map(proxyJobProgress)
            .filter((n: number) => Number.isFinite(n))
        if (!ps.length) return 0
        return clampPct(ps.reduce((a: number, b: number) => a + b, 0) / ps.length)
    }

    const byQuality = new Map<string, number>()
    for (const q of qualities) byQuality.set(q, 0)
    let matchedQualityJobs = 0

    for (const j of proxyJobs) {
        const q = proxyQualityFromJob(j)
        if (!q || !byQuality.has(q)) continue
        const next = proxyJobProgress(j)
        byQuality.set(q, next)
        matchedQualityJobs++
    }

    // Backend may emit one unlabeled proxy job whose progress is already cumulative.
    if (matchedQualityJobs === 0) {
        const ps = proxyJobs
            .map(proxyJobProgress)
            .filter((n: number) => Number.isFinite(n))
        if (!ps.length) return 0
        return clampPct(ps.reduce((a: number, b: number) => a + b, 0) / ps.length)
    }

    let sum = 0
    for (const q of qualities) sum += byQuality.get(q) || 0
    return clampPct(sum / qualities.length)
}

const _state = reactive({
    open: false,
    minimized: false,
    tasks: [] as TransferTask[],
    suppressAutoOpen: false,
})

function upsertTask(task: TransferTask) {
    const idx = _state.tasks.findIndex(t => t.taskId === task.taskId)
    if (idx === -1) _state.tasks.unshift(task)
    else _state.tasks[idx] = task
}

function isActiveTask(t: TransferTask) {
    if (t.kind === 'upload') return t.status === 'uploading' || t.status === 'queued'
    return t.status === 'queued' || t.status === 'running' || t.status === 'unknown'
}

function isFinishedTask(t: TransferTask) {
    if (t.kind === 'upload') return t.status === 'done' || t.status === 'canceled' || t.status === 'error'
    return t.status === 'done' || t.status === 'failed'
}

function jobKindMatches(taskKind?: 'proxy_mp4' | 'hls' | 'any', want?: 'proxy_mp4' | 'hls' | 'any') {
    if (!want || want === 'any') return true
    if (!taskKind || taskKind === 'any') return true
    return taskKind === want
}

function taskHasFile(t: Extract<TransferTask, { kind: 'transcode' }>, file: string) {
    const ctx = t.context
    if (!ctx) return false
    if (ctx.file && ctx.file === file) return true
    if (Array.isArray(ctx.files) && ctx.files.includes(file)) return true
    return false
}

function hasActiveTranscode(opts: {
    assetVersionIds?: number[]
    file?: string
    jobKind?: 'proxy_mp4' | 'hls' | 'any'
}) {
    const ids = Array.from(new Set((opts.assetVersionIds || [])
        .map(n => Number(n))
        .filter(n => Number.isFinite(n) && n > 0)))

    const file = (opts.file || '').trim()

    if (!ids.length && !file) return false

    return _state.tasks.some(t => {
        if (t.kind !== 'transcode') return false
        if (!isActiveTask(t)) return false
        if (!jobKindMatches(t.jobKind, opts.jobKind)) return false

        if (ids.length) {
            const taskIds = t.assetVersionIds || []
            if (ids.some(id => taskIds.includes(id))) return true
        }

        if (file && taskHasFile(t, file)) return true

        return false
    })
}

function hasActiveTranscodeForFile(file: string, jobKind?: 'proxy_mp4' | 'hls' | 'any') {
    if (!file) return false
    return hasActiveTranscode({ file, jobKind })
}

function hasActiveTranscodeForFileId(fileId: number, jobKind?: 'proxy_mp4' | 'hls' | 'any') {
    const fid = Number(fileId)
    if (!Number.isFinite(fid) || fid <= 0) return false
    return _state.tasks.some(t => {
        if (t.kind !== 'transcode') return false
        if (!isActiveTask(t)) return false
        if (!jobKindMatches(t.jobKind, jobKind)) return false
        const ids = (t.fileIds || []).map(Number)
        return ids.includes(fid)
    })
}

function findActiveTranscodeTaskByIds(opts: {
    mode: 'file' | 'version'
    ids: number[]
    jobKind?: 'proxy_mp4' | 'hls' | 'any'
}) {
    const ids = Array.from(new Set((opts.ids || [])
        .map(n => Number(n))
        .filter(n => Number.isFinite(n) && n > 0)))
    if (!ids.length) return null

    for (const t of _state.tasks) {
        if (t.kind !== 'transcode') continue
        if (!isActiveTask(t)) continue
        if (!jobKindMatches(t.jobKind, opts.jobKind)) continue

        const taskIds = (opts.mode === 'version'
            ? (t.assetVersionIds || [])
            : (t.fileIds || [])
        ).map(Number)

        if (ids.some(id => taskIds.includes(id))) return t
    }
    return null
}

function splitActiveTranscodeAssetVersions(assetVersionIds: number[], jobKind?: 'proxy_mp4' | 'hls' | 'any') {
    const ids = Array.from(new Set((assetVersionIds || [])
        .map(n => Number(n))
        .filter(n => Number.isFinite(n) && n > 0)))

    const active: number[] = []
    const inactive: number[] = []

    for (const id of ids) {
        if (hasActiveTranscode({ assetVersionIds: [id], jobKind })) active.push(id)
        else inactive.push(id)
    }

    return { active, inactive }
}

function removeTask(taskId: string) {
    _state.tasks = _state.tasks.filter(t => t.taskId !== taskId)
}

function clearFinished() {
    _state.tasks = _state.tasks.filter(t => !isFinishedTask(t))
}

export function useTransferProgress() {
    const hasActive = computed(() =>
        _state.tasks.some(t => isActiveTask(t))
    )

    const activeCount = computed(() =>
        _state.tasks.filter(t => isActiveTask(t)).length
    )

    // Auto-open drawer when transfers start
    watch(
        () => hasActive.value,
        (active, wasActive) => {
            // rising edge: inactive -> active
            if (active && !wasActive && !_state.suppressAutoOpen) {
                _state.open = true
            }
            if (!active) {
                // Keep the drawer open if there are finished/failed tasks to review.
                if (_state.tasks.length === 0) _state.open = false
            }
        }
    )


    function toggleMinimize() {
        _state.minimized = !_state.minimized
    }

    function setOpen(v: boolean) {
        _state.open = v
    }

    function createUploadTask(opts: {
        title: string
        detail?: string
        cancel?: () => void
        context?: TransferContext
    }) {
        const taskId = makeId('upl')
        const t: TransferTask = {
            taskId,
            kind: 'upload',
            title: opts.title,
            detail: opts.detail?.trim(),
            status: 'queued',
            progress: 0,
            speed: null,
            eta: null,
            error: null,
            startedAt: now(),
            cancel: opts.cancel,
            context: opts.context,
        }
        upsertTask(t)
        return taskId
    }

    function updateUpload(
        taskId: string,
        patch: Partial<Extract<TransferTask, { kind: 'upload' }>>
    ) {
        const t = _state.tasks.find(x => x.taskId === taskId && x.kind === 'upload') as
            | Extract<TransferTask, { kind: 'upload' }>
            | undefined
        if (!t) return

        const nextStatus = patch.status
        if (t.status === 'canceled' && nextStatus && nextStatus !== 'canceled') return
        if ((t.status === 'done' || t.status === 'error') && (nextStatus === 'queued' || nextStatus === 'uploading')) return

        if (typeof patch.detail === 'string') patch.detail = patch.detail.trim()
        Object.assign(t, patch)
        if (typeof patch.progress !== 'undefined') t.progress = clampPct(patch.progress)
    }

    function finishUpload(taskId: string, ok: boolean, err?: string) {
        const t = _state.tasks.find(x => x.taskId === taskId && x.kind === 'upload') as
            | Extract<TransferTask, { kind: 'upload' }>
            | undefined
        if (!t) return
        if (t.status === 'canceled') {
            updateUpload(taskId, { status: 'canceled', completedAt: t.completedAt ?? now() })
            return
        }

        if (ok) {
            updateUpload(taskId, { status: 'done', progress: 100, completedAt: now(), error: null })
        } else {
            updateUpload(taskId, { status: 'error', completedAt: now(), error: err || 'upload failed' })
        }
    }

    function cancelUpload(taskId: string) {
        const t = _state.tasks.find(x => x.taskId === taskId && x.kind === 'upload') as
            | Extract<TransferTask, { kind: 'upload' }>
            | undefined
        if (!t) return
        try {
            t.cancel?.()
        } catch { }
        updateUpload(taskId, { status: 'canceled', completedAt: now(), speed: null, eta: null })
    }

    async function cancelTranscode(taskId: string) {
        const t = _state.tasks.find(x => x.taskId === taskId && x.kind === 'transcode') as
            | Extract<TransferTask, { kind: 'transcode' }>
            | undefined
        if (!t) return

        // Stop polling first
        try { t.stop?.() } catch { }

        // Cancel on the server for each tracked asset version
        const apiFetch = t._apiFetch
        if (apiFetch) {
            const versionIds = t.assetVersionIds || []
            for (const vId of versionIds) {
                const kinds = t.jobKind === 'any' ? ['proxy_mp4', 'hls'] : [t.jobKind || 'proxy_mp4']
                for (const kind of kinds) {
                    try {
                        await apiFetch(`/api/transcodes/${vId}/${kind}`, { method: 'DELETE' })
                    } catch (e) {
                        console.warn(`[cancelTranscode] failed to cancel ${vId}/${kind}:`, e)
                    }
                }
            }
        }

        t.status = 'failed'
        t.error = 'Canceled'
        t.speed = null
        t.eta = null
        t.completedAt = now()
    }

    // Aggregate transcode progress from items:
    // - if any failed => failed
    // - else if any running/queued => running
    // - else => done
    function summarize(items: ProgressItem[]) {
        let failed = 0
        let running = 0
        let queued = 0
        let done = 0

        let sumPct = 0
        let pctCount = 0

        for (const it of items) {
            failed += it.summary.failed || 0
            running += it.summary.running || 0
            queued += it.summary.queued || 0
            done += it.summary.done || 0

            // best-effort per-item %: average job.progress where present
            const ps = (it.jobs || [])
                .map(j => (typeof j.progress === 'number' ? normalizeProgressPercent(j.progress) : null))
                .filter((n): n is number => typeof n === 'number' && Number.isFinite(n))

            if (ps.length) {
                const avg = ps.reduce((a, b) => a + b, 0) / ps.length
                sumPct += avg
                pctCount++
            }

        }

        const progress = pctCount ? clampPct(sumPct / pctCount) : (done > 0 && running === 0 && queued === 0 && failed === 0 ? 100 : 0)

        let status: TranscodeStatus = 'unknown'
        if (failed > 0) status = 'failed'
        else if (running > 0) status = 'running'
        else if (queued > 0) status = 'queued'
        else if (done > 0) status = 'done'

        const m = pickMetricsFromItems(items as Array<ProgressItem | VersionProgressItem>, 'any')
        const etaSeconds = m.etaSeconds
        const speedX = m.speedX

        return { status, progress, etaSeconds, speedX, counts: { failed, running, queued, done } }
    }

    function summarizeVersions(
        items: VersionProgressItem[],
        jobKind: 'proxy_mp4' | 'hls' | 'any' = 'any',
        context?: TransferContext
    ) {
        let failed = 0
        let running = 0
        let queued = 0
        let done = 0

        let sumPct = 0
        let pctCount = 0

        for (const it of items) {
            // status counts should also respect kind if you want the label to match
            const jobs = latestJobsForSummary(it.jobs || []).filter(j => {
                return kindMatchesForSummary(j?.kind, jobKind)
            })

            for (const j of jobs) {
                const st = String(j?.status || '').toLowerCase()
                if (st === 'failed' || st === 'error' || st === 'missing_output') failed++
                else if (st === 'running') running++
                else if (st === 'queued') queued++
                else if (st === 'done') done++

                if (jobKind !== 'proxy_mp4') {
                    sumPct += normalizeProgressPercent(j?.progress)
                    pctCount++
                }
            }

            if (jobKind === 'proxy_mp4') {
                const cumulative = summarizeProxyCumulativeProgress(it.jobs || [], context?.proxyQualities)
                if (typeof cumulative === 'number') {
                    sumPct += cumulative
                    pctCount++
                }
                // console.log('[transcode:proxy:summarize:item]', {
                //     assetVersionId: (it as any)?.assetVersionId,
                //     requestedQualities: context?.proxyQualities || [],
                //     allKinds: (it.jobs || []).map((j: any) => String(j?.kind || '')),
                //     filteredKinds: jobs.map((j: any) => String(j?.kind || '')),
                //     filteredStatuses: jobs.map((j: any) => String(j?.status || '')),
                //     filteredProgress: jobs.map((j: any) => j?.progress),
                //     filteredProgressPct: jobs.map((j: any) => normalizeProgressPercent(j?.progress)),
                //     cumulative,
                // })
            } else if (jobKind === 'hls') {
                // console.log('[transcode:hls:summarize:item]', {
                //     assetVersionId: (it as any)?.assetVersionId,
                //     allKinds: (it.jobs || []).map((j: any) => String(j?.kind || '')),
                //     filteredKinds: jobs.map((j: any) => String(j?.kind || '')),
                //     filteredStatuses: jobs.map((j: any) => String(j?.status || '')),
                //     filteredProgress: jobs.map((j: any) => j?.progress),
                //     filteredProgressPct: jobs.map((j: any) => normalizeProgressPercent(j?.progress)),
                // })
            }
        }

        const progress = (jobKind === 'proxy_mp4' && pctCount)
            ? clampPct(sumPct / pctCount)
            : pctCount
            ? clampPct(sumPct / pctCount)
            : (done > 0 && running === 0 && queued === 0 && failed === 0 ? 100 : 0)

        let status: TranscodeStatus = 'unknown'
        if (failed > 0) status = 'failed'
        else if (running > 0) status = 'running'
        else if (queued > 0) status = 'queued'
        else if (done > 0) status = 'done'

        if (jobKind === 'proxy_mp4' || jobKind === 'hls') {
            // console.log('[transcode:summarize:result]', {
            //     jobKind,
            //     status,
            //     progress,
            //     counts: { failed, running, queued, done },
            //     items: items.length,
            // })
        }

        const m = pickMetricsFromItems(items as Array<ProgressItem | VersionProgressItem>, jobKind)
        const etaSeconds = m.etaSeconds
        const speedX = m.speedX

        return { status, progress, etaSeconds, speedX, counts: { failed, running, queued, done } }
    }
    

    function startTranscodeTaskBase<TItem extends ProgressItem | VersionProgressItem>(opts: {
        apiFetch: (path: string, init?: any) => Promise<any>
        ids: number[]
        title: string
        detail?: string
        intervalMs?: number
        jobKind?: 'proxy_mp4' | 'hls' | 'any'
        context?: TransferContext
        mode: 'file' | 'version'
        summarizeItems: (
            items: TItem[],
            task: Extract<TransferTask, { kind: 'transcode' }>
        ) => { status: TranscodeStatus; progress: number; etaSeconds?: number | null; speedX?: number | null }
        initialItems: TItem[]
    }) {
        const normalizedIds = Array.from(new Set((opts.ids || [])
            .map(n => Number(n))
            .filter(n => Number.isFinite(n) && n > 0)))

        const idsToTrack = opts.mode === 'version'
            ? normalizedIds.filter(id => !hasActiveTranscode({ assetVersionIds: [id], jobKind: opts.jobKind }))
            : normalizedIds.filter(id => !hasActiveTranscodeForFileId(id, opts.jobKind))

        if (!idsToTrack.length) {
            const existing = findActiveTranscodeTaskByIds({
                mode: opts.mode,
                ids: normalizedIds,
                jobKind: opts.jobKind,
            })
            return existing?.taskId || ''
        }

        const taskId = makeId(opts.mode === 'version' ? 'trnV' : 'trn')
        const t: TransferTask = {
            taskId,
            kind: 'transcode',
            title: opts.title,
            detail: opts.detail,
            status: 'queued',
            progress: 0,
            speed: null,
            eta: null,
            error: null,
            ...(opts.mode === 'version' ? { assetVersionIds: idsToTrack.slice() } : { fileIds: idsToTrack.slice() }),
            items: opts.initialItems,
            startedAt: now(),
            stop: undefined,
            _apiFetch: opts.apiFetch,
            jobKind: opts.jobKind ?? 'any',
            context: opts.context,
        }
        upsertTask(t)

        let stopPolling: (() => void) | null = null
        const stop = startProgressPolling({
            apiFetch: opts.apiFetch,
            ...(opts.mode === 'version'
                ? { assetVersionIds: () => idsToTrack }
                : { fileIds: () => idsToTrack }),
            intervalMs: opts.intervalMs ?? 1500,
            onUpdate: (items) => {
                const cur = _state.tasks.find(x => x.taskId === taskId && x.kind === 'transcode') as
                    | Extract<TransferTask, { kind: 'transcode' }>
                    | undefined
                if (!cur) return

                const castItems = (items || []) as TItem[]
                cur.items = castItems as any

                const hasAllTrackedItems = (() => {
                    if (!idsToTrack.length) return false
                    const seen = new Set<number>()
                    for (const it of castItems) {
                        const rawId = opts.mode === 'version'
                            ? (it as any)?.assetVersionId
                            : (it as any)?.fileId
                        const id = Number(rawId)
                        if (Number.isFinite(id) && id > 0) seen.add(id)
                    }
                    return idsToTrack.every(id => seen.has(id))
                })()

                const s = opts.summarizeItems(castItems, cur)
                const rawNextStatus = (isTerminalTranscodeStatus(s.status) && !hasAllTrackedItems)
                    ? 'running'
                    : s.status

                // When no matching jobs exist yet (server hasn't processed the ingest),
                // show 'queued' instead of 'unknown' — the task is waiting for work, not broken.
                const noMatchingJobs = !castItems.length || castItems.every(it => {
                    const jobs = latestJobsForSummary((it as any)?.jobs || [])
                    return !jobs.some(j => kindMatchesForSummary(j?.kind, cur.jobKind ?? 'any'))
                })
                const nextStatus = (rawNextStatus === 'unknown' && noMatchingJobs)
                    ? 'queued' as TranscodeStatus
                    : rawNextStatus

                cur.status = nextStatus
                const prevProgress = clampPct(cur.progress)
                let nextProgress = clampPct(s.progress)
                if (nextStatus === 'running') {
                    if (nextProgress >= 100) {
                        // Ignore stale "100 while still running" snapshots and keep prior progress.
                        // If we have no prior progress yet, start from 0 instead of showing a fake near-complete state.
                        nextProgress = (prevProgress > 0 && prevProgress < 100) ? prevProgress : 0
                    }
                }
                if (nextStatus === 'done') nextProgress = 100
                if (nextStatus === 'queued') nextProgress = 0
                cur.progress = nextProgress
                cur.speed = (nextStatus === 'running') ? formatSpeed(s.speedX ?? null) : null
                const serverEta = formatEta(s.etaSeconds ?? null)
                const elapsedMs = Math.max(0, now() - Number(cur.startedAt || now()))
                const localEta = formatEta(estimateEtaFromProgress(cur.progress, elapsedMs))
                cur.eta = (nextStatus === 'running') ? (serverEta || localEta) : null
                if (nextStatus === 'failed') {
                    cur.error = extractTranscodeError(castItems as Array<ProgressItem | VersionProgressItem>, cur.jobKind ?? 'any')
                    cur.speed = null
                    cur.eta = null
                    // Log to app file only once per failure (not on every poll tick)
                    if (!(cur as any)._failureLogged) {
                        (cur as any)._failureLogged = true
                        window.appLog?.error('transcode.failed', {
                            taskId: cur.taskId,
                            title: cur.title,
                            jobKind: cur.jobKind ?? 'any',
                            error: cur.error,
                            context: cur.context,
                        })
                    }
                } else if (nextStatus === 'running' || nextStatus === 'done') {
                    cur.error = null
                    if (nextStatus === 'done') {
                        cur.speed = null
                        cur.eta = null
                    }
                }
                if ((cur.jobKind ?? 'any') === 'proxy_mp4') {
                    cur.detail = proxyDetailFromProgress(cur.progress, cur.context?.proxyQualities)
                }

                if (nextStatus === 'done' || nextStatus === 'failed') {
                    cur.completedAt = now()
                    try { cur.stop?.() } catch { }
                }
            },
            onError: (e) => {
                const cur = _state.tasks.find(x => x.taskId === taskId && x.kind === 'transcode') as
                    | Extract<TransferTask, { kind: 'transcode' }>
                    | undefined
                if (!cur) return
                if (isAuthPollingError(e)) {
                    cur.status = 'failed'
                    cur.error = (e as any)?.message || 'Unauthorized'
                    cur.speed = null
                    cur.eta = null
                    cur.completedAt = now()
                    try { stopPolling?.() } catch { }
                    return
                }
                cur.status = 'unknown'
                cur.error = (e as any)?.message || String(e)
                cur.speed = null
                cur.eta = null
            },
        })
        stopPolling = stop

        ; (t as any).stop = stop
        return taskId
    }

    function startAssetVersionTranscodeTask(opts: {
        apiFetch: (path: string, init?: any) => Promise<any>
        assetVersionIds: number[]
        title: string
        detail?: string
        intervalMs?: number
        jobKind?: 'proxy_mp4' | 'hls' | 'any'
        context?: TransferContext
    }) {
        return startTranscodeTaskBase<VersionProgressItem>({
            apiFetch: opts.apiFetch,
            ids: opts.assetVersionIds,
            title: opts.title,
            detail: opts.detail,
            intervalMs: opts.intervalMs,
            jobKind: opts.jobKind,
            context: opts.context,
            mode: 'version',
            summarizeItems: (items, task) => summarizeVersions(items, task.jobKind ?? 'any', task.context),
            initialItems: [] as VersionProgressItem[],
        })
    }

    function startPlaybackTranscodeTask(opts: {
        title: string
        detail?: string
        intervalMs?: number
        jobKind?: 'proxy_mp4' | 'hls' | 'any'
        context?: TransferContext
        fetchSnapshot: () => Promise<PlaybackProgressSnapshot | null>
    }) {
        // Dedup: skip if an active transcode task already exists for this file+jobKind
        const file = opts.context?.file || ''
        const jobKind = opts.jobKind ?? 'any'
        if (file) {
            const alreadyActive = _state.tasks.some(t => {
                if (t.kind !== 'transcode') return false
                if (!isActiveTask(t)) return false
                if (!jobKindMatches(t.jobKind, jobKind)) return false
                if (taskHasFile(t, file)) return true
                return false
            })
            if (alreadyActive) return null
        }

        const taskId = makeId('trnP')
        const t: TransferTask = {
            taskId,
            kind: 'transcode',
            title: opts.title,
            detail: opts.detail,
            status: 'queued',
            progress: 0,
            speed: null,
            eta: null,
            error: null,
            items: [],
            startedAt: now(),
            stop: undefined,
            jobKind: opts.jobKind ?? 'any',
            context: opts.context,
        }
        upsertTask(t)

        let stopped = false
        let timer: any = null
        const intervalMs = Math.max(500, opts.intervalMs ?? 1500)

        const normalizePlaybackStatus = (v: any): TranscodeStatus => {
            const s = String(v || '').toLowerCase()
            if (s === 'done' || s === 'completed' || s === 'success' || s === 'ready') return 'done'
            if (s === 'failed' || s === 'error' || s === 'missing_output') return 'failed'
            if (s === 'queued' || s === 'pending') return 'queued'
            if (s === 'running' || s === 'processing' || s === 'started') return 'running'
            return 'unknown'
        }

        const tick = async () => {
            if (stopped) return
            try {
                const cur = _state.tasks.find(x => x.taskId === taskId && x.kind === 'transcode') as
                    | Extract<TransferTask, { kind: 'transcode' }>
                    | undefined
                if (!cur) return

                const snap = await opts.fetchSnapshot()
                if (!snap) {
                    cur.status = 'unknown'
                    cur.error = 'no playback snapshot'
                    return
                }

                cur.items = Array.isArray(snap.items) ? (snap.items as any) : cur.items
                cur.status = normalizePlaybackStatus(snap.status)
                cur.progress = normalizeProgressPercent(snap.progress)

                // ETA & speed from server snapshot
                if (cur.status === 'running') {
                    const serverEta = formatEta((snap as any)?.etaSeconds ?? null)
                    const elapsedMs = Math.max(0, now() - Number(cur.startedAt || now()))
                    const localEta = formatEta(estimateEtaFromProgress(cur.progress, elapsedMs))
                    cur.eta = serverEta || localEta
                    cur.speed = formatSpeed((snap as any)?.speedX ?? null)
                } else {
                    cur.eta = null
                    cur.speed = null
                }

                if (cur.status === 'failed') {
                    const snapError = String((snap as any)?.error || '').trim()
                    cur.error = snapError || cur.error || 'Transcode failed — check server logs or try disabling client-side transcoding'
                } else if (cur.status === 'running' || cur.status === 'done') {
                    cur.error = null
                }
                if ((cur.jobKind ?? 'any') === 'proxy_mp4') {
                    const perQ = snap.perQualityProgress
                    if (perQ && typeof perQ === 'object') {
                        const qualityOrder = normalizeQualityList(
                            (Array.isArray(snap.qualityOrder) && snap.qualityOrder.length)
                                ? snap.qualityOrder
                                : Object.keys(perQ)
                        )
                        if (qualityOrder.length) {
                            if (!cur.context) cur.context = { source: 'link' }
                            cur.context.proxyQualities = qualityOrder
                        }
                        const jobs = qualityOrder.map((q) => {
                            const pct = normalizeProgressPercent(perQ[q])
                            return {
                                kind: `proxy_mp4:${q}`,
                                status: pct >= 100 ? 'done' : String(snap.status || 'running'),
                                progress: pct,
                                quality: q,
                            }
                        })
                        cur.items = [{ assetVersionId: 0, jobs, summary: { queued: 0, running: 1, done: 0, failed: 0 } }] as any
                    }
                    const activePct = proxyActiveQualityProgress(snap.activeQuality, perQ)
                    if (typeof activePct === 'number') {
                        // Keep bar/percentage aligned with "Tracking proxy (<quality>)" label.
                        cur.progress = activePct
                    }
                    cur.detail = proxyDetailFromActiveQuality(snap.activeQuality, cur.progress, cur.context?.proxyQualities)
                }

                if (cur.status === 'done' || cur.status === 'failed') {
                    cur.completedAt = now()
                    stopped = true
                    if (timer) clearTimeout(timer)
                    return
                }
            } catch (e: any) {
                const cur = _state.tasks.find(x => x.taskId === taskId && x.kind === 'transcode') as
                    | Extract<TransferTask, { kind: 'transcode' }>
                    | undefined
                if (cur) {
                    if (isAuthPollingError(e)) {
                        cur.status = 'failed'
                        cur.error = e?.message || 'Unauthorized'
                        cur.completedAt = now()
                        stopped = true
                        if (timer) clearTimeout(timer)
                        return
                    }
                    cur.status = 'unknown'
                    cur.error = e?.message || String(e)
                }
            } finally {
                if (!stopped) timer = setTimeout(tick, intervalMs)
            }
        }

        const stop = () => {
            stopped = true
            if (timer) clearTimeout(timer)
        }
        ;(t as any).stop = stop
        tick()
        return taskId
    }

    function startTranscodeTask(opts: {
        apiFetch: (path: string, init?: any) => Promise<any>
        fileIds: number[]
        title: string
        detail?: string
        intervalMs?: number
        jobKind?: 'proxy_mp4' | 'hls' | 'any'
        context?: TransferContext
    }) {
        return startTranscodeTaskBase<ProgressItem>({
            apiFetch: opts.apiFetch,
            ids: opts.fileIds,
            title: opts.title,
            detail: opts.detail,
            intervalMs: opts.intervalMs,
            jobKind: opts.jobKind,
            context: opts.context,
            mode: 'file',
            summarizeItems: (items) => summarize(items),
            initialItems: [] as ProgressItem[],
        })
    }

    /**
     * Restore persisted (detached-rsync) uploads from the main process.
     * These are uploads that were started in a previous session and may
     * still be running in the background even though the renderer was closed.
     */
    async function restorePersistedUploads() {
        try {
            if (!window.electron?.listPersistedUploads) return
            const list = await window.electron.listPersistedUploads()
            if (!Array.isArray(list) || !list.length) return

            for (const t of list) {
                // Skip if we already have a task for this id
                if (_state.tasks.some(x => x.taskId === t.id)) continue

                // Also skip if we already have a task with the same file + destDir
                // (prevents duplicates when renderer's own queue is still active).
                // context.file may be a full absolute path while t.fileName is just
                // the basename, so compare basenames to catch both cases.
                if (_state.tasks.some(x => {
                    if (x.kind !== 'upload') return false
                    if (x.context?.destDir !== t.destDir) return false
                    const ctxFile = x.context?.file
                    if (!ctxFile) return false
                    const ctxBase = ctxFile.includes('/') ? ctxFile.slice(ctxFile.lastIndexOf('/') + 1) : ctxFile
                    return ctxBase === t.fileName
                })) continue

                const isQueued = t.status === 'queued'
                const taskId = t.id
                const task: TransferTask = {
                    taskId,
                    kind: 'upload',
                    title: isQueued ? `Queued: ${t.fileName}` : `Uploading: ${t.fileName}`,
                    detail: t.destDir,
                    status: isQueued ? 'queued' : 'uploading',
                    progress: 0,
                    speed: null,
                    eta: null,
                    error: null,
                    startedAt: t.startedAt || now(),
                    cancel: () => {
                        window.electron?.rsyncCancel?.(taskId)
                    },
                    context: {
                        source: 'upload' as const,
                        destDir: t.destDir,
                        file: t.fileName,
                    },
                }
                upsertTask(task)

                // Subscribe to progress updates from the log-file tailer
                // (for queued items, main will start sending progress once they begin)
                if (window.electron?.listenUploadProgress) {
                    const unsub = window.electron.listenUploadProgress(taskId, (p) => {
                        let pct: number | undefined = typeof p.percent === 'number' ? p.percent : undefined
                        if (pct === undefined && typeof p.bytesTransferred === 'number' && t.fileSize && t.fileSize > 0) {
                            pct = (p.bytesTransferred / t.fileSize) * 100
                        }
                        updateUpload(taskId, {
                            status: 'uploading',
                            progress: typeof pct === 'number' ? pct : undefined,
                            speed: p.rate ?? null,
                            eta: p.eta ?? null,
                        })
                    })

                    // Also listen for completion
                    const dch = `upload:done:${taskId}`
                    const doneHandler = (_ev: any, res: any) => {
                        unsub()
                        window.electron?.ipcRenderer?.removeListener?.(dch, doneHandler)
                        if (res?.ok) {
                            finishUpload(taskId, true)
                        } else {
                            finishUpload(taskId, false, res?.error || 'rsync failed')
                        }
                    }
                    window.electron?.ipcRenderer?.on?.(dch, doneHandler)
                }
            }

            // If we restored tasks, open the dock
            if (_state.tasks.some(isActiveTask)) {
                _state.open = true
            }
        } catch (e: any) {
            window.appLog?.warn?.('transfer.restore.persisted.error', { error: e?.message || String(e) })
        }
    }

    /**
     * Restore active transcodes from the server after reconnect / app restart.
     * Calls GET /api/progress/active to discover any queued or running jobs,
     * then creates transfer-dock tasks + polling for each (grouped by kind).
     */
    async function restoreActiveTranscodes(
        apiFetch: (path: string, init?: any) => Promise<any>
    ) {
        try {
            const json = await apiFetch('/api/progress/active', {
                parse: 'json',
                suppressAuthRedirect: true,
            })
            if (!json?.ok || !Array.isArray(json.items)) return

            for (const item of json.items as any[]) {
                const assetVersionId = Number(item.assetVersionId)
                const fileId = Number(item.fileId)
                if (!Number.isFinite(assetVersionId) || assetVersionId <= 0) continue

                const relDir = String(item.relDir || '').trim()
                const filename = String(item.filename || '').trim()
                const absPath = String(item.absPath || '').trim()
                // Normalize: strip leading '/' so paths match the relative form
                // used by link responses (e.g. "tank/..." not "/tank/...")
                const rawPath = absPath || (relDir ? `${relDir}/${filename}` : filename)
                const filePath = rawPath.startsWith('/') ? rawPath.slice(1) : rawPath

                const jobs: any[] = Array.isArray(item.jobs) ? item.jobs : []

                // Determine which job kinds are active for this version
                const activeKinds = new Set<string>()
                for (const j of jobs) {
                    const kind = String(j.kind || '').toLowerCase()
                    if (kind.startsWith('proxy_mp4')) activeKinds.add('proxy_mp4')
                    else if (kind === 'hls') activeKinds.add('hls')
                    else activeKinds.add(kind)
                }

                for (const kind of activeKinds) {
                    const jobKind = (kind === 'proxy_mp4' || kind === 'hls') ? kind : 'any' as const

                    // Skip if we already have an active task for this version+kind
                    if (hasActiveTranscode({ assetVersionIds: [assetVersionId], file: filePath, jobKind })) continue

                    const label = kind === 'hls' ? 'Generating browser stream'
                        : kind === 'proxy_mp4' ? 'Generating review copies'
                        : 'Generating transcodes'

                    startAssetVersionTranscodeTask({
                        apiFetch,
                        assetVersionIds: [assetVersionId],
                        title: `${label}: ${filename}`,
                        detail: filePath,
                        intervalMs: 1500,
                        jobKind,
                        context: {
                            source: 'upload' as const,
                            destDir: relDir,
                            file: filePath,
                        },
                    })
                }
            }

            // If we restored tasks, open the dock
            if (_state.tasks.some(isActiveTask)) {
                _state.open = true
            }
        } catch (e: any) {
            // Non-fatal: server might not have the endpoint yet
            window.appLog?.warn?.('transfer.restore.error', { error: e?.message || String(e) })
        }
    }

    return {
        state: _state,
        hasActive,
        activeCount,
        toggleMinimize,
        setOpen,
        removeTask,
        clearFinished,

        hasActiveTranscode,
        hasActiveTranscodeForFile,
        splitActiveTranscodeAssetVersions,

        createUploadTask,
        updateUpload,
        finishUpload,
        cancelUpload,
        cancelTranscode,

        startTranscodeTask,
        startAssetVersionTranscodeTask,
        startPlaybackTranscodeTask,
        restoreActiveTranscodes,
        restorePersistedUploads,
    }
}
