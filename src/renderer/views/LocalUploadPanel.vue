<template>
	<div class="h-full overflow-y-auto pt-3 pb-4">
		<div class="ss-page-frame grid grid-cols-1 gap-3 text-xl">
			<CardContainer class="local-upload-card ss-surface bg-accent rounded-md shadow-xl h-[calc(100vh-10rem)] min-h-[32rem] flex flex-col">
				<template #header>
					<div class="wizard-head" data-tour="upload-wizard-header">
						<h2 class="wizard-main-title">
							Local Upload Wizard
							<span v-if="activeConnection" class="text-sm text-muted font-normal ml-2">
								→ {{ activeConnection!.name }}
							</span>
						</h2>
						<ol class="wizard-stepper" aria-label="Upload steps">
							<li class="wizard-step-item">
								<div :class="stepClass(1)">1</div>
								<div class="wizard-step-copy">
									<span class="wizard-step-label">Select Local Files</span>
									<span class="wizard-step-help">Choose files/folders from this workstation.</span>
								</div>
							</li>
							<li class="wizard-step-divider" aria-hidden="true"></li>
							<li class="wizard-step-item">
								<div :class="stepClass(2)">2</div>
								<div class="wizard-step-copy">
									<span class="wizard-step-label">Choose Destination</span>
									<span class="wizard-step-help">Pick the target folder on the server.</span>
								</div>
							</li>
							<li class="wizard-step-divider" aria-hidden="true"></li>
							<li class="wizard-step-item">
								<div :class="stepClass(3)">3</div>
								<div class="wizard-step-copy">
									<span class="wizard-step-label">Upload</span>
									<span class="wizard-step-help">Monitor transfer progress and completion.</span>
								</div>
							</li>
						</ol>
					</div>
				</template>

				<div class="wizard-stage">

					<!-- STEP 1: Local files -->
					<section v-show="step === 1" class="wizard-pane wizard-pane--fill" data-tour="upload-step-1">

						<h2 class="wizard-heading">Pick local files</h2>

							<div class="wizard-controls">
								<div class="button-group-row">
									<button class="btn btn-primary" @click="pickFiles">Choose Files</button>
									<button class="btn btn-secondary" @click="pickFolder">Choose Folder</button>
								</div>

							<span class="wizard-muted">
								{{ selected.length ? `${selected.length} item(s) • ${formatSize(totalSelectedBytes)}` :	'No files selected' }}

							</span>

							<div class="grow"></div>
							<button class="btn btn-secondary" v-if="selected.length"
								@click="clearSelected">Clear</button>
						</div>

							<div class="wizard-table-shell"
								:class="[selected.length ? 'wizard-table-shell--filled' : 'wizard-table-shell--empty', tableDragOver ? 'ring-2 ring-blue-500/50 bg-blue-500/5' : '']"
								@dragenter="onTableDragEnter"
								@dragover="onTableDragOver"
								@dragleave="onTableDragLeave"
								@drop="onTableDrop"
							>
							<table class="wizard-table">
								<thead>
									<tr class="wizard-thead-row">
										<th scope="col" class="wizard-th">Name</th>
										<th scope="col" class="wizard-th">Size</th>
										<th scope="col" class="wizard-th text-right">Action</th>
									</tr>
								</thead>
								<tbody class="bg-accent">
									<tr v-if="!selected.length">
										<td colspan="3" class="wizard-td text-center text-muted">
											No files selected. Drag files here, click <span class="font-bold">Choose Files</span> (you
											can
											select multiple),
											or <span class="font-bold">Choose Folder</span> to add its contents.
										</td>
									</tr>
									<tr v-for="f in selected" :key="f.path" class="transition border border-default">
										<td class="wizard-td">
											<div class="truncate" :title="f.path">{{ f.name }}</div>
										</td>
										<td class="wizard-td"><span class="text-sm opacity-75">{{
											formatSize(f.size) }}</span></td>
										<td class="wizard-td">
											<div class="flex justify-end">
												<button class="btn btn-secondary"
													@click="removeSelected(f)">Remove</button>
											</div>
										</td>
									</tr>
								</tbody>
							</table>
						</div>
					</section>

					<!-- STEP 2: Destination (server) -->
					<section v-show="step === 2" class="wizard-pane wizard-pane--fill" data-tour="upload-step-2">

						<h2 class="wizard-heading">Choose destination on server</h2>

						<div data-tour="upload-folder-picker" class="flex flex-col flex-1 min-h-0">
							<FolderPicker v-model="destFolderRel" :apiFetch="apiFetch" useCase="upload"
								subtitle="Pick the folder on the server where these files will be uploaded."
								:auto-detect-roots="!activeProject"
								:allow-entire-tree="!activeProject"
								:hide-project-controls="!!activeProject"
								:startDir="activeProject?.root_dir || undefined"
								v-model:project="projectBase"
								v-model:dest="destFolderRel" heightClass="flex-1 min-h-0" />
						</div>
					</section>


					<!-- STEP 3: Upload progress -->
					<section v-show="step === 3" class="wizard-pane wizard-pane--fill" data-tour="upload-step-3">
						<h2 class="wizard-heading">Uploading to {{ destDir || '/' }}</h2>

						<!-- Overall progress summary -->
						<div v-if="uploads.length" data-tour="upload-progress" class="wizard-overall-progress">
							<div class="flex items-center justify-between text-sm mb-1">
								<span>
									{{ uploadSummary.done }}/{{ uploadSummary.total }} completed
									<template v-if="uploadSummary.active"> · {{ uploadSummary.active }} active</template>
									<template v-if="uploadSummary.queued"> · {{ uploadSummary.queued }} queued</template>
									<template v-if="uploadSummary.errors"> · {{ uploadSummary.errors }} failed</template>
								</span>
								<span class="text-muted">{{ uploadSummary.overallPct.toFixed(0) }}%</span>
							</div>
							<progress class="w-full h-2.5 rounded-lg overflow-hidden" :value="uploadSummary.overallPct" max="100"></progress>
						</div>

						<div class="wizard-step3-body">
							<div class="wizard-table-shell wizard-table-shell--uploads">
								<table class="min-w-full text-sm border border-default border-collapse text-left">
									<thead>
										<tr class="bg-default text-default border-b border-default">
											<th scope="col" class="px-4 py-2 font-semibold border border-default">Name</th>
											<th scope="col" class="px-4 py-2 font-semibold border border-default">Size</th>
											<th scope="col" class="px-4 py-2 font-semibold border border-default">Speed/Time</th>
											<th scope="col" class="px-4 py-2 font-semibold border border-default">Status</th>
											<th scope="col" class="px-4 py-2 font-semibold border border-default text-right">Action</th>
										</tr>
									</thead>
									<tbody>
										<tr v-if="!uploads.length">
											<td colspan="5" class="px-4 py-4 text-center text-muted border border-default">
												Ready to start. Click <b>Start Upload</b>.
											</td>
										</tr>
										<template v-for="u in uploads" :key="u.localKey">
											<tr class="hover:bg-black/10 dark:hover:bg-white/10 transition border border-default">
												<td class="px-4 py-2 border border-default">
													<div class="truncate font-medium" :title="u.path">{{ u.name }}</div>
													<div class="text-xs opacity-70">
														<template v-if="u.status === 'uploading'">
															{{ Number.isFinite(u.progress) ? u.progress.toFixed(0) : 0 }}%
															<span v-if="u.speed"> • {{ u.speed }}</span>
															<span v-if="u.eta"> • ETA {{ u.eta }}</span>
														</template>
													</div>
												</td>
												<td class="px-4 py-2 border border-default">
													<span class="text-sm opacity-80">{{ formatSize(u.size) }}</span>
												</td>
												<td class="px-4 py-2 border border-default">
													<template v-if="u.status === 'uploading'">
														<span v-if="u.speed">{{ u.speed }}</span>
														<br />
														<span v-if="u.eta">ETA {{ u.eta }}</span>
													</template>
													<template v-else-if="u.status === 'done' && u.completedIn">
														Completed in {{ u.completedIn }}
													</template>
													<template v-else>
														<span>-</span>
													</template>
												</td>
												<td class="px-4 py-2 border border-default">
													<span
														class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold"
														:class="{
															'bg-default dark:bg-well/75 text-zinc-600 dark:text-zinc-300': u.status === 'queued',
															'bg-default dark:bg-well/75 text-purple-600 dark:text-purple-300': u.status === 'transcoding',
															'bg-default dark:bg-well/75 text-blue-600 dark:text-blue-300': u.status === 'uploading',
															'bg-default dark:bg-well/75 text-green-600 dark:text-green-300': u.status === 'done',
															'bg-default dark:bg-well/75 text-amber-600 dark:text-amber-300': u.status === 'canceled',
															'bg-default dark:bg-well/75 text-red-600 dark:text-red-300': u.status === 'error',
														}">
														<template v-if="u.status === 'transcoding'">
															Transcode {{ Number.isFinite(u.progress) ? u.progress.toFixed(0) : 0 }}%
														</template>
														<template v-else-if="u.status === 'uploading'">
															Upload {{ Number.isFinite(u.progress) ? u.progress.toFixed(0) : 0 }}%
														</template>
														<template v-else>
															<span v-if="u.alreadyUploaded && u.status === 'done'">
																done (already uploaded to this folder)
															</span>
															<span v-else>{{ u.status }}</span>
														</template>
													</span>
												</td>
												<td class="px-4 py-2 border border-default">
													<div class="flex justify-end">
														<button class="btn btn-secondary" @click="cancelOne(u)"
															:disabled="u.status !== 'uploading' && u.status !== 'transcoding'" title="Cancel this upload">
															Cancel
														</button>
													</div>
												</td>
											</tr>

											<tr v-if="(u.status === 'uploading' || u.status === 'transcoding') && uploads.length > 1">
												<td colspan="5" class="px-4 py-2 border border-default">
													<progress class="w-full h-2 rounded-lg overflow-hidden" :value="Number.isFinite(u.progress) ? u.progress : 0" max="100">
													</progress>
												</td>
											</tr>

											<tr v-if="u.error">
												<td colspan="5" class="px-4 py-2 border border-default text-xs text-red-400">
													{{ u.error }}
												</td>
											</tr>
										</template>
									</tbody>
								</table>
							</div>

							<div v-if="hasMediaSelected" data-tour="upload-advanced-video" class="advanced-video-card ss-toned-panel">
								<div class="advanced-video-header">
									<p class="font-semibold">{{ hasVideoSelected ? 'Video options' : 'Image options' }}</p>
									<p class="text-xs text-muted">
										<span v-if="hasVideoSelected">Review copies will be generated for streaming after upload.</span>
										<span v-else>Image watermarks will be applied after upload.</span>
										<span v-if="watermarkAfterUpload"> · Watermark enabled.</span>
									</p>
								</div>

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
									:watermarkLabel="hasVideoSelected ? 'Watermark Videos' : 'Watermark Images'"
									:effectiveWatermarkName="effectiveWatermarkName"
									:usingExistingWatermark="!watermarkFile && !!selectedExistingWatermark"

									@pickWatermark="pickWatermark"
									@clearWatermark="clearWatermark"
									@refreshWatermarks="loadExistingWatermarkFiles"
								/>

								<!-- Premium Watermark Customization -->
								<div v-if="watermarkAfterUpload && (watermarkFile || selectedExistingWatermark)" class="mt-4 border-t border-default pt-4">
									<WatermarkCustomizer v-if="isPremiumActive"
										v-model="watermarkSettings"
										:watermarkPreviewUrl="watermarkFile?.dataUrl || existingWatermarkPreviewUrl || null"
									/>
									<WatermarkPreview v-else
										:previewUrl="watermarkFile?.dataUrl || existingWatermarkPreviewUrl || ''"
										label="Watermark (bottom-right)"
									/>
								</div>
							</div>
						</div>
					</section>
				</div>
				

				<template #footer>
					<div class="wizard-footer grid grid-cols-2 items-center">
						<div class="justify-self-start">
							<button v-if="step !== 1" class="btn btn-secondary" @click="prevStep">Back</button>
						</div>

						<div class="justify-self-end">
							<button data-tour="upload-next-btn" class="btn btn-primary" :disabled="nextDisabled" @click="nextStep">
								{{ nextLabel }}
							</button>
						</div>
					</div>
				</template>

			</CardContainer>
			<div class="button-group-row">
				<button @click="goBack" class="btn btn-danger justify-start">
					Return to Dashboard
				</button>
			</div>
		</div>
	</div>

