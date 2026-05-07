<!-- src/renderer/components/TransferProgressDock.vue -->
<template>
    <!-- Single wrapper: tab + panel slide together -->
    <div class="drawer-wrapper" :class="{ 'drawer-wrapper--open': state.open }">

        <!-- Tab (absolutely positioned on the left edge of the wrapper) -->
        <button
            class="drawer-tab"
            data-tour="transfer-dock-tab"
            @click="setOpen(!state.open)"
            :title="state.open ? 'Close transfers panel' : 'Open transfers panel'"
        >
            <svg class="drawer-tab-chevron" :class="{ 'drawer-tab-chevron--open': state.open }"
                xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd"
                    d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z"
                    clip-rule="evenodd" />
            </svg>
            <span class="drawer-tab-text">Transfers</span>
            <span v-if="activeCount" class="drawer-tab-badge">{{ activeCount }}</span>
        </button>

        <!-- Panel -->
        <div class="drawer-panel">
            <div class="drawer-inner">

            <!-- Drawer header -->
            <div class="drawer-header" data-tour="transfer-dock-header">
                <div class="min-w-0">
                    <div class="font-semibold text-sm">
                        Transfers
                        <span v-if="activeCount" class="opacity-70">({{ activeCount }} active)</span>
                    </div>
                    <div class="text-xs opacity-70 truncate" v-if="hasActive">In progress…</div>
                    <div class="text-xs opacity-70" v-else>Idle</div>
                </div>
                <div class="flex items-center gap-2">
                    <button class="btn btn-secondary px-2 py-1 text-xs" @click="clearFinished">Clear finished</button>
                    <button class="btn btn-secondary px-2 py-1 text-xs" @click="setOpen(false)">Close</button>
                </div>
            </div>

            <!-- Drawer body (scrollable) -->
            <div class="drawer-body" data-tour="transfer-dock-body">
                <div v-if="!state.tasks.length" class="px-4 py-6 text-sm opacity-70 text-center">
                    No transfers.
                </div>

                <!-- OUTER GROUPS -->
                <div v-for="g in groups" :key="g.key" class="drawer-group">
                    <!-- group header -->
                    <div class="drawer-group-header">
                        <div class="min-w-0">
                            <div class="text-sm font-semibold truncate" :title="g.title">{{ g.title }}</div>
                            <div v-if="g.subtitle" class="text-xs opacity-70 truncate" :title="g.subtitle">{{ g.subtitle }}</div>
                        </div>
                        <button class="btn btn-secondary px-2 py-1 text-xs flex-shrink-0" @click="dismissGroup(g.key)">
                            Dismiss all
                        </button>
                    </div>

                    <!-- FILE CARDS (proxy + HLS + upload merged per file) -->
                    <div v-for="fg in g.files" :key="fg.key" class="drawer-file-card">
                        <!-- Card header: filename + overall status + dismiss -->
                        <div class="flex items-start justify-between gap-2">
                            <div class="min-w-0 flex-1">
                                <div class="text-sm font-semibold truncate" :title="fg.fileTitle">{{ fg.fileTitle }}</div>
                                <div v-if="fg.fileSubtitle" class="text-[11px] opacity-50 truncate" :title="fg.fileSubtitle">{{ fg.fileSubtitle }}</div>
                            </div>
                            <div class="flex items-center gap-1.5 flex-shrink-0">
                                <span class="drawer-status-badge" :class="statusClass(bestOfTasks(fg.tasks))">
                                    {{ statusLabel(bestOfTasks(fg.tasks)) }}
                                </span>
                                <button class="btn btn-secondary px-2 py-0.5 text-[10px]" @click="dismissFileGroup(fg)">
                                    Dismiss
                                </button>
                            </div>
                        </div>

                        <!-- Compact task rows -->
                        <div class="mt-2 space-y-1.5">
                            <div v-for="t in fg.tasks" :key="t.taskId">
                                <div class="flex items-center justify-between gap-2">
                                    <div class="flex items-center gap-1.5 min-w-0">
                                        <span class="text-[11px] font-semibold opacity-80">{{ taskRowLabel(t) }}</span>
                                        <button
                                            v-if="t.kind === 'upload' && (t.status === 'uploading' || t.status === 'queued')"
                                            class="btn btn-danger px-1.5 py-0 text-[9px] leading-tight"
                                            @click="cancelUpload(t.taskId)">
                                            Cancel
                                        </button>
                                        <button
                                            v-if="t.kind === 'transcode' && (t.status === 'running' || t.status === 'queued')"
                                            class="btn btn-danger px-1.5 py-0 text-[9px] leading-tight"
                                            @click="cancelTranscode(t.taskId)">
                                            Cancel
                                        </button>
                                    </div>
                                    <div class="flex items-center gap-2 flex-shrink-0 text-[10px] opacity-60 tabular-nums">
                                        <span v-if="t.speed">{{ t.speed }}</span>
                                        <span v-if="t.eta">ETA {{ t.eta }}</span>
                                        <span class="font-semibold opacity-100">{{ Math.round(t.progress || 0) }}%</span>
                                    </div>
                                </div>
                                <progress class="w-full h-1 rounded-lg overflow-hidden mt-0.5"
                                    :class="t.status === 'done' ? 'progress-done' : 'progress-active'"
                                    :value="t.progress || 0" max="100" />
                            </div>
                        </div>

                        <!-- Errors (collapsed) -->
                        <template v-for="t in fg.tasks" :key="'err:' + t.taskId">
                            <div v-if="t.error" class="mt-1.5 text-xs text-red-400">
                                <details class="cursor-pointer">
                                    <summary class="select-none">{{ taskRowLabel(t) }}: {{ errorSummary(t.error) }}</summary>
                                    <pre class="mt-1 whitespace-pre-wrap break-all opacity-80 max-h-24 overflow-y-auto text-[11px] leading-tight">{{ t.error }}</pre>
                                </details>
                            </div>
                        </template>
                    </div>
                </div>
            </div>
        </div>
    </div>  <!-- /drawer-panel -->
    </div>  <!-- /drawer-wrapper -->
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { useTransferProgress } from '../composables/useTransferProgress'
import { useTourManager, type TourStep } from '../composables/useTourManager'
import { useOnboarding } from '../composables/useOnboarding'

