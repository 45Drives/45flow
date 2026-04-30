<template>
  <teleport to="body">
    <div
      v-if="isVisible"
      class="fixed right-4 bottom-4 z-[1200] w-[560px] max-w-[calc(100vw-1.5rem)] rounded-xl border border-default bg-default shadow-2xl p-6 text-left"
    >
      <div class="text-xl font-semibold text-default">{{ title }}</div>
      <div class="text-base leading-relaxed text-default mt-2 break-words">{{ message }}</div>

      <div v-if="state === 'downloading'" class="mt-4">
        <div class="h-3 w-full bg-well rounded overflow-hidden">
          <div
            class="h-full bg-primary transition-all duration-300"
            :style="{ width: `${Math.max(0, Math.min(progressPercent, 100))}%` }"
          />
        </div>
        <div class="text-sm text-default mt-1">{{ progressPercent.toFixed(1) }}%</div>
      </div>

      <div class="flex flex-wrap gap-3 mt-5">
        <button
          v-if="canCheckNow"
          class="btn btn-secondary px-4 py-2 text-sm"
          :disabled="busy"
          @click="checkNow"
        >
          Check Now
        </button>
        <button
          v-if="state === 'available'"
          class="btn btn-primary px-4 py-2 text-sm"
          :disabled="busy"
          @click="downloadNow"
        >
          Download Update
        </button>
        <button
          v-if="state === 'downloaded'"
          class="btn btn-success px-4 py-2 text-sm"
          :disabled="busy"
          @click="installNow"
        >
          Restart & Install
        </button>
        <button
          class="btn btn-secondary px-4 py-2 text-sm"
          :disabled="busy"
          @click="dismiss"
        >
          Dismiss
        </button>
      </div>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

type UpdateBannerState = 'idle' | 'checking' | 'available' | 'none' | 'downloading' | 'downloaded' | 'error'

const enabled = ref(false)
const busy = ref(false)
const state = ref<UpdateBannerState>('idle')
const latestVersion = ref<string>('')
const progressPercent = ref(0)
const errorMessage = ref('')
let hideTimer: ReturnType<typeof setTimeout> | null = null

const isVisible = computed(() => enabled.value && state.value !== 'idle')
const canCheckNow = computed(() => ['none', 'error'].includes(state.value))

const title = computed(() => {
  if (state.value === 'checking') return 'Checking for updates...'
  if (state.value === 'available' || state.value === 'downloading') return 'Update Available'
  if (state.value === 'downloaded') return 'Update Ready'
  if (state.value === 'error') return 'Update Error'
  if (state.value === 'none') return 'Up To Date'
  return ''
})

const message = computed(() => {
  if (state.value === 'checking') return 'Looking for the latest release.'
  if (state.value === 'available') return latestVersion.value ? `Version ${latestVersion.value} is available. Would you like to download it?` : 'A new version is available. Would you like to download it?'
  if (state.value === 'downloading') return latestVersion.value ? `Downloading version ${latestVersion.value}.` : 'Downloading update package.'
  if (state.value === 'downloaded') return latestVersion.value ? `Version ${latestVersion.value} is ready to install.` : 'The update is ready to install.'
  if (state.value === 'error') return errorMessage.value || 'Unable to check or download update.'
  if (state.value === 'none') return 'You already have the latest version.'
  return ''
})

/** Extract a display-ready error string. The main process already normalises
 *  updater errors via normalizeUpdaterError(), so this is just a safe extractor. */
function toUserFriendlyError(input: unknown): string {
  const raw = String((input as any)?.message || input || '').trim()
  return raw || 'We could not check for updates right now. Please try again later.'
}

function clearHideTimer() {
  if (hideTimer) {
    clearTimeout(hideTimer)
    hideTimer = null
  }
}

function scheduleAutoHide(ms = 5000) {
  clearHideTimer()
  hideTimer = setTimeout(() => {
    state.value = 'idle'
  }, ms)
}

function setState(next: UpdateBannerState) {
  clearHideTimer()
  state.value = next
  if (next === 'none') scheduleAutoHide(4500)
}

async function checkNow() {
  busy.value = true
  try {
    setState('checking')
    await window.electron?.ipcRenderer.invoke('update:check')
  } catch (err: any) {
    errorMessage.value = toUserFriendlyError(err)
    setState('error')
  } finally {
    busy.value = false
  }
}

async function downloadNow() {
  busy.value = true
  try {
    setState('downloading')
    await window.electron?.ipcRenderer.invoke('update:download')
  } catch (err: any) {
    errorMessage.value = toUserFriendlyError(err)
    setState('error')
  } finally {
    busy.value = false
  }
}

async function installNow() {
  busy.value = true
  try {
    await window.electron?.ipcRenderer.invoke('update:install')
  } catch (err: any) {
    errorMessage.value = toUserFriendlyError(err)
    setState('error')
  } finally {
    busy.value = false
  }
}

function dismiss() {
  setState('idle')
}

const onChecking = () => setState('checking')
const onAvailable = (_event: unknown, info: any) => {
  latestVersion.value = String(info?.version || '')
  setState('available')
}
const onNone = () => setState('none')
const onProgress = (_event: unknown, payload: any) => {
  if (typeof payload?.percent === 'number') progressPercent.value = payload.percent
  setState('downloading')
}
const onDownloaded = (_event: unknown, info: any) => {
  latestVersion.value = String(info?.version || latestVersion.value || '')
  setState('downloaded')
}
const onError = (_event: unknown, payload: any) => {
  errorMessage.value = toUserFriendlyError(payload?.message)
  setState('error')
}

onMounted(async () => {
  const ipc = window.electron?.ipcRenderer
  if (!ipc) {
    enabled.value = false
    return
  }

  try {
    const isDev = await ipc.invoke<boolean>('is-dev')
    enabled.value = !isDev
  } catch {
    enabled.value = false
  }

  if (!enabled.value) return

  ipc.on('update:checking', onChecking)
  ipc.on('update:available', onAvailable)
  ipc.on('update:none', onNone)
  ipc.on('update:progress', onProgress)
  ipc.on('update:downloaded', onDownloaded)
  ipc.on('update:error', onError)
})

onBeforeUnmount(() => {
  clearHideTimer()
  const ipc = window.electron?.ipcRenderer
  ipc?.removeListener?.('update:checking', onChecking as any)
  ipc?.removeListener?.('update:available', onAvailable as any)
  ipc?.removeListener?.('update:none', onNone as any)
  ipc?.removeListener?.('update:progress', onProgress as any)
  ipc?.removeListener?.('update:downloaded', onDownloaded as any)
  ipc?.removeListener?.('update:error', onError as any)
})
</script>
