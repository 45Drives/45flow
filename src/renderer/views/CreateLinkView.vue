<template>
	<div class="h-full min-h-0 flex items-start justify-center pt-2 overflow-y-auto">
		<div class="mx-auto w-full max-w-screen-2xl px-4 sm:px-6 lg:px-8">
			<div class="grid w-full grid-cols-1 gap-4 text-xl min-w-0">
				<CardContainer class="w-full bg-well rounded-md shadow-xl min-w-0">
					<div class="ss-toned-panel flex flex-col gap-3 text-left min-w-0 p-3">
						<!-- Header -->
						<div class="flex items-center justify-between gap-3 min-w-0">
							<div>
								<h2 class="text-xl font-semibold">Create Link</h2>
								<p class="text-sm opacity-80 -mt-0.5">
									Create a combined link for uploading and/or sharing files.
								</p>
							</div>
							<button class="btn btn-secondary px-4 py-2 text-sm" @click="goBack">Back</button>
						</div>

						<div v-if="initializing" class="border-t border-default pt-6 pb-4">
							<div class="flex flex-col items-center justify-center gap-3 text-center min-h-[16rem]">
								<span class="inline-block w-7 h-7 border-2 border-default border-t-transparent rounded-full animate-spin"></span>
								<div>
									<p class="text-base font-medium">Loading Create Link...</p>
									<p class="text-sm text-muted">Resolving project and folder context.</p>
								</div>
							</div>
						</div>

						<template v-else>

						<!-- ══════ Section: Project & Capabilities ══════ -->
						<section class="border-t border-default pt-3" data-tour="create-link-capabilities">
							<div class="flex flex-wrap items-start gap-6">
								<!-- Project selector -->
								<div v-if="projectModeEnabled" class="flex flex-col gap-2 min-w-[220px]" data-tour="create-link-project">
									<h3 class="text-base font-semibold">Project</h3>
									<div class="flex flex-wrap items-center gap-2">
										<select
											v-model="selectedProjectId"
											class="input-textlike px-3 py-2 border border-default rounded-lg bg-default text-sm min-w-[200px]"
											@change="onProjectChange"
										>
											<option :value="null">— No project —</option>
											<option v-for="p in projects" :key="p.id" :value="p.id">
												{{ p.name }}
											</option>
										</select>
										<button type="button" class="btn btn-secondary text-sm px-3 py-1.5" @click="showNewProjectModal = true">
											+ New Project
										</button>
									</div>
									<p v-if="selectedProject" class="text-xs text-default truncate">
										Root: {{ selectedProject.root_dir }}
									</p>
								</div>

								<!-- Link Capabilities -->
								<div class="flex flex-col gap-2">
									<h3 class="text-base font-semibold">Link Capabilities</h3>
									<div class="flex items-center gap-5">
										<label class="inline-flex items-center gap-2 select-none cursor-pointer text-sm">
											<input type="checkbox" v-model="opts.uploadEnabled.value" class="proxy-quality-checkbox" />
											<span>Upload (clients can send files)</span>
										</label>
										<label class="inline-flex items-center gap-2 select-none cursor-pointer text-sm">
											<input type="checkbox" v-model="opts.shareEnabled.value" class="proxy-quality-checkbox" />
											<span>Share / Review (clients can view files)</span>
										</label>
									</div>
									<p v-if="!opts.uploadEnabled.value && !opts.shareEnabled.value" class="text-xs text-red-400">
										At least one capability must be enabled.
									</p>
									<p v-else-if="opts.uploadEnabled.value && opts.shareEnabled.value" class="text-xs text-default">
										Combined link — your client gets a single URL to upload and review files.
									</p>
								</div>
							</div>
						</section>

						<!-- ══════ Section: Upload Destination ══════ -->
						<section v-if="opts.uploadEnabled.value" class="border-t border-default pt-3" data-tour="create-link-upload-dest">
							<h3 class="text-base font-semibold mb-2">Upload Destination</h3>
							<FolderPicker
								:key="uploadPickerKey"
								v-model="uploadDest"
								:apiFetch="apiFetch"
								useCase="upload"
								subtitle="Pick the folder where clients will upload files."
								:auto-detect-roots="false"
								:allow-entire-tree="false"
								:hide-project-controls="true"
								:startDir="fileBrowserBase || undefined"
								v-model:project="uploadProjectBase"
								v-model:dest="uploadDest"
								:uploadLink="true"
							/>

							<!-- Upload automation toggles (only when both upload + share enabled) -->
							<div v-if="opts.shareEnabled.value" class="mt-3 pt-3 border-t border-default space-y-3">
								<label class="flex items-start gap-3 select-none cursor-pointer">
									<input
										type="checkbox"
										v-model="autoShareUploads"
										class="mt-0.5 h-4 w-4 rounded border-default accent-blue-600 cursor-pointer"
									/>
									<div class="min-w-0">
										<div class="text-sm font-medium">Auto-share uploaded files</div>
										<div class="text-xs text-muted">
											Files uploaded through this link will automatically appear in the link's shared files.
										</div>
									</div>
								</label>
								<label class="flex items-start gap-3 select-none cursor-pointer">
									<input
										type="checkbox"
										v-model="autoWatermarkUploads"
										:disabled="!watermarkEnabled"
										class="mt-0.5 h-4 w-4 rounded border-default accent-blue-600 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
									/>
									<div class="min-w-0">
										<div class="text-sm font-medium" :class="{ 'opacity-50': !watermarkEnabled }">Auto-watermark uploaded files</div>
										<div class="text-xs text-muted" :class="{ 'opacity-50': !watermarkEnabled }">
											Apply the link's watermark settings to files uploaded through this link.
											<span v-if="!watermarkEnabled" class="text-amber-500"> (Enable watermark in media options first)</span>
										</div>
									</div>
								</label>
							</div>
						</section>

						<!-- ══════ Section: Share Files ══════ -->
						<section v-if="opts.shareEnabled.value" class="border-t border-default pt-3" data-tour="create-link-share-files">
							<h3 class="text-base font-semibold mb-2">Files to Share</h3>

							<!-- Browsing context info -->
							<div v-if="fileBrowserBase" class="text-sm text-muted mb-2">
								Browsing files from: <code>{{ fileBrowserBase }}</code>
							</div>

							<FileExplorer
								:apiFetch="apiFetch"
								:modelValue="shareFiles"
								@add="onShareAdd"
								@remove="onShareRemove"
								:startDir="fileBrowserBase"
							/>

							<!-- Selected files -->
							<div v-if="shareFiles.length" class="border border-default p-0.5 rounded bg-accent min-w-0">
								<div class="flex flex-wrap items-center justify-between gap-2 px-2 py-1 min-w-0">
									<div class="text-sm font-semibold">
										Selected files <span class="text-muted">({{ shareFiles.length }})</span>
									</div>
									<div class="flex flex-wrap items-center gap-2">
										<button class="btn btn-secondary" @click="showSelected = !showSelected">
											{{ showSelected ? 'Hide' : 'Show' }} list
										</button>
										<button class="btn btn-danger" @click="shareFiles = []">Clear all</button>
									</div>
								</div>

								<div v-show="showSelected" class="max-h-40 overflow-auto min-w-0">
									<div v-for="(f, i) in shareFiles" :key="f"
										class="grid items-center [grid-template-columns:minmax(0,1fr)_auto] border-t border-default text-sm min-w-0">
										<div class="relative px-3 py-2 rounded-md bg-default min-w-0">
											<span aria-hidden="true"
												class="pointer-events-none absolute inset-0 rounded-md bg-green-500/50 animate-pulse z-0"></span>
											<span class="truncate block text-default relative z-10 min-w-0">{{ f }}</span>
										</div>
										<button class="btn btn-danger m-2 px-2 py-1" @click="removeShareFile(f)" title="Remove">✕</button>
									</div>
								</div>
							</div>
						</section>

						<!-- ══════ Section: Link Options ══════ -->
						<section class="border-t border-default pt-3" data-tour="create-link-options">
							<h3 class="text-base font-semibold mb-2">Link Options</h3>
							<CommonLinkControls>
								<template #expiry>
									<div class="flex flex-col gap-3 min-w-0">
										<div class="flex items-center gap-3 min-w-0">
											<label class="font-semibold whitespace-nowrap flex-shrink-0">Expires in:</label>
											<div class="flex items-center gap-2 min-w-0 flex-1">
												<input
													type="number"
													min="1"
													step="1"
													v-model.number="opts.expiresValue.value"
													class="input-textlike border rounded px-3 py-2 w-24"
												/>
												<select v-model="opts.expiresUnit.value" class="input-textlike border rounded px-3 py-2 w-32">
													<option value="hours">hours</option>
													<option value="days">days</option>
													<option value="weeks">weeks</option>
												</select>
											</div>
										</div>
										<div class="flex flex-nowrap gap-1 text-xs min-w-0">
											<button type="button" class="btn btn-secondary w-20" @click="opts.setPreset(1, 'hours')">1 hour</button>
											<button type="button" class="btn btn-secondary w-20" @click="opts.setPreset(1, 'days')">1 day</button>
											<button type="button" class="btn btn-secondary w-20" @click="opts.setPreset(1, 'weeks')">1 week</button>
											<button type="button" class="btn btn-secondary w-20" @click="opts.setNever()">Never</button>
										</div>
									</div>
								</template>

								<template #title>
									<div class="flex flex-wrap items-center gap-3 min-w-0">
										<label class="font-semibold sm:whitespace-nowrap">Link Title:</label>
										<input
											type="text"
											v-model.trim="opts.linkTitle.value"
											class="input-textlike border rounded px-3 py-2 w-full min-w-[12rem]"
											placeholder="Optional title for the shared link"
										/>
									</div>
								</template>

								<template #access>
									<div class="flex flex-col gap-1 min-w-0">
										<div class="flex flex-wrap items-center gap-3 min-w-0">
											<span class="font-semibold sm:whitespace-nowrap">Network Access:</span>
											<div class="flex flex-wrap gap-2 min-w-0" role="radiogroup" aria-label="Network Access">
												<label class="inline-flex items-center gap-2 px-3 py-1.5 rounded-md cursor-pointer select-none transition border border-default bg-default hover:bg-well/40">
													<input type="radio" name="create-link-access-network" :value="false" v-model="opts.usePublicBase.value" class="h-4 w-4" />
													<span class="text-sm truncate">Share Locally (Over LAN)</span>
												</label>
												<label class="inline-flex items-center gap-2 px-3 py-1.5 rounded-md cursor-pointer select-none transition border border-default bg-default hover:bg-well/40">
													<input type="radio" name="create-link-access-network" :value="true" v-model="opts.usePublicBase.value" class="h-4 w-4" />
													<span class="text-sm truncate">Share Externally (Over Internet)</span>
												</label>
											</div>
										</div>
										<p class="text-xs text-default">
											External sharing needs working port forwarding.
										</p>
									</div>
								</template>

								<template #accessExtra>
									<div v-if="opts.usePublicBase.value" class="flex flex-col gap-3 min-w-0">
										<CheckPortForwarding :apiFetch="apiFetch" endpoint="/api/forwarding/check" :autoCheckOnMount="false" :showDetails="true" />
									</div>
								</template>

								<template #after>
									<div class="border-t border-default mt-2 pt-2 min-w-0">
										<LinkAccessMode
											v-model="opts.accessMode.value"
											v-model:password="opts.password.value"
											v-model:showPassword="opts.showPassword.value"
											v-model:allowOpenComments="opts.allowOpenComments.value"
											:accessCount="opts.accessCount.value"
											:accessSatisfied="opts.accessSatisfied.value"
											radioName="create-link-access-mode"
											wrapperClass="ss-toned-panel min-w-0 p-3"
											@openUserModal="showAccessModal = true"
										/>
									</div>
								</template>
							</CommonLinkControls>
						</section>

						<!-- ══════ Section: Media Options (video/image watermark, proxy) ══════ -->
						<section v-if="opts.shareEnabled.value && hasMediaSelected" class="border-t border-default pt-3" data-tour="create-link-media-options">
							<h3 class="text-base font-semibold mb-2">{{ hasVideoSelected ? 'Video Options' : 'Image Options' }}</h3>
							<VideoOptionsPanel
								v-model:proxyQualities="proxyQualities"
								v-model:watermarkEnabled="watermarkEnabled"
								v-model:selectedExistingWatermark="selectedExistingWatermark"
								v-model:showDefaultWatermarks="showDefaultWatermarks"
								:watermarkFile="watermarkFile"
								:existingWatermarkFiles="existingWatermarkFiles"
								:effectiveWatermarkPreviewUrl="effectiveWatermarkPreviewUrl"
								:effectiveWatermarkName="effectiveWatermarkName"
								:usingExistingWatermark="usingExistingWatermark"
								:showHeading="false"
								:watermarkLabel="hasVideoSelected ? 'Watermark Videos' : 'Watermark Images'"
								:pickButtonLabel="usingExistingWatermark ? 'Replace...' : 'Browse...'"
								:hideProxyQualities="!hasVideoSelected"
								@pickWatermark="pickWatermark"
								@clearWatermark="clearWatermark"
								@refreshWatermarks="loadExistingWatermarks"
							/>

							<!-- Existing watermark info message -->
							<p v-if="existingFileWatermarkMessage && watermarkEnabled" class="text-xs text-emerald-500 mt-1.5 flex items-center gap-1.5">
								<svg class="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
									<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
								</svg>
								{{ existingFileWatermarkMessage }}
								<span v-if="watermarkUnchanged" class="text-muted">(no re-encode needed)</span>
							</p>

							<!-- Watermark Customizer (premium) or basic preview (free) -->
							<div v-if="watermarkEnabled && (watermarkFile || selectedExistingWatermark)" class="mt-3 border-t border-default pt-3">
								<WatermarkCustomizer v-if="isPremiumActive"
									v-model="watermarkSettings"
									:watermarkPreviewUrl="effectiveWatermarkPreviewUrl"
									:isPremium="isServerLicensed"
								/>
								<WatermarkPreview v-else
									:previewUrl="effectiveWatermarkPreviewUrl"
									label="Watermark (bottom-right)"
								/>
							</div>
						</section>

						<!-- ══════ Generate Button ══════ -->
						<section class="border-t border-default pt-4">
							<div v-if="error" class="p-3 rounded bg-red-900/30 text-default border border-red-800 mb-3 text-sm text-center">
								{{ error }}
							</div>

							<div class="flex flex-wrap gap-2 w-full min-w-0">
								<button class="btn btn-secondary" :disabled="loading" @click="resetAll">
									Reset
								</button>
								<button
									data-tour="create-link-generate-btn"
									class="btn btn-primary flex-1 min-w-[14rem]"
									:disabled="!canGenerate || loading"
									@click="generateLink"
									title="Create a Flow link with the selected options"
								>
									<span v-if="loading" class="inline-flex items-center gap-2">
										<span class="inline-block w-4 h-4 border-2 border-default border-t-transparent rounded-full animate-spin"></span>
										Generating…
									</span>
									<span v-else>Generate Flow link</span>
								</button>
							</div>

							<div v-if="resultUrl" class="p-3 border rounded flex flex-col items-center mt-1 min-w-0">
								<code class="max-w-full break-all">{{ resultUrl }}</code>
								<div class="flex flex-wrap gap-2 mt-2">
									<button class="btn btn-secondary" @click="copyResult">Copy</button>
									<button class="btn btn-primary" @click="openResult">Open</button>
								</div>
							</div>
						</section>
						</template>
					</div>
				</CardContainer>
				<div class="button-group-row col-span-1 min-w-0">
					<button @click="goBack" class="btn btn-danger justify-start">
						Return to Dashboard
					</button>
				</div>
			</div>
		</div>
	</div>

	<!-- New Project Modal -->
	<Teleport to="body">
		<div v-if="showNewProjectModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" @click.self="showNewProjectModal = false">
			<div class="panel rounded-2xl shadow-2xl p-6 w-full max-w-lg mx-4">
				<h3 class="text-lg font-semibold mb-4">Create New Project</h3>
				<form @submit.prevent="createProject" class="flex flex-col gap-4">
					<div>
						<label class="block text-sm font-medium mb-1">Project Name</label>
						<input
							v-model="newProjectName"
							type="text"
							class="input-textlike w-full px-3 py-2 rounded-lg border border-default"
							placeholder="My Video Project"
							required
						/>
					</div>
					<div>
						<label class="block text-sm font-medium mb-1">Project Root Directory</label>
						<FolderPicker
							v-model="newProjectRoot"
							:apiFetch="apiFetch"
							useCase="upload"
							subtitle="Choose the root directory for this project."
							:auto-detect-roots="true"
							:allow-entire-tree="true"
							v-model:project="newProjectPickerBase"
							v-model:dest="newProjectRoot"
						/>
					</div>
					<div class="flex items-center justify-end gap-2 mt-2">
						<button type="button" class="btn btn-secondary px-4 py-2" @click="showNewProjectModal = false">Cancel</button>
						<button type="submit" class="btn btn-primary px-4 py-2" :disabled="!newProjectName.trim() || !newProjectRoot.trim() || creatingProject">
							{{ creatingProject ? 'Creating…' : 'Create' }}
						</button>
					</div>
				</form>
			</div>
		</div>
	</Teleport>

	<!-- Outputs Exist Modal -->
	<ConfirmDeleteModal
		v-model="showOutputsExistModal"
		title="Outputs Already Exist"
		message="Transcode outputs (stream/review copies) already exist for one or more selected files. Overwrite to restart output generation, or Generate Link to keep existing/in-progress outputs."
		confirmText="Overwrite"
		cancelText="Generate Link"
		:danger="false"
		:closeIsCancel="false"
		@confirm="resolveOutputsExist('overwrite')"
		@cancel="resolveOutputsExist('keep')"
		@close="resolveOutputsExist('cancel')"
	/>

	<!-- Add Users Modal -->
	<AddUsersModal
		v-model="showAccessModal"
		:apiFetch="apiFetch"
		roleHint="view"
		:preselected="opts.accessUsers.value.map(c => ({
			id: c.id,
			username: c.username || '',
			name: c.name,
			user_email: c.user_email,
			display_color: c.display_color,
			role_id: c.role_id ?? undefined,
			role_name: c.role_name ?? undefined,
		}))"
		:preselectedGroups="opts.accessGroups.value"
		@apply="onApplyUsers"
	/>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { CardContainer } from '@45drives/houston-common-ui'
