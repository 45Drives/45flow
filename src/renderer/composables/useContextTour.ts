import { onMounted, onBeforeUnmount, watch } from 'vue'
import { useTourManager, type TourStep } from './useTourManager'
import { useOnboarding } from './useOnboarding'

/** Request only while the owning screen/panel is available, even if queued. */
export function useContextTour(
  id: string,
  flag: Parameters<ReturnType<typeof useOnboarding>['markDone']>[0],
  available: () => boolean,
  steps: () => TourStep[],
) {
  const { requestTour, cancelTour } = useTourManager()
  const { onboarding, markDone } = useOnboarding()
  let requested = false

  function cancel() {
    if (requested) cancelTour(id)
    requested = false
  }

  onMounted(() => {
    watch(available, (open) => {
      if (!open) cancel()
      else if (!onboarding.value[flag]) {
        requested = requestTour(id, steps(), () => markDone(flag))
      }
    }, { immediate: true, flush: 'post' })
  })
  onBeforeUnmount(cancel)
}