</template>

<script setup lang="ts">
import { ref, computed, inject, watch, onMounted, nextTick } from 'vue'
import { useApi } from '../composables/useApi'
import { useConnections } from '../composables/useConnections'
import { useActiveProject } from '../composables/useActiveProject'
import { useProjectMode } from '../composables/useProjectMode'
import FolderPicker from '../components/FolderPicker.vue'
import VideoOptionsPanel from '../components/VideoOptionsPanel.vue'
import WatermarkCustomizer from '../components/WatermarkCustomizer.vue'
import WatermarkPreview from '../components/WatermarkPreview.vue'
import { useLicenseStatus } from '../composables/useLicenseStatus'
import { connectionMetaInjectionKey } from '../keys/injection-keys';
import type { WatermarkSettings, Default45FlowWatermark } from '../types/watermark'
import type { RsyncProgress, TranscodeProgress } from '../typings/electron'
import { createDefaultWatermarkSettings, DEFAULT_45FLOW_WATERMARKS } from '../types/watermark'
import { useHeader } from '../composables/useHeader';
import { useResilientNav } from '../composables/useResilientNav'
import { onBeforeRouteLeave } from 'vue-router';
import { pushNotification, Notification, CardContainer } from '@45drives/houston-common-ui';
import { useTransferProgress } from '../composables/useTransferProgress'
import { useTourManager, type TourStep } from '../composables/useTourManager'
import { useOnboarding } from '../composables/useOnboarding'
import { useClientTranscode } from '../composables/useClientTranscode'
import { useUploadTranscode } from '../composables/useUploadTranscode'
const { to } = useResilientNav()
useHeader('Upload Files')
const transfer = useTransferProgress()
const { activeProject: rawActiveProject } = useActiveProject()
const { projectModeEnabled } = useProjectMode()
const activeProject = computed(() => projectModeEnabled.value ? rawActiveProject.value : null)
const { requestTour } = useTourManager()
const { onboarding, markDone } = useOnboarding()