import { Notification } from '@45drives/houston-common-ui'
import { useApi } from '../composables/useApi'
import { useResilientNav } from '../composables/useResilientNav'
import { useLinkOptions } from '../composables/useLinkOptions'
import { useHeader } from '../composables/useHeader'
import { pushNotification } from '../composables/useNotificationQueue'
import { signalLinkCreated } from '../composables/useLinkRefresh'
import { useConnections } from '../composables/useConnections'
import { useActiveProject } from '../composables/useActiveProject'
import { useProjectMode } from '../composables/useProjectMode'
import { useTransferProgress } from '../composables/useTransferProgress'
import FolderPicker from '../components/FolderPicker.vue'
import FileExplorer from '../components/FileExplorer.vue'
import CommonLinkControls from '../components/CommonLinkControls.vue'
import LinkAccessMode from '../components/LinkAccessMode.vue'
import CheckPortForwarding from '../components/CheckPortForwarding.vue'
import VideoOptionsPanel from '../components/VideoOptionsPanel.vue'
import WatermarkCustomizer from '../components/WatermarkCustomizer.vue'
import WatermarkPreview from '../components/WatermarkPreview.vue'
import { useLicenseStatus } from '../composables/useLicenseStatus'
import { useTourManager, type TourStep } from '../composables/useTourManager'
import { useOnboarding } from '../composables/useOnboarding'
import ConfirmDeleteModal from '../components/modals/ConfirmDeleteModal.vue'
import AddUsersModal from '../components/modals/AddUsersModal.vue'
import { DEFAULT_45FLOW_WATERMARKS, createDefaultWatermarkSettings, type WatermarkSettings } from '../types/watermark'

