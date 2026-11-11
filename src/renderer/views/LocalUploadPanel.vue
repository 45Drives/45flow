<template>
	<div class="h-full min-h-0 overflow-y-auto pt-2"
		@dragenter="onPageDragEnter"
		@dragover="onPageDragOver"
		@dragleave="onPageDragLeave"
		@drop="onPageDrop"
	>
		<div class="mx-auto w-full max-w-screen-2xl px-4 sm:px-6 lg:px-8 pb-4">
			<FlowCard variant="plain" class="w-full bg-well rounded-md shadow-xl min-w-0">
				<div class="lu-panel ss-toned-panel flex flex-col gap-3 text-left min-w-0 p-3"
					:class="{ 'lu-panel--dragover': dragOver }">

					<!-- Header -->
					<div class="flex flex-wrap items-start justify-between gap-3 min-w-0" data-tour="upload-header">
						<div class="min-w-0">
							<h2 class="text-xl font-semibold">Add Files</h2>
							<p class="text-sm opacity-80 -mt-0.5 truncate">
								Copy files from this computer into
								<template v-if="activeProject"><span class="font-semibold">{{ activeProject.name }}</span> on the server.</template>
								<template v-else>a folder on {{ activeConnection?.name || 'the server' }}.</template>
							</p>
						</div>
						<button class="btn btn-dismiss px-4 py-2 text-sm" @click="goBack">Back to Project</button>
					</div>

					<!-- ══════ Files ══════ -->
					<section class="border-t border-default pt-3 min-w-0" data-tour="upload-files">
						<div class="flex flex-wrap items-baseline justify-between gap-2 mb-2">
							<h3 class="text-base font-semibold">Files</h3>
							<div v-if="selected.length && phase === 'select'" class="flex items-center gap-3 text-xs">
								<span class="opacity-75">{{ selected.length }} item{{ selected.length === 1 ? '' : 's' }} · {{ formatSize(totalSelectedBytes) }}</span>
								<button type="button" class="btn btn-danger btn-xs" @click="clearSelected">Clear</button>
							</div>
						</div>

						<div v-if="phase !== 'running'" class="lu-drop"
							:class="{ 'lu-drop--compact': rows.length > 0, 'lu-drop--active': dragOver }"
							data-tour="upload-drop-zone">
							<ArrowUpTrayIcon class="lu-drop__icon" aria-hidden="true" />
							<div class="lu-drop__text">
								<p class="lu-drop__title">
									{{ phase === 'finished' ? 'Drag more files here to start another upload' : dragOver ? 'Drop to add them' : 'Drag files here' }}
								</p>
								<p class="lu-drop__copy">
									<template v-if="phase === 'finished'">Adding files clears this list and starts a new upload with the same folder and options.</template>
									<template v-else>Drop files anywhere on this screen, or choose them from this computer. You can add files more than once before you upload.</template>
								</p>
							</div>
							<div class="lu-drop__actions">
								<button type="button" class="btn btn-secondary" :class="{ 'btn-sm': rows.length > 0 }" @click="pickFiles">Choose Files</button>
								<button type="button" class="btn btn-secondary" :class="{ 'btn-sm': rows.length > 0 }" @click="pickFolder">Choose Folder</button>
							</div>
						</div>

						<div v-if="rows.length" class="flow-table-wrap lu-table mt-2">
							<table class="flow-table">
								<thead>
									<tr>
										<th scope="col">Name</th>
										<th scope="col" class="flow-table__num">Size</th>
										<th v-if="phase !== 'select'" scope="col">Status</th>
										<th scope="col" class="text-right"><span class="sr-only">Action</span></th>
									</tr>
								</thead>
								<tbody>
									<!-- Before upload: what will be sent -->
									<template v-if="phase === 'select'">
										<tr v-for="f in selected" :key="f.path">
											<td class="min-w-0">
												<div class="truncate max-w-[42rem]" :title="f.path">{{ f.name }}</div>
											</td>
											<td class="flow-table__num">{{ formatSize(f.size) }}</td>
											<td class="text-right">
												<button type="button" class="btn btn-secondary btn-xs" :aria-label="`Remove ${f.name}`"
													@click="removeSelected(f)">Remove</button>
											</td>
										</tr>
									</template>

									<!-- During/after upload: live status per file -->
									<template v-else>
										<tr v-for="u in uploads" :key="u.localKey">
											<td class="min-w-0">
												<div class="truncate max-w-[42rem] font-medium" :title="u.path">{{ u.name }}</div>
												<div class="text-xs opacity-70 mt-0.5">
													<template v-if="u.status === 'uploading' || u.status === 'transcoding'">
														{{ Number.isFinite(u.progress) ? u.progress.toFixed(0) : 0 }}%<span v-if="u.speed"> · {{ u.speed }}</span><span v-if="u.eta"> · ETA {{ u.eta }}</span>
													</template>
													<template v-else-if="u.status === 'done' && u.completedIn">
														{{ u.alreadyUploaded ? 'Already in this folder' : `Completed in ${u.completedIn}` }}
													</template>
												</div>
												<progress v-if="u.status === 'uploading' || u.status === 'transcoding'"
													class="lu-row-progress" :value="Number.isFinite(u.progress) ? u.progress : 0" max="100"></progress>
												<div v-if="u.phaseMessage && u.status !== 'error' && u.status !== 'canceled'"
													class="text-xs opacity-70 mt-1" role="status">{{ u.phaseMessage }}</div>
												<div v-if="u.error" class="text-xs text-flow-danger mt-1">{{ u.error }}</div>
											</td>
											<td class="flow-table__num">{{ formatSize(u.size) }}</td>
											<td class="whitespace-nowrap">
												<FlowChip :tone="statusTone(u)" size="sm" :dot="u.status === 'uploading' || u.status === 'transcoding'">
													{{ statusLabel(u) }}
												</FlowChip>
											</td>
											<td class="text-right">
												<!-- flow-ui-allow: "Cancel" stops a running upload, so it is a danger action -->
												<button v-if="u.status === 'uploading' || u.status === 'transcoding' || (u.status === 'queued' && phase === 'running')"
													type="button" class="btn btn-danger btn-xs" :aria-label="`Cancel ${u.name}`" @click="cancelOne(u)">
													Cancel
												</button>
											</td>
										</tr>
									</template>
								</tbody>
							</table>
						</div>
					</section>

					<!-- ══════ Destination ══════ -->
					<section class="border-t border-default pt-3 min-w-0" data-tour="upload-destination">
						<h3 class="text-base font-semibold mb-2">Upload to</h3>
						<fieldset :disabled="phase === 'running'" class="lu-dest-row" :class="{ 'opacity-60': phase === 'running' }">
							<PathInput
								v-model="destInput"
								:apiFetch="pathInputApiFetch"
								:dirsOnly="true"
								placeholder="Folder on the server, e.g. /tank/projects/spring/footage"
								class="min-w-0 flex-1"
							/>
							<button
								type="button"
								class="btn btn-secondary text-sm px-3 py-1.5"
								:aria-expanded="showBrowser"
								@click="showBrowser = !showBrowser"
							>{{ showBrowser ? 'Done' : 'Browse…' }}</button>
						</fieldset>
						<p v-if="destIsFilesystemRoot" class="text-xs text-flow-danger mt-1">
							The filesystem root (/) can't receive uploads. Choose a folder.
						</p>
						<p v-else class="text-xs opacity-70 mt-1">
							<template v-if="activeProject && destIsProjectRoot">Files go into the top of the project folder. Browse to put them in a subfolder or create one.</template>
							<template v-else>Type a path, or click Browse… to pick a folder or create a new one.</template>
						</p>
						<div v-if="showBrowser && phase !== 'running'" class="mt-2" data-tour="upload-folder-picker">
							<FolderPicker
								:key="pickerKey"
								v-model="destFolderRel"
								:apiFetch="apiFetch"
								useCase="upload"
								subtitle=""
								:auto-detect-roots="!activeProject"
								:allow-entire-tree="!activeProject"
								:is-root-user="isRootUser"
								:hide-project-controls="!!activeProject"
								:startDir="activeProject?.root_dir || undefined"
								v-model:project="projectBase"
								v-model:dest="destFolderRel"
								:compact="true"
							/>
						</div>
					</section>

					<!-- ══════ Media options (only when videos or images are in the list) ══════ -->
					<section v-if="hasMediaSelected" class="border-t border-default pt-3 min-w-0" data-tour="upload-advanced-video">
						<div class="flex flex-wrap items-baseline justify-between gap-2 mb-2">
							<h3 class="text-base font-semibold">{{ mediaOptionsTitle }}</h3>
							<span class="text-xs opacity-75">
								<template v-if="hasVideoSelected">A browser stream is always made; proxy files are extra downloadable MP4s.</template>
								<template v-else>Watermarks are applied to the uploaded images.</template>
							</span>
						</div>
						<fieldset :disabled="phase === 'running'" class="min-w-0" :class="{ 'opacity-60': phase === 'running' }">
							<VideoOptionsPanel
								v-model:proxyQualities="proxyQualities"
								v-model:watermarkEnabled="watermarkAfterUpload"
								v-model:selectedExistingWatermark="selectedExistingWatermark"
								v-model:showDefaultWatermarks="showDefaultWatermarks"
								:watermarkFile="watermarkFile"
								:existingWatermarkFiles="existingWatermarkFiles"
								:defaultWatermarks="validDefaultWatermarks"
								:hideProxyQualities="!hasVideoSelected"
								:showHeading="false"
								:compact="true"
								:watermarkLabel="hasVideoSelected && hasImageSelected ? 'Watermark Media' : hasVideoSelected ? 'Watermark Videos' : 'Watermark Images'"
								:watermarkStatusText="watermarkAfterUpload ? 'On' : 'Off'"
								:effectiveWatermarkName="effectiveWatermarkName"
								:usingExistingWatermark="!watermarkFile && !!selectedExistingWatermark"
								@pickWatermark="pickWatermark"
								@clearWatermark="clearWatermark"
								@refreshWatermarks="loadExistingWatermarkFiles"
							/>

							<!-- Client-side transcoding status hint -->
							<p v-if="hasVideoSelected" class="text-xs text-muted flex items-center gap-1.5 mt-2">
								<template v-if="_clientTranscodeOn">
									<span class="text-flow-success" aria-hidden="true">✓</span>
									<span>Videos are processed on this computer{{ _clientHwAccelOn ? ' (GPU)' : ' (CPU)' }} before they upload.</span>
								</template>
								<template v-else-if="_isWebView">
									<span class="text-flow-info" aria-hidden="true">ⓘ</span>
									<span>The server processes videos after upload. 45Flow Desktop can process them on your computer instead.</span>
								</template>
								<template v-else>
									<span class="text-flow-info" aria-hidden="true">ⓘ</span>
									<span>The server processes videos after upload. Turn on client-side transcoding in Settings → Performance to do it on this computer instead.</span>
								</template>
							</p>

							<!-- Watermark customization (Pro) or preview -->
							<div v-if="watermarkAfterUpload && (watermarkFile || selectedExistingWatermark)" class="mt-3 border-t border-default pt-3">
								<WatermarkCustomizer v-if="isPremiumActive"
									v-model="watermarkSettings"
									:watermarkPreviewUrl="watermarkFile?.dataUrl || existingWatermarkPreviewUrl || null"
								/>
								<WatermarkPreview v-else
									:previewUrl="watermarkFile?.dataUrl || existingWatermarkPreviewUrl || ''"
									label="Watermark (bottom-right)"
								/>
							</div>
						</fieldset>
					</section>

					<!-- ══════ Action bar ══════ -->
					<div class="lu-actionbar border-t border-default pt-3" data-tour="upload-action-bar">
						<div class="min-w-0 flex-1" aria-live="polite">
							<template v-if="phase === 'select'">
								<p v-if="blockReason" class="text-sm opacity-80">{{ blockReason }}</p>
								<p v-else class="text-sm truncate" :title="destDir">
									<span class="font-semibold">{{ selected.length }} file{{ selected.length === 1 ? '' : 's' }}</span>
									<span class="opacity-75"> · {{ formatSize(totalSelectedBytes) }} → </span>
									<span class="font-mono text-xs">{{ destDir }}</span>
								</p>
							</template>
							<template v-else>
								<div class="flex items-center justify-between gap-3 text-sm mb-1">
									<span>
										{{ uploadSummary.done }} of {{ uploadSummary.total }} done
										<template v-if="uploadSummary.active"> · {{ uploadSummary.active }} in progress</template>
										<template v-if="uploadSummary.queued"> · {{ uploadSummary.queued }} waiting</template>
										<template v-if="uploadSummary.errors"> · <span class="text-flow-danger">{{ uploadSummary.errors }} failed</span></template>
										<template v-if="uploadSummary.canceled"> · {{ uploadSummary.canceled }} canceled</template>
									</span>
									<span class="text-muted tabular-nums">{{ uploadSummary.overallPct.toFixed(0) }}%</span>
								</div>
								<progress class="lu-overall-progress" :value="uploadSummary.overallPct" max="100"
									:aria-label="`Upload progress ${uploadSummary.overallPct.toFixed(0)}%`"></progress>
								<p v-if="phase === 'running'" class="text-xs opacity-70 mt-1">
									You can leave this screen. Uploads keep going in the Transfer Dock.
								</p>
							</template>
						</div>

						<div class="flex flex-wrap items-center gap-2 shrink-0">
							<template v-if="phase === 'select'">
								<button type="button" data-tour="upload-start-btn" class="btn btn-primary px-5"
									:disabled="!canStart" @click="onStartUpload">
									{{ selected.length > 1 ? `Upload ${selected.length} Files` : 'Upload' }}
								</button>
							</template>
							<template v-else-if="phase === 'finished'">
								<button v-if="uploadSummary.errors" type="button" class="btn btn-secondary" @click="retryFailed">
									Retry Failed
								</button>
								<button type="button" class="btn btn-secondary" @click="startNewBatch()">Add More Files</button>
								<button type="button" class="btn btn-primary px-5" @click="finish">Done</button>
							</template>
						</div>
					</div>
				</div>
			</FlowCard>
		</div>
	</div>
