<template>
	<CardContainer class="dashboard-shell overflow-y-auto h-full min-h-0">
		<template #header>
			<div class="dashboard-top">
				<div class="dashboard-intro">
					<h2 class="dashboard-title">Control Center</h2>
					<p class="dashboard-subtitle">Create links, monitor activity, and manage access from one place.</p>
				</div>

				<div class="dashboard-utility button-group-row">
					<button @click="goToManageUsers" data-tour="manage-users" class="btn btn-secondary px-5 py-2.5">Manage Access</button>
					<button @click="goToLogs" data-tour="view-logs" class="btn btn-secondary px-5 py-2.5">View Logs</button>
					<button @click="goToSettings" data-tour="settings" class="btn btn-secondary px-5 py-2.5">Settings</button>
					<button @click="leaveServer" class="btn btn-danger px-5 py-2.5">Log Out</button>
				</div>
			</div>

			<div v-if="showUnlicensedBanner && !isPremiumActive" class="dashboard-license-banner">
				<div class="dashboard-license-copy">
					{{ unlicensedBannerMessage }}
				</div>
				<button type="button" class="btn btn-primary h-fit" @click="goToUpgrade">Go Pro</button>
				<button type="button" class="btn btn-secondary h-fit text-xs px-2 py-1" @click="dismissBanner">✕</button>
			</div>

			<div class="dashboard-actions" data-tour="action-cards">
				<button @click="goToCreateLink" class="btn btn-primary dashboard-action" data-tour="create-link">
					<span class="dashboard-action-title">Create Link</span>
					<span class="dashboard-action-copy">Create a shareable link for users to upload or review.</span>
				</button>
				<button @click="goToUploadFiles" class="btn btn-primary dashboard-action" data-tour="upload-files">
					<span class="dashboard-action-title">Upload Files</span>
					<span class="dashboard-action-copy">Send files from this workstation to the server.</span>
				</button>
			</div>
		</template>

		<!-- ═══════════ Flat Links View (Project Mode OFF) ═══════════ -->
		<div v-if="!projectModeEnabled" class="dashboard-content-wrap" data-tour="manage-links">
			<ManageLinks :tourActive="tourShowDemoLinks"/>
		</div>

		<!-- ═══════════ Project List View ═══════════ -->
		<div v-else-if="!activeProject && !showingUnassigned" class="dashboard-content-wrap" data-tour="project-list">
			<div class="flex items-center justify-between gap-3 mb-3 px-1">
				<h3 class="text-base font-semibold">Projects</h3>
				<button class="btn btn-secondary text-xs px-3 py-1.5" @click="showCreateProjectModal = true">+ New Project</button>
			</div>

			<div v-if="projectsLoading" class="flex items-center justify-center py-8">
				<span class="text-sm text-muted">Loading projects…</span>
			</div>

			<div v-else-if="projects.length === 0" class="flex flex-col items-center justify-center py-12 gap-3">
				<p class="text-muted text-sm">No projects yet. Create your first project to get started.</p>
				<button class="btn btn-primary px-4 py-2 text-sm" @click="showCreateProjectModal = true">Create Project</button>
			</div>

			<div v-else class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
				<div
					v-for="project in projects"
					:key="project.id"
					class="project-card panel rounded-xl p-4 cursor-pointer border border-default bg-default"
					@click="openProject(project)"
				>
					<div class="flex items-start justify-between gap-2 mb-2">
						<h4 class="font-semibold text-sm truncate">{{ project.name }}</h4>
						<div class="flex flex-row items-end gap-1.5 mb-2">
							<span class="ss-chip ss-chip--neutral text-xs">Total Links: {{ project.link_count ?? 0 }}</span>
							<span class="ss-chip ss-chip--success text-xs">Active {{ project.active_count ?? 0 }}</span>
							<span class="ss-chip ss-chip--warning text-xs">Expired {{ project.expired_count ?? 0 }}</span>
							<span class="ss-chip ss-chip--danger text-xs">Disabled {{ project.disabled_count ?? 0 }}</span>
						</div>
					</div>
					<div class="text-xs truncate" :title="project.root_dir">Directory: {{ project.root_dir }}</div>
					<p v-if="project.description" class="text-xs line-clamp-2 mb-2">Description: {{ project.description }}</p>
				</div>

				<!-- Unassigned Links card -->
				<div
					class="project-card panel rounded-xl p-4 cursor-pointer border border-dashed border-muted bg-default opacity-80 hover:opacity-100"
					@click="openUnassignedLinks"
				>
					<div class="flex items-start justify-between gap-2 mb-2">
						<h4 class="font-semibold text-sm truncate text-muted">Unassigned Links</h4>
					</div>
					<p class="text-xs text-muted">Links not associated with any project.</p>
				</div>
			</div>
		</div>

		<!-- ═══════════ Unassigned Links View ═══════════ -->
		<div v-else-if="showingUnassigned" class="dashboard-content-wrap" data-tour="manage-links">
			<div class="flex items-center gap-2 mb-3 px-1">
				<button class="text-sm text-primary hover:underline cursor-pointer" @click="backToProjects">Projects</button>
				<span class="text-muted text-sm">›</span>
				<span class="text-sm font-semibold truncate">Unassigned Links</span>
				<div class="button-group-row ml-auto text-xs">
					<button class="btn btn-danger" @click="backToProjects">Close</button>
				</div>
			</div>
			<ManageLinks projectId="none" key="unassigned" :tourActive="tourShowDemoLinks"/>
		</div>

		<!-- ═══════════ Project Detail View (Links) ═══════════ -->
		<div v-else class="dashboard-content-wrap" data-tour="manage-links">
			<!-- Breadcrumb -->
			<div class="flex items-center gap-2 mb-3 px-1">
				<button class="text-sm text-primary hover:underline cursor-pointer" @click="backToProjects">Projects</button>
				<span class="text-muted text-sm">›</span>
				<span class="text-sm font-semibold truncate">{{ activeProject.name }}</span>
				<div class="button-group-row ml-auto text-xs">
					<button class="btn btn-secondary" @click="startEditProject">Edit Project</button>
					<button class="btn btn-danger" @click="backToProjects">Close Project</button>
				</div>
			</div>
			<div class="flex flex-row justify-start text-default border-b border-default">
				<p class="text-xs mb-3 px-1 truncate" :title="activeProject.root_dir">Directory: {{ activeProject.root_dir }}</p>
				<p v-if="activeProject.description" class="text-xs mb-1 px-1">|</p>
				<p v-if="activeProject.description" class="text-xs mb-1 px-1">Description: {{ activeProject.description }}</p>
			</div>

			<ManageLinks :projectId="activeProject.id" :key="activeProject.id" :tourActive="tourShowDemoLinks"/>
		</div>
	</CardContainer>

	<SettingsModal v-if="showSettings" :initialSection="settingsInitialSection" @close="showSettings = false" />
	<LogViewModal v-if="showLogs" @close="showLogs = false" />
	<AddUsersModal v-model="usersModalOpen" :apiFetch="apiFetch" />
	<CreateProjectModal v-model="showCreateProjectModal" @created="onProjectCreated" />

	<!-- Edit Project Modal -->
	<Teleport to="body">
		<div v-if="showEditProjectModal && activeProject" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 text-default" @click.self="showEditProjectModal = false">
			<div class="panel rounded-2xl shadow-2xl p-6 w-full max-w-4xl mx-4 bg-accent">
				<h3 class="text-lg font-semibold mb-4">Edit Project</h3>
				<form @submit.prevent="saveProject" class="flex flex-col gap-4">
					<div>
						<label class="block text-sm font-medium mb-1">Project Name</label>
						<input
							v-model="editProjectName"
							type="text"
							class="input-textlike w-full px-3 py-2 rounded-lg border border-default"
							required
						/>
					</div>
					<div>
						<label class="block text-sm font-medium mb-1">Project Root Directory</label>
						<FolderPicker
							:key="editKey"
							v-model="editProjectRoot"
							:apiFetch="apiFetch"
							useCase="upload"
							subtitle="Change the root directory for this project."
							:auto-detect-roots="true"
							:allow-entire-tree="true"
							:startDir="editProjectRoot"
							v-model:project="editProjectPickerBase"
							v-model:dest="editProjectRoot"
						/>
					</div>
					<div>
						<label class="block text-sm font-medium mb-1">Description (optional)</label>
						<textarea
							v-model="editProjectDescription"
							class="input-textlike w-full px-3 py-2 rounded-lg border border-default resize-none"
							rows="2"
							placeholder="Brief description…"
						/>
					</div>
					<div class="flex items-center justify-end gap-2 mt-2">
						<button type="button" class="btn btn-secondary px-4 py-2" @click="showEditProjectModal = false">Cancel</button>
						<button type="submit" class="btn btn-primary px-4 py-2" :disabled="!editProjectName.trim() || !editProjectRoot.trim() || savingProject">
							{{ savingProject ? 'Saving…' : 'Save' }}
						</button>
					</div>
				</form>
			</div>
		</div>
	</Teleport>