useHeader('Create Link')
const route = useRoute()
const { apiFetch, meta } = useApi()
const { to } = useResilientNav()
const { activeConnection } = useConnections()
const { activeProject: globalActiveProject } = useActiveProject()
const { projectModeEnabled } = useProjectMode()
const transfer = useTransferProgress()
const opts = useLinkOptions()

const isServerLicensed = computed(() => activeConnection.value?.licensed !== false)
const { isPremiumActive } = useLicenseStatus()

const showAccessModal = ref(false)

function onApplyUsers(users: any[], groups?: any[]) {
	opts.accessUsers.value = users.map(u => {
		const username = (u.username || '').trim()
		const name = (u.name || username).trim()
		const user_email = u.user_email?.trim() || undefined
		return {
			key: `${name}|${user_email || ''}|${username}`,
			id: u.id,
			username,
			name,
			user_email,
			display_color: u.display_color,
			role_id: u.role_id ?? null,
			role_name: u.role_name ?? null,
		}
	})
	opts.accessGroups.value = groups || []
}

// ── Projects ──
interface Project { id: number; name: string; root_dir: string; description: string | null; link_count: number }
const projects = ref<Project[]>([])
const selectedProjectId = ref<number | null>(null)
const selectedProject = computed(() => projects.value.find(p => p.id === selectedProjectId.value) || null)
const showNewProjectModal = ref(false)
const newProjectName = ref('')
const newProjectRoot = ref('')
const newProjectPickerBase = ref('')
const creatingProject = ref(false)

