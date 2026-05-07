<template>
  <!-- Visual "drop here" overlay — purely presentational, all events handled on document -->
  <Transition name="qs-fade">
    <div v-if="dragging" class="fixed inset-0 z-[1500] flex items-center justify-center bg-black/50 backdrop-blur-sm pointer-events-none">
      <div class="flex flex-col items-center gap-3 text-white text-xl font-semibold select-none">
        <ArrowUpTrayIcon class="w-16 h-16 text-white/80 animate-bounce" />
        <span>Drop files to quick-share</span>
      </div>
    </div>
  </Transition>

  <!-- Modal: shown after files are dropped -->
  <div v-if="showModal" class="fixed inset-0 z-[2100] flex items-center justify-center">
    <div class="absolute inset-0 bg-black/50" @click="cancel" />
    <div
      class="relative w-full max-w-6xl h-[85vh] flex flex-col bg-accent rounded-lg shadow-xl p-5"
      role="dialog"
      aria-label="Quick upload and share"
      data-tour="qs-modal"
      @keydown.esc.prevent.stop="cancel"
    >
      <!-- Header -->
      <div class="flex items-center justify-between mb-4 shrink-0">
        <h2 class="text-lg font-semibold">
          Upload {{ droppedFiles.length === 1 ? `"${droppedFiles[0].name}"` : `${droppedFiles.length} files` }} to server?
        </h2>
        <button class="btn btn-secondary" @click="cancel" :disabled="busy">Close</button>
      </div>

      <!-- Step indicator -->
      <div class="flex items-center gap-2 text-sm mb-4 shrink-0" data-tour="qs-steps">
        <span
          class="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold"
          :class="wizardStep === 1 ? 'bg-primary text-white' : 'bg-well text-muted'"
        >1</span>
        <span :class="wizardStep === 1 ? 'font-semibold' : 'text-muted'">Destination</span>
        <span class="text-muted mx-1">→</span>
        <span
          class="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold"
          :class="wizardStep === 2 ? 'bg-primary text-white' : 'bg-well text-muted'"
        >2</span>
        <span :class="wizardStep === 2 ? 'font-semibold' : 'text-muted'">Link Options</span>
        <span class="text-muted mx-1">→</span>
        <span
          class="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold"
          :class="wizardStep === 3 ? 'bg-primary text-white' : 'bg-well text-muted'"
        >3</span>
        <span :class="wizardStep === 3 ? 'font-semibold' : 'text-muted'">Upload &amp; Share</span>
      </div>

      <!-- Scrollable content area -->
      <div class="flex-1 min-h-0 overflow-y-auto">
      <!-- Dropped files list -->
      <div class="border border-default rounded-md p-2 mb-4 max-h-32 overflow-y-auto">
        <div v-for="f in droppedFiles" :key="f.path" class="flex items-center justify-between text-sm py-0.5 min-w-0">
          <span class="truncate min-w-0 flex-1" :title="f.path">{{ f.name }}</span>
          <span class="text-muted ml-2 flex-shrink-0">{{ formatSize(f.size) }}</span>
        </div>
      </div>

      <!-- ===== STEP 1: Destination ===== -->
      <section v-show="wizardStep === 1" data-tour="qs-step-destination">
        <FolderPicker
          v-model="destFolder"
          :apiFetch="apiFetch"
          useCase="upload"
          subtitle="Choose where to upload on the server."
          :auto-detect-roots="true"
          :allow-entire-tree="true"
          v-model:project="projectBase"
          v-model:dest="destFolder"
        />
      </section>

      <!-- ===== STEP 2: Link Options ===== -->
      <section v-show="wizardStep === 2" class="qs-lane flex flex-col gap-4" data-tour="qs-step-options">
        <!-- ── Essential options (always visible) ── -->
        <div class="flex flex-col gap-3">
          <!-- Expiry -->
          <div class="flex items-center gap-3 min-w-0" data-tour="qs-expiry">
            <label class="font-semibold whitespace-nowrap flex-shrink-0">Expires in:</label>
            <div class="flex items-center gap-2 min-w-0">
              <input type="number" min="0" step="1" v-model.number="expiresValue"
                class="input-textlike border rounded px-3 py-2 w-20" />
              <select v-model="expiresUnit" class="input-textlike border rounded px-3 py-2 w-28">
                <option value="hours">hours</option>
                <option value="days">days</option>
                <option value="weeks">weeks</option>
              </select>
            </div>
            <div class="flex flex-nowrap gap-1 text-xs">
              <button type="button" class="btn btn-secondary px-2 py-1" @click="setPreset(1, 'hours')">1h</button>
              <button type="button" class="btn btn-secondary px-2 py-1" @click="setPreset(1, 'days')">1d</button>
              <button type="button" class="btn btn-secondary px-2 py-1" @click="setPreset(1, 'weeks')">1w</button>
              <button type="button" class="btn btn-secondary px-2 py-1" @click="setNever()">Never</button>
            </div>
          </div>

          <!-- Network access -->
          <div class="flex items-center gap-3 min-w-0" data-tour="qs-network">
            <span class="font-semibold whitespace-nowrap flex-shrink-0">Network:</span>
            <div class="flex gap-2" role="radiogroup" aria-label="Network Access">
              <label class="inline-flex items-center gap-2 px-3 py-1.5 rounded-md cursor-pointer select-none transition border border-default bg-default hover:bg-well/40">
                <input type="radio" name="qs-link-access" :value="false" :checked="usePublicBase === false" @change="usePublicBase = false" class="h-4 w-4" />
                <span class="text-sm">Local (LAN)</span>
              </label>
              <label class="inline-flex items-center gap-2 px-3 py-1.5 rounded-md cursor-pointer select-none transition border border-default bg-default hover:bg-well/40">
                <input type="radio" name="qs-link-access" :value="true" :checked="usePublicBase === true" @change="usePublicBase = true" class="h-4 w-4" />
                <span class="text-sm">External (Internet)</span>
              </label>
            </div>
          </div>
        </div>

        <!-- ── Summary of current settings ── -->
        <div class="text-xs text-muted flex flex-wrap gap-x-4 gap-y-1">
          <span>Access: {{ accessMode === 'open' ? 'Anyone' : accessMode === 'open_password' ? 'Password' : `${accessUsers.length} invited user(s)` }}</span>
          <span v-if="hasVideo">Review Copies: {{ proxyQualities.join(', ') || 'none' }}</span>
          <span v-if="hasVideo">Watermark: {{ watermarkEnabled ? 'on' : 'off' }}</span>
        </div>

        <!-- ── Advanced Options (collapsible) ── -->
        <Disclosure v-slot="{ open }" as="div" class="border border-default rounded-lg bg-default" data-tour="qs-advanced">
          <DisclosureButton class="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left rounded-lg hover:bg-well/30 transition" data-tour="qs-advanced-btn">
            <div class="min-w-0">
              <span class="font-semibold text-sm">Advanced Options</span>
              <span class="text-xs text-muted ml-2">Title, access control{{ hasVideo ? ', video options' : '' }}</span>
            </div>
            <ChevronDownIcon class="h-5 w-5 text-muted transition-transform duration-200" :class="open ? 'rotate-180' : ''" />
          </DisclosureButton>

          <DisclosurePanel class="px-4 pb-4 pt-1 border-t border-default flex flex-col gap-4" data-tour="qs-advanced-panel">
            <!-- Link title -->
            <div class="flex flex-wrap items-center gap-3 min-w-0" data-tour="qs-link-title">
              <label class="font-semibold text-sm whitespace-nowrap">Link Title:</label>
              <input type="text" v-model.trim="linkTitle"
                class="input-textlike border rounded px-3 py-2 flex-1 min-w-[12rem]"
                placeholder="Optional title" />
            </div>

            <!-- Access mode -->
            <div class="flex flex-col gap-2" data-tour="qs-access-mode">
              <span class="font-semibold text-sm">Link Access Mode</span>
              <div class="grid grid-cols-3 gap-2 min-w-0">
                <div class="flex flex-col gap-1">
                  <label class="flex items-start gap-2 p-1.5 rounded-md border border-default cursor-pointer">
                    <input type="radio" name="qs-access-mode" value="open" v-model="accessMode" class="mt-0.5" />
                    <span class="min-w-0">
                      <span class="font-semibold block text-sm">Anyone with the link</span>
                      <span class="text-xs text-muted block">No sign-in required.</span>
                    </span>
                  </label>
                  <label class="flex items-start gap-2 p-1.5 rounded-md border border-default cursor-pointer">
                    <input type="radio" name="qs-access-mode" value="open_password" v-model="accessMode" class="mt-0.5" />
                    <span class="min-w-0">
                      <span class="font-semibold block text-sm">Password protected</span>
                      <span class="text-xs text-muted block">One shared password.</span>
                    </span>
                  </label>
                  <label class="flex items-start gap-2 p-1.5 rounded-md border border-default cursor-pointer">
                    <input type="radio" name="qs-access-mode" value="restricted" v-model="accessMode" class="mt-0.5" />
                    <span class="min-w-0">
                      <span class="font-semibold block text-sm">Invited users only</span>
                      <span class="text-xs text-muted block">Sign in with user account.</span>
                    </span>
                  </label>
                </div>

                <div class="col-span-2 border border-default rounded-md p-3 min-w-0">
                  <div v-if="accessMode !== 'restricted'" class="flex flex-wrap items-center gap-3 min-w-0">
                    <label class="font-semibold text-sm whitespace-nowrap">Allow comments</label>
                    <Switch id="qs-allow-comments-switch" v-model="allowOpenComments" :class="[
                      allowOpenComments ? 'bg-secondary' : 'bg-well',
                      'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-slate-600 focus:ring-offset-2'
                    ]">
                      <span class="sr-only">Toggle comments</span>
                      <span aria-hidden="true" :class="[
                        allowOpenComments ? 'translate-x-5' : 'translate-x-0',
                        'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-default shadow ring-0 transition duration-200 ease-in-out'
                      ]" />
                    </Switch>
                    <span class="text-xs text-muted">{{ allowOpenComments ? 'Visitors can comment.' : 'Comments disabled.' }}</span>
                  </div>

                  <div v-if="accessMode === 'open_password'" class="flex flex-col gap-2 min-w-0 mt-2">
                    <div class="relative flex items-center min-w-0 w-full">
                      <input :type="showPassword ? 'text' : 'password'" v-model.trim="password"
                        placeholder="Enter a password"
                        class="input-textlike border rounded px-3 py-2 w-full pr-10 min-w-0" />
                      <button type="button" @click="showPassword = !showPassword"
                        class="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted">
                        <EyeIcon v-if="!showPassword" class="w-5 h-5" />
                        <EyeSlashIcon v-else class="w-5 h-5" />
                      </button>
                    </div>
                    <p v-if="!password" class="text-sm text-red-500">Password is required.</p>
                  </div>

                  <div v-if="accessMode === 'restricted'" class="flex flex-col gap-2 min-w-0">
                    <p class="text-xs text-muted">Users sign in with their own credentials. Roles control permissions.</p>
                    <button type="button" class="btn btn-primary" @click="userModalOpen = true">
                      {{ accessUsers.length ? 'Manage invited users' : 'Invite users…' }}
                      <span v-if="accessUsers.length"
                        class="ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs bg-default text-default">
                        {{ accessUsers.length }}
                      </span>
                    </button>
                    <p v-if="!accessUsers.length" class="text-sm text-red-500">Add at least one user.</p>
                  </div>
                </div>
              </div>
            </div>

            <!-- Video options (only shown for video files) -->
            <div v-if="hasVideo" class="flex flex-col gap-3" data-tour="qs-video-options">
              <span class="font-semibold text-sm">Video Options</span>
              <div class="grid grid-cols-3 gap-4 items-start">
                <div class="min-w-0">
                  <label class="font-semibold text-sm block mb-1">Review Copies</label>
                  <div class="flex flex-wrap gap-x-3 gap-y-1">
                    <label class="inline-flex items-center gap-2 text-sm"><input type="checkbox" class="proxy-quality-checkbox" value="720p" v-model="proxyQualities" /> 720p</label>
                    <label class="inline-flex items-center gap-2 text-sm"><input type="checkbox" class="proxy-quality-checkbox" value="1080p" v-model="proxyQualities" /> 1080p</label>
                    <label class="inline-flex items-center gap-2 text-sm"><input type="checkbox" class="proxy-quality-checkbox" value="original" v-model="proxyQualities" /> Full Res</label>
                  </div>
                  <p class="text-xs text-slate-400 mt-1">Lightweight MP4s for downloading &amp; offline review. A browser stream is always generated separately.</p>
                </div>

                <div class="col-span-2 min-w-0">
                  <div class="flex items-center gap-2 mb-2">
                    <label class="font-semibold text-sm whitespace-nowrap">Watermark:</label>
                    <Switch v-model="watermarkEnabled" :class="[
                      watermarkEnabled ? 'bg-secondary' : 'bg-well',
                      'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-slate-600 focus:ring-offset-2'
                    ]">
                      <span class="sr-only">Toggle watermark</span>
                      <span aria-hidden="true" :class="[
                        watermarkEnabled ? 'translate-x-5' : 'translate-x-0',
                        'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-default shadow ring-0 transition duration-200 ease-in-out'
                      ]" />
                    </Switch>
                    <span class="text-xs text-muted">{{ watermarkEnabled ? 'On' : 'Off' }}</span>
                  </div>

                  <div v-if="watermarkEnabled" class="flex flex-wrap items-center gap-2 mb-2">
                    <button class="btn btn-secondary text-xs" @click="pickWatermark">Choose Image</button>
                    <span class="text-sm truncate min-w-0" :title="watermarkFile ? watermarkFile.name : 'No image'">
                      {{ watermarkFile ? watermarkFile.name : (selectedExistingWatermark ? selectedExistingWatermark.split('/').pop() : 'No image') }}
                    </span>
                    <select v-model="selectedExistingWatermark" class="input-textlike border rounded px-2 py-1 text-xs min-w-[14rem]">
                      <option value="">Existing watermark…</option>
                      <option v-for="wm in existingWatermarkFiles" :key="wm" :value="wm">{{ wm }}</option>
                    </select>
                    <button class="btn btn-secondary px-2 py-0.5 text-xs" @click="loadExistingWatermarkFiles">Refresh</button>
                  </div>
                  <p v-if="watermarkEnabled && !watermarkFile && !selectedExistingWatermark"
                    class="text-xs text-amber-700 dark:text-amber-300">Select a watermark image to continue.</p>

                  <div v-if="watermarkEnabled && watermarkPreviewUrl" class="mt-2">
                    <div class="flex items-center justify-between gap-2 mb-1">
                      <span class="text-xs text-slate-400">Preview</span>
                      <button v-if="watermarkFile" class="btn btn-danger text-xs px-2 py-0.5" @click="clearWatermark">Clear</button>
                    </div>
                    <div class="relative aspect-video w-full max-w-[14rem] rounded-md border border-default bg-default/60 overflow-hidden">
                      <div class="absolute inset-0 bg-gradient-to-br from-slate-700/40 via-slate-800/40 to-slate-900/60"></div>
                      <img :src="watermarkPreviewUrl" alt="Watermark preview"
                        class="absolute bottom-3 right-3 max-h-[35%] max-w-[35%] opacity-70 drop-shadow-md" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </DisclosurePanel>
        </Disclosure>

        <AddUsersModal v-model="userModalOpen" :apiFetch="apiFetch" :link="linkContext"
          roleHint="view" :preselected="accessUsers.map(c => ({
            id: c.id,
            username: c.username || '',
            name: c.name,
            user_email: c.user_email,
            display_color: c.display_color,
            role_id: c.role_id ?? undefined,
            role_name: c.role_name ?? undefined,
          }))" @apply="onApplyUsers" />
      </section>

      <!-- ===== STEP 3: Upload & Share Progress ===== -->
      <section v-show="wizardStep === 3" data-tour="qs-step-upload">
        <div v-if="uploadPhase === 'uploading'" class="flex flex-col gap-3">
          <div class="text-sm font-semibold">{{ currentPhaseLabel }}</div>
          <div v-for="f in droppedFiles" :key="f.path" class="flex flex-col gap-1">
            <div class="flex items-center justify-between text-sm">
              <span class="truncate min-w-0 flex-1">{{ f.name }}</span>
              <span class="text-muted ml-2 shrink-0">{{ (perFileProgress[f.path] ?? 0).toFixed(0) }}%</span>
            </div>
            <div v-if="perFileDetail[f.path]" class="text-xs text-muted">{{ perFileDetail[f.path] }}</div>
            <progress
              class="w-full h-2 rounded-lg overflow-hidden"
              :class="{
                '[&::-webkit-progress-value]:bg-amber-500 [&::-moz-progress-bar]:bg-amber-500': perFileStatus[f.path] === 'transcoding',
                '[&::-webkit-progress-value]:bg-primary [&::-moz-progress-bar]:bg-primary': perFileStatus[f.path] === 'uploading',
              }"
              :value="perFileProgress[f.path] ?? 0" max="100"
            ></progress>
          </div>
        </div>

        <div v-else-if="uploadPhase === 'generating'" class="flex items-center gap-3 text-sm">
          <span class="inline-block w-4 h-4 border-2 border-default border-t-transparent rounded-full animate-spin"></span>
          Generating share link…
        </div>

        <div v-else-if="uploadPhase === 'done'" class="flex flex-col gap-3">
          <div class="text-sm font-semibold text-green-500">Upload complete &amp; link generated!</div>
          <div class="p-3 border rounded flex flex-col items-center min-w-0 bg-default">
            <code class="max-w-full break-all">{{ viewUrl }}</code>
            <div class="flex flex-wrap gap-2 mt-2">
              <button class="btn btn-secondary" @click="copyLink">Copy</button>
              <button class="btn btn-primary" @click="openInBrowser">Open</button>
            </div>
          </div>
        </div>

        <div v-else-if="uploadPhase === 'error'" class="flex flex-col gap-2">
          <div class="text-sm font-semibold text-red-500">Error</div>
          <p class="text-sm text-red-400">{{ errorMsg }}</p>
        </div>
      </section>

      </div> <!-- end scrollable content area -->

      <!-- Footer buttons -->
      <div class="flex justify-end gap-2 mt-4 border-t border-default pt-3 shrink-0" data-tour="qs-footer">
        <button v-if="wizardStep > 1 && uploadPhase === 'idle'" class="btn btn-secondary" @click="wizardStep--" :disabled="busy">
          Back
        </button>
        <button v-if="wizardStep === 1" class="btn btn-primary" :disabled="!destFolder" @click="wizardStep = 2">
          Next
        </button>
        <button v-else-if="wizardStep === 2" class="btn btn-primary" :disabled="!canProceed" @click="startUploadAndShare">
          Upload &amp; Share
        </button>
        <button v-else-if="uploadPhase === 'done' || uploadPhase === 'error'" class="btn btn-secondary" @click="cancel">
          Close
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, inject, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { ArrowUpTrayIcon, ChevronDownIcon } from '@heroicons/vue/24/outline'
import { EyeIcon, EyeSlashIcon } from '@heroicons/vue/20/solid'
import { Switch, Disclosure, DisclosureButton, DisclosurePanel } from '@headlessui/vue'
import { pushNotification, Notification } from '@45drives/houston-common-ui'
import { appLog } from '../composables/useLog'
import { connectionMetaInjectionKey, currentServerInjectionKey } from '../keys/injection-keys'
import { useApi } from '../composables/useApi'
import { useTransferProgress } from '../composables/useTransferProgress'
import { useClientTranscode } from '../composables/useClientTranscode'
import { signalLinkCreated } from '../composables/useLinkRefresh'
import { tourQuickShareOpen, tourQuickShareStep, tourQuickShareShowDone } from '../composables/useQuickShareTour'
import FolderPicker from './FolderPicker.vue'
import AddUsersModal from './modals/AddUsersModal.vue'
import type { Commenter, RsyncProgress } from '../typings/electron'

