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

  <!-- Minimized floating bar -->
  <Transition name="qs-fade">
    <div v-if="showModal && minimized" class="fixed bottom-4 right-4 z-[2200] flex items-center gap-3 bg-accent border border-default rounded-lg shadow-xl px-4 py-3 cursor-pointer select-none hover:bg-well/40 transition" @click="minimized = false">
      <ArrowUpTrayIcon class="w-5 h-5 text-primary shrink-0" />
      <div class="flex flex-col min-w-0">
        <span class="text-sm font-semibold truncate">Quick Share</span>
        <span class="text-xs text-muted truncate">
          {{ uploadPhase === 'uploading' ? 'Uploading…' : uploadPhase === 'generating' ? 'Generating link…' : uploadPhase === 'done' ? 'Done — click to view link' : uploadPhase === 'error' ? 'Error' : `${droppedFiles.length} file(s)` }}
        </span>
      </div>
      <progress v-if="uploadPhase === 'uploading'" class="w-24 h-1.5 rounded-lg overflow-hidden [&::-webkit-progress-value]:bg-primary [&::-moz-progress-bar]:bg-primary" :value="overallProgress" max="100" />
    </div>
  </Transition>

  <!-- Modal: shown after files are dropped -->
  <div v-if="showModal && !minimized" class="fixed inset-0 z-[2100] flex items-center justify-center">
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
          Upload {{ droppedFiles.length === 1 ? `"${droppedFiles[0].name}"` : `${droppedFiles.length} files` }} to server
          <span v-if="activeConnection" class="text-sm text-muted font-normal ml-2">
            ({{ activeConnection.name }})
          </span>
        </h2>
        <div class="flex items-center gap-2">
          <button class="btn btn-secondary flex items-center gap-1" @click="minimized = true" title="Minimize">
            <MinusIcon class="w-4 h-4" />
          </button>
          <button class="btn btn-secondary" @click="cancel" :disabled="busy">Close</button>
        </div>
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
          :key="destPickerKey"
          v-model="destFolder"
          :apiFetch="apiFetch"
          useCase="upload"
          subtitle="Choose where to upload on the server."
          :auto-detect-roots="!activeProject"
          :allow-entire-tree="!activeProject"
          :hide-project-controls="!!activeProject"
          :startDir="activeProject?.root_dir || undefined"
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
            <button type="button" @click="showPortFwdModal = true" class="text-xs text-primary hover:underline whitespace-nowrap">
              Learn how to set up port forwarding
            </button>
          </div>
        </div>

        <!-- ── Summary of current settings ── -->
        <div class="text-xs text-muted flex flex-wrap gap-x-4 gap-y-1">
          <span>Access: {{ accessMode === 'open' ? 'Anyone' : accessMode === 'open_password' ? 'Password' : `${accessUsers.length} user(s)${accessGroups.length ? `, ${accessGroups.length} group(s)` : ''}` }}</span>
          <span v-if="hasVideo">Review Copies: {{ proxyQualities.join(', ') || 'none' }}</span>
          <span v-if="hasMedia">Watermark: {{ watermarkEnabled ? 'on' : 'off' }}</span>
        </div>

        <!-- ── Advanced Options (collapsible) ── -->
        <Disclosure v-slot="{ open }" as="div" class="border border-default rounded-lg bg-default" data-tour="qs-advanced">
          <DisclosureButton class="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left rounded-lg hover:bg-well/30 transition" data-tour="qs-advanced-btn">
            <div class="min-w-0">
              <span class="font-semibold text-sm">Advanced Options</span>
              <span class="text-xs text-muted ml-2">Title, access control{{ hasMedia ? ', media options' : '' }}</span>
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
            <LinkAccessMode
              v-model="accessMode"
              v-model:password="password"
              v-model:showPassword="showPassword"
              v-model:allowOpenComments="allowOpenComments"
              :accessCount="accessUsers.length"
              :accessSatisfied="accessUsers.length > 0"
              dataTour="qs-access-mode"
              radioName="qs-access-mode"
              :compact="true"
              :showSummary="false"
              @openUserModal="userModalOpen = true"
            />

            <!-- Video/Image options (shown for media files) -->
            <VideoOptionsPanel
              v-if="hasMedia"
              v-model:proxyQualities="proxyQualities"
              v-model:watermarkEnabled="watermarkEnabled"
              v-model:selectedExistingWatermark="selectedExistingWatermark"
              v-model:showDefaultWatermarks="showDefaultWatermarks"
              :watermarkFile="watermarkFile"
              :existingWatermarkFiles="existingWatermarkFiles"
              :effectiveWatermarkName="watermarkFile ? watermarkFile.name : (selectedExistingWatermark ? selectedExistingWatermark.split('/').pop() || '' : '')"
              dataTour="qs-video-options"
              :compact="true"
              :watermarkLabel="hasVideo ? 'Watermark Videos' : 'Watermark Images'"
              :watermarkStatusText="watermarkEnabled ? 'On' : 'Off'"
              :hideProxyQualities="!hasVideo"
              @pickWatermark="pickWatermark"
              @clearWatermark="clearWatermark"
              @refreshWatermarks="loadExistingWatermarkFiles"
            />

            <!-- Premium Watermark Customization -->
            <div v-if="hasMedia && watermarkEnabled && (watermarkFile || selectedExistingWatermark)" class="mt-3 border-t border-default pt-3">
              <WatermarkCustomizer v-if="isPremiumActive"
                v-model="watermarkSettings" 
                :watermarkPreviewUrl="watermarkPreviewUrl"
                :isPremium="isServerLicensed"
              />
              <WatermarkPreview v-else
                :previewUrl="watermarkPreviewUrl"
                label="Watermark (bottom-right)"
              />
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
          }))"
          :preselectedGroups="accessGroups"
          @apply="onApplyUsers" />
      </section>

      <PortForwardingModal v-if="showPortFwdModal" @close="showPortFwdModal = false" />

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
import { ref, computed, inject, watch, onMounted, onBeforeUnmount, toRaw } from 'vue'
import { useRoute } from 'vue-router'
import { ArrowUpTrayIcon, ChevronDownIcon, MinusIcon } from '@heroicons/vue/24/outline'
import { Disclosure, DisclosureButton, DisclosurePanel } from '@headlessui/vue'
import { pushNotification, Notification } from '@45drives/houston-common-ui'
import { appLog } from '../composables/useLog'
import { connectionMetaInjectionKey, currentServerInjectionKey } from '../keys/injection-keys'
import { useApi } from '../composables/useApi'
import { useConnections } from '../composables/useConnections'
import { useActiveProject } from '../composables/useActiveProject'
import { useProjectMode } from '../composables/useProjectMode'
import { useTransferProgress } from '../composables/useTransferProgress'
import { useClientTranscode } from '../composables/useClientTranscode'
import { useUploadTranscode } from '../composables/useUploadTranscode'
import { signalLinkCreated } from '../composables/useLinkRefresh'
import { tourQuickShareOpen, tourQuickShareStep, tourQuickShareShowDone, quickShareOverlayOpen } from '../composables/useQuickShareTour'
import { useTourManager, type TourStep } from '../composables/useTourManager'
import { useOnboarding } from '../composables/useOnboarding'
import FolderPicker from './FolderPicker.vue'
import AddUsersModal from './modals/AddUsersModal.vue'
import PortForwardingModal from './modals/PortForwardingModal.vue'
import LinkAccessMode from './LinkAccessMode.vue'
import VideoOptionsPanel from './VideoOptionsPanel.vue'
import WatermarkCustomizer from './WatermarkCustomizer.vue'
import WatermarkPreview from './WatermarkPreview.vue'
import { useLicenseStatus } from '../composables/useLicenseStatus'
import type { WatermarkSettings } from '../types/watermark'
import { createDefaultWatermarkSettings, DEFAULT_45FLOW_WATERMARKS } from '../types/watermark'
import type { Commenter, RsyncProgress } from '../typings/electron'