</template>

<script setup lang="ts">
import { CardContainer } from '@45drives/houston-common-ui'
import { Notification } from '@45drives/houston-common-ui'
import { useHeader } from '../composables/useHeader'
import { useResilientNav } from '../composables/useResilientNav'
import { pushNotification } from '../composables/useNotificationQueue'
import ManageLinks from './ManageLinks.vue'
import SettingsModal from '../components/modals/SettingsModal.vue'
import AddUsersModal from '../components/modals/AddUsersModal.vue'
import LogViewModal from '../components/modals/LogViewModal.vue'
import CreateProjectModal from '../components/modals/CreateProjectModal.vue'
import FolderPicker from '../components/FolderPicker.vue'
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useApi } from '../composables/useApi'
import { useTransferProgress } from '../composables/useTransferProgress'
import { clearLastSession } from '../composables/useSessionPersistence'
import { useConnections } from '../composables/useConnections'
import { useTourManager, type TourStep } from '../composables/useTourManager'
import { useOnboarding } from '../composables/useOnboarding'
import { useActiveProject } from '../composables/useActiveProject'
import { useProjectMode } from '../composables/useProjectMode'
import { useLicenseStatus } from '../composables/useLicenseStatus'

useHeader('Dashboard')
const { to } = useResilientNav()
const { apiFetch } = useApi()
const transfer = useTransferProgress()
const { activeConnection, updateConnection } = useConnections()
const { requestTour } = useTourManager()
const { onboarding, markDone } = useOnboarding()
const { activeProject: globalActiveProject, setActiveProject: setGlobalActiveProject } = useActiveProject()
const { projectModeEnabled } = useProjectMode()
const { isPremiumActive, startBackgroundCheck, stopBackgroundCheck, checkLicenseInBackground } = useLicenseStatus()