// Cast to avoid TS plugin resolution issues with global Window augmentation
const electron = window.electron as any

type DroppedFile = { path: string; name: string; size: number }

const route = useRoute()
const { apiFetch } = useApi()
const transfer = useTransferProgress()
const currentServer = inject(currentServerInjectionKey)!
const connectionMeta = inject(connectionMetaInjectionKey)!
const ssh = computed(() => connectionMeta.value.ssh)

// ── Drag state ──
const dragging = ref(false)
let dragCounter = 0

function isConnected() {
  return !!currentServer.value && route.name !== 'server-selection' && route.name !== 'upload-file'
}

// All four drag events live on `document` so the enter/leave counter stays
// balanced regardless of child-element boundary crossings.

function onDocDragEnter(e: DragEvent) {
  if (!isConnected()) return
  if (!e.dataTransfer?.types.includes('Files')) return
  e.preventDefault()
  dragCounter++
  dragging.value = true
}

function onDocDragOver(e: DragEvent) {
  // Must ALWAYS preventDefault on dragover for files, otherwise browser
  // won't fire the drop event at all.
  if (!e.dataTransfer?.types.includes('Files')) return
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
}

function onDocDragLeave(e: DragEvent) {
  // Only count leave events that actually leave the window
  dragCounter--
  if (dragCounter <= 0) {
    dragCounter = 0
    dragging.value = false
  }
}