const {
    state,
    hasActive,
    activeCount,
    setOpen,
    removeTask,
    clearFinished,
    cancelUpload,
    cancelTranscode,
} = useTransferProgress()

const { requestTour } = useTourManager()
const { onboarding, markDone } = useOnboarding()

const transferDockTourSteps: TourStep[] = [
	{
		target: '[data-tour="transfer-dock-tab"]',
		message: 'This is the Transfers panel.\n\nClick this tab anytime to open or close the panel. The badge shows how many transfers are currently active.',
		placement: 'bottom',
	},
	{
		target: '[data-tour="transfer-dock-header"]',
		message: 'The header shows overall status — active count and idle/in-progress indicator.\n\nUse "Clear finished" to remove completed transfers, or "Close" to collapse the panel.',
		placement: 'bottom',
	},
	{
		target: '[data-tour="transfer-dock-body"]',
		message: 'Each file shows its upload progress with speed, ETA, and a progress bar.\n\nFiles are grouped by destination. You can cancel individual uploads or dismiss entire groups when finished.',
		placement: 'bottom',
	},
]

// Trigger dock tour the first time the panel opens
let _dockTourTriggered = false
watch(() => state.open, (open) => {
	if (open && !_dockTourTriggered && !onboarding.value.transferDockTourDone) {
		_dockTourTriggered = true
		setTimeout(() => {
			requestTour('transfer-dock', transferDockTourSteps, () => markDone('transferDockTourDone'))
		}, 600)
	}
})

function basename(p?: string) {
    if (!p) return ''
    const s = String(p)
    const i = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'))
    return i >= 0 ? s.slice(i + 1) : s
}