// Start background license polling while dashboard is mounted
startBackgroundCheck()
onUnmounted(() => stopBackgroundCheck())

// ── License Banner ──
// Show banner only when server WAS licensed but background check detects it's now unlicensed
const showUnlicensedBanner = ref(false)
const unlicensedBannerMessage = ref('')
const wasPreviouslyLicensed = ref(activeConnection.value?.licensed ?? false)

watch(isPremiumActive, (nowLicensed, wasLicensed) => {
	if (!nowLicensed && wasPreviouslyLicensed.value) {
		const conn = activeConnection.value
		showUnlicensedBanner.value = true
		unlicensedBannerMessage.value =
			`Connected to ${conn?.name || conn?.serverIp || 'server'}, but the server license has expired or been revoked. Premium features are disabled until re-activated.`
	} else if (nowLicensed) {
		showUnlicensedBanner.value = false
		unlicensedBannerMessage.value = ''
	}
	if (nowLicensed) wasPreviouslyLicensed.value = true
})

// ── Projects ──
interface Project {
	id: number
	name: string
	root_dir: string
	description: string | null
	link_count: number
	active_count: number
	expired_count: number
	disabled_count: number
}

const projects = ref<Project[]>([])
const projectsLoading = ref(true)
const activeProject = ref<Project | null>(null)
const showingUnassigned = ref(false)

const showCreateProjectModal = ref(false)

const showEditProjectModal = ref(false)
const editProjectName = ref('')
const editProjectRoot = ref('')
const editProjectPickerBase = ref('')
const editProjectDescription = ref('')
const savingProject = ref(false)
const editKey = ref(0)

