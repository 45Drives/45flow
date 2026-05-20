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
  beforeShow?: () => void | Promise<void>
  /** Called when leaving this step — use to undo spoofed state */
  cleanup?: () => void
}

export interface TourRegistration {
  id: string
  steps: TourStep[]
  onDone: () => void | Promise<void>
}

const _activeTour = ref<TourRegistration | null>(null)
const _queue: TourRegistration[] = []

export function useTourManager() {
  const { toursDisabled } = useTourPreferences()

  function requestTour(id: string, steps: TourStep[], onDone: () => void | Promise<void>) {
    // Don't show tours if globally disabled
    if (toursDisabled.value) return
    
    if (_activeTour.value?.id === id || _queue.some(t => t.id === id)) return

    const registration: TourRegistration = { id, steps, onDone }
    if (!_activeTour.value) {
      _activeTour.value = registration
    } else {
      _queue.push(registration)
    }
  }

  function cancelTour(id: string) {
    const idx = _queue.findIndex(t => t.id === id)
    if (idx !== -1) _queue.splice(idx, 1)
    if (_activeTour.value?.id === id) {
      _activeTour.value = null
      advanceQueue()
    }
  }

  async function finishTour() {
    if (_activeTour.value) {
      await _activeTour.value.onDone()
      _activeTour.value = null
    }
    advanceQueue()
  }

  function advanceQueue() {
    if (_queue.length > 0 && !_activeTour.value) {
      _activeTour.value = _queue.shift()!
    }
  }

  return {
    activeTour: readonly(_activeTour) as Readonly<Ref<TourRegistration | null>>,
    requestTour,
    cancelTour,
    finishTour,
  }
}
