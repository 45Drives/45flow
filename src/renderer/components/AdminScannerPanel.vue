<template>
    <section aria-label="Malware scanner">
        <p v-if="loading && !report" class="text-sm text-muted py-4" role="status">Loading scanner status…</p>
        <FlowNotice v-if="error" tone="danger" size="sm" live class="mb-3">
            {{ error }}
            <template #actions>
                <FlowButton size="xs" @click="load">Try again</FlowButton>
            </template>
        </FlowNotice>

        <template v-if="report">
            <p class="text-sm text-muted mb-3">
                Every file uploaded to this server is checked with ClamAV before it reaches your shares.
                This shows what the scanner is, how current it is, and what it found.
            </p>

            <FlowNotice v-if="!engine.available" tone="danger" size="sm" live class="mb-2">
                ClamAV isn't installed or can't run on this server.
                {{ report.required ? 'Uploads are being rejected until it works.' : 'Uploads are accepted without a scan.' }}
            </FlowNotice>
            <FlowNotice v-else-if="engine.stale" tone="warning" size="sm" live class="mb-2"
                title="Virus signatures are out of date">
                {{ engine.ageDays == null ? 'The signature date can\'t be read.' : `They are ${formatDays(engine.ageDays)} old.` }}
                New threats may be missed. On the server, run <span class="font-mono">sudo freshclam</span>.
            </FlowNotice>
            <FlowNotice v-if="engine.available && !engine.freshclam.scheduled" tone="warning" size="sm" class="mb-2">
                Signatures aren't updated automatically. Run
                <span class="font-mono">sudo systemctl enable --now clamav-freshclam.timer</span> on the server.
            </FlowNotice>

            <p class="flow-subhead flow-subhead--first">Scanner</p>
            <div class="flow-group">
                <div v-for="row in engineRows" :key="row.label" class="grid grid-cols-[minmax(0,12rem)_1fr] gap-x-6 py-2.5 text-sm">
                    <span class="text-muted">{{ row.label }}</span>
                    <span :class="TONE_CLASS[row.tone]">{{ row.value }}</span>
                </div>
            </div>

            <p class="flow-subhead">Last {{ stats.days }} days</p>
            <div class="flex flex-wrap gap-2 mb-3" aria-label="Scan totals">
                <FlowChip tone="neutral">{{ stats.total }} scanned</FlowChip>
                <FlowChip tone="success" dot>{{ stats.clean }} clean</FlowChip>
                <FlowChip :tone="stats.infected ? 'danger' : 'muted'" dot>{{ stats.infected }} infected</FlowChip>
                <FlowChip :tone="stats.error ? 'danger' : 'muted'" dot>{{ stats.error }} errors</FlowChip>
                <FlowChip :tone="stats.skipped ? 'warning' : 'muted'" dot>{{ stats.skipped }} not fully scanned</FlowChip>
            </div>
            <ul v-if="reasonRows.length" class="text-sm mb-3 space-y-1">
                <li v-for="r in reasonRows" :key="r.key">
                    <span class="font-medium">{{ r.count }}</span> {{ r.label }}
                </li>
            </ul>

            <div v-if="stats.recent.length" class="flow-table-wrap">
                <table class="flow-table">
                    <caption class="sr-only">Recent files that weren't clean</caption>
                    <thead>
                        <tr><th scope="col">When</th><th scope="col">File</th><th scope="col">Result</th><th scope="col">Details</th></tr>
                    </thead>
                    <tbody>
                        <tr v-for="(r, i) in stats.recent" :key="`${r.ts}-${i}`">
                            <td class="whitespace-nowrap">{{ formatTs(r.ts) }}</td>
                            <td class="max-w-[14rem] truncate" :title="r.file || ''">{{ r.file || 'Unknown file' }}</td>
                            <td><FlowChip size="sm" :tone="RESULT_TONES[r.result || ''] || 'neutral'">{{ RESULT_LABELS[r.result || ''] || r.result }}</FlowChip></td>
                            <td class="text-xs">
                                {{ r.signature && r.result === 'infected' ? r.signature : reasonLabel(r.result, r.reason) }}
                                <span class="text-muted">· {{ SOURCE_LABELS[r.source || ''] || r.source || 'upload' }}{{ r.linkId ? ` · link ${r.linkId}` : '' }}</span>
                                <span class="text-muted">· {{ r.action === 'deleted_from_quarantine' ? 'deleted' : 'kept' }}</span>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <p v-else class="text-sm text-muted">Nothing was infected, failed or skipped in this period.</p>

            <details class="text-sm mt-4">
                <summary class="cursor-pointer font-medium">What the scanner checks, and what it can't</summary>
                <ul class="list-disc pl-5 mt-2 space-y-1">
                    <li>Files are scanned in quarantine, before they reach the share folder.</li>
                    <li><strong>Infected files are deleted</strong> straight away. The uploader is told the file failed the
                        scan, and it never appears in your shares.</li>
                    <li>Files up to {{ formatMb(report.limits.maxFileSizeMb) }} are scanned in full.
                        <strong>Larger files can't be scanned</strong>: ClamAV doesn't support it. They're accepted and
                        shown as "not fully scanned".</li>
                    <li>Large files take a while. A 1.4 GB video took under 2 minutes on our test server. The uploader
                        waits on "Scanning for malware…", and files are scanned one at a time, so other uploads wait too.</li>
                    <li>Archives are opened and scanned up to {{ formatMb(report.limits.maxScanSizeMb) }} of content,
                        {{ report.limits.maxFiles.toLocaleString() }} files and {{ report.limits.maxRecursion }} levels of nesting.</li>
                    <li>Password-protected archives and documents can't be looked inside.</li>
                    <li>A scan is rejected if it runs longer than {{ Math.round(report.limits.timeoutMs / 1000) }} seconds
                        plus 1 second per {{ report.limits.minMbPerSec ?? 5 }} MB of the file.</li>
                    <li>Scanning is {{ report.required ? 'required: if ClamAV can\'t run, uploads are rejected' : 'optional: if ClamAV can\'t run, uploads are accepted without a scan' }}.</li>
                </ul>
            </details>

            <div class="mt-4">
                <FlowButton variant="ghost" size="sm" :disabled="loading" @click="load">
                    {{ loading ? 'Refreshing…' : 'Refresh' }}
                </FlowButton>
            </div>
        </template>
    </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useApi } from '../composables/useApi'