// Cast to avoid TS plugin resolution issues with global Window augmentation
const electron = window.electron as any

type DroppedFile = { path: string; name: string; size: number }

const route = useRoute()
const { apiFetch } = useApi()
const { activeConnection } = useConnections()
const { activeProject: rawActiveProject } = useActiveProject()
const { projectModeEnabled } = useProjectMode()
const activeProject = computed(() => projectModeEnabled.value ? rawActiveProject.value : null)
const transfer = useTransferProgress()
const currentServer = inject(currentServerInjectionKey)!
const connectionMeta = inject(connectionMetaInjectionKey)!
const ssh = computed(() => connectionMeta.value.ssh)
const isServerLicensed = computed(() => activeConnection.value?.licensed !== false)
const { isPremiumActive } = useLicenseStatus()

// ── Tour ──
const { requestTour } = useTourManager()
const { onboarding, markDone } = useOnboarding()

/** Cleanup helper — reset all Quick Share tour state */
function cleanupQuickShareTour() {
  tourQuickShareShowDone.value = false
  tourQuickShareStep.value = 1
  tourQuickShareOpen.value = false
}

const quickShareTourSteps = computed<TourStep[]>(() => [
  // ── Quick Share Step 1: Modal overview ──
  {
    target: '[data-tour="qs-modal"]',
    message: 'This is the Quick Share screen.\n\nWhen you drop files onto 45Flow from most screens, this wizard opens automatically. It walks you through uploading files to the server and generating a share link — all in three quick steps.\n\nThe file list at the top shows what you dropped. Here we\'re using a sample file for the tour.',
    beforeShow: () => {
      tourQuickShareStep.value = 1
      tourQuickShareShowDone.value = false
      tourQuickShareOpen.value = true
    },
  },
  // ── Quick Share Step 1: Step indicator ──
  {
    target: '[data-tour="qs-steps"]',
    message: 'The step indicator shows your progress.\n\nStep 1 is Destination — choose where on the server to upload. Step 2 is Link Options — set expiry, access, and video settings. Step 3 is Upload & Share — monitor the upload and grab your link.',
    beforeShow: () => {
      tourQuickShareStep.value = 1
      tourQuickShareOpen.value = true
    },
  },
  // ── Quick Share Step 1: Destination picker ──
  {
    target: '[data-tour="qs-step-destination"]',
    message: 'In Step 1, you pick a destination folder on the server.\n\nUse the folder browser to navigate your project directories. Once you\'ve selected a folder, click Next to continue.',
    beforeShow: () => {
      tourQuickShareStep.value = 1
      tourQuickShareOpen.value = true
    },
  },
  // ── Quick Share Step 2: Link Options overview ──
  {
    target: '[data-tour="qs-step-options"]',
    message: 'Step 2 is where you configure your share link before uploading.\n\nLet\'s walk through each option.',
    beforeShow: () => {
      tourQuickShareOpen.value = true
      tourQuickShareStep.value = 2
    },
  },
  // ── Quick Share Step 2: Expiry ──
  {
    target: '[data-tour="qs-expiry"]',
    message: 'Set how long the link stays active.\n\nType a custom value or use the quick presets — 1 hour, 1 day, 1 week, or Never for a permanent link.',
    beforeShow: () => {
      tourQuickShareOpen.value = true
      tourQuickShareStep.value = 2
    },
  },
  // ── Quick Share Step 2: Network ──
  {
    target: '[data-tour="qs-network"]',
    message: 'Choose the network for your share link.\n\nLocal (LAN) generates an internal URL for your network. External (Internet) uses your public domain or IP so anyone outside your network can access it (this requires port forwarding to be set up to your server).\n\nClick "Learn how to set up port forwarding" to see detailed setup instructions.',
    beforeShow: () => {
      tourQuickShareOpen.value = true
      tourQuickShareStep.value = 2
    },
  },
  // ── Quick Share Step 2: Advanced Options ──
  {
    target: '[data-tour="qs-advanced-panel"]',
    message: 'The Advanced Options panel gives you finer control over your link.\n\nLet\'s go through each setting.',
    beforeShow: async () => {
      tourQuickShareOpen.value = true
      tourQuickShareStep.value = 2
      await new Promise(r => setTimeout(r, 100))
      const btn = document.querySelector<HTMLElement>('[data-tour="qs-advanced-btn"]')
      const panel = document.querySelector('[data-tour="qs-advanced-panel"]')
      if (btn && !panel) btn.click()
    },
  },
  // ── Quick Share Step 2: Link Title ──
  {
    target: '[data-tour="qs-link-title"]',
    message: 'Give your link a descriptive title.\n\nThis is optional but helps you identify the link later in the dashboard.',
    beforeShow: async () => {
      tourQuickShareOpen.value = true
      tourQuickShareStep.value = 2
      await new Promise(r => setTimeout(r, 100))
      const btn = document.querySelector<HTMLElement>('[data-tour="qs-advanced-btn"]')
      const panel = document.querySelector('[data-tour="qs-advanced-panel"]')
      if (btn && !panel) btn.click()
    },
  },
  // ── Quick Share Step 2: Access Mode ──
  {
    target: '[data-tour="qs-access-mode"]',
    message: isPremiumActive.value
      ? 'Control who can access your shared files.\n\n• Anyone with the link — no sign-in needed.\n• Password protected — recipients enter a shared password.\n• Invited users and groups only — only specific user accounts and groups can access it.\n\nComments can be toggled for open and password-protected links (Pro feature).'
      : 'Control who can access your shared files.\n\n• Anyone with the link — no sign-in needed.\n• Password protected — recipients enter a shared password.\n• Invited users and groups only — only specific user accounts and groups can access it.',
    beforeShow: async () => {
      tourQuickShareOpen.value = true
      tourQuickShareStep.value = 2
      await new Promise(r => setTimeout(r, 100))
      const btn = document.querySelector<HTMLElement>('[data-tour="qs-advanced-btn"]')
      const panel = document.querySelector('[data-tour="qs-advanced-panel"]')
      if (btn && !panel) btn.click()
    },
  },
  // ── Quick Share Step 2: Video Options ──
  {
    target: '[data-tour="qs-video-options"]',
    message: isPremiumActive.value
      ? 'When sharing video or image files, media processing options appear here.\n\nFor video:\n• A browser stream is created so recipients can watch immediately — no download needed.\n• Review copies (720p, 1080p, or full-res MP4s) are generated for offline download and editing.\n\nFor images and video:\n• Watermarks can be overlaid with full customization — position, size, opacity, and tiling (Pro).\n\nWith client-side transcoding enabled (Settings → Performance), video processing happens on your machine before upload — using your local CPU or GPU.'
      : 'When sharing video or image files, media processing options appear here.\n\nFor video:\n• A browser stream is created so recipients can watch immediately — no download needed.\n• Review copies (720p, 1080p, or full-res MP4s) are generated for offline download and editing.\n\nFor images and video:\n• A basic watermark can be applied (bottom-right). Upgrade to Pro for full customization of position, size, and opacity.\n\nWith client-side transcoding enabled (Settings → Performance), video processing happens on your machine before upload — using your local CPU or GPU.',
    beforeShow: async () => {
      tourQuickShareOpen.value = true
      tourQuickShareStep.value = 2
      await new Promise(r => setTimeout(r, 100))
      const btn = document.querySelector<HTMLElement>('[data-tour="qs-advanced-btn"]')
      const panel = document.querySelector('[data-tour="qs-advanced-panel"]')
      if (btn && !panel) btn.click()
    },
  },
  // ── Quick Share Step 3: Upload & Share (done state) ──
  {
    target: '[data-tour="qs-step-upload"]',
    message: 'Step 3 handles the upload and link generation.\n\nYou\'ll see per-file progress bars while files transfer, then your share link appears with Copy and Open buttons. That\'s it — Quick Share in three steps!',
    beforeShow: () => {
      tourQuickShareOpen.value = true
      tourQuickShareStep.value = 3
      tourQuickShareShowDone.value = true
    },
  },
])

