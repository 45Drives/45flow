<template>
  <FlowModal :model-value="true" :title="hasExistingProjects ? 'Review server setup' : 'Set up 45Flow'" size="xl" :dismissible="false" hide-close :close-on-backdrop="false">
    <p v-if="step > 0" class="text-sm text-muted mb-4">{{ hasExistingProjects ? 'Review your current settings and projects. Project folders and files are kept, even when removing a project.' : 'Choose a storage location, staff access, and share-link settings. Then add projects by selecting or creating their folders.' }}</p>
    <div class="flex items-center justify-between gap-3 mb-3">
      <h3 class="text-lg font-semibold">{{ steps[step] }}</h3>
      <p class="text-sm text-muted whitespace-nowrap" aria-live="polite">Step {{ step + 1 }} of {{ steps.length }}</p>
    </div>
    <SetupSettingsPanel v-if="panel" :key="panel" ref="settingsPanel" :section="panel" :connection-id="connectionId" :initial-status="localStatus" wizard
      @refreshed="updated" @restarting="restartChanged" @can-continue="storageCanContinue = $event" />
    <ShareSetupPanel v-else-if="step === 2" :status="localStatus" :connection-id="connectionId" @refreshed="updated" />
    <template v-else-if="step === 3">
      <p class="text-sm text-muted mb-4">Add one or more projects to finish setup. For each project, select its exact folder or create a new folder in the browser. The selected folder becomes the project folder; no extra folder is added.</p>
      <p class="text-sm mb-4">Main storage location: <code class="break-all">{{ localStatus.storageRoot?.path }}</code></p>
      <FlowNotice v-if="projectError" tone="danger" size="sm" live class="mb-3">{{ projectError }}</FlowNotice>
      <p v-if="loadingProjects" class="text-sm text-muted mb-3" role="status">Loading projects…</p>
      <ul v-if="projects.length" class="flow-list bg-default max-h-72 overflow-y-auto mb-4" aria-label="Projects">
        <li v-for="project in projects" :key="project.id" class="flow-list__row">
          <div class="min-w-0 flex-1">
            <p class="flow-list__title break-words">{{ project.name }}</p>
            <p class="flow-list__meta break-all">{{ project.root_dir }}</p>
          </div>
          <FlowButton variant="icon" size="sm" :aria-label="`Edit ${project.name}`" :title="`Edit ${project.name}`" :disabled="loadingProjects" @click="editingProject = project">
            <PencilSquareIcon class="h-4 w-4" aria-hidden="true" />
          </FlowButton>
          <FlowButton variant="danger" size="sm" :aria-label="`Delete ${project.name}`" :title="`Delete ${project.name}`" :disabled="loadingProjects" @click="deletingProject = project; deleteError = ''">
            <TrashIcon class="h-4 w-4" aria-hidden="true" />
          </FlowButton>
        </li>
      </ul>
      <p v-else-if="projectsLoaded && !loadingProjects" class="text-sm text-muted mb-4">No projects yet. Add a project to continue.</p>
      <div class="flex flex-wrap gap-2">
        <FlowButton variant="primary" :disabled="loadingProjects || !projectsLoaded" @click="creatingProject = true">{{ projectCreated ? 'Create another project' : 'Create project' }}</FlowButton>
        <FlowButton :disabled="loadingProjects" @click="loadProjects">Refresh projects</FlowButton>
      </div>
    </template>
    <template #footer>
      <p v-if="step === 0" class="min-w-0 flex-1 truncate text-xs text-muted" :title="localStatus.storageRoot?.configured ? localStatus.storageRoot.path : undefined">
        Current storage: <code v-if="localStatus.storageRoot?.configured">{{ localStatus.storageRoot.path }}</code><span v-else>Not configured</span>
      </p>
      <FlowButton :disabled="step === 0 || restarting" @click="step--">Back</FlowButton>
      <FlowButton v-if="step > 0 && step < 3" :disabled="restarting" @click="advance">Skip for now</FlowButton>
      <FlowButton v-if="step < 3" variant="primary" :disabled="restarting || continuing || (step === 0 && !storageCanContinue)" @click="advance">Next</FlowButton>
      <FlowButton v-else-if="projectCreated" variant="primary" :disabled="loadingProjects" @click="advance">Finish setup</FlowButton>
    </template>
    <CreateProjectModal v-if="creatingProject" v-model="creatingProject" :storage-root="localStatus.storageRoot?.path" :connection-id="connectionId" @created="created" />
    <CreateProjectModal v-if="editingProject" :model-value="true" :project="editingProject" :storage-root="localStatus.storageRoot?.path" :connection-id="connectionId"
      @update:model-value="editingProject = null" @saved="projectSaved" />
    <ConfirmDeleteModal :model-value="!!deletingProject" title="Delete project?" confirm-text="Delete project" :busy="deleting" :error="deleteError"
      @update:model-value="deletingProject = null" @confirm="deleteProject">
      <p>Delete <strong>{{ deletingProject?.name }}</strong> from 45Flow?</p>
      <p class="mt-2">Its folder and files will be kept. Existing share links will be kept but no longer belong to this project.</p>
    </ConfirmDeleteModal>
  </FlowModal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { PencilSquareIcon, TrashIcon } from '@heroicons/vue/24/outline'