function onDocDrop(e: DragEvent) {
  e.preventDefault()
  dragging.value = false
  dragCounter = 0

  if (!isConnected()) return
  if (!e.dataTransfer?.files?.length) return

  const files: DroppedFile[] = []
  for (const f of Array.from(e.dataTransfer.files)) {
    // File.path is deprecated in Electron 32+; use webUtils.getPathForFile via preload
    const filePath = electron?.getPathForFile?.(f) || (f as any).path || ''
    if (filePath) {
      files.push({ path: filePath, name: f.name, size: f.size })
    }
  }

  if (!files.length) return
  droppedFiles.value = files
  resetWizard()
  showModal.value = true
}

// ── Document-level drag listeners ──
onMounted(() => {
  document.addEventListener('dragenter', onDocDragEnter)
  document.addEventListener('dragover', onDocDragOver)
  document.addEventListener('dragleave', onDocDragLeave)
  document.addEventListener('drop', onDocDrop)
})
onBeforeUnmount(() => {
  document.removeEventListener('dragenter', onDocDragEnter)
  document.removeEventListener('dragover', onDocDragOver)
  document.removeEventListener('dragleave', onDocDragLeave)
  document.removeEventListener('drop', onDocDrop)
})

// ── Modal state ──
const showModal = ref(false)
const droppedFiles = ref<DroppedFile[]>([])
const wizardStep = ref<1 | 2 | 3>(1)
const busy = ref(false)