const localUploadTourSteps = computed<TourStep[]>(() => [
	{
		target: '[data-tour="upload-wizard-header"]',
		message: 'Welcome to the Local Upload Wizard!\n\nThis 3-step process lets you transfer files from your computer to the server. The stepper at the top tracks your progress through each step.',
	},
	{
		target: '[data-tour="upload-step-1"]',
		message: 'Step 1: Select files or folders from your local machine.\n\nDrag and drop files directly onto the table, or click "Choose Files" to pick individual files (multi-select supported) or "Choose Folder" to add an entire directory. Selected files appear in the table below.\n\nGo ahead and select some files — when you\'re ready, the tour will continue.',
	},
	{
		target: '[data-tour="upload-next-btn"]',
		message: 'Now click "Next" to move to Step 2 where you\'ll choose where on the server these files will be uploaded.',
		placement: 'top',
	},
	{
		target: '[data-tour="upload-folder-picker"]',
		message: 'Step 2: Choose the destination folder on the server.\n\nBrowse the directory tree to pick where your files will land. You can create new folders, toggle between icon and tree view, and switch between project roots.\n\nSelect a destination folder, then continue.',
	},
	{
		target: '[data-tour="upload-next-btn"]',
		message: 'Click "Next" to move to the final step — reviewing your upload and configuring video options.',
		placement: 'top',
	},
	{
		target: '[data-tour="upload-step-3"]',
		message: isPremiumActive.value
			? 'Step 3: Review your files and start the upload.\n\nThe overall progress bar at the top tracks all files. When client-side transcoding is enabled, video files show a two-phase workflow: Transcode → Upload. Each file shows its own inline progress bar with speed and ETA.\n\nFor video files, you can configure review copy qualities and watermarks with full customization — position, size, opacity, and tiling (Pro). For image files, you can apply watermark overlays as well.'
			: 'Step 3: Review your files and start the upload.\n\nThe overall progress bar at the top tracks all files. When client-side transcoding is enabled, video files show a two-phase workflow: Transcode → Upload. Each file shows its own inline progress bar with speed and ETA.\n\nFor video files, you can configure review copy qualities and a basic watermark (bottom-right). For image files, you can apply a basic watermark overlay. Upgrade to Pro for full watermark customization.',
		placement: 'top',
	},
	{
		target: '[data-tour="upload-next-btn"]',
		message: 'When you\'re ready, click "Start Upload" to begin transferring files to the server.\n\nYou can cancel individual uploads while they\'re in progress. If you selected video or image files, configure review copy and watermark options above before starting.',
		placement: 'top',
	},
])