import { useApi } from '../../composables/useApi'
import { readSetupProgress, saveSetupProgress, type SetupStatus, type SetupSection } from '../../composables/useSetupStatus'
import SetupSettingsPanel from './SetupSettingsPanel.vue'
import ShareSetupPanel from './ShareSetupPanel.vue'
import CreateProjectModal, { type ProjectDetails } from '../modals/CreateProjectModal.vue'
import ConfirmDeleteModal from '../modals/ConfirmDeleteModal.vue'
import FlowModal from '../../ui/FlowModal.vue'
import FlowButton from '../../ui/FlowButton.vue'
import FlowNotice from '../../ui/FlowNotice.vue'

const props = defineProps<{ status: SetupStatus; connectionId?: string; persistenceKey?: string }>()
const emit = defineEmits<{ complete: [projectCreated: boolean]; refreshed: [status: SetupStatus] }>()
const { apiFetch } = useApi(props.connectionId)
const hasExistingProjects = computed(() => (props.status.projects?.count ?? 0) > 0)
const steps = ['Storage', 'Staff users', 'Sharing settings', 'Projects']
const savedStep = props.persistenceKey ? readSetupProgress(props.persistenceKey).step : 0
const pendingRoot = props.persistenceKey ? readSetupProgress(props.persistenceKey + ':storage').restartPath : ''
const rootStillPending = pendingRoot && props.status.storageRoot?.path !== pendingRoot
if (pendingRoot && !rootStillPending && props.persistenceKey) saveSetupProgress(props.persistenceKey + ':storage', {})
const step = ref(props.status.storageRoot?.configured && !rootStillPending && Number.isInteger(savedStep) ? Math.min(3, Math.max(0, savedStep || 0)) : 0)
const localStatus = ref(props.status)
const settingsPanel = ref<InstanceType<typeof SetupSettingsPanel> | null>(null)
const storageCanContinue = ref(false)
const continuing = ref(false)
const restarting = ref(false)
const creatingProject = ref(false)
const projects = ref<ProjectDetails[]>([])
const projectsLoaded = ref(false)
const loadingProjects = ref(false)
const projectError = ref('')
const editingProject = ref<ProjectDetails | null>(null)
const deletingProject = ref<ProjectDetails | null>(null)
const deleting = ref(false)
const deleteError = ref('')
const projectCreated = computed(() => projectsLoaded.value && projects.value.length > 0)
const stepPanels: (SetupSection | null)[] = ['storage', 'staff', null, null]
const panel = computed(() => stepPanels[step.value])
watch(step, value => { if (props.persistenceKey) saveSetupProgress(props.persistenceKey, { step: value }) }, { flush: 'sync' })
watch(() => props.status, status => { localStatus.value = status })
watch(step, value => { if (value === 3) void loadProjects() }, { immediate: true })
function restartChanged(value: boolean) {
  const wasRestarting = restarting.value
  restarting.value = value
  if (value && props.persistenceKey) saveSetupProgress(props.persistenceKey, { step: 1 })
  if (wasRestarting && !value && step.value === 0) step.value = 1
}
function updated(status: SetupStatus) { localStatus.value = status; emit('refreshed', status) }
async function advance() {
  if (restarting.value || continuing.value) return
  if (step.value === 0) {
    if (!storageCanContinue.value || !settingsPanel.value) return
    continuing.value = true
    try { if (!await settingsPanel.value.prepareContinue()) return }
    finally { continuing.value = false }
  }
  if (step.value === 3) {
    if (projectCreated.value && !loadingProjects.value) emit('complete', true)
  }
  else step.value++
}
async function loadProjects() {
  if (loadingProjects.value) return
  loadingProjects.value = true
  projectError.value = ''
  try {
    const data = await apiFetch('/api/projects')
    projects.value = data.projects
    projectsLoaded.value = true
  } catch (error) {
    projectError.value = error instanceof Error ? error.message : 'Could not load projects. Choose Refresh projects to try again.'
  } finally {
    loadingProjects.value = false
  }
}
function created(project: ProjectDetails) {
  projects.value = [...projects.value.filter(item => item.id !== project.id), project]
  creatingProject.value = false
}
function projectSaved(project: ProjectDetails) {
  projects.value = projects.value.map(item => item.id === project.id ? project : item)
  editingProject.value = null
}
async function deleteProject() {
  if (!deletingProject.value || deleting.value) return
  const project = deletingProject.value
  deleting.value = true
  deleteError.value = ''
  try {
    await apiFetch(`/api/projects/${project.id}?hard=1`, { method: 'DELETE', retry: 0 })
    projects.value = projects.value.filter(item => item.id !== project.id)
    deletingProject.value = null
  } catch (error) {
    deleteError.value = error instanceof Error ? error.message : 'Could not delete the project. Try again.'
  } finally {
    deleting.value = false
  }
}
</script>