// ── Upload ──
const uploadDest = ref('')
const uploadProjectBase = ref('')
const uploadPickerKey = ref(0)
const autoShareUploads = ref(false)
const autoWatermarkUploads = ref(false)

// ── Share ──
const shareFiles = ref<string[]>([])
const configuredRoot = ref('')
const fileBrowserBase = computed(() => selectedProject.value?.root_dir || configuredRoot.value || '')
const showSelected = ref(false)

// ── Video / Watermark ──
const proxyQualities = ref<string[]>(['original'])
const watermarkEnabled = ref(false)
const watermarkFile = ref<{ path: string; name: string; size: number; dataUrl?: string | null } | null>(null)
const selectedExistingWatermark = ref('')
const showDefaultWatermarks = ref(false)
const existingWatermarkFiles = ref<string[]>([])
const existingWatermarkPreviewUrl = ref<string | null>(null)
const watermarkSettings = ref<WatermarkSettings>(createDefaultWatermarkSettings())

const effectiveWatermarkPreviewUrl = computed(() =>
	watermarkFile.value?.dataUrl || existingWatermarkPreviewUrl.value || null
)
const effectiveWatermarkName = computed(() => {
	if (watermarkFile.value?.name) return watermarkFile.value.name
	if (selectedExistingWatermark.value) return selectedExistingWatermark.value.split('/').pop() || ''
	return ''
})
const usingExistingWatermark = computed(() => !watermarkFile.value && !!selectedExistingWatermark.value)

// ── Pre-existing watermark detection (files that already have watermarks applied) ──
const existingFileWatermark = ref<{
	watermarkFile: string
	watermarkSettings: WatermarkSettings | null
} | null>(null)
const existingFileWatermarkMessage = ref('')
const watermarkUnchanged = computed(() => {
	if (!existingFileWatermark.value) return false
	const origFile = existingFileWatermark.value.watermarkFile
	const origSettings = existingFileWatermark.value.watermarkSettings
	const curFile = watermarkFile.value?.path || selectedExistingWatermark.value || ''
	if (!curFile || curFile !== origFile) return false
	if (!origSettings) return true // same file, no settings to compare
	const cur = watermarkSettings.value
	return (
		cur.scale === origSettings.scale &&
		cur.opacity === origSettings.opacity &&
		cur.rotation === origSettings.rotation &&
		cur.position.x === origSettings.position.x &&
		cur.position.y === origSettings.position.y &&
		cur.position.xUnit === origSettings.position.xUnit &&
		cur.position.yUnit === origSettings.position.yUnit &&
		cur.position.anchor === origSettings.position.anchor
	)
})

const videoExts = new Set([
	'mp4', 'mov', 'm4v', 'mkv', 'webm', 'avi', 'wmv', 'flv',
	'mpg', 'mpeg', 'm2v', '3gp', '3g2', 'mxf', 'ts', 'm2ts', 'mts',
	'ogv', 'vob', 'divx', 'f4v', 'asf', 'rm', 'rmvb', 'm4s',
	'r3d', 'braw', 'ari', 'cine', 'dav',
])

const imageExts = new Set([
	'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'tif',
	'avif', 'heic', 'heif', 'jp2', 'jxl', 'svg',
])

const hasVideoSelected = computed(() =>
	shareFiles.value.some(f => {
		const ext = (f.split('.').pop() || '').toLowerCase()
		return videoExts.has(ext)
	})
)

const hasImageSelected = computed(() =>
	shareFiles.value.some(f => {
		const ext = (f.split('.').pop() || '').toLowerCase()
		return imageExts.has(ext)
	})
)