async function fetchProjects() {
	projectsLoading.value = true
	try {
		const data = await apiFetch('/api/projects')
		projects.value = data.projects || []
	} catch {
		projects.value = []
	} finally {
		projectsLoading.value = false
	}
}

function openProject(project: Project) {
	activeProject.value = project
	showingUnassigned.value = false
}

function openUnassignedLinks() {
	activeProject.value = null
	showingUnassigned.value = true
}

function backToProjects() {
	activeProject.value = null
	showingUnassigned.value = false
	fetchProjects()
}

watch(activeProject, (p) => setGlobalActiveProject(p))

// Clear active project when project mode is disabled
watch(projectModeEnabled, (enabled) => {
	if (!enabled) {
		activeProject.value = null
		setGlobalActiveProject(null)
	}
})

// Close active project when switching servers (projects are server-specific)
watch(activeConnection, (newConn, oldConn) => {
	// Only close if actually switching between different servers
	if (oldConn && newConn && oldConn.connectionId !== newConn.connectionId) {
		if (activeProject.value) {
			activeProject.value = null
		}
	}
})

function onProjectCreated(project: any) {
	fetchProjects().then(() => {
		const created = projects.value.find(p => p.id === project?.id)
		if (created) openProject(created)
	})
}

function startEditProject() {
	if (!activeProject.value) return
	editProjectName.value = activeProject.value.name
	editProjectRoot.value = activeProject.value.root_dir
	editProjectPickerBase.value = activeProject.value.root_dir
	editProjectDescription.value = activeProject.value.description || ''
	editKey.value++
	showEditProjectModal.value = true
}

async function saveProject() {
	if (!activeProject.value || !editProjectName.value.trim() || !editProjectRoot.value.trim()) return
	savingProject.value = true
	try {
		await apiFetch(`/api/projects/${activeProject.value.id}`, {
			method: 'PATCH',
			body: JSON.stringify({
				name: editProjectName.value.trim(),
				rootDir: editProjectRoot.value.trim(),
				description: editProjectDescription.value.trim() || null,
			}),
		})
		activeProject.value = {
			...activeProject.value,
			name: editProjectName.value.trim(),
			root_dir: editProjectRoot.value.trim(),
			description: editProjectDescription.value.trim() || null,
		}
		showEditProjectModal.value = false
		pushNotification(new Notification('Project Updated', '', 'success', 4000))
	} catch (e: any) {
		pushNotification(new Notification('Failed to update project', e?.message || '', 'error', 8000))
	} finally {
		savingProject.value = false
	}
}

// ── Tour ──
const tourShowDemoLinks = ref(false)

const dashboardTourSteps = computed<TourStep[]>(() => [
	{
		target: '[data-tour="flow-logo"]',
		message: 'Welcome to 45Flow!\n\nTip: You can drag and drop files anywhere onto the app to open Quick Share — the fastest way to upload and share files.\n\nLet\'s explore the dashboard.',
		beforeShow: () => { transfer.setOpen(false) },
	},
	...(isPremiumActive.value ? [{
		target: '[data-tour="connection-switcher"]',
		message: 'This is your Active Server selector.\n\n45Flow Pro can connect to multiple servers at once. The server shown here is where your actions will take effect. Use the dropdown to switch between connected servers.',
	}] : [{
		target: '[data-tour="connection-switcher"]',
		message: 'This shows your connected server.\n\nThe server displayed here is where all your actions take effect.',
	}]),
	{
		target: '[data-tour="action-cards"]',
		message: 'These are your main actions: create a Link for sharing/uploading, or upload files directly from your workstation.',
	},
	{
		target: '[data-tour="project-list"]',
		message: 'Your projects appear here. Each project organizes links under a shared root directory. Click a project to see its links.\n\nTip: If you prefer a flat list without project grouping, you can disable Project Mode in Settings → Preferences.',
	},
])