</template>

<script setup lang="ts">
import FlowCard from '../ui/FlowCard.vue'
import FlowChip from '../ui/FlowChip.vue'
import { ref, computed, inject, watch, onMounted } from 'vue'
import { ArrowUpTrayIcon } from '@heroicons/vue/24/outline'
import { useApi } from '../composables/useApi'
import { useConnections } from '../composables/useConnections'
import { useActiveProject } from '../composables/useActiveProject'
import FolderPicker from '../components/FolderPicker.vue'
import PathInput from '../components/PathInput.vue'
import VideoOptionsPanel from '../components/VideoOptionsPanel.vue'
import WatermarkCustomizer from '../components/WatermarkCustomizer.vue'
import WatermarkPreview from '../components/WatermarkPreview.vue'
import { useLicenseStatus } from '../composables/useLicenseStatus'
import { connectionMetaInjectionKey } from '../keys/injection-keys';
import type { WatermarkSettings, Default45FlowWatermark } from '../types/watermark'
import type { TranscodeProgress } from '../typings/electron'
import { createDefaultWatermarkSettings, DEFAULT_45FLOW_WATERMARKS } from '../types/watermark'
import { useHeader } from '../composables/useHeader';
import { useResilientNav } from '../composables/useResilientNav'
import { onBeforeRouteLeave } from 'vue-router';
import { pushNotification, Notification } from '@45drives/houston-common-ui'
import { useTransferProgress } from '../composables/useTransferProgress'
import { useTourManager, type TourStep } from '../composables/useTourManager'
import { useOnboarding } from '../composables/useOnboarding'
import { useClientTranscode } from '../composables/useClientTranscode'
import { useUploadTranscode } from '../composables/useUploadTranscode'
const { to } = useResilientNav()
useHeader('Add Files')
const transfer = useTransferProgress()
const { activeProject: rawActiveProject } = useActiveProject()

// Client-side transcode status (reactive, for inline hint in template)
const { enabled: _clientTranscodeOn, hwAccel: _clientHwAccelOn } = useClientTranscode()
const _isWebView = window.electron?.isWeb === true
const activeProject = computed(() => rawActiveProject.value)
const { requestTour } = useTourManager()
const { onboarding, markDone } = useOnboarding()

const localUploadTourSteps = computed<TourStep[]>(() => [
	{
		target: '[data-tour="upload-files"]',
		message: 'Add Files copies files from this computer to the server, all from this one screen.\n\nDrag files anywhere onto this screen, or click "Choose Files" (you can pick several) or "Choose Folder" to add everything in a folder. The list shows what will be uploaded.',
	},
	{
		target: '[data-tour="upload-destination"]',
		message: 'Files go into the project folder unless you change it.\n\nType a path, or click "Browse…" to pick a subfolder or create a new one.',
	},
	{
		target: '[data-tour="upload-action-bar"]',
		message: (isPremiumActive.value
			? 'Add videos or images and their options show up above this bar: proxy file qualities for video, and watermarks with full control of position, size, opacity and tiling (Pro).'
			: 'Add videos or images and their options show up above this bar: proxy file qualities for video, and a basic bottom-right watermark. Pro adds full watermark customization.')
			+ '\n\nClick "Upload" to start. Progress shows in the list and in the Transfer Dock, so you can leave this screen while it runs.',
		placement: 'top',
	},
])

const skipUploadTour = () => markDone('localUploadTourDone')

onMounted(async () => {
	if (activeProject.value?.root_dir && !destFolderRel.value) {
		destFolderRel.value = activeProject.value.root_dir
	} else if (!activeProject.value) {
		showBrowser.value = true
	}

	await loadExistingWatermarkFiles()
	await loadDefaultWatermarkSettings()

	if (!onboarding.value.localUploadTourDone) {
		setTimeout(() => {
			requestTour('local-upload', localUploadTourSteps.value, () => markDone('localUploadTourDone'), skipUploadTour)
		}, 300)
	}
})

type LocalFile = { path: string; name: string; size: number; dataUrl?: string | null }

const connectionMeta = inject(connectionMetaInjectionKey)!;
const ssh = connectionMeta.value.ssh
const isUploading = ref(false)

const { apiFetch } = useApi()
const { activeConnection } = useConnections()
const isRootUser = computed(() => activeConnection.value?.username === 'root')
const { isPremiumActive } = useLicenseStatus()

/** ── Files ──────────────────────────────────────────── */
const selected = ref<LocalFile[]>([])
const dragOver = ref(false)
let dragCounter = 0

