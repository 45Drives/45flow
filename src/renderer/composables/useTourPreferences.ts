import { ref, computed } from 'vue'

const STORAGE_KEY = 'flow_tour_preferences_v1'

interface TourPreferences {
  toursDisabled: boolean
}

const DEFAULTS: TourPreferences = {
  toursDisabled: false,
}

function load(): TourPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return { ...DEFAULTS }
}

function persist(state: TourPreferences) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

const _state = ref<TourPreferences>(load())

export function useTourPreferences() {
  const toursDisabled = computed({
    get: () => _state.value.toursDisabled,
    set: (value: boolean) => {
      _state.value = { ..._state.value, toursDisabled: value }
      persist(_state.value)
    },
  })

  return { toursDisabled }
}
