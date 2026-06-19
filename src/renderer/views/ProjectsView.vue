<template>
	<CardContainer class="h-full overflow-y-auto">
		<template #header>
			<div class="flex flex-wrap items-center justify-between gap-3 mb-4">
				<div>
					<h2 class="text-xl font-semibold">Projects</h2>
					<p class="text-sm text-default mt-0.5">Organize your work into projects. Each project has its own root directory and links.</p>
				</div>
				<div class="flex items-center gap-2">
					<label class="inline-flex items-center gap-2 select-none cursor-pointer text-sm">
						<input type="checkbox" v-model="includeArchived" class="styled-checkbox" @change="fetchProjects" />
						<span>Show archived</span>
					</label>
					<button class="btn btn-secondary px-4 py-2" @click="goBack">Back to Dashboard</button>
					<button class="btn btn-primary px-4 py-2" @click="showCreateModal = true">New Project</button>
				</div>
			</div>
		</template>

		<div v-if="loading" class="flex items-center justify-center py-12">
			<span class="text-sm text-default">Loading projects…</span>
		</div>

		<div v-else-if="error" class="p-4 rounded-lg bg-red-900/20 border border-red-800 text-sm text-center">
			{{ error }}
		</div>

		<div v-else-if="projects.length === 0" class="flex flex-col items-center justify-center py-16 gap-4">
			<p class="text-default text-sm">No projects yet. Create your first project to get started.</p>
			<button class="btn btn-primary px-5 py-2.5" @click="showCreateModal = true">Create Project</button>
		</div>

		<div v-else class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 p-2">
			<div
				v-for="project in projects"
				:key="project.id"
				class="project-card panel rounded-xl p-4 cursor-pointer hover:shadow-md transition-shadow border border-default"
				:class="{ 'opacity-60': project.archived }"
				@click="openProject(project.id)"
			>
				<div class="flex items-start justify-between gap-2 mb-2">
					<div class="flex items-center gap-2 min-w-0">
						<h3 class="font-semibold text-base truncate">{{ project.name }}</h3>
						<span v-if="project.archived" class="ss-chip ss-chip--muted text-xs shrink-0">Archived</span>
					</div>
					<div class="flex items-center gap-1 shrink-0" @click.stop>
						<button
							v-if="!project.archived"
							class="btn btn-secondary px-2 py-1 text-xs"
							title="Archive project"
							@click="archiveProject(project)"
						>Archive</button>
						<button
							v-else
							class="btn btn-secondary px-2 py-1 text-xs"
							title="Unarchive project"
							@click="unarchiveProject(project)"
						>Unarchive</button>
						<button
							class="btn btn-secondary px-2 py-1 text-xs text-red-400 hover:text-red-300"
							title="Delete project permanently"
							@click="confirmDeleteProject(project)"
						>Delete</button>
					</div>
				</div>
				<div class="flex flex-wrap gap-1.5 mb-2">
					<span class="ss-chip ss-chip--neutral text-xs">Total {{ project.link_count ?? 0 }}</span>
					<span class="ss-chip ss-chip--success text-xs">Active {{ project.active_count ?? 0 }}</span>
					<span class="ss-chip ss-chip--warning text-xs">Expired {{ project.expired_count ?? 0 }}</span>
					<span class="ss-chip ss-chip--muted text-xs">Disabled {{ project.disabled_count ?? 0 }}</span>
				</div>
				<p v-if="project.description" class="text-xs text-default line-clamp-2 mb-2">{{ project.description }}</p>
				<div class="text-xs text-default flex items-center gap-2 mt-auto">
					<span class="truncate" :title="project.root_dir">{{ project.root_dir }}</span>
				</div>
			</div>
		</div>

		<!-- Delete Confirmation Modal -->
		<Teleport to="body">
			<div v-if="projectToDelete" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" @click.self="projectToDelete = null">
				<div class="panel rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4">
					<h3 class="text-lg font-semibold mb-2">Delete Project</h3>
					<p class="text-sm text-default mb-4">Permanently delete <strong>{{ projectToDelete.name }}</strong>? This cannot be undone.</p>
					<div class="flex items-center justify-end gap-2">
						<button class="btn btn-secondary px-4 py-2" @click="projectToDelete = null">Cancel</button>
						<button class="btn btn-primary px-4 py-2 !bg-red-600 hover:!bg-red-500" @click="deleteProject">Delete</button>
					</div>
				</div>
			</div>
		</Teleport>

		<CreateProjectModal v-model="showCreateModal" @created="onProjectCreated" />
	</CardContainer>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { CardContainer } from '@45drives/houston-common-ui'
import { useApi } from '../composables/useApi'
import { useResilientNav } from '../composables/useResilientNav'
import CreateProjectModal from '../components/modals/CreateProjectModal.vue'

const { apiFetch } = useApi()
const { to } = useResilientNav()

interface Project {
	id: number
	name: string
	root_dir: string
	description: string | null
	archived: number
	link_count: number
	active_count: number
	expired_count: number
	disabled_count: number
	created_at: string
}

const projects = ref<Project[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const showCreateModal = ref(false)
const includeArchived = ref(false)
const projectToDelete = ref<Project | null>(null)

async function fetchProjects() {
	loading.value = true
	error.value = null
	try {
		const qs = includeArchived.value ? '?includeArchived=1' : ''
		const data = await apiFetch(`/api/projects${qs}`)
		projects.value = data.projects || []
	} catch (e: any) {
		error.value = e?.message || 'Failed to load projects'
	} finally {
		loading.value = false
	}
}

function onProjectCreated() {
	fetchProjects()
}

function openProject(id: number) {
	to('project-detail', { id: String(id) })
}

async function archiveProject(project: Project) {
	try {
		await apiFetch(`/api/projects/${project.id}`, { method: 'DELETE' })
		await fetchProjects()
	} catch (e: any) {
		error.value = e?.message || 'Failed to archive project'
	}
}

async function unarchiveProject(project: Project) {
	try {
		await apiFetch(`/api/projects/${project.id}/unarchive`, { method: 'POST' })
		await fetchProjects()
	} catch (e: any) {
		error.value = e?.message || 'Failed to unarchive project'
	}
}

function confirmDeleteProject(project: Project) {
	projectToDelete.value = project
}

async function deleteProject() {
	if (!projectToDelete.value) return
	try {
		await apiFetch(`/api/projects/${projectToDelete.value.id}?hard=1`, { method: 'DELETE' })
		projectToDelete.value = null
		await fetchProjects()
	} catch (e: any) {
		error.value = e?.message || 'Failed to delete project'
	}
}

function goBack() {
	to('dashboard')
}

onMounted(fetchProjects)
</script>

<style scoped>
.project-card {
	display: flex;
	flex-direction: column;
}
.line-clamp-2 {
	display: -webkit-box;
	-webkit-line-clamp: 2;
	-webkit-box-orient: vertical;
	overflow: hidden;
}
</style>