/** Pending real files to open after the tour finishes */
let pendingDropFiles: DroppedFile[] = []

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

  if (!onboarding.value.quickShareTourDone) {
    // First drop — run the Quick Share tour first, then open the real modal
    // But only if tours are enabled; otherwise skip straight to modal
    pendingDropFiles = files
    const tourShown = requestTour('quickShare', quickShareTourSteps.value, () => {
      markDone('quickShareTourDone')
      const realFiles = pendingDropFiles
      pendingDropFiles = []
      tourQuickShareShowDone.value = false
      tourQuickShareStep.value = 1
      droppedFiles.value = realFiles.length ? realFiles : []
      wizardStep.value = 1
      uploadPhase.value = 'idle'
      viewUrl.value = ''
      tourQuickShareOpen.value = false
      showModal.value = realFiles.length > 0
    })
    // If requestTour actually started the tour, wait for it to finish
    if (tourShown !== false) return
    // Tours disabled — mark done and fall through
    markDone('quickShareTourDone')
    pendingDropFiles = []
  }

  droppedFiles.value = files
  resetWizard()
  showModal.value = true
}

// ── Document-level drag listeners ──
onMounted(async () => {
  document.addEventListener('dragenter', onDocDragEnter)
  document.addEventListener('dragover', onDocDragOver)
  document.addEventListener('dragleave', onDocDragLeave)
  document.addEventListener('drop', onDocDrop)
  
  await loadDefaultWatermarkSettings()
})
onBeforeUnmount(() => {
  document.removeEventListener('dragenter', onDocDragEnter)
  document.removeEventListener('dragover', onDocDragOver)
  document.removeEventListener('dragleave', onDocDragLeave)
  document.removeEventListener('drop', onDocDrop)
})

