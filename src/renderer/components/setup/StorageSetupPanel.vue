<template>
  <section class="space-y-4" aria-label="Storage">
    <FlowNotice v-if="status?.storageRoot?.configured" tone="info" size="sm">
      Current storage root: <code class="break-all">{{ status.storageRoot.path }}</code>
      <span v-if="status.storageRoot.fstype"> · {{ status.storageRoot.fstype }}</span>
      <span v-if="currentCandidate"> · {{ formatSize(currentCandidate.avail) }} free</span>
    </FlowNotice>
    <p class="text-sm text-muted">All project folders must be inside one storage root. Choose a mounted filesystem, then optionally open a subfolder.</p>
    <FlowNotice v-if="error" tone="danger" size="sm" live>{{ error }}</FlowNotice>
    <FlowNotice v-if="restarting" tone="info" live title="Waiting for the server">
      The storage change restarts the server. Keep this window open while it reconnects.
      <template #actions><FlowButton :disabled="busy" @click="checkRestart(false)">Check again</FlowButton></template>
    </FlowNotice>
    <template v-else>
      <FlowButton :disabled="busy" @click="loadCandidates">{{ busy ? 'Loading…' : 'Refresh filesystems' }}</FlowButton>
      <ul class="flow-list max-h-56 overflow-y-auto" aria-label="Mounted filesystems">
        <li v-for="candidate in candidates" :key="candidate.path" class="flow-list__row flex-wrap" :class="{ 'flow-list__row--selected': candidate.path === anchor }">
          <div class="min-w-0 flex-1">
            <p class="flow-list__title break-all">{{ candidate.path }}</p>
            <p class="flow-list__meta break-all">{{ candidate.zfsDataset || candidate.source }} · {{ candidate.fstype }} · {{ formatSize(candidate.size) }} total · {{ formatSize(candidate.avail) }} free<span v-if="candidate.network"> · Network</span></p>
          </div>
          <FlowButton size="sm" :disabled="busy" @click="open(candidate.path, candidate.path)">Browse</FlowButton>
        </li>
      </ul>
      <p v-if="!busy && !candidates.length" class="text-sm text-muted">No storage filesystems found. Mount a data filesystem on the server, then refresh.</p>
      <template v-if="path">
        <FlowNotice v-if="selectedCandidate?.network" tone="warning" size="sm">Network storage can be slower and may have different file-locking behaviour. 45Flow uses this existing mount; it does not mount shares or manage credentials.</FlowNotice>
        <div class="flex items-center gap-2">
          <FlowButton :disabled="busy || path === anchor" @click="open(parentPath, anchor)">Up</FlowButton>
          <code class="text-sm break-all min-w-0">{{ path }}</code>
        </div>
        <ul class="flow-list max-h-48 overflow-y-auto" aria-label="Storage subfolders">
          <li v-for="dir in dirs" :key="dir.path" class="flow-list__row">
            <span class="min-w-0 flex-1 break-all">{{ dir.name }}</span>
            <FlowButton size="sm" :disabled="busy" @click="open(dir.path, anchor)">Open</FlowButton>
          </li>
        </ul>
        <p v-if="!dirs.length && !busy" class="text-sm text-muted">No subfolders.</p>
        <FlowButton variant="primary" :disabled="busy || path === '/'" @click="review">Use this folder</FlowButton>
        <p v-if="path === '/'" class="text-sm text-muted">Open a data folder. The system root cannot be used for storage.</p>
      </template>
    </template>
    <FlowModal v-model="confirming" title="Change storage root?" :busy="busy" size="lg">
      <p class="text-sm mb-3">Use <code class="break-all">{{ path }}</code> as the storage root? The server will restart. Existing files are not moved.</p>
      <template v-for="group in impactGroups" :key="group.label">
        <h4 class="font-semibold text-sm mt-4">{{ group.label }} ({{ group.items.length }})</h4>
        <ul class="text-sm list-disc pl-5 max-h-32 overflow-y-auto">
          <li v-for="(item, index) in group.items" :key="index" class="break-all">{{ impactLabel(item) }}</li>
        </ul>
        <p v-if="!group.items.length" class="text-sm text-muted">None.</p>
      </template>
      <label class="flex gap-2 items-start text-sm mt-4"><input v-model="acknowledged" type="checkbox" />I understand affected projects and links may become unavailable.</label>
      <template #footer>
        <FlowButton variant="dismiss" :disabled="busy" @click="confirming = false">Cancel</FlowButton>
        <FlowButton variant="primary" :disabled="busy || !acknowledged" @click="apply">Confirm storage root</FlowButton>
      </template>
    </FlowModal>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { readSetupProgress, saveSetupProgress, type SetupStatus } from '../../composables/useSetupStatus'
import { BACKGROUND_REQUEST } from '../../background-request'
import FlowButton from '../../ui/FlowButton.vue'
import FlowNotice from '../../ui/FlowNotice.vue'
import FlowModal from '../../ui/FlowModal.vue'

