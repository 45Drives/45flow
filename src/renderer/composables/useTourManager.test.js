import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('tour manager skip', () => {
  let manager

  beforeEach(async () => {
    vi.resetModules()
    localStorage.clear()
    manager = (await import('./useTourManager')).useTourManager()
  })

  it('runs the skip handler instead of the done handler and advances the queue', async () => {
    const onDone = vi.fn()
    const onSkip = vi.fn()
    manager.requestTour('part-1', [], onDone, onSkip)
    manager.requestTour('part-2', [], vi.fn())

    await manager.skipTour()

    expect(onSkip).toHaveBeenCalledOnce()
    expect(onDone).not.toHaveBeenCalled()
    expect(manager.activeTour.value?.id).toBe('part-2')
  })

  it('falls back to the done handler for tours without a skip handler', async () => {
    const onDone = vi.fn()
    manager.requestTour('single', [], onDone)

    await manager.skipTour()

    expect(onDone).toHaveBeenCalledOnce()
    expect(manager.activeTour.value).toBeNull()
  })
})
