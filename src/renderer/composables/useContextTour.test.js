import { createApp, nextTick, ref } from 'vue'
import { expect, it } from 'vitest'
import { useContextTour } from './useContextTour'
import { useTourManager } from './useTourManager'
import { useOnboarding } from './useOnboarding'

it('drops queued tours when their panel closes, retries on reopen, and cancels on unmount', async () => {
  const { activeTour, cancelTour, requestTour } = useTourManager()
  const { onboarding } = useOnboarding()
  const steps = [{ target: '#test', message: 'Test' }]
  const open = ref(true)
  const app = createApp({
    setup() {
      useContextTour('settings', 'settingsTourDone', () => open.value, () => steps)
      return () => null
    },
  })
  requestTour('other', steps, () => {})
  app.mount(document.createElement('div'))
  try {
    open.value = false
    await nextTick()
    cancelTour('other')
    expect(activeTour.value).toBeNull()

    open.value = true
    await nextTick()
    expect(activeTour.value?.id).toBe('settings')
  } finally {
    app.unmount()
    cancelTour('other')
  }
  expect(activeTour.value).toBeNull()
  expect(onboarding.value.settingsTourDone).toBe(false)
})