const hasMediaSelected = computed(() => hasVideoSelected.value || hasImageSelected.value)

// ── State ──
const loading = ref(false)
const initializing = ref(true)
const error = ref<string | null>(null)
const resultUrl = ref('')

// ── Computed ──
const canGenerate = computed(() => {
	if (!opts.uploadEnabled.value && !opts.shareEnabled.value) return false
	if (opts.passwordRequired.value) return false
	if (!opts.accessSatisfied.value) return false
	if (opts.uploadEnabled.value && !uploadDest.value.trim()) return false
	if (opts.shareEnabled.value && shareFiles.value.length === 0) return false
	return true
})

// ── Methods ──
function onProjectChange() {
	opts.projectId.value = selectedProjectId.value
	const root = selectedProject.value?.root_dir || configuredRoot.value || ''
	uploadProjectBase.value = root
	uploadDest.value = root
	uploadPickerKey.value++
}

function onShareAdd(paths: string[]) {
	const base = fileBrowserBase.value
	paths.forEach(p => {
		let full = p
		if (base && !p.startsWith('/')) {
			full = `/${base.replace(/^\/+/, '')}/${p.replace(/^\/+/, '')}`.replace(/\/+/g, '/')
		} else if (!p.startsWith('/')) {
			full = '/' + p
		}
		if (!shareFiles.value.includes(full)) shareFiles.value.push(full)
	})
}

function onShareRemove(paths: string[]) {
	shareFiles.value = shareFiles.value.filter(f => !paths.includes(f))
}

function removeShareFile(f: string) {
	shareFiles.value = shareFiles.value.filter(x => x !== f)
}

// ── Watermark ──
async function loadExistingWatermarks() {
	try {
		const root = configuredRoot.value || ''
		const wmDir = root ? `${root.replace(/^\/+/, '')}/.45flow/watermarks` : '.45flow/watermarks'
		let serverWatermarks: string[] = []
		try {
			const data = await apiFetch(`/api/files?dir=${encodeURIComponent(wmDir)}`, { method: 'GET' })
			const entries = Array.isArray(data?.entries) ? data.entries : []
			serverWatermarks = entries
				.filter((e: any) => !e?.isDir && typeof e?.name === 'string' && String(e.name).trim())
				.map((e: any) => `${wmDir}/${String(e.name).trim()}`)
				.sort((a: string, b: string) => a.localeCompare(b))
		} catch { /* no user watermarks dir yet */ }

		const base = meta.value.apiBase ?? ''
		const token = meta.value.token ?? ''
		const builtinChecks = await Promise.allSettled(
			DEFAULT_45FLOW_WATERMARKS.map(async (wm) => {
				const url = `${base}/api/files/watermark-preview?path=${encodeURIComponent(wm.path)}`
				const res = await fetch(url, { method: 'HEAD', headers: { 'Authorization': `Bearer ${token}` } })
				return res.ok ? wm.path : null
			})
		)
		const validBuiltins = builtinChecks
			.filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled' && r.value !== null)
			.map(r => r.value)

		existingWatermarkFiles.value = showDefaultWatermarks.value ? [...serverWatermarks, ...validBuiltins] : serverWatermarks

		if (!selectedExistingWatermark.value && existingWatermarkFiles.value.length) {
			const last = localStorage.getItem('45flow-last-watermark')
			if (last && existingWatermarkFiles.value.includes(last)) {
				selectedExistingWatermark.value = last
			} else if (existingWatermarkFiles.value.length) {
				selectedExistingWatermark.value = existingWatermarkFiles.value[0]
			}
		}
	} catch {
		existingWatermarkFiles.value = []
	}
}

function pickWatermark() {
	window.electron.pickWatermark().then(f => {
		if (f) {
			watermarkFile.value = f
			selectedExistingWatermark.value = ''
		}
	})
}

function clearWatermark() {
	watermarkFile.value = null
	selectedExistingWatermark.value = ''
	existingWatermarkPreviewUrl.value = null
}

// ── Watermark upload helpers ──
function resolveWatermarkDirRel() {
	// Always use the central configured root for watermarks, never individual project dirs
	const root = configuredRoot.value || ''
	const rel = root ? root.replace(/^\/+/, '') : ''
	return rel ? `${rel}/.45flow/watermarks` : '.45flow/watermarks'
}

function resolveWatermarkRelPath() {
	const name = String(watermarkFile.value?.name || '').replace(/\\/g, '/').replace(/^\/+/, '').trim()
	if (!name) return ''
	return `${resolveWatermarkDirRel()}/${name}`
}

function resolveWatermarkPathForApi(idOrPath: string) {
	const builtin = DEFAULT_45FLOW_WATERMARKS.find(wm => wm.id === idOrPath)
	if (builtin) return builtin.path
	return idOrPath
}

