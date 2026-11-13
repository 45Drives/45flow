<template>
  <section v-if="supported" aria-label="Proxy files for existing videos" class="mb-6">
    <p class="flow-subhead flow-subhead--first">Existing videos</p>
    <FlowNotice v-if="error" tone="danger" size="sm" live class="mb-3">{{ error }}</FlowNotice>
    <div class="flow-group">
      <div class="grid grid-cols-[minmax(0,1fr)_auto] gap-x-6 items-center py-3">
        <div class="min-w-0">
          <p class="text-sm font-medium text-default">Make proxy files for existing videos</p>
          <p class="text-xs text-accent mt-0.5">
            Queues the server's proxy sizes for videos uploaded before they were chosen. Videos that already have them,
            or that chose their own sizes, are skipped. Runs in the background; you can close this window.
          </p>
          <p v-if="state" class="text-xs text-muted mt-1" role="status" data-testid="backfill-status">{{ statusLine }}</p>
        </div>
        <div class="flex items-center gap-2">
          <FlowButton v-if="canResume" size="sm" :loading="acting === 'resume'" loading-text="Resuming…"
            :disabled="!!acting" @click="act('resume')">Resume</FlowButton>
          <FlowButton size="sm" :loading="acting === 'start'" loading-text="Starting…"
            :disabled="!!acting || state?.status === 'running'" @click="act('start')">
            {{ state?.status === 'completed' ? 'Run again' : 'Start' }}
          </FlowButton>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
// C4: admin-run backfill of the server's proxy sizes onto existing videos
// (server routes /api/admin/transcode-backfill/{status,start,resume}).
import { computed, onBeforeUnmount, ref } from 'vue'
import FlowButton from '../ui/FlowButton.vue'
import FlowNotice from '../ui/FlowNotice.vue'
import { useApi } from '../composables/useApi'

type BackfillState = {
  status: 'idle' | 'running' | 'completed' | 'error'
  qualities: string[]
  processedCount: number
  queuedCount: number
  skippedCounts: { explicit: number; nonVideo: number; covered: number; active: number }
  lastError: string | null
}

const props = defineProps<{ connectionId: string }>()
const { apiFetch } = useApi(props.connectionId)

const state = ref<BackfillState | null>(null)
const supported = ref(true)
const error = ref('')
const acting = ref<'start' | 'resume' | null>(null)
let timer: ReturnType<typeof setTimeout> | null = null

const canResume = computed(() => state.value?.status === 'error')

const statusLine = computed(() => {
  const s = state.value
  if (!s) return ''
  const sizes = s.qualities?.length ? ` (${s.qualities.join(', ')})` : ''
  const skipped = s.skippedCounts
    ? Object.values(s.skippedCounts).reduce((a, b) => a + (Number(b) || 0), 0)
    : 0
  switch (s.status) {
    case 'running':
      return `Working${sizes}: ${s.processedCount} checked, ${s.queuedCount} queued so far.`
    case 'completed':
      return `Done${sizes}: ${s.queuedCount} queued, ${skipped} already fine or skipped.`
    case 'error':
      return `Stopped after ${s.processedCount} videos${s.lastError ? `: ${s.lastError}` : ''}. Resume to continue where it left off.`
    default:
      return 'Not run yet.'
  }
})

function schedule() {
  if (timer) clearTimeout(timer)
  if (state.value?.status === 'running') timer = setTimeout(load, 5000)
}

async function load() {
  try {
    const data = await apiFetch('/api/admin/transcode-backfill/status')
    state.value = data?.state ?? null
    error.value = ''
    schedule()
  } catch (e: any) {
    // Older servers, or a non-admin session: hide rather than show a broken control.
    if (e?.status === 404 || e?.status === 403) { supported.value = false; return }
    error.value = e?.message ? `Couldn't check existing videos: ${e.message}` : "Couldn't check existing videos."
  }
}

async function act(kind: 'start' | 'resume') {
  if (acting.value) return
  acting.value = kind
  error.value = ''
  try {
    const data = await apiFetch(`/api/admin/transcode-backfill/${kind}`, { method: 'POST', body: JSON.stringify({}), retry: 0 })
    state.value = data?.state ?? state.value
    schedule()
  } catch (e: any) {
    error.value = e?.code === 'already_running' || /already_running/.test(String(e?.message))
      ? 'A run is already in progress.'
      : (e?.message ? `Couldn't ${kind}: ${e.message}` : `Couldn't ${kind}.`)
  } finally {
    acting.value = null
  }
}

load()
onBeforeUnmount(() => { if (timer) clearTimeout(timer) })
</script>
