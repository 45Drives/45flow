<template>
  <FlowModal :model-value="true" :title="hasExistingProjects ? 'Review storage, staff, and sharing settings' : 'Set up storage, sharing, and your first project'" size="xl" :dismissible="false" hide-close :close-on-backdrop="false">
    <p class="text-sm text-muted mb-4">{{ hasExistingProjects ? 'Review your current settings. Existing projects and files are kept.' : 'Choose where projects are stored, who can manage the server, and what address share links use. Then create your first project.' }}</p>
    <p class="text-sm mb-3" aria-live="polite">Step {{ step + 1 }} of {{ steps.length }} · {{ steps[step] }}</p>
    <h3 class="text-lg font-semibold mb-4">{{ steps[step] }}</h3>
    <SetupSettingsPanel v-if="panel" :key="panel" :section="panel" :connection-id="connectionId" :initial-status="localStatus" @refreshed="updated" @restarting="restartChanged" />
    <ShareSetupPanel v-else-if="step === 2" :status="localStatus" :connection-id="connectionId" @refreshed="updated" />
    <template v-else-if="step === 3">
      <p v-if="!hasExistingProjects" class="text-sm text-muted mb-4">Create a project to finish setup. Its folder will be inside your storage root.</p>
      <p class="text-sm mb-4">Storage root: <code class="break-all">{{ localStatus.storageRoot?.path }}</code></p>
      <FlowButton v-if="!projectCreated" variant="primary" @click="creatingProject = true">Create project</FlowButton>
      <FlowNotice v-else tone="success" size="sm" live>{{ hasExistingProjects ? 'Your existing projects are ready. Choose Finish setup to return to 45Flow.' : 'Your project is ready. Choose Finish setup to start using 45Flow.' }}</FlowNotice>
    </template>
    <template #footer>
      <FlowButton :disabled="step === 0 || restarting" @click="step--">Back</FlowButton>
      <FlowButton v-if="step > 0 && step < 3" :disabled="restarting" @click="advance">Skip for now</FlowButton>
      <FlowButton v-if="step < 3" variant="primary" :disabled="restarting || (step === 0 && !storageConfigured)" @click="advance">Next</FlowButton>
      <FlowButton v-else-if="projectCreated" variant="primary" @click="advance">Finish setup</FlowButton>
    </template>
    <CreateProjectModal v-model="creatingProject" :storage-root="localStatus.storageRoot?.path" @created="created" />
  </FlowModal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { readSetupProgress, saveSetupProgress, type SetupStatus, type SetupSection } from '../../composables/useSetupStatus'
import SetupSettingsPanel from './SetupSettingsPanel.vue'
import ShareSetupPanel from './ShareSetupPanel.vue'
import CreateProjectModal from '../modals/CreateProjectModal.vue'
import FlowModal from '../../ui/FlowModal.vue'
import FlowButton from '../../ui/FlowButton.vue'
import FlowNotice from '../../ui/FlowNotice.vue'

const props = defineProps<{ status: SetupStatus; connectionId?: string; persistenceKey?: string }>()
const emit = defineEmits<{ complete: [projectCreated: boolean]; refreshed: [status: SetupStatus] }>()
const hasExistingProjects = (props.status.projects?.count ?? 0) > 0
const steps = ['Storage', 'Staff users', 'Sharing settings', hasExistingProjects ? 'Projects' : 'New project']
const savedStep = props.persistenceKey ? readSetupProgress(props.persistenceKey).step : 0
const pendingRoot = props.persistenceKey ? readSetupProgress(props.persistenceKey + ':storage').restartPath : ''
const rootStillPending = pendingRoot && props.status.storageRoot?.path !== pendingRoot
if (pendingRoot && !rootStillPending && props.persistenceKey) saveSetupProgress(props.persistenceKey + ':storage', {})
const step = ref(props.status.storageRoot?.configured && !rootStillPending && Number.isInteger(savedStep) ? Math.min(3, Math.max(0, savedStep || 0)) : 0)
const localStatus = ref(props.status)
const storageConfigured = computed(() => localStatus.value.storageRoot?.configured === true)
const restarting = ref(false)
const creatingProject = ref(false)
const projectCreated = ref(hasExistingProjects)
const stepPanels: (SetupSection | null)[] = ['storage', 'staff', null, null]
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
  if (step.value === 3) {
    if (projectCreated.value) emit('complete', true)
  }
  else step.value++
}
function created() { projectCreated.value = true; creatingProject.value = false }
</script>