import FlowNotice from '../ui/FlowNotice.vue'
import FlowButton from '../ui/FlowButton.vue'
import FlowChip from '../ui/FlowChip.vue'

type UnitState = { installed: boolean; active: boolean; lastRunAt: string | null } | null
type Engine = {
    available: boolean
    engineVersion: string | null
    signatureVersion: number | null
    signatureDate: string | null
    databaseUpdatedAt: string | null
    ageDays: number | null
    stale: boolean
    staleAfterDays: number
    freshclam: { timer: UnitState; daemon: UnitState; scheduled: boolean }
}
type RecentScan = {
    ts: string; result: string | null; reason: string | null; signature: string | null
    file: string | null; source: string | null; action: string | null; linkId: number | null
}
type Report = {
    engine: Engine
    required: boolean
    limits: { maxFileSizeMb: number; maxScanSizeMb: number; maxFiles: number; maxRecursion: number; timeoutMs: number; minMbPerSec?: number }
    stats: {
        days: number; total: number; clean: number; infected: number; error: number; skipped: number
        reasons: Record<string, number>; recent: RecentScan[]
    }
}
type ChipTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'muted'

const props = defineProps<{ connectionId: string }>()
const { apiFetch } = useApi(props.connectionId)

const RESULT_LABELS: Record<string, string> = { clean: 'Clean', infected: 'Infected', error: 'Error', skipped: 'Not fully scanned' }
const RESULT_TONES: Record<string, ChipTone> = { clean: 'success', infected: 'danger', error: 'danger', skipped: 'warning' }
const SOURCE_LABELS: Record<string, string> = {
    upload_link: 'upload link', upload_link_chunked: 'upload link', desktop_upload: 'desktop app',
}
const REASON_LABELS: Record<string, string> = {
    'skipped:over_size_limit': 'too large to scan (over 2 GB)',
    'skipped:over_scan_size_limit': 'archive content over the scan limit',
    'skipped:too_many_files_in_archive': 'archive with too many files',
    'skipped:archive_nested_too_deep': 'archive nested too deep',
    'skipped:limits_exceeded': 'over a scanner limit',
    'skipped:encrypted': 'password-protected, can\'t look inside',
    'skipped:scanner_unavailable': 'accepted without a scan (scanner unavailable)',
    'skipped:disabled': 'accepted without a scan (scanning off)',
    'error:scan_timeout': 'scan timed out, rejected',
    'error:scanner_unavailable': 'scanner unavailable, rejected',
    'error:file_not_readable': 'file couldn\'t be read, rejected',
    'error:scan_failed': 'scan failed, rejected',
}