function isActiveTask(t: any) {
    return (
        (t.kind === 'upload' && (t.status === 'uploading' || t.status === 'queued')) ||
        (t.kind !== 'upload' && (t.status === 'queued' || t.status === 'running' || t.status === 'unknown'))
    )
}

/** Status priority for sorting: lower = more urgent */
function statusPriority(t: any): number {
    const s = String(t?.status || '').toLowerCase()
    if (s === 'uploading' || s === 'running') return 0
    if (s === 'queued') return 1
    if (s === 'unknown') return 2
    if (s === 'error' || s === 'failed') return 3
    if (s === 'done') return 4
    if (s === 'canceled') return 5
    return 6
}

/** Human-readable status labels */
function statusLabel(t: any): string {
    const s = String(t?.status || '').toLowerCase()
    if (s === 'uploading') return 'Uploading'
    if (s === 'running') return 'Running'
    if (s === 'queued') return 'Queued'
    if (s === 'unknown') return 'Checking…'
    if (s === 'done') return 'Complete'
    if (s === 'failed' || s === 'error') return 'Failed'
    if (s === 'canceled') return 'Canceled'
    return s || 'Unknown'
}

/** CSS class for status badge */
function statusClass(t: any): string {
    const s = String(t?.status || '').toLowerCase()
    if (s === 'uploading' || s === 'running') return 'drawer-status--active'
    if (s === 'queued') return 'drawer-status--queued'
    if (s === 'unknown') return 'drawer-status--queued'
    if (s === 'done') return 'drawer-status--done'
    if (s === 'failed' || s === 'error') return 'drawer-status--error'
    if (s === 'canceled') return 'drawer-status--canceled'
    return ''
}

function taskRowLabel(t: any) {
    if (t?.kind === 'upload') {
        const detail = String(t?.detail || '')
        if (detail.startsWith('Transcoding')) return 'Transcode'
        return 'Upload'
    }
    if (t?.kind === 'transcode') {
        const jk = String(t?.jobKind || '').toLowerCase()
        if (jk === 'proxy_mp4') {
            const m = String(t?.detail || '').match(/\(([^)]+)\)/)
            return m ? `Review Copy (${m[1]})` : 'Review Copy'
        }
        if (jk === 'hls') return 'Stream'
        return 'Transcode'
    }
    return t?.title || 'Task'
}

function bestOfTasks(tasks: any[]): any {
    if (!tasks.length) return { status: 'unknown' }
    let best = tasks[0]
    for (let i = 1; i < tasks.length; i++) {
        if (statusPriority(tasks[i]) < statusPriority(best)) best = tasks[i]
    }
    return best
}

function dismissFileGroup(fg: { tasks: any[] }) {
    for (const t of fg.tasks) removeTask(t.taskId)
}

/** Extract a short human-readable summary from a (potentially long) error string */
function errorSummary(raw: any): string {
    const s = String(raw || '').trim()
    if (!s) return 'Unknown error'
    // Look for the last meaningful ffmpeg error line
    const patterns = [
        /Conversion failed!?/,
        /Error initializing output stream.*/,
        /Could not write header.*/,
        /Unable to map stream.*/,
        /No such file or directory/,
        /Invalid argument/,
    ]
    for (const re of patterns) {
        const m = re.exec(s)
        if (m) return m[0].slice(0, 120)
    }
    // Fallback: last line that isn't blank
    const lines = s.split('\n').map(l => l.trim()).filter(Boolean)
    const last = lines[lines.length - 1] || s
    return last.length > 120 ? last.slice(0, 117) + '…' : last
}

type FileGroup = {
    key: string
    fileTitle: string
    fileSubtitle?: string
    tasks: any[]
}

type OuterGroup = {
    key: string
    title: string
    subtitle?: string
    files: FileGroup[]
    tasksFlat: any[]
}

function outerKeyForTask(t: any) {
    const c = t?.context || {}
    if (c.groupId) return String(c.groupId)
    if (c.linkUrl) return `link:${c.linkUrl}`
    if (c.source === 'upload' && c.destDir) return `upload:${c.destDir}`
    if (c.file) return `file:${c.file}`
    return `task:${t.taskId}`
}

