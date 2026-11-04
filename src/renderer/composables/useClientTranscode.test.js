import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('client-side transcoding availability', () => {
  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
  })

  it('forces local transcoding off in browser mode even if it was previously enabled', async () => {
    localStorage.setItem('45flow:client_transcode_enabled', 'true')
    vi.stubGlobal('electron', { isWeb: true })
    const { useClientTranscode } = await import('./useClientTranscode')

    expect(useClientTranscode().enabled.value).toBe(false)
  })
})
