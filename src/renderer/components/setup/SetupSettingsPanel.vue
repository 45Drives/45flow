<template>
  <section class="space-y-4">
    <FlowNotice v-if="error" tone="danger" size="sm" live>{{ error }}</FlowNotice>
    <p v-if="loading && !status" class="flex items-center gap-2 text-sm text-muted" role="status" aria-live="polite">
      <ArrowPathIcon class="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
      Loading server setup…
    </p>
    <FlowButton v-if="!status && error" @click="refresh">Try again</FlowButton>
    <template v-if="status">
      <StorageSetupPanel v-if="section === 'storage'" :api-fetch="apiFetch" :status="status" :persistence-key="storageKey" @refreshed="updated" @restarting="emit('restarting', $event)" />
      <template v-else-if="section === 'staff'">
        <FlowNotice :tone="status.adminGroup?.required ? 'info' : 'warning'" size="sm">
          {{ status.adminGroup?.required ? 'Staff group membership is required for server administration.' : 'Staff group enforcement is off on this server.' }}
          <span v-if="status.adminGroup?.required && !status.adminGroup.exists"> The staff group does not exist yet.</span>
        </FlowNotice>
        <template v-if="accountsLoaded">
          <p class="text-sm text-muted">Choose existing server accounts that can administer 45Flow. This changes staff-group access; it does not create user accounts. You cannot remove yourself or the last staff member.</p>
          <p class="text-sm">Staff users: {{ members.join(', ') || 'None' }}</p>
          <ul class="flow-list bg-default max-h-72 overflow-y-auto">
            <li v-for="account in accounts" :key="account.username" class="flow-list__row">
              <span class="min-w-0 flex-1 break-all">{{ account.username }}</span>
              <FlowButton :variant="account.member ? 'danger' : 'secondary'" size="sm"
                :disabled="busy || (account.member && (account.username === currentUsername || members.length <= 1))"
                :loading="busy && pendingUsername === account.username"
                :loading-text="account.member ? 'Removing…' : 'Adding…'"
                @click="setMember(account.username, !account.member)">{{ account.member ? 'Remove from staff' : 'Add to staff' }}</FlowButton>
            </li>
          </ul>
          <p v-if="!accounts.length" class="text-sm text-muted">No eligible local accounts found.</p>
          <FlowButton :disabled="busy" @click="refresh(false)">Refresh staff users</FlowButton>
        </template>
        <template v-else>
          <p v-if="refreshing" class="flex items-center gap-2 text-sm text-muted" role="status" aria-live="polite">
            <ArrowPathIcon class="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
            Loading staff users…
          </p>
          <FlowButton v-else :disabled="busy" @click="refresh(false)">Try again</FlowButton>
        </template>
      </template>
      <template v-else-if="section === 'uploads'">
        <FlowNotice :tone="status.malwareScan?.scannerAvailable ? 'success' : 'warning'" title="Malware scanner" size="sm">
          {{ status.malwareScan?.scannerAvailable ? 'Scanner is available.' : 'Scanner is not installed or is unavailable.' }}
          <span v-if="status.malwareScan?.required && !status.malwareScan.scannerAvailable"> Uploads are blocked until a scanner is available or scanning is turned off.</span>
          <p v-if="!status.malwareScan?.scannerAvailable && status.malwareScan?.detail" class="mt-2">{{ status.malwareScan.detail }}</p>
        </FlowNotice>
        <FlowNotice v-if="status.malwareScan?.locked" tone="info" size="sm">Scanning policy is locked by the server configuration.</FlowNotice>
        <div class="flex items-center justify-between gap-4">
          <span class="text-sm">Require malware scanning for uploads</span>
          <FlowSwitch v-model="requireScan" label="Require malware scanning for uploads" :disabled="busy || status.malwareScan?.locked" />
        </div>
        <FlowNotice v-if="!requireScan" tone="warning" size="sm">Uploads without scanning may contain malware. Only allow this if you have another way to check files.</FlowNotice>
        <div class="flex flex-wrap gap-2">
          <FlowButton v-if="!status.malwareScan?.scannerAvailable" :disabled="busy" @click="install">{{ busy ? 'Working…' : 'Install scanner' }}</FlowButton>
          <FlowButton variant="primary" :disabled="busy || status.malwareScan?.locked" @click="saveUploads">{{ requireScan ? 'Save scanning policy' : 'Allow uploads without scanning' }}</FlowButton>
          <FlowButton :disabled="busy" @click="refresh">Check scanner</FlowButton>
        </div>
      </template>
      <template v-else-if="section === 'watermarks'">
        <p class="text-sm text-muted">Project images come from each project's .45flow/watermarks folder. Optionally add a shared folder inside the storage root. Built-in images remain available.</p>
        <div class="flex items-center justify-between gap-4">
          <span class="text-sm">Enable global watermark folder</span>
          <FlowSwitch v-model="globalEnabled" label="Enable global watermark folder" :disabled="busy" />
        </div>
        <FlowField v-if="globalEnabled" label="Global watermark folder" help="Choose a folder inside the storage root. Only images directly in this folder are listed.">
          <p class="text-sm break-all mb-2">{{ globalDir || 'No folder selected' }}</p>
          <FolderPicker v-model="globalDir" :api-fetch="apiFetch" :base="status.storageRoot?.path" :start-dir="status.storageRoot?.path" :auto-detect-roots="false" hide-project-controls compact />
        </FlowField>
        <FlowButton variant="primary" :disabled="busy || (globalEnabled && !globalDir)" @click="saveWatermarks">Save watermarks</FlowButton>
      </template>
      <FlowNotice v-if="saved" tone="success" size="sm" live>{{ saved }}</FlowNotice>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ArrowPathIcon } from '@heroicons/vue/24/outline'
