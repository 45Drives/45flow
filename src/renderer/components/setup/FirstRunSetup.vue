<template>
  <FlowModal :model-value="true" title="Set up your server" size="xl" :dismissible="false" hide-close :close-on-backdrop="false">
    <p class="text-sm text-muted mb-4">Choose where projects live, then create your first project. Other steps can be skipped and revisited in Settings.</p>
    <p class="text-sm mb-3" aria-live="polite">Step {{ step + 1 }} of {{ steps.length }} · {{ steps[step] }}</p>
    <h3 class="text-lg font-semibold mb-4">{{ steps[step] }}</h3>
    <SetupSettingsPanel v-if="panel" :key="panel" :section="panel" :connection-id="connectionId" @refreshed="updated" @restarting="restartChanged" />
    <template v-else-if="step === 2">
      <p class="text-sm text-muted mb-4">Set the address used in share links, then check whether recipients can reach it.</p>
      <div class="flex flex-wrap gap-2">
        <FlowButton @click="settingsSection = 'sharing'">Edit share addresses</FlowButton>
        <FlowButton @click="settingsSection = 'publicSharing'">Check internet sharing</FlowButton>
      </div>
    </template>
    <template v-else-if="step === 5">
      <p class="text-sm text-muted mb-4">A project groups the media and links for one job. Its folder stays inside your storage root.</p>
      <FlowButton variant="primary" @click="creatingProject = true">Create first project</FlowButton>
      <FlowNotice v-if="projectCreated" tone="success" size="sm" class="mt-4">Your project is ready.</FlowNotice>
    </template>
    <template #footer>
      <FlowButton :disabled="step === 0 || restarting" @click="step--">Back</FlowButton>
      <FlowButton v-if="step > 0" :disabled="restarting" @click="advance">{{ step === 5 ? (projectCreated ? 'Finish setup' : 'Skip for now') : 'Skip for now' }}</FlowButton>
      <FlowButton v-if="step < 5" variant="primary" :disabled="restarting || (step === 0 && !storageConfigured)" @click="advance">Next</FlowButton>
    </template>
    <SettingsModal v-if="settingsSection" :initial-section="settingsSection" defer-tour @close="settingsSection = ''" />
    <CreateProjectModal v-model="creatingProject" :storage-root="localStatus.storageRoot?.path" @created="created" />
  </FlowModal>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { readSetupProgress, saveSetupProgress, type SetupStatus, type SetupSection } from '../../composables/useSetupStatus'
import SetupSettingsPanel from './SetupSettingsPanel.vue'
import CreateProjectModal from '../modals/CreateProjectModal.vue'
import FlowModal from '../../ui/FlowModal.vue'
import FlowButton from '../../ui/FlowButton.vue'
import FlowNotice from '../../ui/FlowNotice.vue'

const SettingsModal = defineAsyncComponent(() => import('../modals/SettingsModal.vue').then(m => m.default))

const props = defineProps<{ status: SetupStatus; connectionId?: string; persistenceKey?: string }>()
const emit = defineEmits<{ complete: []; refreshed: [status: SetupStatus] }>()
const steps = ['Storage', 'Staff server accounts', 'Share address', 'Uploads', 'Watermarks', 'First project']
const savedStep = props.persistenceKey ? readSetupProgress(props.persistenceKey).step : 0
const pendingRoot = props.persistenceKey ? readSetupProgress(props.persistenceKey + ':storage').restartPath : ''
const rootStillPending = pendingRoot && props.status.storageRoot?.path !== pendingRoot
if (pendingRoot && !rootStillPending && props.persistenceKey) saveSetupProgress(props.persistenceKey + ':storage', {})
const step = ref(props.status.storageRoot?.configured && !rootStillPending && Number.isInteger(savedStep) ? Math.min(5, Math.max(0, savedStep || 0)) : 0)
const localStatus = ref(props.status)
const storageConfigured = computed(() => localStatus.value.storageRoot?.configured === true)
const restarting = ref(false)
const settingsSection = ref('')
const creatingProject = ref(false)
const projectCreated = ref(false)
const stepPanels: (SetupSection | null)[] = ['storage', 'staff', null, 'uploads', 'watermarks', null]
const panel = computed(() => stepPanels[step.value])
watch(step, value => { if (props.persistenceKey) saveSetupProgress(props.persistenceKey, { step: value }) }, { flush: 'sync' })
function restartChanged(value: boolean) {
  const wasRestarting = restarting.value
  restarting.value = value
  if (value && props.persistenceKey) saveSetupProgress(props.persistenceKey, { step: 1 })
  if (wasRestarting && !value && step.value === 0) step.value = 1
}
function updated(status: SetupStatus) { localStatus.value = status; emit('refreshed', status) }
function advance() {
  if (restarting.value || (step.value === 0 && !storageConfigured.value)) return
  if (step.value === 5) emit('complete')
  else step.value++
}
function created() { projectCreated.value = true; creatingProject.value = false }
</script>
