import { ref, computed } from 'vue'

export type OnboardingFlag =
  | 'connectTourDone'
  | 'dashboardTourDone'
  | 'quickShareTourDone'
  | 'shareFilesTourDone'
  | 'createLinkTourDone'
  | 'localUploadTourDone'
  | 'uploadLinkTourDone'
  | 'transferDockTourDone'
  | 'manageUsersTourDone'
  | 'manageRolesTourDone'
  | 'viewLogsTourDone'
  | 'settingsTourDone'
  | 'linkDetailsTourDone'
  | 'linkDetailsEditTourDone'

const DEFAULTS: Record<OnboardingFlag, boolean> = {
  connectTourDone: false,
  dashboardTourDone: false,
  quickShareTourDone: false,
  shareFilesTourDone: false,
  createLinkTourDone: false,
  localUploadTourDone: false,
  uploadLinkTourDone: false,
  transferDockTourDone: false,
  manageUsersTourDone: false,
  manageRolesTourDone: false,
  viewLogsTourDone: false,
  settingsTourDone: false,
  linkDetailsTourDone: false,
  linkDetailsEditTourDone: false,
}

const STORAGE_KEY = 'flow_onboarding_v1'

function load(): Record<OnboardingFlag, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return { ...DEFAULTS }
}

function persist(state: Record<OnboardingFlag, boolean>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

const _state = ref<Record<OnboardingFlag, boolean>>(load())

export function useOnboarding() {
  const onboarding = computed(() => _state.value)

  function markDone(flag: OnboardingFlag) {
    _state.value = { ..._state.value, [flag]: true }
    persist(_state.value)
  }

  function resetAll() {
    _state.value = { ...DEFAULTS }
    persist(_state.value)
  }

  function isDone(flag: OnboardingFlag): boolean {
    return _state.value[flag]
  }

  return { onboarding, markDone, resetAll, isDone }
}