import { useApi } from '../../composables/useApi'
import { useConnections } from '../../composables/useConnections'
import { useSetupStatus, serverSetupKey, type SetupSection, type SetupStatus } from '../../composables/useSetupStatus'
import StorageSetupPanel from './StorageSetupPanel.vue'
import FolderPicker from '../FolderPicker.vue'
import FlowButton from '../../ui/FlowButton.vue'
import FlowNotice from '../../ui/FlowNotice.vue'
import FlowField from '../../ui/FlowField.vue'
import FlowSwitch from '../../ui/FlowSwitch.vue'

const props = defineProps<{ section: SetupSection; connectionId?: string; initialStatus?: SetupStatus }>()
const emit = defineEmits<{ refreshed: [status: SetupStatus]; restarting: [value: boolean] }>()
const { apiFetch } = useApi(props.connectionId)
const { activeConnection } = useConnections()
const storageKey = computed(() => serverSetupKey(activeConnection.value) + ':storage')
const currentUsername = activeConnection.value?.username
const { status, error, loading, load } = useSetupStatus(apiFetch)
if (props.initialStatus) status.value = props.initialStatus
const accounts = ref<{ username: string; uid: number; member: boolean }[]>([])
const members = ref<string[]>([])
const busy = ref(false)
const refreshing = ref(false)
const accountsLoaded = ref(false)
const pendingUsername = ref('')
const saved = ref('')
const requireScan = ref(true)
const globalEnabled = ref(false)
const globalDir = ref('')
function updated(data: SetupStatus) { status.value = data; emit('refreshed', data) }
async function refresh(includeStatus = !props.initialStatus) {
  refreshing.value = true
  if (props.section === 'staff') accountsLoaded.value = false
  error.value = ''
  try {
    const statusRequest = includeStatus || !status.value ? load() : Promise.resolve(status.value)
    const accountsRequest = props.section === 'staff' ? apiFetch('/api/admin/staff-accounts') : Promise.resolve(null)
    const [data, staff] = await Promise.all([statusRequest, accountsRequest])
    if (!data) {
      error.value = 'This server does not support storage setup. Update Broadcaster to use these settings.'
      return
    }
    requireScan.value = !!data.malwareScan?.required
    globalEnabled.value = !!data.watermarks?.globalEnabled
    globalDir.value = data.watermarks?.globalDir || ''
    if (props.section === 'staff') {
      accounts.value = staff.accounts || []
      members.value = staff.members || []
      accountsLoaded.value = true
    }
    emit('refreshed', data)
  } catch (e: any) { error.value = e?.message || 'Could not load server setup.' }
  finally { refreshing.value = false }
}
async function action(work: () => Promise<void>, message: string, reload = true) {
  if (busy.value) return
  busy.value = true
  error.value = ''
  saved.value = ''
  try { await work(); if (reload) await refresh(true); if (!error.value) saved.value = message }
  catch (e: any) { error.value = e?.message || 'Could not save. Try again.' }
  finally { busy.value = false }
}
async function setMember(username: string, member: boolean) {
  if (busy.value) return
  pendingUsername.value = username
  try {
    await action(async () => {
      const data = await apiFetch('/api/admin/staff-accounts', { method: 'POST', body: JSON.stringify({ username, member }), retry: 0 })
      const account = data.accounts?.find((item: { username: string }) => item.username === username)
      accounts.value = accounts.value.map(item => item.username === username ? { ...item, member: account?.member ?? member } : item)
      members.value = data.members ?? accounts.value.filter(item => item.member).map(item => item.username)
      if (status.value?.adminGroup) updated({
        ...status.value,
        adminGroup: { ...status.value.adminGroup, exists: data.exists ?? status.value.adminGroup.exists,
          members: members.value, currentUserIsMember: members.value.includes(currentUsername || '') },
      })
    }, 'Staff users updated.', false)
  } finally {
    pendingUsername.value = ''
  }
}
async function install() {
  await action(async () => { await apiFetch('/api/admin/malware-scanner/install', { method: 'POST', retry: 0, timeoutMs: 10 * 60 * 1000 }) }, 'Scanner installation requested. Check scanner status after installation finishes.')
}
async function saveUploads() {
  await action(async () => { await apiFetch('/api/admin/setup/settings', { method: 'POST', body: JSON.stringify({ malwareScanPolicy: requireScan.value ? 'require' : 'skip' }) }) }, 'Scanning policy saved.')
}
async function saveWatermarks() {
  const root = status.value?.storageRoot?.path?.replace(/\/+$/, '') || ''
  const dir = '/' + globalDir.value.replace(/^\/+|\/+$/g, '')
  if (globalEnabled.value && (!root || (dir !== root && !dir.startsWith(root + '/')))) { error.value = 'Choose a watermark folder inside the storage root.'; return }
  await action(async () => { await apiFetch('/api/admin/setup/settings', { method: 'POST', body: JSON.stringify({ globalWatermarkEnabled: globalEnabled.value, ...(globalEnabled.value ? { globalWatermarkDir: dir } : {}) }) }) }, 'Watermark settings saved.')
}
onMounted(() => refresh(!props.initialStatus))
</script>