/** Request specific tour steps based on the current wizard step */
function requestStepTour() {
	if (onboarding.value.localUploadTourDone) return

	if (step.value === 1 && !_tourStep1Shown) {
		_tourStep1Shown = true
		requestTour('local-upload', localUploadTourSteps.value.slice(0, 2), () => {})
	}
}

/** Show the "click Next" hint after user adds files (first time only) */
function requestNextHintForStep1() {
	if (onboarding.value.localUploadTourDone || !_tourStep1Shown) return
	if (_tourNextHint1Shown) return
	_tourNextHint1Shown = true
	requestTour('local-upload-next1', [localUploadTourSteps.value[2]], () => {})
}

/** Show step 2 tour after navigating there */
function requestStep2Tour() {
	if (onboarding.value.localUploadTourDone) return
	if (_tourStep2Shown) return
	_tourStep2Shown = true
	requestTour('local-upload-step2', [localUploadTourSteps.value[3]], () => {})
}

/** Show "click Next" for step 2→3 after user picks a folder */
function requestNextHintForStep2() {
	if (onboarding.value.localUploadTourDone || !_tourStep2Shown) return
	if (_tourNextHint2Shown) return
	_tourNextHint2Shown = true
	requestTour('local-upload-next2', [localUploadTourSteps.value[4]], () => {})
}

/** Show step 3 tour after navigating there */
function requestStep3Tour() {
	if (onboarding.value.localUploadTourDone) return
	if (_tourStep3Shown) return
	_tourStep3Shown = true
	requestTour('local-upload-step3', localUploadTourSteps.value.slice(5, 7), () => markDone('localUploadTourDone'))
}

let _tourStep1Shown = false
let _tourNextHint1Shown = false
let _tourStep2Shown = false
let _tourNextHint2Shown = false
let _tourStep3Shown = false

onMounted(async () => {
	await loadExistingWatermarkFiles()
	await loadDefaultWatermarkSettings()
	
	if (!onboarding.value.localUploadTourDone) {
		setTimeout(() => requestStepTour(), 300)
	}
})

type LocalFile = { path: string; name: string; size: number; dataUrl?: string | null }

const connectionMeta = inject(connectionMetaInjectionKey)!;
const ssh = connectionMeta.value.ssh
const isUploading = ref(false)

const { apiFetch } = useApi()
const { activeConnection } = useConnections()
const { isPremiumActive } = useLicenseStatus()

/** ── Step control ───────────────────────────────────────── */
const step = ref<1 | 2 | 3>(1)

/** ── Step 1: local files ───────────────────────────────── */
const selected = ref<LocalFile[]>([])
const tableDragOver = ref(false)
let tableDragCounter = 0

// Step 2: destination
const destFolderRel = ref<string>('')       // FolderPicker v-model
const projectBase = ref<string>('')
const configuredProjectRoot = ref<string>('')

// Normalize the destination we actually use with rsync
const normalizedDest = computed(() =>
	`/${destFolderRel.value.replace(/^\/+/, '')}`
)
const destDir = computed(() => normalizedDest.value)
const canNext = computed(() => !!destFolderRel.value)

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
	rsyncId?: string | null
	status: 'queued' | 'transcoding' | 'uploading' | 'done' | 'canceled' | 'error'
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

	// Weighted overall progress: done files count as 100%
	let weightedPct = 0
	for (const u of rows) {
		if (u.status === 'done' || u.status === 'canceled') weightedPct += 100
		else if (u.status === 'uploading' || u.status === 'transcoding') weightedPct += (u.progress || 0)
		// queued/error = 0
	}
	const overallPct = total > 0 ? weightedPct / total : 0

	return { total, done, active, queued, errors, canceled, overallPct }
})

const totalSelectedBytes = computed(() =>
	selected.value.reduce((sum, f) => sum + (f.size || 0), 0)
)
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

const nextLabel = computed(() => {
	if (step.value === 1) return 'Next';
	if (step.value === 2) return 'Next';
	// step 3
	return allDone.value ? 'Finish' : (isUploading.value ? 'Uploading…' : 'Start Upload');
});

const nextDisabled = computed(() => {
	if (step.value === 1) return selected.value.length === 0;
	if (step.value === 2) return !canNext.value;
	// step 3: disable while actively uploading (until done), otherwise allow Start/Finish
	if (transcodeProxyAfterUpload.value && proxyQualities.value.length === 0) return true;
	if (watermarkAfterUpload.value && !watermarkFile.value && !selectedExistingWatermark.value) return true;
	return isUploading.value && !allDone.value;
});

function prevStep() {
	if (step.value > 1) goStep((step.value - 1) as 1 | 2 | 3);
}