/** ── Destination ──────────────────────────────────────── */
// Shared by PathInput ("/tank/p/sub/") and FolderPicker ("tank/p/sub"); normalizedDest evens them out.
const destFolderRel = ref<string>('')
const projectBase = ref<string>('')
const configuredProjectRoot = ref<string>('')
const showBrowser = ref(false)
const pickerKey = ref(0)

const normalizedDest = computed(() =>
	'/' + destFolderRel.value.trim().replace(/^\/+/, '').replace(/\/+$/, '')
)
const destDir = computed(() => normalizedDest.value)
// FolderPicker writes "tank/p/sub"; show it as an absolute path in the text box.
const destInput = computed({
	get: () => (destFolderRel.value ? '/' + destFolderRel.value.replace(/^\/+/, '') : ''),
	set: (v: string) => { destFolderRel.value = v },
})
const destIsFilesystemRoot = computed(() => !!destFolderRel.value.trim() && normalizedDest.value === '/')
const destIsProjectRoot = computed(() => {
	const root = String(activeProject.value?.root_dir || '').replace(/^\/+/, '').replace(/\/+$/, '')
	return !!root && normalizedDest.value === '/' + root
})

// PathInput works with absolute paths, so its listings must come from the filesystem root.
const pathInputApiFetch = (url: string, init?: RequestInit) =>
	apiFetch(url + (url.includes('?') ? '&' : '?') + 'fromRoot=1', init)

// Registry of successful uploads: key = `${path}::${dest}`
const uploadedRegistry = ref(new Set<string>())

/** ── Step 3: upload & progress ─────────────────────────── */
const transcodeProxyAfterUpload = ref(true)
const proxyQualities = ref<string[]>(['original'])
const watermarkAfterUpload = ref(false)
const watermarkFile = ref<LocalFile | null>(null)
const watermarkSettings = ref<WatermarkSettings>(createDefaultWatermarkSettings())
const existingWatermarkFiles = ref<string[]>([])
const validDefaultWatermarks = ref<Default45FlowWatermark[]>([])
const selectedExistingWatermark = ref('')
const existingWatermarkPreviewUrl = ref<string | null>(null)
const showDefaultWatermarks = ref(false)
const effectiveWatermarkName = computed(() => {
	if (watermarkFile.value?.name) return watermarkFile.value.name
	if (selectedExistingWatermark.value) {
		const builtin = validDefaultWatermarks.value.find(w => w.path === selectedExistingWatermark.value)
		if (builtin) return builtin.name
		return selectedExistingWatermark.value.split('/').pop() || ''
	}
	return ''
})
const adaptiveHls = ref(false)

// ----- TYPES -----
type UploadRow = {
	localKey: string
	path: string
	name: string
	size: number
	dest: string
	uploadId?: string | null
	status: 'queued' | 'transcoding' | 'uploading' | 'done' | 'canceled' | 'error'
	phase?: 'uploading' | 'scanning' | 'finalizing' | 'complete'
	phaseMessage?: string
	error: string | null
	progress: number
	speed: string | null
	eta: string | null
	alreadyUploaded?: boolean
	startedAt?: number | null
	completedAt?: number | null
	completedIn?: string | null
	dockTaskId?: string | null
	ingestUnsub?: (() => void) | null
}
const uploads = ref<UploadRow[]>([])

const hasRunOnce = computed(() =>
	uploads.value.some(u => u.status !== 'queued')
)

function resetUploadState() {
	uploads.value = []
	isUploading.value = false
	activeUploads.value = 0
	completedSinceStart = 0
	failedSinceStart = 0
	if (batchNotifyTimer) { clearTimeout(batchNotifyTimer); batchNotifyTimer = null }
	rafState.clear()
}

// from step 1
const serverPort = 22
const privateKeyPath = computed(() => ssh?.keyPath)


const allTerminal = computed(() =>
	uploads.value.length > 0 &&
	uploads.value.every(u =>
		u.status === 'done' ||
		u.status === 'canceled' ||
		u.status === 'error'
	)
)

const allDone = computed(() =>
	uploads.value.length > 0 &&
	uploads.value.every(u => u.status === 'done' || u.status === 'canceled')
)

/** ── Overall progress summary ──────────────────────────── */
const uploadSummary = computed(() => {
	const rows = uploads.value
	const total = rows.length
	const done = rows.filter(u => u.status === 'done').length
	const active = rows.filter(u => u.status === 'uploading' || u.status === 'transcoding').length
	const queued = rows.filter(u => u.status === 'queued').length
	const errors = rows.filter(u => u.status === 'error').length
	const canceled = rows.filter(u => u.status === 'canceled').length

	// Weighted overall progress: done files count as 100%; canceled files drop out entirely
	let weightedPct = 0
	for (const u of rows) {
		if (u.status === 'done') weightedPct += 100
		else if (u.status === 'uploading' || u.status === 'transcoding') weightedPct += (u.progress || 0)
		// queued/error = 0
	}
	const counted = total - canceled
	const overallPct = counted > 0 ? weightedPct / counted : 0

	return { total, done, active, queued, errors, canceled, overallPct }
})

const totalSelectedBytes = computed(() =>
	selected.value.reduce((sum, f) => sum + (f.size || 0), 0)
)
const videoExts = new Set([
	'mp4', 'mov', 'm4v', 'mkv', 'webm', 'avi', 'wmv', 'flv',
	'mpg', 'mpeg', 'm2v', '3gp', '3g2', 'mxf', 'ts', 'm2ts', 'mts',
	'ogv', 'vob', 'divx', 'f4v', 'asf', 'rm', 'rmvb', 'm4s',
	'r3d', 'braw', 'ari', 'cine', 'dav', 'crm', 'nraw', 'cdx', 'prores',
	'mod', 'tod', 'mj2', 'qt', 'dv', 'hevc', 'h264', 'h265',
	'vp8', 'vp9', 'av1', 'dnxhd',
])
const imageExts = new Set([
	'jpg', 'jpeg', 'jfif', 'png', 'gif', 'webp', 'bmp', 'tiff', 'tif',
	'avif', 'heic', 'heif', 'jp2', 'jxl', 'svg',
])
const hasVideoSelected = computed(() =>
	selected.value.some(f => {
		const ext = String(f.name || '').toLowerCase().split('.').pop() || '';
		return videoExts.has(ext);
	})
)
const hasImageSelected = computed(() =>
	selected.value.some(f => {
		const ext = String(f.name || '').toLowerCase().split('.').pop() || '';
		return imageExts.has(ext);
	})
)
const hasMediaSelected = computed(() => hasVideoSelected.value || hasImageSelected.value)

const mediaOptionsTitle = computed(() =>
	hasVideoSelected.value && hasImageSelected.value ? 'Media options' : hasVideoSelected.value ? 'Video options' : 'Image options'
)

/** select → running → finished; one screen shows all three. */
const phase = computed<'select' | 'running' | 'finished'>(() => {
	if (!uploads.value.length) return 'select'
	return allTerminal.value ? 'finished' : 'running'
})
const rows = computed(() => (phase.value === 'select' ? selected.value : uploads.value))

const blockReason = computed(() => {
	if (!selected.value.length) return 'Add files to upload.'
	if (!destFolderRel.value.trim()) return 'Choose a folder on the server.'
	if (destIsFilesystemRoot.value) return "Choose a folder other than the filesystem root (/)."
	if (transcodeProxyAfterUpload.value && hasVideoSelected.value && proxyQualities.value.length === 0) return 'Pick at least one proxy file quality.'
	if (watermarkAfterUpload.value && !watermarkFile.value && !selectedExistingWatermark.value) return 'Choose a watermark image, or turn the watermark off.'
	return ''
})
const canStart = computed(() => !blockReason.value && !isUploading.value)

function statusTone(u: UploadRow): 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'muted' {
	switch (u.status) {
		case 'transcoding':
		case 'uploading': return 'info'
		case 'done': return 'success'
		case 'canceled': return 'muted'
		case 'error': return 'danger'
		default: return 'neutral'
	}
}

function statusLabel(u: UploadRow) {
	switch (u.status) {
		case 'transcoding': return 'Processing'
		case 'uploading':
			if (u.phase === 'scanning') return 'Scanning'
			if (u.phase === 'finalizing') return 'Finishing'
			return 'Uploading'
		case 'done': return 'Done'
		case 'canceled': return 'Canceled'
		case 'error': return 'Failed'
		default: return 'Waiting'
	}
}

async function onStartUpload() {
	if (!canStart.value) return
	uploads.value = prepareRows()
	await startUploads()
	// startUploads can stop before anything is sent (e.g. the watermark upload failed); go back to the editable list.
	if (!isUploading.value && uploads.value.every(u => u.status === 'queued')) uploads.value = []
}

async function retryFailed() {
	const failed = uploads.value.filter(u => u.status === 'error')
	if (!failed.length) return
	const previousErrors = new Map(failed.map(u => [u.localKey, u.error]))
	for (const u of failed) {
		u.status = 'queued'
		u.error = null
		u.progress = 0
		u.speed = null
		u.eta = null
		u.phase = undefined
		u.phaseMessage = undefined
		u.uploadId = null
		u.dockTaskId = null
		u.startedAt = null
		u.completedAt = null
		u.completedIn = null
	}
	await startUploads()
	if (!isUploading.value) {
		for (const u of failed) {
			if (u.status === 'queued') {
				u.status = 'error'
				u.error = previousErrors.get(u.localKey) || 'Not retried'
			}
		}
	}
}