function outerTitleForBucket(bucketCtx: any, tasks: any[]) {
    const c = bucketCtx || {}

    if (c.source === 'upload') {
        const dest = (c.destDir && String(c.destDir).trim()) || ''
        return { title: 'Upload', subtitle: dest || undefined }
    }

    if (c.source === 'link') {
        const title = (c.linkTitle && String(c.linkTitle).trim()) || ''
        const url = (c.linkUrl && String(c.linkUrl).trim()) || ''
        return {
            title: title ? title : 'Link',
            subtitle: title && url ? url : url || undefined,
        }
    }

    const anyUpload = tasks.some(t => t?.context?.source === 'upload')
    if (!anyUpload) {
        const anyLink = tasks.find(t => t?.context?.linkUrl)?.context?.linkUrl
        if (anyLink) return { title: 'Link', subtitle: String(anyLink) }
    }

    return { title: 'Transfers' }
}

function fileKeyForTask(t: any) {
    const c = t?.context || {}
    if (c.file) return `file:${c.file}`
    const files = Array.isArray(c.files) ? c.files : []
    if (files.length === 1) return `file:${files[0]}`
    return 'file:__multi__'
}

function fileHeaderForKey(fileKey: string, bucketCtx: any) {
    if (fileKey === 'file:__multi__') {
        const files = Array.isArray(bucketCtx?.files) ? bucketCtx.files : []
        return {
            title: files.length > 1 ? 'Multiple files' : 'File',
            subtitle: files.length > 1 ? `${files.length} files` : undefined,
        }
    }
    const file = fileKey.startsWith('file:') ? fileKey.slice(5) : fileKey
    return { title: basename(file), subtitle: file }
}

const groups = computed<OuterGroup[]>(() => {
    const buckets = new Map<string, { ctx: any; tasks: any[] }>()

    for (const t of state.tasks as any[]) {
        const k = outerKeyForTask(t)
        if (!buckets.has(k)) buckets.set(k, { ctx: t?.context, tasks: [] })
        buckets.get(k)!.tasks.push(t)
    }

    const out: OuterGroup[] = []

    for (const [key, bucket] of buckets.entries()) {
        const rep =
            bucket.tasks.find(t => t?.context?.source)?.context ||
            bucket.tasks.find(t => t?.context?.linkUrl)?.context ||
            bucket.tasks.find(t => t?.context?.destDir)?.context ||
            bucket.ctx ||
            {}

        const hdr = outerTitleForBucket(rep, bucket.tasks)
        const fileGroups = new Map<string, FileGroup>()

        function ensureFileGroup(fk: string) {
            if (!fileGroups.has(fk)) {
                const fh = fileHeaderForKey(fk, rep)
                fileGroups.set(fk, { key: fk, fileTitle: fh.title, fileSubtitle: fh.subtitle, tasks: [] })
            }
            return fileGroups.get(fk)!
        }

        for (const t of bucket.tasks) {
            ensureFileGroup(fileKeyForTask(t)).tasks.push(t)
        }

        // Sort tasks within each file group by status priority, then kind, then start time
        const taskOrder = (t: any) => {
            if (t.kind === 'transcode') {
                const jk = String(t?.jobKind || '').toLowerCase()
                if (jk === 'proxy_mp4') return 0
                if (jk === 'hls') return 1
                return 2
            }
            if (t.kind === 'upload') return 3
            return 9
        }

        const filesArr = Array.from(fileGroups.values()).map(fg => {
            fg.tasks.sort((a, b) => {
                // Primary: status priority (active first, then queued, then done)
                const sp = statusPriority(a) - statusPriority(b)
                if (sp !== 0) return sp
                // Secondary: kind order
                const d = taskOrder(a) - taskOrder(b)
                if (d !== 0) return d
                return Number(a?.startedAt || 0) - Number(b?.startedAt || 0)
            })
            return fg
        })

        // Sort file groups: active first, then by best task status
        filesArr.sort((a, b) => {
            const aAct = a.tasks.some(isActiveTask)
            const bAct = b.tasks.some(isActiveTask)
            if (aAct !== bAct) return aAct ? -1 : 1
            const aBest = Math.min(...a.tasks.map(statusPriority))
            const bBest = Math.min(...b.tasks.map(statusPriority))
            if (aBest !== bBest) return aBest - bBest
            return String(a.fileTitle).localeCompare(String(b.fileTitle))
        })

        out.push({
            key,
            title: hdr.title,
            subtitle: hdr.subtitle,
            files: filesArr,
            tasksFlat: bucket.tasks.slice(),
        })
    }

    // Sort outer groups: active first, then by best task status, then newest
    out.sort((a, b) => {
        const aAct = a.tasksFlat.some(isActiveTask)
        const bAct = b.tasksFlat.some(isActiveTask)
        if (aAct !== bAct) return aAct ? -1 : 1
        const aBest = Math.min(...a.tasksFlat.map(statusPriority))
        const bBest = Math.min(...b.tasksFlat.map(statusPriority))
        if (aBest !== bBest) return aBest - bBest
        const aNew = Math.max(...a.tasksFlat.map(t => Number(t?.startedAt || 0)), 0)
        const bNew = Math.max(...b.tasksFlat.map(t => Number(t?.startedAt || 0)), 0)
        return bNew - aNew
    })

    return out
})

