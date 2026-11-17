<template>
  <section class="space-y-3" aria-label="Storage">
    <p class="text-sm text-muted">Choose the main storage location for 45Flow. Project folders are chosen separately and must be inside this location.</p>
    <FlowNotice v-if="error" tone="danger" size="sm" live>{{ error }}</FlowNotice>
    <FlowNotice v-if="restarting" tone="info" live title="Waiting for the server">
      The storage change restarts the server. Keep this window open while it reconnects.
      <template #actions><FlowButton :disabled="busy" @click="checkRestart(false)">Check again</FlowButton></template>
    </FlowNotice>
    <template v-else>
      <FlowField label="Filesystem">
        <template #default="{ id, describedBy }">
          <div class="flex min-w-0 items-center gap-2">
            <select :id="id" :aria-describedby="describedBy" :value="anchor" :disabled="busy || !candidates.length" class="input-textlike w-full min-w-0 px-3 py-2"
              @change="browse(($event.target as HTMLSelectElement).value)">
              <option v-if="!candidates.length" value="">{{ busy ? 'Finding filesystems…' : 'No filesystems available' }}</option>
              <option v-for="candidate in candidates" :key="candidate.path" :value="candidate.path">{{ candidate.path }} · {{ candidate.fstype }}</option>
            </select>
            <FlowButton variant="icon" size="sm" :disabled="busy" aria-label="Refresh filesystems" title="Refresh filesystems" @click="loadCandidates">
              <ArrowPathIcon class="h-4 w-4" :class="{ 'motion-safe:animate-spin': busy }" aria-hidden="true" />
            </FlowButton>
          </div>
        </template>
        <template v-if="selectedCandidate" #help>
          {{ formatSize(selectedCandidate.avail) }} free of {{ formatSize(selectedCandidate.size) }}
          <span v-if="selectedCandidate.zfsDataset"> · Dataset {{ selectedCandidate.zfsDataset }}</span>
        </template>
      </FlowField>
      <p v-if="!busy && !candidates.length" class="text-sm text-muted">Mount a supported filesystem, or use an existing /srv or /mnt folder, then refresh. ZFS is optional.</p>
      <template v-if="anchor">
        <FlowNotice v-if="selectedCandidate?.network" tone="warning" size="sm">Network storage speed and permissions depend on the remote server. 45Flow uses this existing mount.</FlowNotice>
        <FolderPicker :key="browserVersion" v-model="path" :api-fetch="apiFetch" :base="anchor" :start-dir="startPath"
          storage-browse :auto-detect-roots="false" hide-project-controls compact
          :inert="busy || undefined" @browse-ready="browserReady = $event" />
        <p v-if="!wizard && changed && status?.storageRoot?.configured" class="text-xs text-muted break-all">Current storage: <code>{{ status.storageRoot.path }}</code></p>
        <p v-if="wizard" class="text-xs text-muted">Choose Next to continue. Changes are reviewed before saving; existing files are not moved.</p>
        <FlowButton v-else variant="primary" :disabled="!canContinue || !changed" @click="review">Save storage location</FlowButton>
      </template>
    </template>
    <FlowModal v-model="confirming" title="Change storage location?" :busy="busy" size="lg">
      <p class="text-sm mb-3">Use <code class="break-all">{{ path }}</code> as the main storage location for 45Flow? The server will restart. Existing files are not moved.</p>
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
        <FlowButton variant="primary" :disabled="busy || !acknowledged" @click="apply">Confirm storage location</FlowButton>
      </template>
    </FlowModal>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { ArrowPathIcon } from '@heroicons/vue/24/outline'
import { readSetupProgress, saveSetupProgress, type SetupStatus } from '../../composables/useSetupStatus'
import type { useApi } from '../../composables/useApi'
import { BACKGROUND_REQUEST } from '../../background-request'
import FlowButton from '../../ui/FlowButton.vue'
import FlowNotice from '../../ui/FlowNotice.vue'
import FlowModal from '../../ui/FlowModal.vue'
import FlowField from '../../ui/FlowField.vue'
import FolderPicker from '../FolderPicker.vue'

type Candidate = { path: string; fstype: string; source: string; size: number | string; avail: number | string; network?: boolean; zfsDataset?: string }
const props = defineProps<{ apiFetch: ReturnType<typeof useApi>['apiFetch']; status: SetupStatus | null; persistenceKey?: string; wizard?: boolean }>()
const emit = defineEmits<{ refreshed: [status: SetupStatus]; restarting: [value: boolean]; 'can-continue': [value: boolean] }>()
const candidates = ref<Candidate[]>([])
const path = ref('')
const anchor = ref('')
const startPath = ref('')
const browserReady = ref(false)
const browserVersion = ref(0)
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
const selectedPath = () => '/' + path.value.replace(/^\/+|\/+$/g, '')
const changed = computed(() => !props.status?.storageRoot?.configured || selectedPath() !== props.status.storageRoot.path.replace(/\/+$/, ''))
const canContinue = computed(() => browserReady.value && !!anchor.value && !busy.value && !restarting.value && !confirming.value)
watch(canContinue, value => emit('can-continue', value), { immediate: true })
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
    if (candidates.value.some(item => item.path === anchor.value)) return
    const current = props.status?.storageRoot?.configured ? props.status.storageRoot.path.replace(/\/+$/, '') : ''
    const match = candidates.value.filter(item => current === item.path || current.startsWith(item.path + '/')).sort((a, b) => b.path.length - a.path.length)[0]
    const candidate = match || candidates.value[0]
    if (candidate) browse(candidate.path, match ? current : candidate.path)
    else { anchor.value = ''; path.value = ''; browserReady.value = false }
  })
}
function browse(root: string, start = root) {
  browserReady.value = false
  browserVersion.value++
  path.value = start
  anchor.value = root
  startPath.value = start
}
async function prepareContinue() {
  if (!canContinue.value) return false
  if (!changed.value) return true
  await review()
  return false
}
defineExpose({ prepareContinue })
async function review() {
  await action(async () => {
    path.value = selectedPath()
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
