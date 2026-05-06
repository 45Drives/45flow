/**
 * Composable: useTranscodeSettings
 * 
 * Manages transcode configuration including backend selection,
 * remote worker settings, and fallback preferences.
 * 
 * This is the primary interface for the renderer to control transcoding behavior.
 */

import { ref, computed, watch } from 'vue'

const STORAGE_KEY_TRANSCODE_ENABLED = '45flow:client_transcode_enabled'
const STORAGE_KEY_TRANSCODE_BACKEND = '45flow:transcode_backend'
const STORAGE_KEY_REMOTE_WORKER_HOST = '45flow:remote_transcode_host'
const STORAGE_KEY_REMOTE_WORKER_PORT = '45flow:remote_transcode_port'

export type TranscodeBackendType = 'local' | 'remote'

export function useTranscodeSettings() {
  // Client-side transcode enabled
  const clientTranscodeEnabled = ref(
    localStorage.getItem(STORAGE_KEY_TRANSCODE_ENABLED) !== 'false'
  )

  // Active backend (local or remote)
  const activeBackend = ref<TranscodeBackendType>(
    (localStorage.getItem(STORAGE_KEY_TRANSCODE_BACKEND) as TranscodeBackendType) || 'local'
  )

  // Remote worker host/port (for future remote feature)
  const remoteWorkerHost = ref(
    localStorage.getItem(STORAGE_KEY_REMOTE_WORKER_HOST) || ''
  )
  const remoteWorkerPort = ref(
    parseInt(localStorage.getItem(STORAGE_KEY_REMOTE_WORKER_PORT) || '9999', 10)
  )

  // Computed: can use remote worker?
  const canUseRemote = computed(() => {
    return remoteWorkerHost.value?.trim().length > 0 && remoteWorkerPort.value > 0
  })

  // Computed: which backend should actually be used?
  const effectiveBackend = computed(() => {
    if (activeBackend.value === 'remote' && canUseRemote.value) {
      return 'remote'
    }
    return 'local'
  })

  // Watch and persist changes
  watch(clientTranscodeEnabled, (val) => {
    localStorage.setItem(STORAGE_KEY_TRANSCODE_ENABLED, val ? 'true' : 'false')
  })

  watch(activeBackend, (val) => {
    localStorage.setItem(STORAGE_KEY_TRANSCODE_BACKEND, val)
  })

  watch(remoteWorkerHost, (val) => {
    localStorage.setItem(STORAGE_KEY_REMOTE_WORKER_HOST, val)
  })

  watch(remoteWorkerPort, (val) => {
    localStorage.setItem(STORAGE_KEY_REMOTE_WORKER_PORT, String(val))
  })

  return {
    clientTranscodeEnabled,
    activeBackend,
    remoteWorkerHost,
    remoteWorkerPort,
    canUseRemote,
    effectiveBackend,
  }
}