function dismissGroup(groupKey: string) {
    const g = groups.value.find(x => x.key === groupKey)
    if (!g) return
    for (const t of g.tasksFlat) removeTask(t.taskId)
}
</script>

<style lang="css" scoped>
/* ── Wrapper (slides tab + panel as one unit) ──────────── */
.drawer-wrapper {
    position: fixed;
    top: 4rem;   /* below app header */
    right: 0;
    bottom: 0;
    width: 26rem;
    z-index: 50;
    overflow: visible;          /* let tab overflow to the left */
    transform: translateX(100%);
    transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1);
    pointer-events: none;
}

.drawer-wrapper--open {
    transform: translateX(0);
    pointer-events: auto;
}

/* ── Drawer Tab ────────────────────────────────────────── */
.drawer-tab {
    position: absolute;
    top: 50%;
    right: calc(100% + 0.75rem);   /* offset from scrollbar when closed */
    transform: translateY(-50%);
    z-index: 2;
    pointer-events: auto;

    display: flex;
    align-items: center;
    gap: 0.35rem;
    writing-mode: vertical-rl;
    text-orientation: mixed;
    padding: 0.85rem 0.45rem;
    background: var(--btn-primary-fill);
    color: white;
    border: none;
    border-radius: 0.5rem 0 0 0.5rem;
    cursor: pointer;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    box-shadow: -2px 0 8px rgba(0, 0, 0, 0.18);
    user-select: none;

    transition: right 0.35s cubic-bezier(0.4, 0, 0.2, 1);
}

.drawer-wrapper--open .drawer-tab {
    right: 100%;   /* flush with panel edge when open */
}

.drawer-tab:hover {
    background: var(--btn-primary-hover-fill);
}

.drawer-tab-chevron {
    width: 1rem;
    height: 1rem;
    flex-shrink: 0;
    transition: transform 0.3s ease;
    /* Default: pointing left (toward drawer open direction) */
    transform: rotate(90deg);
}

.drawer-tab-chevron--open {
    /* Flip to point right (toward close) */
    transform: rotate(-90deg);
}

.drawer-tab-text {
    white-space: nowrap;
}

.drawer-tab-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.1rem;
    height: 1.1rem;
    padding: 0 0.25rem;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.25);
    font-size: 0.65rem;
    font-weight: 800;
    line-height: 1;
}

/* ── Drawer Panel ──────────────────────────────────────── */

:is(.dark *) .drawer-inner,
.drawer-inner:is(.dark *) {
    color: #f3f4f6;
}

