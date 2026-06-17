<template>
	<CardContainer class="h-full overflow-y-auto">
		<template #header>
			<div class="flex flex-wrap items-center justify-between gap-3 mb-4">
				<div>
					<h2 class="text-xl font-semibold">Projects</h2>
					<p class="text-sm text-default mt-0.5">Organize your work into projects. Each project has its own root directory and links.</p>
				</div>
				<div class="flex items-center gap-2">
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
				@click="openProject(project.id)"
			>
				<div class="flex items-start justify-between gap-2 mb-2">
					<h3 class="font-semibold text-base truncate">{{ project.name }}</h3>
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

async function fetchProjects() {
	loading.value = true
	error.value = null
	try {
		const data = await apiFetch('/api/projects')
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
