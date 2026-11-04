<template>
  <section v-if="visible" class="w-full" data-tour="link-details-processing">
    <div class="flex items-center justify-between gap-2 mb-2">
      <div class="min-w-0">
        <h4 class="font-semibold">Processing</h4>
        <div class="text-xs opacity-70">{{ headline }}</div>
      </div>
      <button
        type="button"
        class="btn btn-secondary text-xs px-2 py-1 shrink-0"
        :disabled="loading"
        @click="refresh()"
      >
        {{ loading ? 'Refreshing…' : 'Refresh' }}
      </button>
    </div>

    <div v-if="loadError" class="text-xs text-red-600 dark:text-red-400 mb-2">
      Couldn't load processing status: {{ loadError }}
    </div>

    <div class="overflow-x-auto max-h-[18rem] overflow-y-auto overscroll-y-contain rounded-lg border border-default">
      <table class="min-w-full text-sm border-separate border-spacing-0">
        <thead>
          <tr class="bg-default text-default">
            <th class="text-left px-3 py-2 border border-default">File</th>
            <th v-for="k in shownKinds" :key="k" class="text-left px-3 py-2 border border-default whitespace-nowrap">
              {{ KIND_LABELS[k] }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="f in processedFiles" :key="f.fileId" class="border-t border-default align-top">
            <td class="px-3 py-2 border border-default max-w-[18rem] truncate" :title="f.path || f.name">{{ f.name }}</td>
            <td v-for="k in shownKinds" :key="k" class="px-3 py-2 border border-default min-w-[11rem]">
              <template v-if="f.transcodes[k]?.status && f.transcodes[k].status !== 'none'">
                <div class="flex items-center gap-2">
                  <span class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium" :class="chipClass(f.transcodes[k].status)">
                    {{ STATUS_LABELS[f.transcodes[k].status] || f.transcodes[k].status }}
                  </span>
                  <span v-if="f.transcodes[k].status === 'running' && f.transcodes[k].progress != null" class="text-xs opacity-80">
                    {{ Math.round(f.transcodes[k].progress) }}%<template v-if="f.transcodes[k].eta_seconds"> · {{ fmtEta(f.transcodes[k].eta_seconds) }} left</template>
                  </span>
                  <button
                    v-if="f.transcodes[k].status === 'failed' && f.assetVersionId"
                    type="button"
                    class="btn btn-secondary text-xs px-2 py-0.5 ml-auto"
                    :disabled="retrying.has(retryKey(f.assetVersionId, k))"
                    @click="retry(f.assetVersionId, k)"
                  >
                    {{ retrying.has(retryKey(f.assetVersionId, k)) ? 'Retrying…' : 'Retry' }}
                  </button>
                </div>
                <div v-if="f.transcodes[k].status === 'running'" class="mt-1 h-1.5 w-full rounded bg-default overflow-hidden">
                  <div class="h-full bg-blue-500 transition-all" :style="{ width: `${Math.round(f.transcodes[k].progress ?? 0)}%` }"></div>
                </div>
                <div
                  v-if="f.transcodes[k].status === 'failed' && f.transcodes[k].error"
                  class="mt-1 text-xs text-red-600 dark:text-red-400 truncate max-w-[16rem]"
                  :title="f.transcodes[k].error || ''"
                >
                  {{ f.transcodes[k].error }}
                </div>
              </template>
              <span v-else class="opacity-50">—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { pushNotification, Notification } from '@45drives/houston-common-ui'

type JobKind = 'proxy_mp4' | 'hls' | 'watermark_image'
type JobStatus = 'none' | 'queued' | 'running' | 'done' | 'failed' | string

interface JobState {
  status: JobStatus
  progress: number | null
  eta_seconds: number | null
  error: string | null
}

interface SummaryFile {
  fileId: number
  name: string
  path: string
  assetVersionId: number | null
  transcodes: Partial<Record<JobKind, JobState>>
}

const props = defineProps<{
  linkId: number | string
  apiFetch: (url: string, opts?: any) => Promise<any>
  /** Bump to force a reload (e.g. after the link's files or media settings change). */
  reloadSignal?: number
}>()

const KINDS: JobKind[] = ['proxy_mp4', 'hls', 'watermark_image']
const KIND_LABELS: Record<JobKind, string> = {
  proxy_mp4: 'Review copy',
  hls: 'Streaming (HLS)',
  watermark_image: 'Watermark',
}
const STATUS_LABELS: Record<string, string> = {
  queued: 'Queued',
  running: 'Processing',
  done: 'Ready',
  failed: 'Failed',
}
const POLL_MS = 3000

const files = ref<SummaryFile[]>([])
const loading = ref(false)
const loadError = ref('')
// 401/403/404: not visible to this user (or link gone) — hide the panel instead of erroring.
const hidden = ref(false)
const retrying = ref(new Set<string>())
let pollTimer: ReturnType<typeof setTimeout> | null = null
let requestSeq = 0
let disposed = false

const isActive = (s?: JobStatus) => s === 'queued' || s === 'running'

const processedFiles = computed(() =>
  files.value.filter(f => KINDS.some(k => (f.transcodes[k]?.status ?? 'none') !== 'none'))
)
const shownKinds = computed(() =>
  KINDS.filter(k => processedFiles.value.some(f => (f.transcodes[k]?.status ?? 'none') !== 'none'))
)
const visible = computed(() => !hidden.value && processedFiles.value.length > 0)

const counts = computed(() => {
  const c = { queued: 0, running: 0, done: 0, failed: 0 }
  for (const f of processedFiles.value) {
    for (const k of KINDS) {
      const s = f.transcodes[k]?.status
      if (s === 'queued' || s === 'running' || s === 'done' || s === 'failed') c[s]++
    }
  }
  return c
})
const anyActive = computed(() => counts.value.queued + counts.value.running > 0)

const headline = computed(() => {
  const { queued, running, done, failed } = counts.value
  const parts: string[] = []
  if (running) parts.push(`${running} processing`)
  if (queued) parts.push(`${queued} queued`)
  if (failed) parts.push(`${failed} failed`)
  if (!parts.length) return done ? 'Everything is ready for viewers.' : ''
  if (done) parts.push(`${done} ready`)
  return parts.join(' · ')
})

function retryKey(assetVersionId: number, kind: JobKind) {
  return `${assetVersionId}:${kind}`
}

function chipClass(s: JobStatus) {
  switch (s) {
    case 'done': return 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
    case 'running': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
    case 'queued': return 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
    case 'failed': return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
    default: return 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
  }
}

function fmtEta(sec: number) {
  if (sec < 60) return `${sec}s`
  const m = Math.floor(sec / 60)
  if (m < 60) return `${m}m ${sec % 60}s`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

function stopPolling() {
  if (pollTimer) clearTimeout(pollTimer)
  pollTimer = null
}

function schedulePoll() {
  stopPolling()
  if (disposed || hidden.value || !anyActive.value) return
  pollTimer = setTimeout(() => { void refresh(true) }, POLL_MS)
}

async function refresh(silent = false) {
  if (!props.linkId) return
  const seq = ++requestSeq
  if (!silent) loading.value = true
  try {
    const resp = await props.apiFetch(`/api/links/${encodeURIComponent(String(props.linkId))}/transcodes/summary`)
    if (seq !== requestSeq || disposed) return
    files.value = Array.isArray(resp?.files) ? resp.files : []
    loadError.value = ''
    hidden.value = false
  } catch (e: any) {
    if (seq !== requestSeq || disposed) return
    const status = Number(e?.status)
    if (status === 401 || status === 403 || status === 404) {
      hidden.value = true
      files.value = []
    } else {
      loadError.value = e?.message || 'request failed'
    }
  } finally {
    if (seq === requestSeq) {
      loading.value = false
      schedulePoll()
    }
  }
}

async function retry(assetVersionId: number, kind: JobKind) {
  const key = retryKey(assetVersionId, kind)
  if (retrying.value.has(key)) return
  retrying.value = new Set(retrying.value).add(key)
  try {
    await props.apiFetch(`/api/transcodes/${encodeURIComponent(String(assetVersionId))}/${kind}/retry`, { method: 'POST' })
  } catch (e: any) {
    pushNotification(new Notification('Retry Failed', e?.message || `Could not retry ${KIND_LABELS[kind].toLowerCase()}.`, 'error', 8000))
  } finally {
    const next = new Set(retrying.value)
    next.delete(key)
    retrying.value = next
    await refresh(true)
  }
}

watch(
  () => [props.linkId, props.reloadSignal],
  () => {
    files.value = []
    hidden.value = false
    loadError.value = ''
    void refresh()
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  disposed = true
  stopPolling()
})
</script>
