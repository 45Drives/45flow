<template>
	<CardContainer class="h-full overflow-y-auto">
		<template #header>
			<div class="flex flex-wrap items-center justify-between gap-3 mb-4">
				<div>
					<div class="flex items-center gap-2">
						<button class="btn btn-secondary px-2 py-1 text-sm" @click="goBack">←</button>
						<h2 class="text-xl font-semibold">{{ project?.name || 'Project' }}</h2>
					</div>
					<p v-if="project?.description" class="text-sm text-default mt-0.5 ml-9">{{ project.description }}</p>
					<p class="text-xs text-default mt-1 ml-9 truncate" :title="project?.root_dir">{{ project?.root_dir }}</p>
				</div>
				<div class="flex items-center gap-2">
					<button class="btn btn-primary px-4 py-2" @click="showCreateLinkModal = true">New Link</button>
					<button class="btn btn-secondary px-4 py-2" @click="showEditModal = true">Edit Project</button>
				</div>
			</div>
		</template>

		<div v-if="loading" class="flex items-center justify-center py-12">
			<span class="text-sm text-default">Loading…</span>
		</div>

		<div v-else-if="error" class="p-4 rounded-lg bg-red-900/20 border border-red-800 text-sm text-center">
			{{ error }}
		</div>

		<template v-else>
			<!-- Links section -->
			<div class="p-2">
				<h3 class="text-base font-semibold mb-3">Links ({{ links.length }})</h3>

				<div v-if="links.length === 0" class="text-sm text-default text-center py-8">
					No links yet. Create a link for this project.
				</div>

				<div v-else class="flex flex-col gap-2">
					<div
						v-for="link in links"
						:key="link.id"
						class="panel rounded-lg p-3 border border-default flex items-center gap-3"
					>
						<!-- Type badge -->
						<span class="ss-chip text-xs shrink-0" :class="linkTypeBadgeClass(link)">
							{{ linkTypeLabel(link) }}
						</span>

						<!-- Title/info -->
						<div class="flex-1 min-w-0">
							<div class="font-medium text-sm truncate">{{ link.title || 'Untitled' }}</div>
							<div class="text-xs text-default truncate">
								<span v-if="link.upload_enabled && link.share_enabled">Upload + Share</span>
								<span v-else-if="link.upload_enabled">Upload only</span>
								<span v-else>Share only</span>
								<span v-if="link.dir_rel"> · {{ link.dir_rel }}</span>
							</div>
						</div>

						<!-- Status -->
						<span class="ss-chip text-xs" :class="linkStatusClass(link)">{{ linkStatus(link) }}</span>

						<!-- Actions -->
						<div class="flex items-center gap-1 shrink-0">
							<button class="btn btn-secondary px-2 py-1 text-xs" @click="copyLinkUrl(link)" title="Copy link">
								Copy
							</button>
						</div>
					</div>
				</div>
			</div>
		</template>

		<!-- Create Link Modal -->
		<Teleport to="body">
			<div v-if="showCreateLinkModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" @click.self="showCreateLinkModal = false">
				<div class="panel rounded-2xl shadow-2xl p-6 w-full max-w-lg mx-4">
					<h3 class="text-lg font-semibold mb-4">Create Link for {{ project?.name }}</h3>
					<form @submit.prevent="createLink" class="flex flex-col gap-4">
						<div>
							<label class="block text-sm font-medium mb-1">Title</label>
							<input
								v-model="newLink.title"
								type="text"
								class="input-textlike w-full px-3 py-2 rounded-lg border border-default"
								placeholder="Link title"
							/>
						</div>

						<!-- Link type toggles -->
						<div class="flex flex-col gap-2">
							<label class="block text-sm font-medium">Link Capabilities</label>
							<div class="flex items-center gap-4">
								<label class="inline-flex items-center gap-2 select-none cursor-pointer">
									<input type="checkbox" v-model="newLink.uploadEnabled" class="styled-checkbox" />
									<span class="text-sm">Upload (clients can upload files)</span>
								</label>
								<label class="inline-flex items-center gap-2 select-none cursor-pointer">
									<input type="checkbox" v-model="newLink.shareEnabled" class="styled-checkbox" />
									<span class="text-sm">Share (clients can view files)</span>
								</label>
							</div>
							<p v-if="!newLink.uploadEnabled && !newLink.shareEnabled" class="text-xs text-red-400">
								At least one capability must be enabled.
							</p>
						</div>

						<!-- Upload folder (when upload enabled) -->
						<div v-if="newLink.uploadEnabled">
							<label class="block text-sm font-medium mb-1">Upload Folder (relative to project root)</label>
							<input
								v-model="newLink.uploadDir"
								type="text"
								class="input-textlike w-full px-3 py-2 rounded-lg border border-default"
								:placeholder="`e.g. incoming`"
							/>
							<p class="text-xs text-default mt-1">Files will be uploaded to: {{ project?.root_dir }}/{{ newLink.uploadDir || '…' }}</p>
						</div>

						<!-- Expiry -->
						<div>
							<label class="block text-sm font-medium mb-1">Expires in</label>
							<div class="flex items-center gap-2">
								<input type="number" min="1" v-model.number="newLink.expiresValue" class="input-textlike px-3 py-2 rounded-lg border border-default w-24" />
								<select v-model="newLink.expiresUnit" class="input-textlike px-3 py-2 rounded-lg border border-default w-32">
									<option value="hours">hours</option>
									<option value="days">days</option>
									<option value="weeks">weeks</option>
								</select>
								<button type="button" class="btn btn-secondary text-xs px-2 py-1" @click="newLink.expiresValue = 0">Never</button>
							</div>
						</div>

						<div class="flex items-center justify-end gap-2 mt-2">
							<button type="button" class="btn btn-secondary px-4 py-2" @click="showCreateLinkModal = false">Cancel</button>
							<button
								type="submit"
								class="btn btn-primary px-4 py-2"
								:disabled="creatingLink || (!newLink.uploadEnabled && !newLink.shareEnabled)"
							>
								{{ creatingLink ? 'Creating…' : 'Create Link' }}
							</button>
						</div>
					</form>
				</div>
			</div>
		</Teleport>

		<!-- Edit Project Modal -->
		<Teleport to="body">
			<div v-if="showEditModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" @click.self="showEditModal = false">
				<div class="panel rounded-2xl shadow-2xl p-6 w-full max-w-lg mx-4">
					<h3 class="text-lg font-semibold mb-4">Edit Project</h3>
					<form @submit.prevent="updateProject" class="flex flex-col gap-4">
						<div>
							<label class="block text-sm font-medium mb-1">Name</label>
							<input v-model="editForm.name" type="text" class="input-textlike w-full px-3 py-2 rounded-lg border border-default" />
						</div>
						<div>
							<label class="block text-sm font-medium mb-1">Description</label>
							<textarea v-model="editForm.description" class="input-textlike w-full px-3 py-2 rounded-lg border border-default resize-none" rows="2" />
						</div>
						<div class="flex items-center justify-end gap-2 mt-2">
							<button type="button" class="btn btn-secondary px-4 py-2" @click="showEditModal = false">Cancel</button>
							<button type="submit" class="btn btn-primary px-4 py-2" :disabled="saving">{{ saving ? 'Saving…' : 'Save' }}</button>
						</div>
					</form>
				</div>
			</div>
		</Teleport>
	</CardContainer>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { CardContainer } from '@45drives/houston-common-ui'
