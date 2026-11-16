import { computed, reactive, ref } from 'vue'
import { BACKGROUND_REQUEST } from '../background-request'

export interface SetupStatus {
  ready: boolean
  storageRoot?: { configured: boolean; path: string; fstype: string }
  adminGroup?: { required: boolean; exists: boolean; members: string[]; currentUserIsMember: boolean }
  malwareScan?: { required: boolean; scannerAvailable: boolean; locked: boolean; scanner?: 'clamscan' | 'clamd' | null; definitionsAvailable?: boolean; detail?: string | null }
  shareAddress?: { externalBase: string | null; httpsPort: number }
  watermarks?: { globalEnabled: boolean; globalDir: string }
  projects?: { count: number }
}

export type SetupSection = 'storage' | 'staff' | 'uploads' | 'watermarks'
export function serverSetupKey(connection?: { connectionId?: string; baseUrl?: string; serverIp?: string; apiPort?: number; username?: string } | null): string {
  const server = connection?.baseUrl || (connection?.serverIp ? `${connection.serverIp}:${connection.apiPort || ''}` : connection?.connectionId || 'server')
  return `45flow-setup:v1:${encodeURIComponent(server)}:${encodeURIComponent(connection?.username || '')}`
}

export function readSetupProgress(key: string): { step?: number; complete?: boolean; restartPath?: string } {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) || '{}')
    return {
      step: Number.isInteger(value?.step) ? value.step : undefined,
      complete: value?.complete === true,
      restartPath: typeof value?.restartPath === 'string' ? value.restartPath : undefined,
    }
  } catch { return {} }
}
export function saveSetupProgress(key: string, value: { step?: number; complete?: boolean; restartPath?: string }) {
  try { sessionStorage.setItem(key, JSON.stringify(value)) } catch { /* Setup still works when browser storage is disabled. */ }
}

const setupReplays = reactive<Record<string, boolean>>({})
export function useSetupReplay(key: () => string) {
  const requested = computed(() => {
    if (setupReplays[key()] !== undefined) return setupReplays[key()]
    try { return sessionStorage.getItem(`${key()}:replay`) === '1' } catch { return false }
  })
  function setRequested(value: boolean) {
    setupReplays[key()] = value
    try {
      if (value) sessionStorage.setItem(`${key()}:replay`, '1')
      else sessionStorage.removeItem(`${key()}:replay`)
    } catch { /* The wizard can still be reopened when browser storage is disabled. */ }
  }
  function request() {
    saveSetupProgress(key(), { step: 0 })
    setRequested(true)
  }
  return { requested, request, finish: () => setRequested(false) }
}

export const setupSections = [
  { key: 'storage', label: 'Storage' },
  { key: 'staff', label: 'Staff users' },
  { key: 'uploads', label: 'Upload security' },
  { key: 'watermarks', label: 'Watermarks' },
] as const

export function setupRequired(status: SetupStatus | null): boolean {
  return !!status && (!status.ready || status.projects?.count === 0)
}

export function useSetupStatus(apiFetch: (url: string, init?: RequestInit) => Promise<any>) {
  const status = ref<SetupStatus | null>(null)
  const error = ref('')
  const loading = ref(false)
  const unsupported = ref(false)
  let generation = 0
  async function load(background = false) {
    const request = ++generation
    loading.value = true
    error.value = ''
    try {
      const data = await apiFetch('/api/setup/status', background ? { headers: BACKGROUND_REQUEST } : undefined)
      if (request === generation) {
        status.value = data
        unsupported.value = false
      }
      return data as SetupStatus
    } catch (e: any) {
      if (e?.status === 404 && (!e.code || e.code === 'Not found' || e.code === 'not_found')) {
        if (request === generation) {
          unsupported.value = true
          window.appLog?.warn?.('setup.unsupported', { status: 404 })
        }
        return null
      }
      if (request === generation) unsupported.value = false
      if (request === generation) error.value = e?.message || 'Could not check server setup. Try again.'
      throw e
    } finally {
      if (request === generation) loading.value = false
    }
  }
  return { status, error, loading, unsupported, load, required: computed(() => setupRequired(status.value)) }
}