const TONE_CLASS: Record<string, string> = { danger: 'text-flow-danger', warning: 'text-flow-warning', '': '' }

const report = ref<Report | null>(null)
const loading = ref(false)
const error = ref('')

const engine = computed(() => report.value!.engine)
const stats = computed(() => report.value!.stats)

function reasonLabel(result: string | null, reason: string | null) {
    return REASON_LABELS[`${result}:${reason}`] || reason || ''
}

const reasonRows = computed(() => Object.entries(stats.value.reasons)
    .map(([key, count]) => ({ key, count, label: REASON_LABELS[key] || key.split(':')[1] }))
    .sort((a, b) => b.count - a.count))

function formatMb(mb: number) {
    return mb >= 1000 ? `${Math.round(mb / 1024)} GB` : `${mb} MB`
}

function formatDays(days: number) {
    return days < 1 ? 'less than a day' : `${Math.round(days)} day${Math.round(days) === 1 ? '' : 's'}`
}

// Audit timestamps are SQLite UTC ("YYYY-MM-DD HH:MM:SS").
function formatTs(ts: string | null) {
    if (!ts) return 'Unknown'
    const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(ts) ? ts : `${ts.replace(' ', 'T')}Z`)
    return Number.isFinite(d.getTime()) ? d.toLocaleString() : ts
}

function scheduleText(e: Engine) {
    const { timer, daemon } = e.freshclam
    if (timer?.active) return `Every 6 hours (timer)${timer.lastRunAt ? `, last ran ${formatTs(timer.lastRunAt)}` : ''}`
    if (daemon?.active) return 'freshclam daemon running'
    if (timer?.installed || daemon?.installed) return 'Installed but not running'
    return 'Not scheduled'
}

const engineRows = computed(() => {
    const e = engine.value
    return [
        { label: 'Engine', value: e.engineVersion ? `ClamAV ${e.engineVersion}` : 'Not found', tone: e.available ? '' : 'danger' },
        {
            label: 'Signatures',
            value: e.signatureVersion
                ? `Version ${e.signatureVersion}${e.signatureDate ? `, built ${formatTs(e.signatureDate)}` : ''}${e.ageDays != null ? ` (${formatDays(e.ageDays)} old)` : ''}`
                : 'Version unknown',
            tone: e.stale ? 'warning' : '',
        },
        { label: 'Last database update', value: e.databaseUpdatedAt ? formatTs(e.databaseUpdatedAt) : 'Unknown', tone: '' },
        { label: 'Automatic updates', value: scheduleText(e), tone: e.freshclam.scheduled ? '' : 'warning' },
        { label: 'Scanning', value: report.value!.required ? 'Required for every upload' : 'Optional', tone: '' },
    ]
})

async function load() {
    loading.value = true
    error.value = ''
    try {
        const data = await apiFetch('/api/admin/scanner', { exposeServerMessage: true })
        if (!data?.engine || !data?.stats || !data?.limits) throw new Error('Unexpected scanner status from the server.')
        report.value = data
    } catch (e: unknown) {
        const status = typeof e === 'object' && e !== null && 'status' in e ? e.status : undefined
        error.value = status === 404
            ? 'This server does not report scanner status yet. Update the Broadcaster.'
            : e instanceof Error ? e.message : 'Couldn\'t load scanner status.'
    } finally {
        loading.value = false
    }
}

onMounted(load)
</script>