async function serverFileExists(relPath: string) {
	const clean = String(relPath || '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '')
	if (!clean) return false
	const idx = clean.lastIndexOf('/')
	const dir = idx >= 0 ? clean.slice(0, idx) : ''
	const name = idx >= 0 ? clean.slice(idx + 1) : clean
	if (!name) return false
	try {
		const data = await apiFetch(`/api/files?dir=${encodeURIComponent(dir || '.')}`, { method: 'GET' })
		const entries = Array.isArray(data?.entries) ? data.entries : []
		return entries.some((e: any) => !e?.isDir && String(e?.name || '') === name)
	} catch {
		return false
	}
}

async function ensureServerDirExists(dir: string) {
	const clean = String(dir || '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '')
	try {
		await apiFetch(`/api/files?dir=${encodeURIComponent(clean || '.')}&dirsOnly=1&ensure=1`, { method: 'GET' })
		return true
	} catch {
		return false
	}
}

async function uploadWatermarkToServer(): Promise<{ ok: boolean; relPath?: string; error?: string }> {
	if (!watermarkFile.value) return { ok: false, error: 'no watermark file' }
	const ssh = activeConnection.value?.ssh
	const host = ssh?.server
	const user = ssh?.username
	if (!host || !user) return { ok: false, error: 'missing ssh connection info' }

	// Check if watermark already exists on server
	const existingRelPath = resolveWatermarkRelPath()
	if (existingRelPath && await serverFileExists(existingRelPath)) {
		return { ok: true, relPath: existingRelPath }
	}

	// Upload via rsync
	const destDir = `/${resolveWatermarkDirRel()}`
	const ensured = await ensureServerDirExists(destDir)
	if (!ensured) return { ok: false, error: 'failed to prepare remote watermark directory' }

	const { id: rsyncId, done } = await window.electron.rsyncStart({
		host,
		user,
		src: watermarkFile.value.path,
		destDir,
		port: ssh?.port || 22,
		noIngest: true,
	})
	const res = await done
	// Remove the watermark upload task from Transfer Dock
	if (rsyncId) {
		const uploadTasks = transfer.state.tasks.filter(
			(t: any) => t.kind === 'upload' && t.taskId === rsyncId
		)
		for (const task of uploadTasks) {
			transfer.removeTask(task.taskId)
		}
	}
	if (!res?.ok) return { ok: false, error: res?.error || 'watermark upload failed' }
	return { ok: true, relPath: resolveWatermarkRelPath() }
}

async function fetchWatermarkPreview(relPath: string) {
	try {
		const base = meta.value.apiBase ?? ''
		const token = meta.value.token ?? ''
		const builtin = DEFAULT_45FLOW_WATERMARKS.find(wm => wm.id === relPath || wm.path === relPath)
		const previewPath = builtin ? builtin.path : relPath
		const url = `${base}/api/files/watermark-preview?path=${encodeURIComponent(previewPath)}`
		const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } })
		if (!res.ok) { existingWatermarkPreviewUrl.value = null; return }
		const blob = await res.blob()
		existingWatermarkPreviewUrl.value = await new Promise<string>((resolve, reject) => {
			const reader = new FileReader()
			reader.onloadend = () => resolve(reader.result as string)
			reader.onerror = reject
			reader.readAsDataURL(blob)
		})
	} catch {
		existingWatermarkPreviewUrl.value = null
	}
}

watch(selectedExistingWatermark, (v) => {
	if (v) fetchWatermarkPreview(v)
	else existingWatermarkPreviewUrl.value = null
})

// ── Detect pre-existing watermarks on selected files ──
async function checkExistingWatermarkInfo() {
	const paths = shareFiles.value
	if (paths.length === 0) {
		existingFileWatermark.value = null
		existingFileWatermarkMessage.value = ''
		return
	}
	try {
		const data = await apiFetch('/api/files/watermark-info', {
			method: 'POST',
			body: JSON.stringify({ filePaths: paths }),
		})
		const files: any[] = data?.files || []
		if (files.length === 0) {
			existingFileWatermark.value = null
			existingFileWatermarkMessage.value = ''
			return
		}
		// Use the first file's watermark info as the reference
		const first = files[0]
		existingFileWatermark.value = {
			watermarkFile: first.watermarkFile || '',
			watermarkSettings: first.watermarkSettings || null,
		}
		// Auto-enable watermark toggle and load existing settings
		watermarkEnabled.value = true
		if (first.watermarkFile) {
			selectedExistingWatermark.value = first.watermarkFile
			void fetchWatermarkPreview(first.watermarkFile)
		}
		if (first.watermarkSettings) {
			watermarkSettings.value = {
				position: {
					x: first.watermarkSettings.position?.x ?? 3,
					y: first.watermarkSettings.position?.y ?? 3,
					xUnit: first.watermarkSettings.position?.xUnit ?? '%',
					yUnit: first.watermarkSettings.position?.yUnit ?? '%',
					anchor: first.watermarkSettings.position?.anchor ?? 'bottom-right',
				},
				scale: first.watermarkSettings.scale ?? 35,
				opacity: first.watermarkSettings.opacity ?? 70,
				rotation: first.watermarkSettings.rotation ?? 0,
			}
		}
		const wmName = (first.watermarkFile || '').split('/').pop() || 'watermark'
		const count = files.length
		existingFileWatermarkMessage.value = count === paths.length
			? `${count === 1 ? 'File already has' : 'All files already have'} watermark: ${wmName}`
			: `${count} of ${paths.length} file${paths.length > 1 ? 's' : ''} already watermarked with: ${wmName}`
	} catch {
		existingFileWatermark.value = null
		existingFileWatermarkMessage.value = ''
	}
}

watch(shareFiles, () => {
	void checkExistingWatermarkInfo()
}, { deep: true })

watch(showDefaultWatermarks, () => {
	void loadExistingWatermarks()
})

watch(configuredRoot, () => {
	void loadExistingWatermarks()
})

// ── Outputs Exist Dialog ──
const showOutputsExistModal = ref(false)
let outputsExistResolver: ((action: 'overwrite' | 'keep' | 'cancel') => void) | null = null

function showOutputsExistPrompt(): Promise<'overwrite' | 'keep' | 'cancel'> {
	showOutputsExistModal.value = true
	return new Promise(resolve => { outputsExistResolver = resolve })
}

function resolveOutputsExist(action: 'overwrite' | 'keep' | 'cancel') {
	if (outputsExistResolver) {
		outputsExistResolver(action)
		outputsExistResolver = null
	}
	showOutputsExistModal.value = false
}

async function fetchProjects() {
	try {
		const data = await apiFetch('/api/projects')
		projects.value = data.projects || []
	} catch {}
}

async function createProject() {
	if (!newProjectName.value.trim() || !newProjectRoot.value.trim()) return
	creatingProject.value = true
	try {
		const data = await apiFetch('/api/projects', {
			method: 'POST',
			body: JSON.stringify({
				name: newProjectName.value.trim(),
				rootDir: newProjectRoot.value.trim(),
			}),
		})
		showNewProjectModal.value = false
		newProjectName.value = ''
		newProjectRoot.value = ''
		await fetchProjects()
		if (data?.project?.id) {
			selectedProjectId.value = data.project.id
			onProjectChange()
		}
	} catch (e: any) {
		pushNotification(new Notification('Failed to create project', e?.message || '', 'error', 8000))
	} finally {
		creatingProject.value = false
	}
}