type Candidate = { path: string; fstype: string; source: string; size: number | string; avail: number | string; network?: boolean; zfsDataset?: string }
const props = defineProps<{ apiFetch: (url: string, init?: RequestInit) => Promise<any>; status: SetupStatus | null; persistenceKey?: string }>()
const emit = defineEmits<{ refreshed: [status: SetupStatus]; restarting: [value: boolean] }>()
const candidates = ref<Candidate[]>([])
const dirs = ref<{ name: string; path: string }[]>([])
const path = ref('')
const anchor = ref('')
const busy = ref(false)
const error = ref('')
const restarting = ref(false)
const confirming = ref(false)
const acknowledged = ref(false)
const impact = ref<{ projects: any[]; activeLinks: any[]; transfers: any[] }>({ projects: [], activeLinks: [], transfers: [] })
const impactGroups = computed(() => [
  { label: 'Projects outside the new root', items: impact.value.projects },
  { label: 'Active links', items: impact.value.activeLinks },
  { label: 'Running transfers and processing jobs', items: impact.value.transfers },
])
const selectedCandidate = computed(() => candidates.value.find(item => item.path === anchor.value))
const currentCandidate = computed(() => candidates.value.filter(item => props.status?.storageRoot?.path === item.path || props.status?.storageRoot?.path.startsWith(item.path.replace(/\/$/, '') + '/')).sort((a, b) => b.path.length - a.path.length)[0])
const parentPath = computed(() => path.value.replace(/\/+$/, '').split('/').slice(0, -1).join('/') || '/')
let timer: ReturnType<typeof setTimeout> | undefined
let disposed = false
let attempts = 0
function formatSize(value: number | string) {
  const numeric = typeof value === 'string' && value.trim() ? Number(value) : value
  if (typeof numeric !== 'number' || !Number.isFinite(numeric)) return value || 'unknown'
  return new Intl.NumberFormat(undefined, { style: 'unit', unit: 'gigabyte', maximumFractionDigits: 1 }).format(numeric / 1e9)
}
function impactLabel(item: any) { return typeof item === 'string' ? item : item.name || item.title || item.filename || item.root_dir || item.path || (item.kind ? `${item.kind} · ${item.status}` : item.id) || 'Affected item' }
async function action(work: () => Promise<void>) {
  busy.value = true
  error.value = ''
  try { await work() } catch (e: any) { error.value = e?.message || 'Storage operation failed. Try again.' }
  finally { busy.value = false }
}
async function loadCandidates() {
  await action(async () => {
    const data = await props.apiFetch('/api/admin/storage/candidates')
    candidates.value = (data.candidates || []).sort((a: Candidate, b: Candidate) => Number(!!b.zfsDataset || b.fstype === 'zfs') - Number(!!a.zfsDataset || a.fstype === 'zfs') || a.path.localeCompare(b.path))
  })
}
async function open(nextPath: string, nextAnchor: string) {
  await action(async () => {
    const data = await props.apiFetch(`/api/admin/storage/dirs?path=${encodeURIComponent(nextPath)}`)
    path.value = data.path || nextPath
    anchor.value = nextAnchor
    dirs.value = data.dirs || data.directories || []
  })
}
async function review() {
  await action(async () => {
    const data = await props.apiFetch(`/api/admin/storage/impact?path=${encodeURIComponent(path.value)}`)
    impact.value = { projects: data.projects || [], activeLinks: data.activeLinks || [], transfers: [...(data.transfers || data.runningTransfers || []), ...(data.runningJobs || [])] }
    acknowledged.value = false
    confirming.value = true
  })
}
async function apply() {
  await action(async () => {
    await props.apiFetch('/api/admin/storage/root', { method: 'POST', body: JSON.stringify({ path: path.value }) })
    if (props.persistenceKey) saveSetupProgress(props.persistenceKey, { restartPath: path.value })
    if (disposed) return
    confirming.value = false
    restarting.value = true
    emit('restarting', true)
    attempts = 0
    timer = setTimeout(checkRestart, 2500)
  })
}
async function checkRestart(background = true) {
  if (disposed || busy.value) return
  if (!background) { attempts = 0; error.value = '' }
  if (timer) clearTimeout(timer)
  busy.value = true
  try {
    const data: SetupStatus = await props.apiFetch('/api/setup/status', background ? { headers: BACKGROUND_REQUEST } : undefined)
    if (disposed) return
    if (data.storageRoot?.configured && data.storageRoot.path.replace(/\/+$/, '') === path.value.replace(/\/+$/, '')) {
      restarting.value = false
      if (props.persistenceKey) saveSetupProgress(props.persistenceKey, {})
      error.value = ''
      emit('refreshed', data)
      emit('restarting', false)
      return
    }
  } catch { /* The restart temporarily disconnects the session. */ }
  finally { busy.value = false }
  if (++attempts < 60 && !disposed) timer = setTimeout(checkRestart, 2500)
  else error.value = 'The server has not confirmed the storage change. Check the server connection, then choose Check again.'
}
onMounted(() => {
  const pending = props.persistenceKey ? readSetupProgress(props.persistenceKey).restartPath : ''
  if (pending) {
    path.value = pending
    restarting.value = true
    emit('restarting', true)
    void checkRestart()
  } else void loadCandidates()
})
onBeforeUnmount(() => { disposed = true; if (timer) clearTimeout(timer) })
</script>