.drawer-header {
    position: sticky;
    top: 0;
    z-index: 2;

    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.65rem 0.85rem;
    background: var(--btn-primary-fill);
    color: white;
    border-bottom: 1px solid var(--ui-panel-border);
    flex-shrink: 0;
}

.drawer-panel {
    position: relative;
    width: 100%;
    height: 100%;
    background: linear-gradient(to right, var(--ui-panel-bg) calc(100% - 1rem), transparent calc(100% - 1rem));
    border-left: 1px solid var(--ui-panel-border);
    box-shadow: -4px 0 16px rgba(0, 0, 0, 0.12);
}

.drawer-inner {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-gutter: stable;
    background: transparent;
    color: #111827;
}

.drawer-body {
    flex: 1;
    min-height: 0;
    overflow: visible;
    background: transparent;
}
/* ── Group ─────────────────────────────────────────────── */
.drawer-group {
    border-bottom: 1px solid var(--ui-panel-border);
}

.drawer-group-header {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.5rem 0.85rem;
    background: color-mix(in srgb, var(--btn-primary-bg) 8%, var(--ui-panel-bg));
}

/* ── File Card (merged tasks per file) ─────────────────── */
.drawer-file-card {
    padding: 0.5rem 0.85rem 0.6rem;
    border-top: 1px solid color-mix(in srgb, var(--ui-panel-border) 50%, transparent);
}

.drawer-group,
.drawer-file-card {
    background: var(--ui-panel-bg);
}
/* ── Progress bar (static colors — avoids repaints on theme change) ── */
progress {
    appearance: none;
    -webkit-appearance: none;
    height: 0.375rem;
    border-radius: 999px;
    overflow: hidden;
}

/* In-progress: use primary theme color */
progress.progress-active {
    background: rgba(128, 128, 128, 0.2);
}

progress.progress-active::-webkit-progress-bar {
    background: rgba(128, 128, 128, 0.2);
    border-radius: 999px;
}

progress.progress-active::-webkit-progress-value {
    background: var(--btn-primary-fill);
    border-radius: 999px;
}

/* Complete: static green */
progress.progress-done {
    background: rgba(34, 197, 94, 0.18);
}

progress.progress-done::-webkit-progress-bar {
    background: rgba(34, 197, 94, 0.18);
    border-radius: 999px;
}

progress.progress-done::-webkit-progress-value {
    background: #22c55e;
    border-radius: 999px;
}

/* ── Status badges ─────────────────────────────────────── */
.drawer-status-badge {
    display: inline-flex;
    align-items: center;
    padding: 0.05rem 0.4rem;
    border-radius: 999px;
    font-size: 0.65rem;
    font-weight: 700;
    line-height: 1.4;
}

/* Dark-mode badge colors */
.drawer-status--active {
    background: color-mix(in srgb, #3b82f6 25%, transparent);
    color: #1d4ed8;
}

.drawer-status--active:is(.dark *) {
    color: #93c5fd;
}

.drawer-status--queued {
    background: color-mix(in srgb, #a78bfa 20%, transparent);
    color: #6d28d9;
}

.drawer-status--queued:is(.dark *) {
    color: #c4b5fd;
}

.drawer-status--done {
    background: color-mix(in srgb, #22c55e 20%, transparent);
    color: #15803d;
}

.drawer-status--done:is(.dark *) {
    color: #86efac;
}

.drawer-status--error {
    background: color-mix(in srgb, #ef4444 20%, transparent);
    color: #dc2626;
}

.drawer-status--error:is(.dark *) {
    color: #fca5a5;
}

.drawer-status--canceled {
    background: color-mix(in srgb, #f59e0b 18%, transparent);
    color: #b45309;
}

.drawer-status--canceled:is(.dark *) {
    color: #fcd34d;
}

/* ── Responsive ────────────────────────────────────────── */
@media (max-width: 640px) {
    .drawer-wrapper {
        width: 100vw;
    }
}
</style>