async function nextStep() {
	if (step.value === 1) return goStep(2);
	if (step.value === 2) return goStep(3);
	// step 3
	if (allDone.value) return finish();
	return startUploads();
}

function goStep(s: 1 | 2 | 3) {
	step.value = s
	if (s === 3) {
		// build rows for review
		uploads.value = prepareRows()
	}
}
function stepClass(n: number) {
	return [
		'wizard-step-dot',
		step.value > n
			? 'wizard-step-dot--done'
			: step.value === n
				? 'wizard-step-dot--active'
				: 'wizard-step-dot--pending'
	].join(' ')
}

/** ── Step 1: local files functions ───────────────────────────────── */
function addToSelection(files?: LocalFile[]) {
	const seen = new Set(selected.value.map(f => f.path))
	const append: LocalFile[] = []
	for (const f of (files || [])) if (!seen.has(f.path)) { append.push(f); seen.add(f.path) }
	if (append.length) selected.value = [...selected.value, ...append]
}
function pickFiles() { window.electron.pickFiles().then(addToSelection) }
function pickFolder() { window.electron.pickFolder().then(addToSelection) }
function removeSelected(file: LocalFile) { selected.value = selected.value.filter(f => f.path !== file.path) }
function clearSelected() { selected.value = [] }

// ── Drag-and-drop onto the file table ──
function onTableDragEnter(e: DragEvent) {
	if (!e.dataTransfer?.types.includes('Files')) return
	e.preventDefault()
	tableDragCounter++
	tableDragOver.value = true
}
function onTableDragOver(e: DragEvent) {
	if (!e.dataTransfer?.types.includes('Files')) return
	e.preventDefault()
	if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
}
function onTableDragLeave() {
	tableDragCounter--
	if (tableDragCounter <= 0) { tableDragCounter = 0; tableDragOver.value = false }
}
function onTableDrop(e: DragEvent) {
	e.preventDefault()
	tableDragOver.value = false
	tableDragCounter = 0
	if (!e.dataTransfer?.files?.length) return
	const files: LocalFile[] = []
	for (const f of Array.from(e.dataTransfer.files)) {
		const filePath = window.electron?.getPathForFile?.(f) || (f as any).path || ''
		if (filePath) files.push({ path: filePath, name: f.name, size: f.size })
	}
	if (files.length) addToSelection(files)
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
	const { rel } = resolveWatermarkStorageRoot()
	return rel ? `${rel}/.45flow/watermarks` : '.45flow/watermarks'
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
		watermarkSettings: opts.localWatermarkPath ? JSON.parse(JSON.stringify(watermarkSettings.value)) : undefined,
		skipWatermarkCleanup: true,
		ssh: {
			host: ssh?.server || '',
			user: ssh?.username || '',
			port: serverPort,
			keyPath: privateKeyPath.value!,
		},
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
	watermarkRelPath?: string
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
					detail: 'Generating review copy…',
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
					detail: 'Generating review copy…',
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
					if (payload?.error === 'outputs_exist' || payload?.error === 'hls_exists' || payload?.error === 'watermark_exists') {
						const msg = 'Transcode outputs already exist for this file. Overwrite them?';
						const proceed = window.confirm(msg);
						if (proceed) {
							const params = new URLSearchParams();
							if (payload?.destRel) params.set('dest', String(payload.destRel));
							if (payload?.name) params.set('name', String(payload.name));
							if (opts.isVideo && opts.wantProxy) {
								params.set('hls', '1');
								params.set('proxy', '1');
								if (proxyQualities.value.length) params.set('proxyQualities', proxyQualities.value.join(','));
							}

							if (watermarkAfterUpload.value) {
								const wmRel = String(opts.watermarkRelPath || resolveWatermarkRelPath() || watermarkFile.value?.name || '').trim()
								if (wmRel) {
									params.set('watermark', '1');
									params.set('watermarkFile', wmRel);
									if (opts.isVideo && proxyQualities.value.length) {
										params.set('watermarkProxyQualities', proxyQualities.value.join(','));
									}
								// Premium: Pass custom watermark settings to server
								if (watermarkSettings.value) {
									params.set('watermarkSettings', JSON.stringify(watermarkSettings.value));
								}
							}
						}

						params.set('overwrite', '1');
						const data = await apiFetch(`/api/files/reingest?${params}`, { method: 'POST' });
						startTranscodeFromPayload(data);
					} else {
						pushNotification(
							new Notification(
								'Overwrite Canceled',
								'Existing review copy outputs were kept.',
								'info',
								6000
							)
						);
					}
				} else {
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
				}
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
			rsyncId: null,
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

watch(step, (s, old) => {
	if (s === 3 && uploads.value.length === 0) {
		uploads.value = prepareRows()
	}

	if (old === 3 && s !== 3 && allTerminal.value) {
		resetUploadState()
	}

	// Tour: trigger tour segments on step transitions
	if (s === 2) nextTick(() => requestStep2Tour())
	if (s === 3) nextTick(() => requestStep3Tour())
})

// Tour: show "click Next" hint when files are first selected
watch(() => selected.value.length, (len) => {
	if (len > 0 && step.value === 1) {
		nextTick(() => requestNextHintForStep1())
	}
})

// Tour: show "click Next" hint when destination is picked
watch(destFolderRel, (val) => {
	if (val && step.value === 2) {
		nextTick(() => requestNextHintForStep2())
	}
})


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
	row.status = 'uploading'
	row.startedAt = row.startedAt ?? Date.now()
	activeUploads.value++

	const groupId = crypto.randomUUID?.() || Math.random().toString(36).slice(2)
	const destDirAbs = row.dest
	const destFileAbs = joinPath(destDirAbs, row.name)

	// Reuse pre-created dock task, or create one if missing
	let taskId = row.dockTaskId || ''
	if (taskId) {
		// Update existing queued task to show it's now uploading
		transfer.updateUpload(taskId, {
			status: 'uploading',
			progress: 0,
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
				if (row.rsyncId) window.electron.rsyncCancel(row.rsyncId)
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

	// Determine if this is a video file and if we should transcode client-side
	const ext = String(row.name || '').toLowerCase().split('.').pop() || ''
	const isVideo = videoExts.has(ext)
	const { enabled: clientTranscodeEnabled, preset: transcodePreset, hwAccel: hwAccelSetting } = useClientTranscode()
	// Old single-quality client transcode is replaced by full multi-output transcode
	// that runs after ingest (via runClientFullTranscode). Always upload the raw file.
	const shouldTranscodeClient = false

	const doUpload = async (filePathToUpload: string, clientTranscoded: boolean = false, clientWatermarked: boolean = false) => {
		// Tell server we WILL transcode client-side (pre-claim jobs to prevent server from picking them up)
		const clientWillTranscode = !clientTranscoded && isVideo && clientTranscodeEnabled.value && transcodeProxyAfterUpload.value
		return window.electron.rsyncStart(
			{
				host: ssh?.server,
				user: ssh?.username,
				src: filePathToUpload,
				destDir: row.dest,
				port: serverPort,
				keyPath: privateKeyPath.value,
				transcodeProxy: transcodeProxyAfterUpload.value, // Server generates proxy variants (scaling) even when client transcoded
				proxyQualities: proxyQualities.value.slice(),
				watermark: enableWatermark,
				watermarkFileName: enableWatermark ? watermarkRelPathForIngest : undefined,
				watermarkProxyQualities: enableWatermark ? proxyQualities.value.slice() : undefined,
				watermarkSettings: enableWatermark ? JSON.parse(JSON.stringify(watermarkSettings.value)) : undefined,
				apiToken: connectionMeta.value.token || undefined,
				clientTranscoded, // Tell server we transcoded client-side
				clientWatermarked, // Tell server watermark was applied client-side
				clientTranscode: clientWillTranscode, // Tell server we WILL transcode (claim jobs)
			},
		(p: RsyncProgress) => {
				let pct: number | undefined =
					typeof p.percent === 'number' && !Number.isNaN(p.percent) ? p.percent : undefined;

				if (pct === undefined && typeof p.bytesTransferred === 'number' && row.size > 0) {
					pct = (p.bytesTransferred / row.size) * 100;
				}

				if (pct === undefined && typeof p.raw === 'string') {
					const m = p.raw.match(/(\d+(?:\.\d+)?)%/);
					if (m) pct = parseFloat(m[1]);
				}

				updateRowProgress(row, pct, p.rate, p.eta);

				transfer.updateUpload(taskId, {
					status: 'uploading',
					progress: typeof pct === 'number' ? pct : row.progress,
					speed: p.rate ?? null,
					eta: p.eta ?? null,
				});
			}
		);
	}

	// Handle transcode and upload workflow
	const startUploadWorkflow = async () => {
		if (shouldTranscodeClient) {
			const transcodeQuality = proxyQualities.value.includes('original') ? 'original' : proxyQualities.value[0] || '720p'
			
			try {
				row.status = 'transcoding'
				transfer.updateUpload(taskId, {
					detail: 'Transcoding locally…',
				})

				const { jobId, done } = await window.electron.transcodeStart(
					{
						inputPath: row.path,
						quality: transcodeQuality as 'original' | '1080p' | '720p',
						outputFormat: 'mp4',
						useHardwareAccel: hwAccelSetting.value,
						preset: transcodePreset.value,
						watermarkPath: (enableWatermark && localWatermarkPath) ? localWatermarkPath : undefined,
							watermarkSettings: enableWatermark ? JSON.parse(JSON.stringify(watermarkSettings.value)) : undefined,
					},
					(progress: TranscodeProgress) => {
						row.progress = progress.percent
						transfer.updateUpload(taskId, {
							progress: progress.percent,
							speed: progress.speed || null,
							eta: progress.eta || null,
							detail: `Transcoding: ${progress.fps}fps @ ${progress.speed} - ETA ${progress.eta}`,
						})
					}
				)

				const result = await done
				if (result?.ok && result?.outputPath) {
					row.status = 'uploading'
					row.progress = 0
					transfer.updateUpload(taskId, {
						detail: 'Uploading…',
						progress: 0,
						speed: null,
						eta: null,
					})
					const clientWatermarked = !!(enableWatermark && localWatermarkPath)
					return doUpload(result.outputPath, true, clientWatermarked)
				} else {
					const errorMsg = result?.error || 'Transcode failed — try disabling client-side transcoding in Settings to let the server handle it.'
					throw new Error(errorMsg)
				}
			} catch (err) {
				const errorMsg = err instanceof Error ? err.message : String(err)
				row.status = 'error'
				row.error = `Transcode error: ${errorMsg}`
				transfer.updateUpload(taskId, {
					status: 'error',
				})
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
				throw err // Re-throw to prevent upload
			}
		} else {
			// No client transcode needed, upload directly
			return doUpload(row.path, false)
		}
	}

	startUploadWorkflow()
		.then(uploadPromise => uploadPromise)
		.then(({ id, done }) => {
		row.rsyncId = id;
		if (row.status === 'canceled') {
			window.electron.rsyncCancel(id)
		}

		// Start listening for ingest -> fileId (so we can track transcode progress)
		const stopIngestListener = waitForIngestAndStartTranscode({
			uploadId: id,
			rowName: row.name,
			isVideo: videoExts.has(String(row.name || '').toLowerCase().split('.').pop() || ''),
			wantProxy: transcodeProxyAfterUpload.value,
			groupId,
			destDir: destDirAbs,
			destFileAbs,
			watermarkRelPath: watermarkRelPathForIngest,
			// Client-side full transcode
			clientTranscode: clientTranscodeEnabled.value && videoExts.has(String(row.name || '').toLowerCase().split('.').pop() || ''),
			sourceFilePath: row.path,
			localWatermarkPath: localWatermarkPath,
			taskId,
		})
		row.ingestUnsub = stopIngestListener

		const cleanup = () => {
			try { stopIngestListener?.(); } catch { }
		};

		done.then((res: any) => {
			// Don't immediately remove the ingest listener on success — the ingest
			// IPC arrives AFTER upload:done (server API call has latency). The handler
			// self-cleans via its finally block. Use a generous timeout as safety net.
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
				row.error = res.error || 'rsync failed';
				transfer.finishUpload(taskId, false, res.error || 'rsync failed');
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
				transfer.finishUpload(taskId, false, err?.message || 'rsync failed');
				failedSinceStart++;
				scheduleBatchNotification();
			}

			onDone();
		});
	}).catch((err: any) => {
		// rsyncStart itself failed (couldn't even start the process)
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

	// Ensure SSH keys are deployed before uploading
	const host = ssh?.server
	const user = ssh?.username
	const port = serverPort ?? 22
	if (host && user) {
		try {
			const sshReady = await window.electron.ensureSshReady({
				host,
				username: user,
				password: undefined, // No password available; rely on existing keys/agent
				sshPort: port,
			})
			if (!sshReady?.ok) {
				pushNotification(
					new Notification(
						'Upload Failed',
						'SSH authentication setup failed. Please reconnect to the server from the Connections page to re-establish SSH keys.',
						'error',
						10000
					)
				)
				isUploading.value = false
				return
			}
		} catch (e: any) {
			pushNotification(
				new Notification(
					'Upload Failed',
					`SSH setup error: ${e?.message || String(e)}. Please reconnect to the server.`,
					'error',
					10000
				)
			)
			isUploading.value = false
			return
		}
	}

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
			const { done } = await window.electron.rsyncStart(
				{
					host: ssh?.server,
					user: ssh?.username,
					src: watermarkFile.value.path,
					destDir: watermarkDestDir,
					port: serverPort,
					keyPath: privateKeyPath.value,
					noIngest: true,
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
					if (row.rsyncId) window.electron.rsyncCancel(row.rsyncId)
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

	// Persist queued items so they survive app restart
	const enableWm = watermarkAfterUpload.value && !!watermarkRelPathForIngest
	try {
		window.electron.persistUploadQueue?.(
			queue.map(row => ({
				src: row.path,
				fileName: row.name,
				fileSize: row.size,
				host: ssh?.server,
				user: ssh?.username,
				destDir: row.dest,
				port: serverPort,
				keyPath: privateKeyPath.value,
				transcodeProxy: transcodeProxyAfterUpload.value,
				proxyQualities: proxyQualities.value.slice(),
				watermark: enableWm,
				watermarkFileName: enableWm ? watermarkRelPathForIngest : undefined,
				watermarkProxyQualities: enableWm ? proxyQualities.value.slice() : undefined,
				apiToken: connectionMeta.value.token || undefined,
			}))
		)
	} catch { /* best-effort */ }

	let watermarkCleaned = false
	function maybeCleanupWatermark() {
		if (watermarkCleaned) return
		if (activeUploads.value === 0 && queueIdx >= queue.length && pendingIngests.value === 0 && pendingFullTranscodes.value === 0) {
			isUploading.value = false
			if (localWatermarkPath) {
				watermarkCleaned = true
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
		transfer.cancelUpload(row.dockTaskId)
	} else if (row.rsyncId) {
		window.electron.rsyncCancel(row.rsyncId)
	}
	try { row.ingestUnsub?.(); } catch { }
	row.ingestUnsub = null;
	row.status = 'canceled'
}

</script>

<style lang="css" scoped>
.wizard-head {
	display: grid;
	gap: 0.75rem;
}

.wizard-main-title {
	font-size: 1.18rem;
	font-weight: 700;
	line-height: 1.2;
}

.wizard-stepper {
	display: grid;
	grid-template-columns: minmax(0, 1fr) 1fr minmax(0, 1fr) 1fr minmax(0, 1fr);
	align-items: center;
	gap: 0.0rem;
}

.wizard-step-item {
	display: flex;
	align-items: center;
	gap: 0.52rem;
	min-width: 0;
	border: 1px solid color-mix(in srgb, var(--btn-primary-bg) 28%, #4f5160);
	border-radius: 5rem;
	padding: 0.15rem 0.15rem;
	background-color: color-mix(in srgb, var(--btn-primary-bg) 6%, transparent);
}

.wizard-step-divider {
	height: 1px;
	width: 100%;
	background: color-mix(in srgb, var(--btn-primary-bg) 28%, #56566a);
}

.wizard-step-copy {
	min-width: 0;
	display: flex;
	flex-direction: column;
}

.wizard-step-label {
	font-size: 0.8rem;
	font-weight: 700;
	line-height: 1.2;
}

.wizard-step-help {
	font-size: 0.68rem;
	opacity: 0.78;
	line-height: 1.3;
}

.wizard-step-dot {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 1.7rem;
	height: 1.7rem;
	border-radius: 999px;
	border: 1px solid color-mix(in srgb, var(--btn-primary-bg) 36%, #616172);
	font-size: 0.76rem;
	font-weight: 800;
	flex-shrink: 0;
}

.wizard-step-dot--pending {
	color: #c8cad2;
	background: color-mix(in srgb, #2c2f3a 86%, transparent);
}

.wizard-step-dot--active {
	color: white;
	background: var(--btn-primary-bg);
	box-shadow: 0 0 0 3px color-mix(in srgb, var(--btn-primary-bg) 34%, transparent);
}

.wizard-step-dot--done {
	color: #0a2a1c;
	background: #4ade80;
}

.wizard-stage {
	@apply flex flex-col flex-1 min-h-0 overflow-hidden;
}

.wizard-pane {
	@apply flex flex-col gap-4 text-left flex-1 min-h-0;
}

.wizard-pane--fill {
	@apply flex-1 min-h-0 overflow-hidden;
}

.wizard-heading {
	@apply text-xl font-semibold mt-1 text-left;
}

.wizard-controls {
	@apply flex flex-wrap items-center gap-3;
}

.wizard-muted {
	@apply text-sm text-muted;
}

.wizard-table-shell {
	@apply border rounded overflow-auto flex-1;
	min-height: 12rem;
	border-color: color-mix(in srgb, var(--btn-primary-bg) 24%, #4f5160);
}

.wizard-table-shell--filled {
	@apply flex-1;
	min-height: 12rem;
}

.wizard-table-shell--empty {
	@apply flex-1;
	min-height: 12rem;
}

.wizard-table-shell--uploads {
	@apply flex-1;
	min-height: 16rem;
}

.wizard-step3-body {
	@apply flex flex-col flex-1 min-h-0 gap-3 overflow-y-auto pr-1;
}

.wizard-overall-progress {
	@apply shrink-0 px-3 py-2 rounded-md border;
	border-color: color-mix(in srgb, var(--btn-primary-bg) 28%, #4f5160);
	background: color-mix(in srgb, var(--btn-primary-bg) 6%, transparent);
}

.wizard-overall-progress progress {
	appearance: none;
	border: none;
}

.wizard-overall-progress progress::-webkit-progress-bar {
	background: color-mix(in srgb, var(--btn-primary-bg) 10%, #e4e7ec);
	border-radius: 0.5rem;
}

.dark .wizard-overall-progress progress::-webkit-progress-bar {
	background: color-mix(in srgb, var(--btn-primary-bg) 14%, #2c2f3a);
	border-radius: 0.5rem;
}

.wizard-overall-progress progress::-webkit-progress-value {
	background: var(--btn-primary-fill);
	border-radius: 0.5rem;
	transition: width 0.3s ease;
}

.advanced-video-card {
	@apply shrink-0 p-3 rounded-md border;
	border-color: color-mix(in srgb, var(--btn-primary-bg) 22%, #c8ced9);
}

.advanced-video-header {
	@apply mb-2;
}

.advanced-video-grid {
	@apply grid gap-3 items-start;
	grid-template-columns: repeat(1, minmax(0, 1fr));
}

.advanced-col {
	@apply rounded-md p-2 min-w-0;
}

.watermark-warning {
	@apply text-xs font-semibold;
	color: #9a6a00;
	background: color-mix(in srgb, #ffda7a 24%, transparent);
	border: 1px solid color-mix(in srgb, #d99a1a 34%, transparent);
	padding: 0.25rem 0.4rem;
	border-radius: 0.35rem;
}

@media (min-width: 1024px) {
	.advanced-video-grid {
		grid-template-columns: repeat(3, minmax(0, 1fr));
	}
}

.wizard-footer {
	@apply relative z-20;
}

.local-upload-card :deep(> div:nth-child(2)) {
	@apply min-h-0 overflow-hidden flex flex-col;
}

.wizard-table {
	@apply min-w-full text-sm border border-default border-collapse text-left;
}

.wizard-thead-row {
	@apply bg-default text-default border-b border-default;
}

.wizard-th {
	@apply px-4 py-2 font-semibold border border-default;
}

.wizard-td {
	@apply px-4 py-2 border border-default;
}

:global(html.dark) .watermark-warning,
:global(body.dark) .watermark-warning,
:global(.dark) .watermark-warning {
	color: #ffe5b0 !important;
	background: color-mix(in srgb, #7f5600 44%, transparent) !important;
	border-color: color-mix(in srgb, #ffc85c 55%, transparent) !important;
}

@media (max-width: 920px) {
	.wizard-stepper {
		grid-template-columns: minmax(0, 1fr);
		gap: 0.45rem;
	}

	.wizard-step-divider {
		display: none;
	}

	.wizard-step-help {
		display: none;
	}
}

@media (max-height: 860px) {
	.wizard-table-shell--uploads {
		min-height: 12rem;
	}
	
	.wizard-table-shell {
		min-height: 10rem;
	}
}

@media (max-height: 640px) {
	.wizard-table-shell {
		min-height: 8rem;
	}
	
	.wizard-table-shell--uploads {
		min-height: 10rem;
	}
}

</style>