async function generateLink() {
	loading.value = true
	error.value = null
	resultUrl.value = ''

	try {
		const optionsBody = opts.buildOptionsBody()
		const body: any = { ...optionsBody }

		body.uploadEnabled = opts.uploadEnabled.value
		body.shareEnabled = opts.shareEnabled.value

		if (opts.uploadEnabled.value && uploadDest.value.trim()) {
			body.uploadDir = '/' + uploadDest.value.replace(/^\/+/, '')
			body.autoShareUploads = autoShareUploads.value
			body.autoWatermarkUploads = autoWatermarkUploads.value
		}

		if (opts.shareEnabled.value) {
			const wantsProxy = hasVideoSelected.value && proxyQualities.value.length > 0
			body.generateReviewProxy = wantsProxy
			body.hls = hasVideoSelected.value

			if (wantsProxy) {
				body.proxyQualities = proxyQualities.value.slice()
			}

			if (hasMediaSelected.value && watermarkEnabled.value) {
				body.watermark = true
				const selectedServerWatermark = String(selectedExistingWatermark.value || '').trim()

				// Determine watermark path for the API
				let wmFilePath = ''
				if (selectedServerWatermark) {
					// User picked an existing server watermark (or builtin) from dropdown
					wmFilePath = resolveWatermarkPathForApi(selectedServerWatermark)
				} else if (watermarkFile.value) {
					// User browsed for a new local file — upload it to the server first
					const up = await uploadWatermarkToServer()
					if (!up.ok) {
						error.value = up.error || 'Watermark upload failed'
						loading.value = false
						return
					}
					wmFilePath = up.relPath || resolveWatermarkRelPath() || watermarkFile.value.name
				}

				if (wmFilePath) body.watermarkFile = wmFilePath

				// Premium: Include watermark customization settings
				body.watermarkSettings = { ...watermarkSettings.value }

				// If watermark is unchanged from what's already on the files, tell server to keep existing
				if (watermarkUnchanged.value) {
					body.useExistingWatermarkOnly = true
				}
			}

			if (shareFiles.value.length === 1) body.filePath = shareFiles.value[0]
			else body.filePaths = shareFiles.value.slice()
		}

		const doRequest = () => apiFetch('/api/magic-link', {
			method: 'POST',
			body: JSON.stringify(body),
			timeoutMs: 5 * 60 * 1000,
		})

		let data: any
		try {
			data = await doRequest()
		} catch (e: any) {
			if (e?.status === 409 && (
				String(e?.message || '').includes('outputs_exist') ||
				String(e?.message || '').includes('hls_exists') ||
				String(e?.message || '').includes('watermark_exists')
			)) {
				const action = await showOutputsExistPrompt()
				if (action === 'overwrite') {
					body.overwrite = true
					data = await doRequest()
				} else if (action === 'keep') {
					body.keepExistingOutputs = true
					body.overwrite = false
					data = await doRequest()
					pushNotification(new Notification('Existing Outputs Kept', 'Link created using existing transcode outputs.', 'info', 6000))
				} else {
					loading.value = false
					return
				}
			} else {
				throw e
			}
		}

		resultUrl.value = data.viewUrl || data.url || ''

		// ── Start transcode tracking in TransferDock ──
		if (hasMediaSelected.value) {
			const token = extractLinkToken(data)
			const fileRecords: any[] = Array.isArray(data?.files) ? data.files : []
			const transcodeRecords: any[] = Array.isArray(data?.transcodes) ? data.transcodes : []
			const groupId = crypto.randomUUID?.() || Math.random().toString(36).slice(2)

			const jobInfo: Record<number, { queuedKinds: string[]; activeKinds: string[] }> = {}
			for (const rec of transcodeRecords) {
				const vId = Number(rec?.assetVersionId)
				if (!Number.isFinite(vId) || vId <= 0) continue
				jobInfo[vId] = {
					queuedKinds: Array.isArray(rec?.jobs?.queuedKinds) ? rec.jobs.queuedKinds : [],
					activeKinds: Array.isArray(rec?.jobs?.activeKinds) ? rec.jobs.activeKinds : [],
				}
			}

			for (const rec of fileRecords) {
				const fileId = Number(rec?.id ?? rec?.fileId ?? rec?.file_id)
				const assetVersionId = Number(rec?.assetVersionId ?? 0)
				if (!Number.isFinite(assetVersionId) || assetVersionId <= 0) continue

				const info = jobInfo[assetVersionId]
				const hlsActive = info?.activeKinds?.includes('hls') || info?.queuedKinds?.includes('hls')
				const proxyActive = info?.activeKinds?.includes('proxy_mp4') || info?.queuedKinds?.includes('proxy_mp4')
				const canUsePlayback = !!token && Number.isFinite(fileId) && fileId > 0
				const playbackPath = canUsePlayback
					? `/api/token/${encodeURIComponent(token)}/files/${encodeURIComponent(String(fileId))}/playback/${encodeURIComponent(String(assetVersionId))}?prefer=auto&audit=0`
					: ''
				const filePath = rec?.path || rec?.name || 'File'
				const displayName = rec?.name || rec?.path || 'File'
				const context = {
					source: 'link' as const,
					groupId,
					file: filePath,
					linkUrl: resultUrl.value,
					linkTitle: opts.linkTitle.value || undefined
				}

				if (hlsActive && canUsePlayback && !transfer.hasActiveTranscode({ assetVersionIds: [assetVersionId], file: filePath, jobKind: 'hls' })) {
					transfer.startPlaybackTranscodeTask({
						title: `Transcoding: ${displayName}`,
						detail: 'HLS stream',
						intervalMs: 1500,
						jobKind: 'hls',
						context,
						assetVersionId,
						fetchSnapshot: async () => {
							const payload = await apiFetch(playbackPath, { suppressAuthRedirect: true })
							const j = payload?.transcodes?.hls || payload?.transcodes?.HLS || null
							return {
								status: j?.status ?? payload?.hlsStatus ?? payload?.status,
								progress: j?.progress ?? payload?.hlsProgress ?? 0,
								etaSeconds: j?.eta_seconds ?? null,
								speedX: j?.speed_x ?? null,
							}
						}
					})
				}

				if (proxyActive && canUsePlayback && !transfer.hasActiveTranscode({ assetVersionIds: [assetVersionId], file: filePath, jobKind: 'proxy_mp4' })) {
					transfer.startPlaybackTranscodeTask({
						title: `Transcoding: ${displayName}`,
						detail: 'Review copy',
						intervalMs: 1500,
						jobKind: 'proxy_mp4',
						context,
						assetVersionId,
						fetchSnapshot: async () => {
							const payload = await apiFetch(playbackPath, { suppressAuthRedirect: true })
							const j = payload?.transcodes?.proxy_mp4 || payload?.transcodes?.proxy || null
							return {
								status: j?.status ?? payload?.proxyStatus ?? payload?.status,
								progress: j?.progress ?? payload?.proxyProgress ?? 0,
								etaSeconds: j?.eta_seconds ?? null,
								speedX: j?.speed_x ?? null,
								qualityOrder: j?.quality_order ?? j?.qualityOrder,
								activeQuality: j?.active_quality ?? j?.activeQuality,
								perQualityProgress: j?.per_quality_progress ?? j?.perQualityProgress,
							}
						}
					})
				}

				// Track watermark_image jobs for image files
				const wmImgActive = info?.activeKinds?.includes('watermark_image') || info?.queuedKinds?.includes('watermark_image')
				if (wmImgActive && canUsePlayback && !transfer.hasActiveTranscode({ assetVersionIds: [assetVersionId], file: filePath, jobKind: 'watermark_image' })) {
					transfer.startPlaybackTranscodeTask({
						title: `Watermarking: ${displayName}`,
						detail: 'Image watermark',
						intervalMs: 1500,
						jobKind: 'watermark_image',
						context,
						assetVersionId,
						fetchSnapshot: async () => {
							const payload = await apiFetch(playbackPath, { suppressAuthRedirect: true })
							const j = payload?.transcodes?.watermark_image || null
							return {
								status: j?.status ?? 'queued',
								progress: j?.progress ?? 0,
								etaSeconds: j?.eta_seconds ?? null,
								speedX: null,
							}
						}
					})
				}
			}
		}

		signalLinkCreated()
		pushNotification(new Notification('Link Created', 'Your link has been generated successfully.', 'success', 6000))
	} catch (e: any) {
		error.value = e?.message || 'Failed to generate link'
		pushNotification(new Notification('Link Generation Failed', error.value!, 'error', 8000))
	} finally {
		loading.value = false
	}
}