import { useApi } from '../composables/useApi'
import { useResilientNav } from '../composables/useResilientNav'

const { apiFetch } = useApi()
const { to } = useResilientNav()
const route = useRoute()

interface ProjectLink {
	id: number
	type: string
	token: string
	title: string | null
	expires_at_ms: number | null
	is_disabled: number
	upload_enabled: number
	share_enabled: number
	allow_comments: number
	dir_rel: string | null
	files_json: string | null
	created_at: string
	external_link: number
}

const project = ref<any>(null)
const links = ref<ProjectLink[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const showCreateLinkModal = ref(false)
const showEditModal = ref(false)
const creatingLink = ref(false)
const saving = ref(false)

const newLink = ref({
	title: '',
	uploadEnabled: true,
	shareEnabled: false,
	uploadDir: 'incoming',
	expiresValue: 7,
	expiresUnit: 'days' as 'hours' | 'days' | 'weeks',
})

const editForm = ref({ name: '', description: '' })

function getProjectId(): number {
	return Number(route.params.id)
}

async function fetchProject() {
	loading.value = true
	error.value = null
	try {
		const id = getProjectId()
		const [projData, linksData] = await Promise.all([
			apiFetch(`/api/projects/${id}`),
			apiFetch(`/api/projects/${id}/links`),
		])
		project.value = projData.project
		links.value = linksData.links || []
		editForm.value = {
			name: project.value?.name || '',
			description: project.value?.description || '',
		}
	} catch (e: any) {
		error.value = e?.message || 'Failed to load project'
	} finally {
		loading.value = false
	}
}

async function createLink() {
	const { uploadEnabled, shareEnabled, title, uploadDir, expiresValue, expiresUnit } = newLink.value
	if (!uploadEnabled && !shareEnabled) return

	creatingLink.value = true
	try {
		const multiplier = expiresUnit === 'hours' ? 3600 : expiresUnit === 'days' ? 86400 : 604800
		const expiresIn = expiresValue > 0 ? expiresValue * multiplier : 0

		const rootDir = project.value?.root_dir || ''
		const body: any = {
			expiresIn,
			title: title.trim() || null,
			projectId: getProjectId(),
			uploadEnabled,
			shareEnabled,
		}

		if (uploadEnabled) {
			const fullPath = uploadDir ? `${rootDir}/${uploadDir}`.replace(/\/+/g, '/') : rootDir
			body.uploadDir = fullPath
		}

		await apiFetch('/api/magic-link', {
			method: 'POST',
			body: JSON.stringify(body),
		})

		showCreateLinkModal.value = false
		newLink.value = { title: '', uploadEnabled: true, shareEnabled: false, uploadDir: 'incoming', expiresValue: 7, expiresUnit: 'days' }
		await fetchProject()
	} catch (e: any) {
		error.value = e?.message || 'Failed to create link'
	} finally {
		creatingLink.value = false
	}
}

async function updateProject() {
	saving.value = true
	try {
		await apiFetch(`/api/projects/${getProjectId()}`, {
			method: 'PATCH',
			body: JSON.stringify({
				name: editForm.value.name.trim() || undefined,
				description: editForm.value.description.trim() || undefined,
			}),
		})
		showEditModal.value = false
		await fetchProject()
	} catch (e: any) {
		error.value = e?.message || 'Failed to update project'
	} finally {
		saving.value = false
	}
}

function linkTypeLabel(link: ProjectLink): string {
	if (link.upload_enabled && link.share_enabled) return 'Combined'
	if (link.upload_enabled) return 'Upload'
	return 'Share'
}

function linkTypeBadgeClass(link: ProjectLink): string {
	if (link.upload_enabled && link.share_enabled) return 'ss-chip--accent'
	if (link.upload_enabled) return 'ss-chip--warning'
	return 'ss-chip--success'
}

function linkStatus(link: ProjectLink): string {
	if (link.is_disabled) return 'Disabled'
	if (link.expires_at_ms && link.expires_at_ms < Date.now()) return 'Expired'
	return 'Active'
}

function linkStatusClass(link: ProjectLink): string {
	const s = linkStatus(link)
	if (s === 'Active') return 'ss-chip--success'
	if (s === 'Expired') return 'ss-chip--warning'
	return 'ss-chip--muted'
}

function copyLinkUrl(link: ProjectLink) {
	// Determine link path based on type
	const pathPrefix = link.upload_enabled && link.share_enabled ? 'link'
		: link.upload_enabled ? 'upload'
		: 'v'
	const url = `${window.location.origin}/${pathPrefix}/${link.token}`
	navigator.clipboard.writeText(url).catch(() => {})
}

function goBack() {
	to('projects')
}

onMounted(fetchProject)
</script>
