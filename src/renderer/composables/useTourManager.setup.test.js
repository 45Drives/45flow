import { describe, expect, it, vi } from 'vitest'
import { useTourManager } from './useTourManager'

describe('tour deferral during setup', () => {
  it('queues walkthroughs without marking them done and releases them after setup', async () => {
    const manager = useTourManager()
    const done = vi.fn()
    manager.setSetupPending(true)
    expect(manager.requestTour('setup-deferred-tour', [{ target: '#project', message: 'Open your project' }], done)).toBe(true)
    expect(manager.activeTour.value).toBeNull()
    expect(done).not.toHaveBeenCalled()
    manager.setSetupPending(false)
    expect(manager.activeTour.value.id).toBe('setup-deferred-tour')
    await manager.finishTour()
    expect(done).toHaveBeenCalledOnce()
    expect(manager.activeTour.value).toBeNull()
  })
})