function copyResult() {
	if (resultUrl.value) {
		navigator.clipboard.writeText(resultUrl.value)
		pushNotification(new Notification('Copied!', 'Link copied to clipboard.', 'success', 4000))
	}
}

function extractLinkToken(data: any): string {
	const direct = String(data?.token || '').trim()
	if (direct) return direct
	const u = String(data?.viewUrl || '').trim()
	if (!u) return ''
	const parts = u.split('/').filter(Boolean)
	return parts[parts.length - 1] || ''
}

function openResult() {
	if (resultUrl.value) window.open(resultUrl.value, '_blank')
}

function resetAll() {
	opts.resetOptions()
	uploadDest.value = ''
	uploadProjectBase.value = ''
	autoShareUploads.value = false
	autoWatermarkUploads.value = false
	shareFiles.value = []
	proxyQualities.value = ['original']
	watermarkEnabled.value = false
	watermarkSettings.value = createDefaultWatermarkSettings()
	resultUrl.value = ''
	error.value = null
	selectedProjectId.value = null
}

function goBack() {
	to('dashboard')
}

// ── Guided Tour ──
const { requestTour } = useTourManager()
const { onboarding, markDone } = useOnboarding()

const createLinkTourSteps = computed<TourStep[]>(() => [
	{
		target: '[data-tour="create-link-capabilities"]',
		message: 'Welcome to Create Link!\n\nThis screen lets you create a combined link with Upload, Share/Review, or both capabilities in a single URL.\n\nUse the checkboxes to toggle Upload (clients send files) and Share/Review (clients view files). Enable both for a combined link.',
	},
	{
		target: '[data-tour="create-link-project"]',
		message: 'Select a project to scope the link.\n\nThis sets the root directory for browsing and uploading. Choose "No project" to use the server\'s default root instead.\n\nYou can also create a new project inline.',
		beforeShow: () => { /* only shows if projectMode is enabled */ },
	},
	{
		target: '[data-tour="create-link-upload-dest"]',
		message: 'When Upload is enabled, pick the destination folder on the server.\n\nClients who access this link will upload files to this directory.',
		beforeShow: () => { opts.uploadEnabled.value = true },
	},
	{
		target: '[data-tour="create-link-share-files"]',
		message: 'When Share/Review is enabled, browse and select files to include in the link.\n\nRecipients will be able to view, stream, and download these files.',
		beforeShow: () => { opts.shareEnabled.value = true },
	},
	{
		target: '[data-tour="create-link-options"]',
		message: 'Configure link settings: expiry time, title, network access (Local or External), and access mode (open, password, or invited users/groups).\n\nThese apply to the entire link regardless of capabilities.',
	},
	{
		target: '[data-tour="create-link-media-options"]',
		message: isPremiumActive.value
			? 'When sharing video or image files, media options appear here.\n\nFor video: choose review copy qualities (720p, 1080p, full-res) and toggle watermarks.\nFor images: toggle watermark overlays to protect your content.\n\nWatermarks support PNG, JPG, and SVG with full customization — position, size, opacity, and tiling (Pro).'
			: 'When sharing video or image files, media options appear here.\n\nFor video: choose review copy qualities (720p, 1080p, full-res) and toggle watermarks.\nFor images: toggle watermark overlays to protect your content.\n\nA basic watermark is applied at bottom-right. Upgrade to Pro for full customization of position, size, and opacity.',
		beforeShow: () => { opts.shareEnabled.value = true },
	},
	{
		target: '[data-tour="create-link-generate-btn"]',
		message: 'Click here to generate your Flow link.\n\nThe resulting URL handles both upload and review in one link — share it with your collaborators.',
	},
])

onMounted(async () => {
	try {
		await Promise.all([
			opts.loadLinkDefaults(),
			fetchProjects(),
			loadExistingWatermarks(),
			apiFetch('/api/settings').then(s => {
				if (s?.projectRoot) configuredRoot.value = String(s.projectRoot).trim()
			}).catch(() => {}),
		])
		// Auto-select project from query param (passed from Dashboard)
		const qProjectId = Number(route.query.projectId)
		if (qProjectId && projects.value.some(p => p.id === qProjectId)) {
			selectedProjectId.value = qProjectId
			onProjectChange()
		} else if (globalActiveProject.value && projects.value.some(p => p.id === globalActiveProject.value!.id)) {
			// Auto-select from global active project
			selectedProjectId.value = globalActiveProject.value.id
			onProjectChange()
		}
	} finally {
		initializing.value = false
	}

	// Guided tour
	if (!onboarding.value.createLinkTourDone) {
		setTimeout(() => {
			requestTour('create-link', createLinkTourSteps.value, () => markDone('createLinkTourDone'))
		}, 500)
	}
})
</script>