// ── Lifecycle ──
onMounted(async () => {
	transfer.restoreActiveTranscodes(apiFetch)
	transfer.restorePersistedUploads()
	void checkLicenseInBackground()
	await fetchProjects()

	// Restore active project from global state after projects list is available
	if (!activeProject.value && globalActiveProject.value) {
		const match = projects.value.find(p => p.id === globalActiveProject.value!.id)
		if (match) activeProject.value = match
	}

	if (!onboarding.value.dashboardTourDone) {
		setTimeout(() => {
			requestTour('dashboard', dashboardTourSteps.value, () => markDone('dashboardTourDone'))
		}, 500)
	}
})

watch(() => activeConnection.value?.connectionId, () => {
	void checkLicenseInBackground()
	fetchProjects() // Reload projects when switching servers
})

// ── Navigation ──
const leaveServer = () => {
	if (activeConnection.value) {
		updateConnection(activeConnection.value.connectionId, {
			status: 'disconnected',
			lastError: 'User logged out'
		})
	}
	clearLastSession()
	to('server-selection')
}

const showSettings = ref(false)
const settingsInitialSection = ref<string | undefined>(undefined)
const goToSettings = () => { settingsInitialSection.value = undefined; showSettings.value = true }
const goToUpgrade = () => { settingsInitialSection.value = 'upgrade'; showSettings.value = true }
const dismissBanner = () => { showUnlicensedBanner.value = false }

const showLogs = ref(false)
const goToLogs = () => { showLogs.value = true }

const usersModalOpen = ref(false)
const goToManageUsers = () => { usersModalOpen.value = true }

const goToUploadFiles = () => { to('upload-file') }
const goToCreateLink = () => { to('create-link', undefined, activeProject.value ? { projectId: String(activeProject.value.id) } : undefined) }
</script>

<style scoped>
.dashboard-shell {
	--local-border: color-mix(in srgb, var(--btn-primary-bg) 28%, #545463);
	background: color-mix(in srgb, var(--ui-panel-bg) 0%, transparent) !important;
}

.dashboard-top {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 0.75rem;
	justify-content: space-between;
	margin-bottom: 0.9rem;
}

.dashboard-intro {
	min-width: 0;
}

.dashboard-title {
	font-size: 1.3rem;
	line-height: 1.2;
	font-weight: 700;
}

.dashboard-subtitle {
	margin-top: 0.2rem;
	font-size: 0.9rem;
	opacity: 0.95;
}

.dashboard-utility {
	display: flex;
	gap: 0.5rem;
	flex-wrap: wrap;
}

.dashboard-actions {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 0.65rem;
	margin-bottom: 0.95rem;
}

.dashboard-license-banner {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 0.75rem;
	padding: 0.65rem 0.8rem;
	margin-bottom: 0.8rem;
	border: 1px solid color-mix(in srgb, #d97706 45%, var(--local-border));
	border-radius: 0.72rem;
	background: color-mix(in srgb, #f59e0b 14%, transparent);
}

.dashboard-license-copy {
	font-size: 0.82rem;
	line-height: 1.35;
	opacity: 0.95;
}

.dashboard-action {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	text-align: left;
	gap: 0.25rem;
	padding: 0.8rem 0.95rem;
	border: 1px solid var(--local-border);
	border-radius: 0.72rem;
}

.dashboard-action-title {
	font-size: 0.95rem;
	font-weight: 700;
	line-height: 1.25;
}

.dashboard-action-copy {
	font-size: 0.76rem;
	line-height: 1.3;
	opacity: 0.86;
}

.dashboard-content-wrap {
	border: 1px solid var(--local-border);
	border-radius: 0.85rem;
	padding: 0.65rem;
	background: color-mix(in srgb, var(--btn-primary-bg) 8%, transparent);
}

.project-card {
	display: flex;
	flex-direction: column;
	transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
	box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
}

.project-card:hover {
	transform: translateY(-2px);
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
	border-color: var(--btn-primary-bg);
}

.line-clamp-2 {
	display: -webkit-box;
	-webkit-line-clamp: 2;
	-webkit-box-orient: vertical;
	overflow: hidden;
}

@media (max-width: 780px) {
	.dashboard-actions {
		grid-template-columns: minmax(0, 1fr);
	}

	.dashboard-title {
		font-size: 1.15rem;
	}
}
</style>