// ── Tour / demo mode ──
// When the guided tour opens the Quick Share overlay it sets tourQuickShareOpen.
// We show mock data and drive wizardStep from the tour composable.
const MOCK_FILES: DroppedFile[] = [
  { path: '/home/user/FinalEdit_v3.mp4', name: 'FinalEdit_v3.mp4', size: 1_200_000_000 },
]

const isTourMode = computed(() => tourQuickShareOpen.value)

watch(tourQuickShareOpen, (open) => {
  if (open) {
    droppedFiles.value = MOCK_FILES
    wizardStep.value = tourQuickShareStep.value
    showModal.value = true
  } else {
    showModal.value = false
    droppedFiles.value = []
    wizardStep.value = 1
    uploadPhase.value = 'idle'
  }
})

watch(tourQuickShareStep, (step) => {
  if (!tourQuickShareOpen.value) return
  wizardStep.value = step
  if (step === 3 && tourQuickShareShowDone.value) {
    uploadPhase.value = 'done'
    viewUrl.value = 'https://example.com/s/demo-link-abc123'
  }
})

watch(tourQuickShareShowDone, (done) => {
  if (!tourQuickShareOpen.value || wizardStep.value !== 3) return
  if (done) {
    uploadPhase.value = 'done'
    viewUrl.value = 'https://example.com/s/demo-link-abc123'
  }
})