/** Clear the finished batch (keeping folder and options) so new files can be added. */
function startNewBatch(files?: LocalFile[]) {
	resetUploadState()
	selected.value = []
	if (files?.length) addToSelection(files)
}

/** ── Files ──────────────────────────────────────────── */
function addToSelection(files?: LocalFile[] | null) {
	if (!files?.length) return
	if (phase.value === 'running') return
	if (phase.value === 'finished') return startNewBatch(files)
	const seen = new Set(selected.value.map(f => f.path))
	const append: LocalFile[] = []
	for (const f of files) if (!seen.has(f.path)) { append.push(f); seen.add(f.path) }
	if (append.length) selected.value = [...selected.value, ...append]
}
function pickFiles() { window.electron.pickFiles().then(addToSelection) }
function pickFolder() { window.electron.pickFolder().then(addToSelection) }
function removeSelected(file: LocalFile) { selected.value = selected.value.filter(f => f.path !== file.path) }
function clearSelected() { selected.value = [] }

// ── Drag-and-drop anywhere on the screen ──
// (QuickShare's document-level listener ignores this route, so drops land here.)
function canAcceptDrop(e: DragEvent) {
	return phase.value !== 'running' && !!e.dataTransfer?.types.includes('Files')
}
function onPageDragEnter(e: DragEvent) {
	if (!canAcceptDrop(e)) return
	e.preventDefault()
	dragCounter++
	dragOver.value = true
}
function onPageDragOver(e: DragEvent) {
	if (!e.dataTransfer?.types.includes('Files')) return
	e.preventDefault()
	e.dataTransfer.dropEffect = canAcceptDrop(e) ? 'copy' : 'none'
}
function onPageDragLeave() {
	if (!dragOver.value) return
	dragCounter--
	if (dragCounter <= 0) { dragCounter = 0; dragOver.value = false }
}
function onPageDrop(e: DragEvent) {
	e.preventDefault()
	dragOver.value = false
	dragCounter = 0
	if (!canAcceptDrop(e) || !e.dataTransfer?.files?.length) return

	// A dropped folder arrives as a single path the uploader can't send; Choose Folder expands it.
	const folderNames = new Set(
		Array.from(e.dataTransfer.items || [])
			.map(item => item.webkitGetAsEntry?.())
			.filter(entry => entry?.isDirectory)
			.map(entry => entry!.name),
	)
	if (folderNames.size) {
		pushNotification(new Notification(
			'Use Choose Folder for Folders',
			'Dropped folders can\'t be uploaded directly. Click Choose Folder to add everything inside a folder, or drop the files themselves.',
			'warning',
			7000,
		))
	}

	const files: LocalFile[] = []
	for (const f of Array.from(e.dataTransfer.files)) {
		const filePath = window.electron?.getPathForFile?.(f) || (f as any).path || ''
		if (!filePath || folderNames.has(f.name)) continue
		files.push({ path: filePath, name: f.name, size: f.size })
	}
	addToSelection(files)
}
function pickWatermark() {
	window.electron.pickWatermark().then((f: { path: string; name: string; size: number; dataUrl?: string | null } | null) => {
		if (f) {
			watermarkFile.value = f;
			selectedExistingWatermark.value = '';
		}
	});
}
function clearWatermark() {
	watermarkFile.value = null
	existingWatermarkPreviewUrl.value = null
	selectedExistingWatermark.value = ''
}

async function loadExistingWatermarkFiles() {
	try {
		const dirRel = resolveWatermarkDirRel()
		const [dirData, globalData] = await Promise.all([
			apiFetch(`/api/files?dir=${encodeURIComponent(dirRel)}`, { method: 'GET' }).catch(() => null),
			apiFetch('/api/files/watermarks', { method: 'GET' }).catch(() => null),
		])
		
		// Directory-specific watermarks
		const dirEntries = Array.isArray(dirData?.entries) ? dirData.entries : []
		const dirWatermarks = dirEntries
			.filter((e: any) => !e?.isDir && typeof e?.name === 'string' && String(e.name).trim())
			.map((e: any) => `${dirRel}/${String(e.name).trim()}`)
		
		// Global watermarks from all .45flow/watermarks/ dirs
		const globalWatermarks = Array.isArray(globalData?.watermarks) ? globalData.watermarks : []
		
		// Merge and deduplicate
		const allCustom = [...new Set([...dirWatermarks, ...globalWatermarks])].sort()
		
		// Check which built-in watermarks actually exist on the server
		const base = connectionMeta.value.apiBase ?? ''
		const token = connectionMeta.value.token ?? ''
		const builtinChecks = await Promise.allSettled(
			DEFAULT_45FLOW_WATERMARKS.map(async (wm) => {
				const url = `${base}/api/watermarks/defaults/${wm.id}/stream`
				const res = await fetch(url, { method: 'HEAD', headers: { 'Authorization': `Bearer ${token}` } })
				return res.ok ? wm : null
			})
		)
		validDefaultWatermarks.value = builtinChecks
			.filter((r): r is PromiseFulfilledResult<Default45FlowWatermark> => r.status === 'fulfilled' && r.value !== null)
			.map(r => r.value)
		
		existingWatermarkFiles.value = allCustom
	} catch {
		existingWatermarkFiles.value = []
		validDefaultWatermarks.value = []
	}
}

