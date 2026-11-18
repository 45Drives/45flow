import { ref, readonly, type Ref } from 'vue'
import { useTourPreferences } from './useTourPreferences'

export interface TourStep {
  /** CSS selector for the target element to highlight */
  target: string
  /** Message to display in the popup */
  message: string
  /** Preferred popup placement relative to target */
  placement?: 'top' | 'bottom'
  /** Called before the step is shown — use to spoof visibility of hidden elements */
  beforeShow?: () => void
  /** Called when leaving this step — use to undo spoofed state */
  cleanup?: () => void
}

export interface TourRegistration {
  id: string
  steps: TourStep[]
  onDone: () => void | Promise<void>
  /** Called instead of onDone when the user skips; use when a tour is split into several parts */
  onSkip?: () => void | Promise<void>
}

const _activeTour = ref<TourRegistration | null>(null)
const _queue: TourRegistration[] = []
const _setupPending = ref(false)

export function useTourManager() {
  const { toursDisabled } = useTourPreferences()

  function requestTour(id: string, steps: TourStep[], onDone: () => void | Promise<void>, onSkip?: () => void | Promise<void>): boolean {
    // Don't show tours if globally disabled
    if (toursDisabled.value) return false
    
    if (_activeTour.value?.id === id || _queue.some(t => t.id === id)) return false

    const registration: TourRegistration = { id, steps, onDone, onSkip }
    _queue.push(registration)
    advanceQueue()
    return true
  }

  function cancelTour(id: string) {
    const idx = _queue.findIndex(t => t.id === id)
    if (idx !== -1) _queue.splice(idx, 1)
    if (_activeTour.value?.id === id) {
      _activeTour.value = null
      advanceQueue()
    }
  }

  async function settleTour(skipped: boolean) {
    const tour = _activeTour.value
    if (!tour) return
    // Release this registration before invoking its callback. A slow or failing
    // callback must not clear the next tour or keep the queue blocked.
    _activeTour.value = null
    try {
      return (skipped ? tour.onSkip ?? tour.onDone : tour.onDone)()
    } finally {
      advanceQueue()
    }
  }

  function advanceQueue() {
    if (toursDisabled.value) {
      _queue.length = 0
      return
    }
    if (_queue.length > 0 && !_activeTour.value && !_setupPending.value) {
      _activeTour.value = _queue.shift()!
    }
  }

  return {
    setSetupPending(pending: boolean) {
      _setupPending.value = pending
      if (pending && _activeTour.value) {
        _queue.unshift(_activeTour.value)
        _activeTour.value = null
      } else if (!pending) advanceQueue()
    },
    activeTour: readonly(_activeTour) as Readonly<Ref<TourRegistration | null>>,
    requestTour,
    cancelTour,
    finishTour: () => settleTour(false),
    skipTour: () => settleTour(true),
  }
}