// Step 1: Destination
const destFolder = ref('')
const projectBase = ref('')

// Step 2: Link options
const expiresValue = ref(1)
const expiresUnit = ref<'hours' | 'days' | 'weeks'>('days')
const linkTitle = ref('')
const usePublicBase = ref(false)
const externalHttpsPort = ref(443)
type AccessMode = 'open' | 'open_password' | 'restricted'
const accessMode = ref<AccessMode>('open')
const password = ref('')
const showPassword = ref(false)
const allowOpenComments = ref(true)
const proxyQualities = ref<string[]>(['original'])

// Restricted users
const userModalOpen = ref(false)
const accessUsers = ref<Commenter[]>([])
const linkContext = { type: 'download' as const }

// Watermark
const watermarkEnabled = ref(false)
type LocalFile = { path: string; name: string; size: number; dataUrl?: string | null }
const watermarkFile = ref<LocalFile | null>(null)
const existingWatermarkFiles = ref<string[]>([])
const selectedExistingWatermark = ref('')
const existingWatermarkPreviewUrl = ref<string | null>(null)

// Step 3: Progress
type UploadPhase = 'idle' | 'uploading' | 'generating' | 'done' | 'error'
const uploadPhase = ref<UploadPhase>('idle')
const perFileProgress = ref<Record<string, number>>({})
const perFileStatus = ref<Record<string, 'waiting' | 'transcoding' | 'uploading' | 'done' | 'error'>>({})
const perFileDetail = ref<Record<string, string>>({})
const viewUrl = ref('')
const errorMsg = ref('')

const currentPhaseLabel = computed(() => {
  const statuses = Object.values(perFileStatus.value)
  if (statuses.includes('transcoding')) return 'Transcoding on your machine…'
  if (statuses.includes('uploading')) return 'Uploading files…'
  return 'Processing files…'
})

const videoExts = new Set([
  'mp4', 'mov', 'm4v', 'mkv', 'webm', 'avi', 'wmv', 'flv',
  'mpg', 'mpeg', 'm2v', '3gp', '3g2', 'mxf', 'ts', 'm2ts', 'mts',
  'ogv', 'vob', 'divx', 'f4v', 'asf', 'rm', 'rmvb', 'm4s',
  'r3d', 'braw', 'ari', 'cine', 'dav',
])

const hasVideo = computed(() =>
  droppedFiles.value.some(f => {
    const ext = f.name.toLowerCase().split('.').pop() || ''
    return videoExts.has(ext)
  })
)

const UNIT_TO_SECONDS = { hours: 3600, days: 86400, weeks: 604800 } as const

const expiresSec = computed(() => {
  const raw = Math.floor(expiresValue.value || 0)
  if (raw <= 0) return 0
  return raw * UNIT_TO_SECONDS[expiresUnit.value]
})

const canProceed = computed(() => {
  if (accessMode.value === 'open_password' && !password.value) return false
  if (accessMode.value === 'restricted' && !accessUsers.value.length) return false
  if (hasVideo.value && proxyQualities.value.length === 0) return false
  if (watermarkEnabled.value && !watermarkFile.value && !selectedExistingWatermark.value) return false
  return true
})

function setPreset(v: number, u: 'hours' | 'days' | 'weeks') {
  expiresValue.value = v
  expiresUnit.value = u
}

function setNever() {
  expiresValue.value = 0
  expiresUnit.value = 'hours'
}

function resetWizard() {
  wizardStep.value = 1
  destFolder.value = ''
  projectBase.value = ''
  expiresValue.value = 1
  expiresUnit.value = 'days'
  linkTitle.value = ''
  linkDefaultsLoaded = false
  usePublicBase.value = false
  accessMode.value = 'open'
  password.value = ''
  showPassword.value = false
  allowOpenComments.value = true
  accessUsers.value = []
  userModalOpen.value = false
  proxyQualities.value = ['original']
  watermarkEnabled.value = false
  watermarkFile.value = null
  selectedExistingWatermark.value = ''
  existingWatermarkFiles.value = []
  existingWatermarkPreviewUrl.value = null
  uploadPhase.value = 'idle'
  perFileProgress.value = {}
  perFileStatus.value = {}
  perFileDetail.value = {}
  viewUrl.value = ''
  errorMsg.value = ''
  busy.value = false
  loadLinkDefaults()
}

function cancel() {
  if (isTourMode.value) return // don't close during guided tour
  if (busy.value && uploadPhase.value === 'uploading') return // don't close during upload
  showModal.value = false
  droppedFiles.value = []
}

watch(accessMode, (mode) => {
  if (mode !== 'open_password') {
    password.value = ''
    showPassword.value = false
  }
})

watch(watermarkEnabled, (enabled) => {
  if (enabled) loadExistingWatermarkFiles()
  if (!enabled) {
    selectedExistingWatermark.value = ''
    existingWatermarkPreviewUrl.value = null
  }
})

watch(selectedExistingWatermark, (v) => {
  if (String(v || '').trim()) {
    watermarkFile.value = null
    fetchExistingWatermarkPreview(v)
  }
})

const watermarkPreviewUrl = computed(() =>
  watermarkFile.value?.dataUrl || existingWatermarkPreviewUrl.value || null
)

function onApplyUsers(users: any[]) {
  const next = users.map((u: any) => {
    const username = (u.username || '').trim()
    const name = (u.name || username).trim()
    const user_email = u.user_email?.trim() || undefined
    const display_color = u.display_color
    const key = (username || name).toLowerCase() + '|' + (user_email || '').toLowerCase()
    return { key, id: u.id, username, name, user_email, display_color, role_id: u.role_id ?? null, role_name: u.role_name ?? null }
  })
  const seen = new Set<string>()
  const dedup: typeof next = []
  for (const c of next) {
    if (seen.has(c.key)) continue
    seen.add(c.key)
    dedup.push(c)
  }
  accessUsers.value = dedup
}