async function fetchExistingWatermarkPreview(relPath: string) {
	try {
		const base = connectionMeta.value.apiBase ?? ''
		const token = connectionMeta.value.token ?? ''
		
		// Check if it's a built-in watermark (by ID or path)
		const builtinById = DEFAULT_45FLOW_WATERMARKS.find(wm => wm.id === relPath)
		const builtinByPath = DEFAULT_45FLOW_WATERMARKS.find(wm => wm.path === relPath)
		const builtin = builtinById || builtinByPath
		const url = builtin
			? `${base}/api/watermarks/defaults/${builtin.id}/stream`
			: `${base}/api/files/watermark-preview?path=${encodeURIComponent(relPath)}`
		
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

async function loadDefaultWatermarkSettings() {
	try {
		const settings = await apiFetch('/api/settings')
		if (settings?.projectRoot) {
			configuredProjectRoot.value = String(settings.projectRoot).trim()
		}
		if (settings?.defaultWatermarkId) {
			// Apply watermark customization settings if available (premium feature)
			if (settings.defaultWatermarkSettings && typeof settings.defaultWatermarkSettings === 'object') {
				watermarkSettings.value = { ...createDefaultWatermarkSettings(), ...settings.defaultWatermarkSettings }
			}
			
			// If default is a built-in watermark, ensure built-ins are shown
			const isBuiltin = DEFAULT_45FLOW_WATERMARKS.some(wm => wm.id === settings.defaultWatermarkId)
			if (isBuiltin) showDefaultWatermarks.value = true
			
			// Load list first so dropdown has options
			await loadExistingWatermarkFiles()
			// Convert ID to path so it matches dropdown values
			const resolvedPath = resolveWatermarkPathForApi(settings.defaultWatermarkId)
			selectedExistingWatermark.value = resolvedPath
			// Only auto-enable if there are video files selected
			if (hasVideoSelected.value) {
				watermarkAfterUpload.value = true
			}
		} else {
			// No default watermark configured — ensure watermark is off
			watermarkAfterUpload.value = false
			selectedExistingWatermark.value = ''
			existingWatermarkPreviewUrl.value = null
		}
	} catch (err) {
		console.warn('[localupload] Failed to load default watermark settings:', err)
	}
}

function formatSize(size: number) {
	const u = ['B', 'KB', 'MB', 'GB', 'TB']
	let i = 0; let v = size
	while (v >= 1024 && i < u.length - 1) { v /= 1024; i++ }
	return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${u[i]}`
}

function formatDuration(ms: number): string {
	const totalSeconds = Math.max(0, Math.round(ms / 1000));

	if (totalSeconds < 1) return 'under 1 second';
	if (totalSeconds < 60) return `${totalSeconds} second${totalSeconds === 1 ? '' : 's'}`;

	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;

	if (minutes < 60) {
		if (seconds === 0) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
		return `${minutes} minute${minutes === 1 ? '' : 's'} ${seconds} second${seconds === 1 ? '' : 's'}`;
	}

	const hours = Math.floor(minutes / 60);
	const remMinutes = minutes % 60;

	if (remMinutes === 0) {
		return `${hours} hour${hours === 1 ? '' : 's'}`;
	}

	return `${hours} hour${hours === 1 ? '' : 's'} ${remMinutes} minute${remMinutes === 1 ? '' : 's'}`;
}

function joinPath(dir: string, name: string) {
	const d = String(dir || '').replace(/\/+$/, '')
	const n = String(name || '').replace(/^\/+/, '')
	return (d ? d : '/') + '/' + n
}

function rootOfServerPath(p: string) {
	const clean = String(p || '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '')
	if (!clean) return '/'
	const first = clean.split('/').filter(Boolean)[0] || ''
	return first ? `/${first}` : '/'
}

function resolveWatermarkStorageRoot() {
	// Always use the central configured project root for watermarks, never individual project dirs
	const base = String(configuredProjectRoot.value || '').trim()
	const root = base || rootOfServerPath(normalizedDest.value)
	let abs = String(root || '/').replace(/\\/g, '/').trim()
	if (!abs) abs = '/'
	if (!abs.startsWith('/')) abs = '/' + abs
	abs = abs.replace(/\/+$/, '') || '/'
	const rel = abs === '/' ? '' : abs.replace(/^\/+/, '')
	return { abs, rel }
}

function resolveWatermarkDirRel() {
	// Watermarks are stored at .45flow/watermarks/ relative to the effective share root
	return '.45flow/watermarks'
}

function resolveWatermarkUploadDir() {
	return `/${resolveWatermarkDirRel()}`
}

function resolveWatermarkRelPath() {
	const name = String(watermarkFile.value?.name || '').replace(/\\/g, '/').replace(/^\/+/, '').trim()
	if (!name) return ''
	return `${resolveWatermarkDirRel()}/${name}`
}

/** Convert a watermark ID (e.g. '45flow-grad') to the path the dropdown/server expects */
function resolveWatermarkPathForApi(idOrPath: string) {
	const builtin = DEFAULT_45FLOW_WATERMARKS.find(wm => wm.id === idOrPath)
	if (builtin) return builtin.path
	return idOrPath
}

function resolveWatermarkProjectRoot() {
	return resolveWatermarkStorageRoot().abs
}

function resolveLegacyWatermarkRelPath() {
	const name = String(watermarkFile.value?.name || '').replace(/\\/g, '/').replace(/^\/+/, '').trim()
	if (!name) return ''
	return `.45flow/watermarks/${name}`
}

function resolveCandidateServerWatermarkRelPath() {
	const selectedPath = String(watermarkFile.value?.path || '').trim().replace(/\\/g, '/').replace(/\/+$/, '')
	if (!selectedPath) return ''

	let root = String(resolveWatermarkProjectRoot() || '').trim().replace(/\\/g, '/').replace(/\/+$/, '')
	if (!root) root = '/'
	if (!root.startsWith('/')) root = '/' + root

	if (root !== '/' && (selectedPath === root || selectedPath.startsWith(root + '/'))) {
		const tail = selectedPath.slice(root.length).replace(/^\/+/, '')
		const rootRel = root.replace(/^\/+/, '')
		return tail ? `${rootRel}/${tail}` : rootRel
	}

	if (root === '/' && selectedPath.startsWith('/')) {
		return selectedPath.replace(/^\/+/, '')
	}

	return ''
}

function splitRelPath(relPath: string) {
	const clean = String(relPath || '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '')
	if (!clean) return { dir: '', name: '' }
	const idx = clean.lastIndexOf('/')
	if (idx < 0) return { dir: '', name: clean }
	return {
		dir: clean.slice(0, idx),
		name: clean.slice(idx + 1),
	}
}

async function serverFileExists(relPath: string) {
	const { dir, name } = splitRelPath(relPath)
	if (!name) return false
	try {
		const data = await apiFetch(`/api/files?dir=${encodeURIComponent(dir)}`, { method: 'GET' })
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

async function resolveExistingServerWatermarkRelPath() {
	const candidate = resolveCandidateServerWatermarkRelPath()
	const rooted = resolveWatermarkRelPath()
	const legacy = resolveLegacyWatermarkRelPath()
	const candidates = Array.from(new Set([candidate, rooted, legacy].filter(Boolean)))
	for (const relPath of candidates) {
		if (await serverFileExists(relPath)) return relPath
	}
	return ''
}

function extractJobInfoByVersion(data: any): Record<number, { queuedKinds: string[]; skippedKinds: string[] }> {
	const map: Record<number, { queuedKinds: string[]; skippedKinds: string[] }> = {};
	const t = data?.transcodes;
	if (!Array.isArray(t)) return map;

	for (const rec of t as any[]) {
		const vId = Number(rec?.assetVersionId);
		if (!Number.isFinite(vId) || vId <= 0) continue;

		map[vId] = {
			queuedKinds: Array.isArray(rec?.jobs?.queuedKinds) ? rec.jobs.queuedKinds : [],
			skippedKinds: Array.isArray(rec?.jobs?.skippedKinds) ? rec.jobs.skippedKinds : [],
		};
	}
	return map;
}

/** Parse ETA string like "00:05:23" or "5m 23s" to seconds */
function parseEta(eta: string): number | null {
	if (!eta || eta === 'N/A' || eta === '—') return null
	// HH:MM:SS or MM:SS
	const hms = eta.match(/^(\d+):(\d+):(\d+)$/)
	if (hms) return Number(hms[1]) * 3600 + Number(hms[2]) * 60 + Number(hms[3])
	const ms = eta.match(/^(\d+):(\d+)$/)
	if (ms) return Number(ms[1]) * 60 + Number(ms[2])
	// "5m 23s" style
	let secs = 0
	const hm = eta.match(/(\d+)\s*h/); if (hm) secs += Number(hm[1]) * 3600
	const mm = eta.match(/(\d+)\s*m/); if (mm) secs += Number(mm[1]) * 60
	const sm = eta.match(/(\d+)\s*s/); if (sm) secs += Number(sm[1])
	return secs > 0 ? secs : null
}

/**
 * Run full client-side transcode via the unified composable.
 */
async function runClientFullTranscode(opts: {
	assetVersionId: number
	sourceFilePath: string
	rowName: string
	groupId: string
	destDir: string
	destFileAbs: string
	wantProxy: boolean
	localWatermarkPath: string | null
	taskId?: string
}) {
	const { runClientTranscode } = useUploadTranscode()

	await runClientTranscode({
		assetVersionId: opts.assetVersionId,
		sourceFilePath: opts.sourceFilePath,
		filename: opts.rowName,
		proxyQualities: opts.wantProxy ? proxyQualities.value.slice() : ['720p'],
		generateHls: true,
		watermarkPath: opts.localWatermarkPath,
		watermarkSettings: opts.localWatermarkPath && isPremiumActive.value ? JSON.parse(JSON.stringify(watermarkSettings.value)) : undefined,
		skipWatermarkCleanup: true,
		apiBase: connectionMeta.value.apiBase || '',
		apiToken: connectionMeta.value.token || '',
		apiFetch,
	})
	// If this fails, server-side jobs remain queued as fallback
}

function waitForIngestAndStartTranscode(opts: {
	uploadId: string
	rowName: string
	isVideo: boolean
	wantProxy: boolean
	groupId: string
	destDir: string
	destFileAbs: string
	// Client-side full transcode opts
	clientTranscode?: boolean
	sourceFilePath?: string
	localWatermarkPath?: string | null
	taskId?: string
}) {
	const chan = `upload:ingest:${opts.uploadId}`
	// Track that we're waiting for an ingest event that will start a client transcode
	const expectsClientTranscode = !!(opts.clientTranscode && opts.isVideo)
	let ingestReceived = false
	if (expectsClientTranscode) pendingIngests.value++

	const startTranscodeFromPayload = (payload: any) => {
		const fileId = Number(payload.fileId);
		const assetVersionId = Number(payload.assetVersionId);

		// Ingest received — transfer responsibility from pendingIngests to pendingFullTranscodes
		if (expectsClientTranscode && !ingestReceived) {
			ingestReceived = true
			pendingIngests.value = Math.max(0, pendingIngests.value - 1)
		}

		if (!Number.isFinite(fileId) || fileId <= 0) return;

		// ── Client-side full transcode path ──────────────────────────────────────
		if (opts.clientTranscode && opts.sourceFilePath && Number.isFinite(assetVersionId) && assetVersionId > 0) {
			pendingFullTranscodes.value++
			runClientFullTranscode({
				assetVersionId,
				sourceFilePath: opts.sourceFilePath,
				rowName: opts.rowName,
				groupId: opts.groupId,
				destDir: opts.destDir,
				destFileAbs: opts.destFileAbs,
				wantProxy: opts.wantProxy,
				localWatermarkPath: opts.localWatermarkPath ?? null,
				taskId: opts.taskId,
			}).finally(() => {
				pendingFullTranscodes.value = Math.max(0, pendingFullTranscodes.value - 1)
				_checkWatermarkCleanup?.()
			});
			// Fall through to create polling tasks — the composable pushes progress to
			// server DB and the polling tasks display it in the TransferDock UI.
		}

		// ── Transcode tracking via polling (displays progress from server DB) ──

		const jobInfo = extractJobInfoByVersion(payload);
		const rec = Number.isFinite(assetVersionId) && assetVersionId > 0 ? jobInfo[assetVersionId] : null;

		const shouldTrack = (kind: string) => {
			// If we don't have job info, preserve old behavior and track.
			if (!rec) return true;

			if (rec.queuedKinds?.includes(kind)) return true;
			if (rec.skippedKinds?.includes(kind)) return false;

			// Unknown: be permissive
			return true;
		};

		// Prefer assetVersion polling when available
		const useAssetVersion = Number.isFinite(assetVersionId) && assetVersionId > 0;

		// HLS
		if (opts.isVideo && shouldTrack('hls')) {
			if (useAssetVersion) {
				transfer.startAssetVersionTranscodeTask({
					apiFetch,
					assetVersionIds: [assetVersionId],
					title: `Transcoding: ${opts.rowName}`,
					detail: 'Generating HLS…',
					intervalMs: 1500,
					jobKind: 'hls',
					context: {
						source: 'upload',
						groupId: opts.groupId,
						destDir: opts.destDir,
						file: opts.destFileAbs,
						proxyQualities: opts.wantProxy ? proxyQualities.value.slice() : [],
						connectionId: activeConnection.value?.connectionId,
					},
				});
			} else {
				transfer.startTranscodeTask({
					apiFetch,
					fileIds: [fileId],
					title: `Transcoding: ${opts.rowName}`,
					detail: 'Generating HLS…',
					intervalMs: 1500,
					jobKind: 'hls',
					context: {
						source: 'upload',
						groupId: opts.groupId,
						destDir: opts.destDir,
						file: opts.destFileAbs,
						proxyQualities: opts.wantProxy ? proxyQualities.value.slice() : [],
						connectionId: activeConnection.value?.connectionId,
					},
				});
			}
		}

		// Proxy (only if user asked)
		if (opts.isVideo && opts.wantProxy && shouldTrack('proxy_mp4')) {
			if (useAssetVersion) {
				transfer.startAssetVersionTranscodeTask({
					apiFetch,
					assetVersionIds: [assetVersionId],
					title: `Transcoding: ${opts.rowName}`,
					detail: 'Generating proxy file…',
					intervalMs: 1500,
					jobKind: 'proxy_mp4',
					context: {
						source: 'upload',
						groupId: opts.groupId,
						destDir: opts.destDir,
						file: opts.destFileAbs,
						proxyQualities: proxyQualities.value.slice(),
						connectionId: activeConnection.value?.connectionId,
					},
				});
			} else {
				transfer.startTranscodeTask({
					apiFetch,
					fileIds: [fileId],
					title: `Transcoding: ${opts.rowName}`,
					detail: 'Generating proxy file…',
					intervalMs: 1500,
					jobKind: 'proxy_mp4',
					context: {
						source: 'upload',
						groupId: opts.groupId,
						destDir: opts.destDir,
						file: opts.destFileAbs,
						proxyQualities: proxyQualities.value.slice(),
						connectionId: activeConnection.value?.connectionId,
					},
				});
			}
		}
	};

		const handler = async (_e: any, payload: any) => {
			try {
				if (!payload?.ok) {
					const requestSuffix = payload?.requestId ? ` (request ${String(payload.requestId)})` : '';
					pushNotification(
						new Notification(
							'Ingest Failed',
							`${payload?.error || 'Ingest failed.'}${requestSuffix}`,
							'error',
							8000,
							'ingest-error'
						)
					);
					return;
				}

			startTranscodeFromPayload(payload);
		} finally {
			window.electron?.ipcRenderer.removeListener(chan, handler);
			if (expectsClientTranscode && !ingestReceived) {
				ingestReceived = true
				pendingIngests.value = Math.max(0, pendingIngests.value - 1)
				_checkWatermarkCleanup?.()
			}
		}
	};

	window.electron?.ipcRenderer.on(chan, handler)
	return () => {
		window.electron?.ipcRenderer.removeListener(chan, handler)
		// If listener removed before ingest fired (upload failed), decrement counter
		if (expectsClientTranscode && !ingestReceived) {
			ingestReceived = true
			pendingIngests.value = Math.max(0, pendingIngests.value - 1)
			_checkWatermarkCleanup?.()
		}
	}
}

function makeUploadKey(path: string, dest: string) {
	return `${path}::${dest}`
}

function markUploaded(path: string, dest: string) {
	uploadedRegistry.value.add(makeUploadKey(path, dest))
}

function hasAlreadyUploaded(path: string, dest: string) {
	return uploadedRegistry.value.has(makeUploadKey(path, dest))
}

// Make rows once when entering Step 3
function prepareRows(): UploadRow[] {
	const dest = normalizedDest.value

	return selected.value.map(f => {
		const already = hasAlreadyUploaded(f.path, dest)

		return {
			localKey: crypto.randomUUID?.() || Math.random().toString(36).slice(2),
			path: f.path,
			name: f.name,
			size: f.size,
			dest,
			uploadId: null,
			progress: already ? 100 : 0,
			status: already ? 'done' : 'queued',
			error: null,
			speed: null,
			eta: null,
			alreadyUploaded: already,
			startedAt: null,
			completedAt: already ? Date.now() : null,
			completedIn: already ? 'already uploaded' : null,
		}
	})
}


function finish() {
	// Reset the wizard (or route away)
	selected.value = []
	uploads.value = []
	isUploading.value = false

	uploadedRegistry.value.clear()
	// goStep(1)
	goBack();
}

function goBack() {
	// router.push({ name: 'dashboard' })
	to('dashboard');
}

watch(selected, () => {
	if (!hasMediaSelected.value) {
		transcodeProxyAfterUpload.value = false
		watermarkAfterUpload.value = false
		watermarkFile.value = null
	} else if (hasVideoSelected.value) {
		transcodeProxyAfterUpload.value = true
		if (!proxyQualities.value.includes('original')) {
			proxyQualities.value = ['original']
		}
		// Auto-enable watermark if default is configured
		if (selectedExistingWatermark.value && !watermarkAfterUpload.value) {
			watermarkAfterUpload.value = true
		}
	} else {
		// Image-only: auto-enable watermark if configured
		if (selectedExistingWatermark.value && !watermarkAfterUpload.value) {
			watermarkAfterUpload.value = true
		}
	}
}, { deep: true })

watch(transcodeProxyAfterUpload, (v) => {
	if (v && proxyQualities.value.length === 0) {
		proxyQualities.value = ['original']
	}
	if (!v) {
		proxyQualities.value = []
		watermarkAfterUpload.value = false
		watermarkFile.value = null
		selectedExistingWatermark.value = ''
	}
})

watch(selectedExistingWatermark, (v) => {
	if (String(v || '').trim()) {
		watermarkFile.value = null
		void fetchExistingWatermarkPreview(v)
		// Store the selected watermark for auto-selection later
		try {
			localStorage.setItem('45flow-last-watermark', v)
		} catch { /* ignore storage errors */ }
	}
})

watch(watermarkAfterUpload, (enabled) => {
	if (enabled) void loadExistingWatermarkFiles()
	else {
		selectedExistingWatermark.value = ''
		existingWatermarkPreviewUrl.value = null
	}
})

watch(showDefaultWatermarks, () => {
	void loadExistingWatermarkFiles()
})

onBeforeRouteLeave((_to, _from, next) => {
	resetUploadState();
	selected.value = [];
	uploadedRegistry.value.clear();
	destFolderRel.value = '';
	projectBase.value = '';
	next();
});

function updateRowProgress(row: UploadRow, p?: number, speed?: string, eta?: string) {
	// Coalesce many rsync ticks into one animation frame update
	const prev = rafState.get(row.localKey) || {
		p: typeof row.progress === 'number' ? row.progress : undefined,
		speed: row.speed,
		eta: row.eta,
		scheduled: 0 as number | 0,
	};

	// Only update fields we actually received
	if (typeof p === 'number' && !Number.isNaN(p)) {
		prev.p = Math.max(0, Math.min(100, p));
	}
	if (typeof speed === 'string') prev.speed = speed;
	if (typeof eta === 'string') prev.eta = eta;

	if (!prev.scheduled) {
		prev.scheduled = requestAnimationFrame(() => {
			if (typeof prev.p === 'number') row.progress = prev.p;
			if (typeof prev.speed !== 'undefined') row.speed = prev.speed;
			if (typeof prev.eta !== 'undefined') row.eta = prev.eta;
			prev.scheduled = 0;
		});
	}

	rafState.set(row.localKey, prev);
}

const rafState = new Map<
	string,
	{ p?: number; speed?: string | null; eta?: string | null; scheduled?: number }
>()

/** ── Concurrency-limited upload engine ─────────────────── */
const MAX_CONCURRENT_UPLOADS = 3
const activeUploads = ref(0)
const pendingFullTranscodes = ref(0)
// Tracks videos awaiting ingest events (between upload-done and ingest-received)
const pendingIngests = ref(0)
// Callback set per upload batch to check if watermark can be cleaned up
let _checkWatermarkCleanup: (() => void) | null = null
// Tracks cumulative completed count for batched notifications
let completedSinceStart = 0
let failedSinceStart = 0
let batchNotifyTimer: ReturnType<typeof setTimeout> | null = null

function scheduleBatchNotification() {
	if (batchNotifyTimer) return
	batchNotifyTimer = setTimeout(() => {
		batchNotifyTimer = null
		// Skip notifications when the transfer dock is open — the user can already see progress there
		if (transfer.state.open) return
		const done = completedSinceStart
		const failed = failedSinceStart
		if (done > 0 && allTerminal.value) {
			// Final summary notification
			const parts: string[] = []
			if (done > 0) parts.push(`${done} file${done === 1 ? '' : 's'} uploaded successfully`)
			if (failed > 0) parts.push(`${failed} failed`)
			pushNotification(
				new Notification(
					'Upload Batch Complete',
					parts.join(', ') + '.',
					failed > 0 ? 'warning' : 'success',
					10000,
					'upload-batch'
				)
			)
		} else if (done > 0) {
			// Intermediate batch notification (some still in progress)
			pushNotification(
				new Notification(
					'Uploads Progressing',
					`${done} file${done === 1 ? '' : 's'} uploaded so far${failed > 0 ? `, ${failed} failed` : ''}.`,
					'info',
					5000,
					'upload-batch'
				)
			)
		}
	}, 1500) // Debounce: wait 1.5s to batch notifications together
}

function uploadOneFile(
	row: UploadRow,
	watermarkRelPathForIngest: string,
	localWatermarkPath: string | null,
	onDone: () => void
) {
	row.startedAt = row.startedAt ?? Date.now()
	activeUploads.value++

	const groupId = crypto.randomUUID?.() || Math.random().toString(36).slice(2)
	const destDirAbs = row.dest
	const destFileAbs = joinPath(destDirAbs, row.name)

	// Determine if this is a video file and if we should transcode client-side
	const ext = String(row.name || '').toLowerCase().split('.').pop() || ''
	const isVideo = videoExts.has(ext)
	const { enabled: clientTranscodeEnabled, preset: transcodePreset, hwAccel: hwAccelSetting } = useClientTranscode()
	const shouldTranscodeClient = isVideo && clientTranscodeEnabled.value && transcodeProxyAfterUpload.value

	// Set initial status based on workflow path
	row.status = shouldTranscodeClient ? 'transcoding' : 'uploading'

	// Reuse pre-created dock task, or create one if missing
	let taskId = row.dockTaskId || ''
	if (taskId) {
		// Update existing queued task to show current phase
		transfer.updateUpload(taskId, {
			status: shouldTranscodeClient ? 'transcoding' : 'uploading',
			progress: 0,
			detail: shouldTranscodeClient ? 'Registering…' : undefined,
		})
		// Update the context with the groupId now that we have it
		const existing = (transfer.state.tasks as any[]).find((t: any) => t.taskId === taskId)
		if (existing?.context) {
			existing.context.groupId = groupId
		}
	} else {
		taskId = transfer.createUploadTask({
			title: `Uploading: ${row.name}`,
			detail: destDirAbs,
			cancel: () => {
				row.status = 'canceled'
				try { row.ingestUnsub?.(); } catch { }
				row.ingestUnsub = null
				if (row.uploadId) window.electron.httpUploadCancel(row.uploadId)
			},
			context: {
				source: 'upload',
				groupId,
				destDir: destDirAbs,
				file: destFileAbs,
			},
		})
		row.dockTaskId = taskId
	}

	const enableWatermark = watermarkAfterUpload.value && !!watermarkRelPathForIngest

	const doUpload = async (clientTranscoded: boolean = false) => {
		return window.electron.httpUploadStart(
			{
				src: row.path,
				apiBase: connectionMeta.value.apiBase || '',
				apiToken: connectionMeta.value.token || '',
				dest: row.dest,
				clientTranscode: clientTranscoded,
				proxy: transcodeProxyAfterUpload.value,
				proxyQualities: proxyQualities.value.slice(),
				hls: transcodeProxyAfterUpload.value,
				watermark: enableWatermark,
				watermarkFile: enableWatermark ? watermarkRelPathForIngest : undefined,
				watermarkSettings: enableWatermark && isPremiumActive.value ? JSON.parse(JSON.stringify(watermarkSettings.value)) : undefined,
			},
		(p) => {
				const pct = typeof p.percent === 'number' ? p.percent : undefined;

				updateRowProgress(row, pct, p.rate ?? '', p.eta ?? '');
				row.phase = p.phase;
				row.phaseMessage = p.message;

				transfer.updateUpload(taskId, {
					status: 'uploading',
					progress: typeof pct === 'number' ? pct : row.progress,
					speed: p.rate ?? null,
					eta: p.eta ?? null,
					phase: p.phase,
					phaseMessage: p.message,
				});
			}
		);
	}

	// Handle transcode and upload workflow
	// Client transcode path: register → transcode locally → upload raw
	// Server transcode path: upload raw → server transcodes
	const startUploadWorkflow = async () => {
		if (shouldTranscodeClient) {
			try {
				// 1. Register metadata — get fileId + assetVersionId before upload
				row.status = 'transcoding'
				transfer.updateUpload(taskId, { detail: 'Registering…' })

				const registerRes = await apiFetch('/api/local-upload/register', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						filename: row.name,
						fileSize: row.size,
						dest: row.dest,
						mimeType: `video/${ext === 'mov' ? 'quicktime' : ext}`,
					}),
				})
				if (!registerRes?.ok) {
					throw new Error(registerRes?.error || 'Failed to register file metadata')
				}
				const { fileId, assetVersionId } = registerRes

				// 2. Client transcode locally (source is on this workstation)
				// Polling tasks are created INSIDE runClientTranscode after transcode-plan
				// creates the DB jobs — this avoids the race where pollers find no jobs.
				transfer.updateUpload(taskId, { detail: 'Transcoding locally…' })
				const { runClientTranscode } = useUploadTranscode()

				const transcodeContext = {
					source: 'upload' as const,
					groupId,
					destDir: destDirAbs,
					file: destFileAbs,
					proxyQualities: proxyQualities.value.slice(),
					connectionId: activeConnection.value?.connectionId,
				}

				const transcodeResult = await runClientTranscode({
					assetVersionId,
					sourceFilePath: row.path,
					filename: row.name,
					proxyQualities: proxyQualities.value.slice(),
					generateHls: true,
					watermarkPath: localWatermarkPath || undefined,
					watermarkSettings: localWatermarkPath && isPremiumActive.value ? JSON.parse(JSON.stringify(watermarkSettings.value)) : undefined,
					skipWatermarkCleanup: true,
					apiBase: connectionMeta.value.apiBase || '',
					apiToken: connectionMeta.value.token || '',
					apiFetch,
					context: transcodeContext,
					onProgress: (phase, percent) => {
						// Update wizard row progress directly from FFmpeg ticks
						updateRowProgress(row, percent)
					},
				})

				// If user cancelled from the dock, abort the upload
				if (transcodeResult?.cancelled) {
					row.status = 'error' as any
					transfer.finishUpload(taskId, false, 'Canceled')
					return
				}

				// 3. Upload raw file (server won't queue transcodes — clientTranscode:true)
				row.status = 'uploading'
				row.progress = 0
				transfer.updateUpload(taskId, { detail: 'Uploading…', progress: 0, speed: null, eta: null })
				return doUpload(true)
			} catch (err) {
				const errorMsg = err instanceof Error ? err.message : String(err)
				row.status = 'error'
				row.error = `Transcode error: ${errorMsg}`
				transfer.updateUpload(taskId, { status: 'error' })
				pushNotification(
					new Notification(
						'Transcode Failed',
						`${row.name}: ${errorMsg}\n\nTip: You can disable client-side transcoding in Settings → Performance to let the server handle it instead.`,
						'error',
						12000
					)
				)
				activeUploads.value = Math.max(0, activeUploads.value - 1)
				onDone()
				throw err
			}
		} else {
			// Server transcode path: upload raw, server queues transcode jobs
			return doUpload(false)
		}
	}

	startUploadWorkflow()
		.then(uploadPromise => uploadPromise)
		.then((result) => {
		if (!result) return
		const { id, done } = result
		row.uploadId = id;
		if (row.status === 'canceled') {
			window.electron.httpUploadCancel(id)
		}

		// With HTTP upload, ingest is included in the /complete response.
		// If client transcode already ran, skip waitForIngestAndStartTranscode entirely —
		// the transcode is done and progress was already pushed to the server.
		let stopIngestListener: (() => void) | null = null
		if (!shouldTranscodeClient) {
			stopIngestListener = waitForIngestAndStartTranscode({
				uploadId: id,
				rowName: row.name,
				isVideo: videoExts.has(String(row.name || '').toLowerCase().split('.').pop() || ''),
				wantProxy: transcodeProxyAfterUpload.value,
				groupId,
				destDir: destDirAbs,
				destFileAbs,
				clientTranscode: false,
				sourceFilePath: row.path,
				localWatermarkPath: localWatermarkPath,
				taskId,
			})
			row.ingestUnsub = stopIngestListener
		}

		const cleanup = () => {
			try { stopIngestListener?.(); } catch { }
		};

		done.then((res: any) => {
			// HTTP upload /complete emits upload:ingest:{id} from main process
			// so waitForIngestAndStartTranscode picks it up automatically.

			if (res.ok) {
				setTimeout(cleanup, 60000)
			} else {
				cleanup()
			}
			activeUploads.value = Math.max(0, activeUploads.value - 1)

			if (res.ok) {
				if (row.status === 'canceled') {
					transfer.updateUpload(taskId, { status: 'canceled', completedAt: Date.now() })
				} else {
					row.status = 'done';
					row.progress = 100;
					transfer.finishUpload(taskId, true);
				}

				// Track sanitized filename from server
				if (res.file?.savedAs && res.file.savedAs !== row.name) {
					row.name = res.file.savedAs
				}

				if (row.status === 'done') {
					markUploaded(row.path, row.dest);
					const end = Date.now();
					const start = row.startedAt ?? end;
					row.completedAt = end;
					row.completedIn = formatDuration(end - start);
					completedSinceStart++;
					scheduleBatchNotification();
				}
			} else if (row.status !== 'canceled') {
				row.status = 'error';
				row.error = res.error || 'Upload failed';
				transfer.finishUpload(taskId, false, res.error || 'Upload failed');
				failedSinceStart++;
				scheduleBatchNotification();
			}

			onDone();
		}).catch((err: any) => {
			cleanup();
			activeUploads.value = Math.max(0, activeUploads.value - 1)

			if (row.status !== 'canceled') {
				row.status = 'error';
				row.error = err?.message || String(err);
				transfer.finishUpload(taskId, false, err?.message || 'Upload failed');
				failedSinceStart++;
				scheduleBatchNotification();
			}

			onDone();
		});
	}).catch((err: any) => {
		// httpUploadStart itself failed
		activeUploads.value = Math.max(0, activeUploads.value - 1)
		row.status = 'error';
		row.error = err?.message || 'Failed to start upload';
		failedSinceStart++;
		scheduleBatchNotification();
		onDone();
	});
}

async function startUploads() {
	if (!uploads.value.length) uploads.value = prepareRows();
	completedSinceStart = 0
	failedSinceStart = 0
	let watermarkRelPathForIngest = ''

	// HTTP upload uses JWT auth — no SSH key setup needed

	if (watermarkAfterUpload.value) {
		isUploading.value = true
		const selectedServerWatermark = String(selectedExistingWatermark.value || '').trim()
		if (!watermarkFile.value && !selectedServerWatermark) {
			pushNotification(
				new Notification(
					'Watermark Image Required',
					'Please choose a watermark image before starting the upload.',
					'warning',
					8000
				)
			)
			isUploading.value = false
			return
		}

		if (selectedServerWatermark) {
			watermarkRelPathForIngest = selectedServerWatermark
		} else {
			watermarkRelPathForIngest = await resolveExistingServerWatermarkRelPath()
		}
		if (!watermarkRelPathForIngest && watermarkFile.value) {
			const watermarkDestDir = resolveWatermarkUploadDir()
			const ensured = await ensureServerDirExists(watermarkDestDir)
			if (!ensured) {
				pushNotification(
					new Notification(
						'Watermark Upload Failed',
						'Unable to prepare the remote watermark directory.',
						'error',
						8000
					)
				)
				isUploading.value = false
				return
			}
			const { done } = await window.electron.httpUploadStart(
				{
					src: watermarkFile.value.path,
					apiBase: connectionMeta.value.apiBase || '',
					apiToken: connectionMeta.value.token || '',
					dest: watermarkDestDir,
				}
			)
			const res = await done
			if (!res?.ok) {
				pushNotification(
					new Notification(
						'Watermark Upload Failed',
						res?.error || 'Unable to upload the watermark image.',
						'error',
						8000
					)
				)
				isUploading.value = false
				return
			}
			watermarkRelPathForIngest = resolveWatermarkRelPath() || String(watermarkFile.value?.name || '').trim()
		}
		
		// Store the watermark path for auto-selection in share link creation
		if (watermarkRelPathForIngest) {
			try {
				localStorage.setItem('45flow-last-watermark', watermarkRelPathForIngest)
			} catch { /* ignore storage errors */ }
		}
	}

	// Build the queue of rows that need uploading
	const queue = uploads.value.filter(r => r.status === 'queued' && !r.alreadyUploaded)
	if (!queue.length) {
		isUploading.value = false
		return
	}

	// Resolve local watermark path for client-side transcode watermarking
	let localWatermarkPath: string | null = null
	if (watermarkAfterUpload.value) {
		if (watermarkFile.value?.path) {
			localWatermarkPath = watermarkFile.value.path
		} else if (selectedExistingWatermark.value) {
			try {
				localWatermarkPath = await window.electron.downloadWatermark({
					apiBase: connectionMeta.value.apiBase || '',
					token: connectionMeta.value.token || '',
					relPath: selectedExistingWatermark.value,
				})
			} catch (e) {
				console.warn('Failed to download watermark for client transcode, server will apply it:', e)
			}
		}
	}

	// Pre-create dock tasks for ALL queued items so they're visible immediately
	for (const row of queue) {
		if (!row.dockTaskId) {
			const destDirAbs = row.dest
			const destFileAbs = joinPath(destDirAbs, row.name)
			const taskId = transfer.createUploadTask({
				title: `Queued: ${row.name}`,
				detail: destDirAbs,
				cancel: () => {
					row.status = 'canceled'
					try { row.ingestUnsub?.(); } catch { }
					row.ingestUnsub = null
					if (row.uploadId) window.electron.httpUploadCancel(row.uploadId)
				},
				context: {
					source: 'upload',
					destDir: destDirAbs,
					file: destFileAbs,
				},
			})
			row.dockTaskId = taskId
		}
	}

	isUploading.value = true
	let queueIdx = 0

	// Let user know they can leave this screen
	pushNotification(
		new Notification(
			'Uploads Queued',
			`${queue.length} file${queue.length !== 1 ? 's' : ''} queued in the Transfer Dock — you can leave this screen and progress will continue.`,
			'info',
			8000
		)
	)



	let watermarkCleaned = false
	function maybeCleanupWatermark() {
		if (watermarkCleaned) return
		console.log(`[watermark-gate] check: activeUploads=${activeUploads.value} queueDone=${queueIdx >= queue.length} pendingIngests=${pendingIngests.value} pendingFullTranscodes=${pendingFullTranscodes.value} hasWm=${!!localWatermarkPath}`)
		if (activeUploads.value === 0 && queueIdx >= queue.length && pendingIngests.value === 0 && pendingFullTranscodes.value === 0) {
			isUploading.value = false
			if (localWatermarkPath) {
				watermarkCleaned = true
				console.warn(`[watermark-gate] CLEANING watermark: ${localWatermarkPath}`)
				;(window as any).electron.cleanupWatermarkTemp(localWatermarkPath).catch(() => {})
			}
		}
	}
	// Register so post-upload full transcodes can trigger cleanup check
	_checkWatermarkCleanup = maybeCleanupWatermark

	function drainQueue() {
		while (activeUploads.value < MAX_CONCURRENT_UPLOADS && queueIdx < queue.length) {
			const row = queue[queueIdx++]
			if (row.status !== 'queued') continue // may have been canceled while waiting
			uploadOneFile(row, watermarkRelPathForIngest, localWatermarkPath, () => {
				// When a file finishes, try to start the next queued one
				drainQueue()
				// Check if everything is finished (uploads + full transcodes)
				maybeCleanupWatermark()
			})
		}
	}

	drainQueue()
}


function cancelOne(row: UploadRow) {
	if (row.dockTaskId) {
		// Find the upload task's groupId to cancel associated transcodes
		const uploadTask = transfer.state.tasks.find((t: any) => t.taskId === row.dockTaskId)
		const groupId = uploadTask?.context?.groupId

		transfer.cancelUpload(row.dockTaskId)

		// Cancel any transcode tasks with the same groupId
		if (groupId) {
			const transcodes = transfer.state.tasks.filter(
				(t: any) => t.kind === 'transcode' && t.context?.groupId === groupId && t.status !== 'done' && t.status !== 'failed'
			)
			for (const tc of transcodes) {
				transfer.cancelTranscode(tc.taskId)
			}
		}
	} else if (row.uploadId) {
		window.electron.httpUploadCancel(row.uploadId)
	}
	try { row.ingestUnsub?.(); } catch { }
	row.ingestUnsub = null;
	row.status = 'canceled'
}

</script>

<style lang="css" scoped>
.lu-panel {
	transition: box-shadow 140ms ease, border-color 140ms ease;
}

.lu-panel--dragover {
	border-color: var(--btn-primary-bg);
	box-shadow: 0 0 0 2px color-mix(in srgb, var(--btn-primary-bg) 45%, transparent);
}

/* Drop zone: same dashed language as the dashboard's Quick Share hint */
.lu-drop {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 0.75rem;
	min-height: 15rem;
	padding: 1.5rem 1rem;
	text-align: center;
	border: 1.5px dashed color-mix(in srgb, var(--btn-primary-bg) 45%, currentColor);
	border-radius: var(--flow-radius-lg, 0.75rem);
	background: color-mix(in srgb, var(--btn-primary-bg) 4%, transparent);
	transition: background-color 140ms ease, border-color 140ms ease;
}

.lu-drop--active {
	border-style: solid;
	border-color: var(--btn-primary-bg);
	background: color-mix(in srgb, var(--btn-primary-bg) 14%, transparent);
}

.lu-drop__icon {
	width: 2.5rem;
	height: 2.5rem;
	flex-shrink: 0;
	opacity: 0.8;
}

.lu-drop__text {
	min-width: 0;
	max-width: 34rem;
}

.lu-drop__title {
	font-size: 1rem;
	font-weight: 600;
}

.lu-drop__copy {
	margin-top: 0.15rem;
	font-size: 0.8rem;
	opacity: 0.8;
}

.lu-drop__actions {
	display: flex;
	flex-wrap: wrap;
	justify-content: center;
	gap: 0.5rem;
}

/* Once files are listed the drop zone shrinks to a single strip */
.lu-drop--compact {
	flex-direction: row;
	min-height: 0;
	padding: 0.6rem 0.9rem;
	text-align: left;
}

.lu-drop--compact .lu-drop__icon {
	width: 1.6rem;
	height: 1.6rem;
}

.lu-drop--compact .lu-drop__text {
	flex: 1 1 auto;
	max-width: none;
}

.lu-drop--compact .lu-drop__title {
	font-size: 0.85rem;
}

.lu-drop--compact .lu-drop__copy {
	font-size: 0.75rem;
}

.lu-table {
	max-height: 22rem;
	overflow-y: auto;
}

.lu-table td {
	vertical-align: middle;
}

.lu-row-progress {
	display: block;
	width: 100%;
	max-width: 28rem;
	height: 0.3rem;
	margin-top: 0.3rem;
	border-radius: 999px;
	overflow: hidden;
}

.lu-dest-row {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	min-width: 0;
}

.lu-actionbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 0.75rem 1rem;
}

.lu-overall-progress {
	display: block;
	width: 100%;
	height: 0.5rem;
	border-radius: 999px;
	overflow: hidden;
}

@media (max-width: 640px) {
	.lu-drop--compact {
		flex-direction: column;
		align-items: flex-start;
	}
}
</style>