// ── Modal state ──
const showModal = ref(false)
watch(showModal, (v) => { quickShareOverlayOpen.value = v })
const minimized = ref(false)
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
  } else if (!droppedFiles.value.length) {
    // Only reset if no real files were loaded (i.e. tour was cancelled, not completed)
    showModal.value = false
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
const destPickerKey = ref(0)

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
const showPortFwdModal = ref(false)
const accessUsers = ref<Commenter[]>([])
const accessGroups = ref<{ id: number; name: string; member_count?: number; display_color?: string | null; role_id: number | null; role_name: string | null }[]>([])
const linkContext = { type: 'download' as const }

// Watermark
const watermarkEnabled = ref(false)
type LocalFile = { path: string; name: string; size: number; dataUrl?: string | null }
const watermarkFile = ref<LocalFile | null>(null)
const watermarkSettings = ref<WatermarkSettings>(createDefaultWatermarkSettings())
const showDefaultWatermarks = ref(true)
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

const overallProgress = computed(() => {
  const vals = Object.values(perFileProgress.value)
  if (!vals.length) return 0
  return vals.reduce((a, b) => a + b, 0) / vals.length
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

const hasVideo = computed(() =>
  droppedFiles.value.some(f => {
    const ext = f.name.toLowerCase().split('.').pop() || ''
    return videoExts.has(ext)
  })
)

const hasImage = computed(() =>
  droppedFiles.value.some(f => {
    const ext = f.name.toLowerCase().split('.').pop() || ''
    return imageExts.has(ext)
  })
)

const hasMedia = computed(() => hasVideo.value || hasImage.value)

const UNIT_TO_SECONDS = { hours: 3600, days: 86400, weeks: 604800 } as const

const expiresSec = computed(() => {
  const raw = Math.floor(expiresValue.value || 0)
  if (raw <= 0) return 0
  return raw * UNIT_TO_SECONDS[expiresUnit.value]
})

const canProceed = computed(() => {
  if (accessMode.value === 'open_password' && !password.value) return false
  if (accessMode.value === 'restricted' && !accessUsers.value.length && !accessGroups.value.length) return false
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
  minimized.value = false
  destFolder.value = ''
  projectBase.value = ''
  destPickerKey.value++
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
  accessGroups.value = []
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
  void loadDefaultWatermarkSettings()
}

function cancel() {
  if (isTourMode.value) return // don't close during guided tour
  if (busy.value && uploadPhase.value === 'uploading') return // don't close during upload
  showModal.value = false
  minimized.value = false
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
  // Don't clear selectedExistingWatermark when disabled - preserve default selection
})

watch(showDefaultWatermarks, () => {
  void loadExistingWatermarkFiles()
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

function onApplyUsers(users: any[], groups?: any[]) {
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
  accessGroups.value = groups || []
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

/** Convert a watermark ID (e.g. '45flow-grad') to the path the dropdown/server expects */
function resolveWatermarkPathForApi(idOrPath: string) {
  const builtin = DEFAULT_45FLOW_WATERMARKS.find(wm => wm.id === idOrPath)
  if (builtin) return builtin.path
  return idOrPath
}

async function loadDefaultWatermarkSettings() {
  try {
    const settings = await apiFetch('/api/settings')
    if (settings?.defaultWatermarkId) {
      // Apply watermark customization settings if available (premium feature)
      if (settings.defaultWatermarkSettings && typeof settings.defaultWatermarkSettings === 'object') {
        watermarkSettings.value = { ...createDefaultWatermarkSettings(), ...settings.defaultWatermarkSettings }
      }
      
      // Load list first so dropdown has options
      await loadExistingWatermarkFiles()
      // Convert ID to path so it matches dropdown values
      const resolvedPath = resolveWatermarkPathForApi(settings.defaultWatermarkId)
      selectedExistingWatermark.value = resolvedPath
      // Only enable if there are video files
      if (hasVideo.value) {
        watermarkEnabled.value = true
      }
      
      // Load the preview for the selected watermark
      await fetchExistingWatermarkPreview(resolvedPath)
    } else {
      // No default watermark configured — ensure watermark is off
      watermarkEnabled.value = false
      selectedExistingWatermark.value = ''
      existingWatermarkPreviewUrl.value = null
    }
  } catch (err) {
    console.warn('[quickshare] Failed to load default watermark settings:', err)
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

async function loadExistingWatermarkFiles() {
  try {
    // Fetch custom watermarks from both the specific directory AND the global search
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
        return res.ok ? wm.path : null
      })
    )
    const validBuiltins = builtinChecks
      .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled' && r.value !== null)
      .map(r => r.value)
    
    // User watermarks first, default watermarks last
    existingWatermarkFiles.value = showDefaultWatermarks.value ? [...allCustom, ...validBuiltins] : allCustom
    
    // Auto-select last used watermark if available
    try {
      const lastUsed = localStorage.getItem('45flow-last-watermark')
      if (lastUsed && existingWatermarkFiles.value.includes(lastUsed) && !watermarkFile.value && !selectedExistingWatermark.value) {
        selectedExistingWatermark.value = lastUsed
        void fetchExistingWatermarkPreview(lastUsed)
      }
    } catch { /* ignore storage errors */ }
  } catch {
    existingWatermarkFiles.value = []
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

async function uploadWatermarkToProject() {
  if (!watermarkFile.value) return { ok: false, error: 'no watermark file' }
  const host = ssh.value?.server
  const user = ssh.value?.username
  if (!host || !user) return { ok: false, error: 'missing ssh connection info' }

  const destDir = resolveWatermarkUploadDir()
  const ensured = await ensureServerDirExists(destDir)
  if (!ensured) return { ok: false, error: 'failed to prepare remote watermark directory' }
  const { id: rsyncId, done } = await electron.rsyncStart({
    host,
    user,
    src: watermarkFile.value.path,
    destDir,
    port: ssh.value?.port ?? 22,
    keyPath: ssh.value?.keyPath,
    noIngest: true,
  })
  const res = await done
  if (!res?.ok) return { ok: false, error: res?.error || 'watermark upload failed', uploadId: rsyncId }
  return { ok: true, relPath: resolveWatermarkRelPath(), uploadId: rsyncId }
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

function parseEtaToSeconds(eta: string): number | null {
  if (!eta || eta === 'N/A' || eta === '—') return null
  const hms = eta.match(/^(\d+):(\d+):(\d+)$/)
  if (hms) return Number(hms[1]) * 3600 + Number(hms[2]) * 60 + Number(hms[3])
  const ms = eta.match(/^(\d+):(\d+)$/)
  if (ms) return Number(ms[1]) * 60 + Number(ms[2])
  let secs = 0
  const hm = eta.match(/(\d+)\s*h/); if (hm) secs += Number(hm[1]) * 3600
  const mm = eta.match(/(\d+)\s*m/); if (mm) secs += Number(mm[1]) * 60
  const sm = eta.match(/(\d+)\s*s/); if (sm) secs += Number(sm[1])
  return secs > 0 ? secs : null
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

  // Ensure SSH keys are deployed before uploading
  try {
    const sshReady = await electron.ensureSshReady({
      host,
      username: user,
      password: undefined, // No password available; rely on existing keys/agent
      sshPort: port,
    })
    if (!sshReady?.ok) {
      uploadPhase.value = 'error'
      errorMsg.value = 'SSH authentication setup failed. Please reconnect to the server from the Connections page to re-establish SSH keys.'
      busy.value = false
      pushNotification(
        new Notification(
          'Quick Share Failed',
          'SSH authentication is not configured. Please reconnect to the server.',
          'error',
          10000
        )
      )
      return
    }
  } catch (e: any) {
    uploadPhase.value = 'error'
    errorMsg.value = `SSH setup error: ${e?.message || String(e)}`
    busy.value = false
    pushNotification(
      new Notification(
        'Quick Share Failed',
        'Could not verify SSH authentication. Please reconnect to the server.',
        'error',
        10000
      )
    )
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

    // Shared groupId ensures upload + transcode tasks render in one dock section
    const groupId = crypto.randomUUID?.() || Math.random().toString(36).slice(2)

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
        context: { source: 'upload', groupId, destDir, file: fileDestAbs },
      })

      // Determine if this is a video file and if we should transcode client-side
      const videoExts = new Set(['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'wmv', 'mxf', 'mts', 'm2ts', 'mod', 'tod', 'vob', 'f4v', 'asf', 'rm', 'rmvb', 'ts', 'ogv', '3gp', '3g2', 'mj2', 'm4v', 'qt', 'dv', 'divx', 'hevc', 'h264', 'h265', 'vp8', 'vp9', 'av1', 'dnxhd', 'prores', 'r3d', 'braw', 'ari', 'cine', 'dav'])
      const fileExt = String(f.name || '').toLowerCase().split('.').pop() || ''
      const isVideo = videoExts.has(fileExt)
      // Old single-quality client transcode replaced by full multi-output post-upload transcode
      const shouldTranscodeClient = false

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
              watermarkSettings: localWatermarkPath ? JSON.parse(JSON.stringify(watermarkSettings.value)) : undefined,
            },
            (progress: { percent: number; fps: any; speed: any; eta: any }) => {
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
          keyPath: connectionMeta.value.ssh?.keyPath,
          transcodeProxy: hasVideo.value,
          proxyQualities: hasVideo.value ? proxyQualities.value.slice() : undefined,
          apiToken: connectionMeta.value.token || undefined,
          clientTranscoded,
          clientWatermarked: clientAppliedWatermark,
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
    let watermarkUploadId: string | undefined
    if (watermarkEnabled.value && hasMedia.value) {
      const selectedServerWm = String(selectedExistingWatermark.value || '').trim()
      if (selectedServerWm) {
        // Convert watermark ID to path for API if it's a built-in watermark
        watermarkRelPath = resolveWatermarkPathForApi(selectedServerWm)
      } else if (watermarkFile.value) {
        const wmUp = await uploadWatermarkToProject()
        if (!wmUp.ok) {
          uploadPhase.value = 'error'
          errorMsg.value = wmUp.error || 'Watermark upload failed.'
          busy.value = false
          return
        }
        watermarkRelPath = (wmUp as any).relPath || ''
        watermarkUploadId = (wmUp as any).uploadId
      }
    }

    // Generate share link
    uploadPhase.value = 'generating'

    const body: any = {
      expiresInSeconds: expiresSec.value,
      projectBase: projectBase.value || undefined,
      baseMode: usePublicBase.value ? 'externalPreferred' : 'local',
      title: linkTitle.value || undefined,
      generateReviewProxy: hasVideo.value, // Server generates proxy variants even when client transcoded
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

    if (accessMode.value === 'restricted' && accessGroups.value.length) {
      body.groups = accessGroups.value.map(g => ({
        groupId: g.id,
        roleId: g.role_id,
        roleName: g.role_name,
      }))
    }

    if (hasVideo.value) {
      body.proxyQualities = proxyQualities.value.length > 0 ? proxyQualities.value.slice() : ['original']
    }

    if (watermarkEnabled.value && watermarkRelPath) {
      body.watermark = true
      body.watermarkFile = watermarkRelPath
      if (hasVideo.value) {
        body.watermarkProxyQualities = proxyQualities.value.slice()
      }
      // Premium: Pass custom watermark settings to server
      if (watermarkSettings.value) {
        body.watermarkSettings = watermarkSettings.value
      }
    }

    // If client applied the watermark, tell the server so it doesn't re-watermark
    if (clientAppliedWatermark) {
      body.clientWatermarked = true
    }

    // Tell the server to pre-claim transcode jobs so the server worker
    // doesn't pick them up before the client can start transcoding.
    if (hasVideo.value && clientTranscodeEnabled.value) {
      body.clientTranscode = true
    }

    // QuickShare always uploads fresh files — overwrite existing outputs
    body.overwrite = true

    const data = await apiFetch('/api/magic-link', {
      method: 'POST',
      body: JSON.stringify(body),
      timeoutMs: 5 * 60 * 1000,
    })

    viewUrl.value = data.viewUrl || ''
    uploadPhase.value = 'done'
    signalLinkCreated()

    // Dismiss the watermark upload task from Transfer Dock since it's not a user-facing upload
    if (watermarkUploadId) {
      const uploadTasks = transfer.state.tasks.filter(
        t => t.kind === 'upload' && t.taskId === watermarkUploadId
      )
      for (const task of uploadTasks) {
        transfer.removeTask(task.taskId)
      }
    }

    // ── Start transcode tracking in the TransferDock ──
    // When client transcoding is enabled, the FFmpeg onProgress callback
    // updates the TransferDock directly — polling tasks would fight it
    // and cause progress oscillation.  Only create polling tasks for
    // server-side transcoding.
    if ((hasVideo.value || (watermarkEnabled.value && hasImage.value)) && !clientTranscodeEnabled.value) {
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
        const context = { 
          source: 'link' as const, 
          groupId, 
          file: filePath,
          linkUrl: viewUrl.value,
          linkTitle: linkTitle.value || undefined
        }

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

        if (proxyActive && canUsePlayback && !alreadyTrackingProxy) {
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

    // ── Client-side full transcode for video files ───────────────────────────
    console.log('[quick-share] client transcode decision:', {
      hasVideo: hasVideo.value,
      clientTranscodeEnabled: clientTranscodeEnabled.value,
      hwAccel: hwAccelSetting.value,
      preset: transcodePreset.value,
    })
    if (hasVideo.value && clientTranscodeEnabled.value) {
      const { createTranscodePollingTasks, runClientTranscode } = useUploadTranscode()
      const fileRecordsForTranscode: any[] = Array.isArray(data?.files) ? data.files : []
      const videoExtsSet = new Set(['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'wmv', 'mxf', 'mts', 'm2ts', 'mod', 'tod', 'vob', 'f4v', 'asf', 'rm', 'rmvb', 'ts', 'ogv', '3gp', '3g2', 'mj2', 'm4v', 'qt', 'dv', 'divx', 'hevc', 'h264', 'h265', 'vp8', 'vp9', 'av1', 'dnxhd', 'prores', 'r3d', 'braw', 'ari', 'cine', 'dav'])

      for (let fi = 0; fi < fileRecordsForTranscode.length; fi++) {
        const rec = fileRecordsForTranscode[fi]
        const avId = Number(rec?.assetVersionId ?? 0)
        if (!Number.isFinite(avId) || avId <= 0) continue

        const localFile = droppedFiles.value[fi]
        if (!localFile) continue

        const ext = String(localFile.name || '').toLowerCase().split('.').pop() || ''
        if (!videoExtsSet.has(ext)) continue

        const filePath = rec?.path || rec?.name || localFile.name
        const pQualities = proxyQualities.value.length > 0 ? proxyQualities.value.slice() : ['original']

        // Create polling tasks — same composable as LocalUploadPanel
        createTranscodePollingTasks({
          assetVersionId: avId,
          filename: localFile.name,
          proxyQualities: pQualities,
          generateHls: true,
          apiFetch,
          context: {
            source: 'link' as const,
            groupId,
            file: filePath,
            linkUrl: viewUrl.value,
            linkTitle: linkTitle.value || undefined,
            proxyQualities: pQualities,
            connectionId: activeConnection.value?.connectionId,
          },
        })

        // Run transcode async — same composable as LocalUploadPanel
        console.log('[quick-share] runClientTranscode watermark debug:', {
          localWatermarkPath,
          watermarkSettingsRaw: watermarkSettings.value,
          watermarkSettingsToRaw: localWatermarkPath ? JSON.parse(JSON.stringify(watermarkSettings.value)) : undefined,
          watermarkEnabled: watermarkEnabled.value,
        })
        ;(async () => {
          const result = await runClientTranscode({
            assetVersionId: avId,
            sourceFilePath: localFile.path,
            filename: localFile.name,
            proxyQualities: pQualities,
            generateHls: true,
            watermarkPath: localWatermarkPath,
            watermarkSettings: localWatermarkPath ? JSON.parse(JSON.stringify(watermarkSettings.value)) : undefined,
            ssh: {
              host: host || '',
              user: user || '',
              port,
              keyPath: ssh.value?.keyPath,
            },
            apiFetch,
          })
          if (result.ok) {
            console.log(`[quick-share] ✓ client transcode done: ${localFile.name}`)
          } else {
            console.warn(`[quick-share] client transcode failed for ${localFile.name}: ${result.error}`)
          }
        })()
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