function pickWatermark() {
  electron.pickWatermark().then((f: any) => {
    if (f) {
      watermarkFile.value = f
      selectedExistingWatermark.value = ''
    }
  })
}

function clearWatermark() {
  watermarkFile.value = null
  existingWatermarkPreviewUrl.value = null
  selectedExistingWatermark.value = ''
}

function rootOfServerPath(p: string) {
  const clean = String(p || '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '')
  if (!clean) return '/'
  const first = clean.split('/').filter(Boolean)[0] || ''
  return first ? `/${first}` : '/'
}

function resolveWatermarkStorageRoot() {
  const base = String(projectBase.value || '').trim()
  const root = base || rootOfServerPath(destFolder.value)
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

async function ensureServerDirExists(dir: string) {
  const clean = String(dir || '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '')
  try {
    await apiFetch(`/api/files?dir=${encodeURIComponent(clean || '.')}&dirsOnly=1&ensure=1`, { method: 'GET' })
    return true
  } catch {
    return false
  }
}

async function loadExistingWatermarkFiles() {
  try {
    const dirRel = resolveWatermarkDirRel()
    const data = await apiFetch(`/api/files?dir=${encodeURIComponent(dirRel)}`, { method: 'GET' })
    const entries = Array.isArray(data?.entries) ? data.entries : []
    existingWatermarkFiles.value = entries
      .filter((e: any) => !e?.isDir && typeof e?.name === 'string' && String(e.name).trim())
      .map((e: any) => `${dirRel}/${String(e.name).trim()}`)
      .sort((a: string, b: string) => a.localeCompare(b))
  } catch {
    existingWatermarkFiles.value = []
  }
}

async function fetchExistingWatermarkPreview(relPath: string) {
  try {
    const base = connectionMeta.value.apiBase ?? ''
    const token = connectionMeta.value.token ?? ''
    const url = `${base}/api/files/watermark-preview?path=${encodeURIComponent(relPath)}`
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

async function uploadWatermarkToProject() {
  if (!watermarkFile.value) return { ok: false, error: 'no watermark file' }
  const host = ssh.value?.server
  const user = ssh.value?.username
  if (!host || !user) return { ok: false, error: 'missing ssh connection info' }

  const destDir = resolveWatermarkUploadDir()
  const ensured = await ensureServerDirExists(destDir)
  if (!ensured) return { ok: false, error: 'failed to prepare remote watermark directory' }
  const { done } = await electron.rsyncStart({
    host,
    user,
    src: watermarkFile.value.path,
    destDir,
    port: ssh.value?.port ?? 22,
    keyPath: undefined,
    noIngest: true,
  })
  const res = await done
  if (!res?.ok) return { ok: false, error: res?.error || 'watermark upload failed' }
  return { ok: true, relPath: resolveWatermarkRelPath() }
}

let linkDefaultsLoaded = false

async function loadLinkDefaults() {
  try {
    const s = await apiFetch('/api/settings', { method: 'GET' })
    const isInternal = s?.defaultLinkAccess === 'internal'
    usePublicBase.value = !isInternal
    externalHttpsPort.value = Number(s?.externalHttpsPort ?? 443)
  } catch {
    usePublicBase.value = false
  }
  linkDefaultsLoaded = true
}

watch(usePublicBase, (isExternal) => {
  if (isExternal && linkDefaultsLoaded) {
    const port = externalHttpsPort.value || 443
    pushNotification(
      new Notification(
        'Port Forwarding Required',
        `External sharing requires port forwarding to your configured HTTPS port (${port}). You can change this port in Settings → URLs & Access.`,
        'info',
        8000
      )
    )
  }
})

function formatSize(bytes: number) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + units[i]
}

function joinPath(dir: string, name: string) {
  const d = String(dir || '').replace(/\/+$/, '')
  const n = String(name || '').replace(/^\/+/, '')
  return (d || '/') + '/' + n
}

// ── Upload & Share ──
async function startUploadAndShare() {
  if (!canProceed.value) return
  busy.value = true
  wizardStep.value = 3
  uploadPhase.value = 'uploading'
  perFileProgress.value = Object.fromEntries(droppedFiles.value.map(f => [f.path, 0]))
  perFileStatus.value = Object.fromEntries(droppedFiles.value.map(f => [f.path, 'waiting']))
  perFileDetail.value = {}

  const host = ssh.value?.server
  const user = ssh.value?.username
  const port = ssh.value?.port ?? 22

  if (!host || !user) {
    uploadPhase.value = 'error'
    errorMsg.value = 'SSH connection info missing. Please reconnect.'
    busy.value = false
    return
  }

  const destDir = `/${(destFolder.value || '').replace(/^\/+/, '')}` || '/'

  try {
    // Suppress transfer dock auto-open for quick share uploads
    transfer.state.suppressAutoOpen = true

    // Upload all files sequentially
    const serverPaths: string[] = []
    let anyClientTranscoded = false
    let clientAppliedWatermark = false
    const { enabled: clientTranscodeEnabled, preset: transcodePreset, hwAccel: hwAccelSetting } = useClientTranscode()
    
    // Resolve watermark image path for client-side transcoding
    let localWatermarkPath: string | null = null
    if (watermarkEnabled.value && clientTranscodeEnabled.value) {
      if (watermarkFile.value?.path) {
        // User picked a local watermark image
        localWatermarkPath = watermarkFile.value.path
      } else if (selectedExistingWatermark.value) {
        // Download the server-side watermark to a local temp file
        const downloaded = await window.electron.downloadWatermark({
          apiBase: connectionMeta.value.apiBase || '',
          token: connectionMeta.value.token || '',
          relPath: selectedExistingWatermark.value,
        })
        localWatermarkPath = downloaded || null
      }
    }

    for (let i = 0; i < droppedFiles.value.length; i++) {
      const f = droppedFiles.value[i]
      let uploadedFileName = f.name  // Track actual uploaded filename
      const fileDestAbs = joinPath(destDir, f.name)

      perFileProgress.value[f.path] = 0
      perFileStatus.value[f.path] = 'waiting'
      perFileDetail.value[f.path] = ''

      const taskId = transfer.createUploadTask({
        title: `Quick share: ${f.name}`,
        detail: destDir,
        cancel: () => {},
        context: { source: 'upload', destDir, file: fileDestAbs },
      })

      // Determine if this is a video file and if we should transcode client-side
      const videoExts = new Set(['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'wmv', 'mxf', 'mts', 'm2ts', 'mod', 'tod', 'vob', 'f4v', 'asf', 'rm', 'rmvb', 'ts', 'ogv', '3gp', '3g2', 'mj2', 'm4v', 'qt', 'dv', 'divx', 'hevc', 'h264', 'h265', 'vp8', 'vp9', 'av1', 'dnxhd', 'prores', 'r3d', 'braw', 'ari', 'cine', 'dav'])
      const fileExt = String(f.name || '').toLowerCase().split('.').pop() || ''
      const isVideo = videoExts.has(fileExt)
      const shouldTranscodeClient = isVideo && clientTranscodeEnabled.value && hasVideo.value

      let fileToUpload = f.path
      let clientTranscoded = false

      // Transcode if needed
      if (shouldTranscodeClient) {
        const transcodeQuality = proxyQualities.value.includes('original') ? 'original' : proxyQualities.value[0] || '720p'
        perFileStatus.value[f.path] = 'transcoding'
        perFileDetail.value[f.path] = 'Preparing transcode…'
        
        try {
          transfer.updateUpload(taskId, {
            detail: 'Transcoding locally…',
          })

          const { jobId, done } = await window.electron.transcodeStart(
            {
              inputPath: f.path,
              quality: transcodeQuality as 'original' | '1080p' | '720p',
              outputFormat: 'mp4',
              useHardwareAccel: hwAccelSetting.value,
              preset: transcodePreset.value,
              watermarkPath: localWatermarkPath || undefined,
            },
            (progress) => {
              perFileProgress.value[f.path] = progress.percent
              perFileDetail.value[f.path] = `Transcoding: ${progress.fps} fps @ ${progress.speed} — ETA ${progress.eta}`
              transfer.updateUpload(taskId, {
                progress: progress.percent,
                detail: `Transcoding: ${progress.fps}fps @ ${progress.speed} - ETA ${progress.eta}`,
              })
            }
          )

          const result = await done
          if (result?.ok && result?.outputPath) {
            fileToUpload = result.outputPath
            clientTranscoded = true
            anyClientTranscoded = true
            if (localWatermarkPath) clientAppliedWatermark = true
            // Update filename to match transcoded output (always .mp4)
            uploadedFileName = f.name.replace(/\.[^.]+$/, '.mp4')
            perFileProgress.value[f.path] = 0
            perFileStatus.value[f.path] = 'uploading'
            perFileDetail.value[f.path] = 'Uploading…'
            transfer.updateUpload(taskId, {
              detail: 'Uploading…',
              progress: 0,
            })
          } else {
            const errorMsg = result?.error || 'Transcode failed — try disabling client-side transcoding in Settings to let the server handle it.'
            perFileStatus.value[f.path] = 'error'
            perFileDetail.value[f.path] = `Error: ${errorMsg}`
            transfer.finishUpload(taskId, false, `Transcode error: ${errorMsg}`)
            throw new Error(errorMsg)
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err)
          perFileStatus.value[f.path] = 'error'
          perFileDetail.value[f.path] = `Error: ${errorMsg}`
          pushNotification(
            new Notification(
              'Transcode Failed',
              `${f.name}: ${errorMsg}\n\nTip: You can disable client-side transcoding in Settings → Performance to let the server handle it instead.`,
              'error',
              12000
            )
          )
          throw err
        }
      } else {
        perFileStatus.value[f.path] = 'uploading'
        perFileDetail.value[f.path] = 'Uploading…'
      }

      const { done } = await electron.rsyncStart(
        {
          host,
          user,
          src: fileToUpload,
          destDir,
          port,
          keyPath: undefined,
          transcodeProxy: hasVideo.value && !clientTranscoded, // Skip server transcode if we transcoded client-side
          proxyQualities: hasVideo.value && !clientTranscoded ? proxyQualities.value.slice() : undefined,
          apiToken: connectionMeta.value.token || undefined,
          clientTranscoded, // Tell server we transcoded client-side
        },
        (p: { percent?: number; bytesTransferred?: number; raw?: string; rate?: string; eta?: string }) => {
          let pct: number | undefined =
            typeof p.percent === 'number' && !Number.isNaN(p.percent) ? p.percent : undefined
          if (pct === undefined && typeof p.bytesTransferred === 'number' && f.size > 0) {
            pct = (p.bytesTransferred / f.size) * 100
          }
          if (pct === undefined && typeof p.raw === 'string') {
            const m = p.raw.match(/(\d+(?:\.\d+)?)%/)
            if (m) pct = parseFloat(m[1])
          }
          const filePct = pct ?? 0
          perFileProgress.value[f.path] = filePct
          perFileDetail.value[f.path] = p.rate ? `Uploading: ${p.rate}${p.eta ? ' — ETA ' + p.eta : ''}` : 'Uploading…'
          transfer.updateUpload(taskId, {
            status: 'uploading',
            progress: filePct,
            speed: p.rate ?? null,
            eta: p.eta ?? null,
          })
        }
      )

      const res = await done
      if (!res?.ok) {
        perFileStatus.value[f.path] = 'error'
        perFileDetail.value[f.path] = res?.error || 'Upload failed'
        transfer.finishUpload(taskId, false, res?.error || 'Upload failed')
        throw new Error(res?.error || `Upload failed for ${f.name}`)
      }
      transfer.finishUpload(taskId, true)
      perFileProgress.value[f.path] = 100
      perFileStatus.value[f.path] = 'done'
      perFileDetail.value[f.path] = 'Complete'

      // Add server path using the actual uploaded filename
      serverPaths.push(joinPath(destDir, uploadedFileName))
    }

    // Upload watermark if needed
    let watermarkRelPath = ''
    if (watermarkEnabled.value && hasVideo.value) {
      const selectedServerWm = String(selectedExistingWatermark.value || '').trim()
      if (selectedServerWm) {
        watermarkRelPath = selectedServerWm
      } else if (watermarkFile.value) {
        const wmUp = await uploadWatermarkToProject()
        if (!wmUp.ok) {
          uploadPhase.value = 'error'
          errorMsg.value = wmUp.error || 'Watermark upload failed.'
          busy.value = false
          return
        }
        watermarkRelPath = (wmUp as any).relPath || ''
      }
    }

    // Generate share link
    uploadPhase.value = 'generating'

    const body: any = {
      expiresInSeconds: expiresSec.value,
      projectBase: projectBase.value || undefined,
      baseMode: usePublicBase.value ? 'externalPreferred' : 'local',
      title: linkTitle.value || undefined,
      generateReviewProxy: hasVideo.value && !anyClientTranscoded,
      hls: hasVideo.value,
      clientTranscoded: anyClientTranscoded || undefined,
    }

    if (serverPaths.length === 1) body.filePath = serverPaths[0]
    else body.filePaths = serverPaths

    if (accessMode.value === 'open_password' && password.value) {
      body.password = password.value
    }

    body.access_mode = accessMode.value === 'restricted' ? 'restricted' : 'open'
    body.auth_mode = accessMode.value === 'open_password' ? 'password' : 'none'

    if (accessMode.value !== 'restricted') {
      body.allow_comments = !!allowOpenComments.value
    }

    if (accessMode.value === 'restricted' && accessUsers.value.length) {
      body.users = accessUsers.value.map(c => {
        const out: any = {}
        if (c.id != null) out.userId = c.id
        if (c.username) out.username = c.username
        if (c.user_email) out.user_email = c.user_email
        if (c.name) out.name = c.name
        if (c.role_id != null) out.roleId = c.role_id
        if (c.role_name) out.roleName = c.role_name
        return out
      })
    }

    if (hasVideo.value) {
      body.proxyQualities = proxyQualities.value.length > 0 ? proxyQualities.value.slice() : ['original']
    }

    if (watermarkEnabled.value && watermarkRelPath && !clientAppliedWatermark) {
      body.watermark = true
      body.watermarkFile = watermarkRelPath
      body.watermarkProxyQualities = proxyQualities.value.slice()
    }

    // If client applied the watermark, tell the server so it doesn't re-watermark
    if (clientAppliedWatermark) {
      body.clientWatermarked = true
    }

    // Reuse existing transcodes instead of failing with outputs_exist;
    // the server will still queue any missing quality variants.
    body.keepExistingOutputs = true

    const data = await apiFetch('/api/magic-link', {
      method: 'POST',
      body: JSON.stringify(body),
      timeoutMs: 5 * 60 * 1000,
    })

    viewUrl.value = data.viewUrl || ''
    uploadPhase.value = 'done'
    signalLinkCreated()

    // ── Start transcode tracking in the TransferDock ──
    if (hasVideo.value) {
      const token = extractLinkToken(data)
      const fileRecords: any[] = Array.isArray(data?.files) ? data.files : []
      const transcodeRecords: any[] = Array.isArray(data?.transcodes) ? data.transcodes : []

      // Build lookup of which job kinds are queued/active per assetVersionId
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
        const context = { source: 'upload' as const, linkUrl: data.viewUrl, file: filePath }

        const alreadyTrackingHls = transfer.hasActiveTranscode({
          assetVersionIds: [assetVersionId],
          file: filePath,
          jobKind: 'hls',
        })
        const alreadyTrackingProxy = transfer.hasActiveTranscode({
          assetVersionIds: [assetVersionId],
          file: filePath,
          jobKind: 'proxy_mp4',
        })

        if (hlsActive && canUsePlayback && !alreadyTrackingHls) {
          transfer.startPlaybackTranscodeTask({
            title: `Transcoding: ${displayName}`,
            detail: 'HLS stream',
            intervalMs: 1500,
            jobKind: 'hls',
            context,
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

        if (proxyActive && canUsePlayback && !alreadyTrackingProxy) {
          transfer.startPlaybackTranscodeTask({
            title: `Transcoding: ${displayName}`,
            detail: 'Review copy',
            intervalMs: 1500,
            jobKind: 'proxy_mp4',
            context,
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
      }
    }

    pushNotification(
      new Notification(
        'Quick Share Ready',
        `Link created for ${droppedFiles.value.length === 1 ? droppedFiles.value[0].name : `${droppedFiles.value.length} files`}.`,
        'success',
        6000
      )
    )
    appLog.info('quick_share.completed', { fileCount: droppedFiles.value.length, mode: usePublicBase.value ? 'external' : 'local' })
  } catch (e: any) {
    uploadPhase.value = 'error'
    errorMsg.value = e?.message || 'Upload or link generation failed.'
    appLog.error('quick_share.failed', { error: errorMsg.value })
    pushNotification(
      new Notification('Quick Share Failed', errorMsg.value, 'error', 8000)
    )
  } finally {
    transfer.state.suppressAutoOpen = false
    busy.value = false
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

function copyLink() {
  if (!viewUrl.value) return
  navigator.clipboard.writeText(viewUrl.value).then(() => {
    pushNotification(new Notification('Link Copied', 'Share link copied to clipboard.', 'success', 3000))
  })
}

function openInBrowser() {
  if (!viewUrl.value) return
  window.open(viewUrl.value, '_blank')
}
</script>

<style scoped>
.qs-lane {
  border: 1px solid color-mix(in srgb, var(--btn-primary-bg) 25%, #585867);
  border-radius: 0.8rem;
  padding: 0.8rem;
  overflow: hidden;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--btn-primary-bg) 9%, transparent), transparent 58%);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, white 3%, transparent);
}

.qs-fade-enter-active,
.qs-fade-leave-active {
  transition: opacity 0.2s ease;
}
.qs-fade-enter-from,
.qs-fade-leave-to {
  opacity: 0;
}
</style>
