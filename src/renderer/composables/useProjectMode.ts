import { ref, watch } from 'vue'

const STORAGE_KEY = '45flow:project_mode_enabled'

function loadEnabled(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === null) return true // default: enabled
    return stored === 'true'
  } catch {
    return true
  }
}

const enabled = ref(loadEnabled())

watch(enabled, (val) => localStorage.setItem(STORAGE_KEY, String(val)))

export function useProjectMode() {
  return { projectModeEnabled: enabled }
}
