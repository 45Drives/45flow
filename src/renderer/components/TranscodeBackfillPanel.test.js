import { afterEach, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'

const api = vi.hoisted(() => ({ apiFetch: vi.fn() }))
vi.mock('../composables/useApi', () => ({ useApi: () => ({ apiFetch: api.apiFetch }) }))

import TranscodeBackfillPanel from './TranscodeBackfillPanel.vue'

let app, host
async function flush() { for (let i = 0; i < 8; i++) await nextTick(); await new Promise(r => setTimeout(r, 0)) }
afterEach(() => { app?.unmount(); host?.remove(); api.apiFetch.mockReset(); vi.useRealTimers() })

function mount() {
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp({ render: () => h(TranscodeBackfillPanel, { connectionId: 'c1' }) })
  app.mount(host)
}
const state = (extra) => ({ status: 'idle', qualities: [], processedCount: 0, queuedCount: 0,
  skippedCounts: { explicit: 0, nonVideo: 0, covered: 0, active: 0 }, lastError: null, ...extra })
const button = (text) => [...host.querySelectorAll('button')].find(b => b.textContent.trim() === text)

it('starts a run with the server sizes and shows its progress', async () => {
  api.apiFetch.mockImplementation(async (url) => {
    if (url.endsWith('/status')) return { ok: true, state: state() }
    if (url.endsWith('/start')) return { ok: true, state: state({ status: 'completed', qualities: ['720p'], processedCount: 5, queuedCount: 3,
      skippedCounts: { explicit: 1, nonVideo: 1, covered: 0, active: 0 } }) }
    throw new Error(url)
  })
  mount()
  await flush()
  expect(host.querySelector('[data-testid="backfill-status"]').textContent).toContain('Not run yet')
  button('Start').click()
  await flush()
  expect(api.apiFetch).toHaveBeenCalledWith('/api/admin/transcode-backfill/start', { method: 'POST', body: '{}', retry: 0 })
  expect(host.querySelector('[data-testid="backfill-status"]').textContent).toBe('Done (720p): 3 queued, 2 already fine or skipped.')
  expect(button('Run again')).toBeTruthy()
})

it('offers Resume after an interrupted run', async () => {
  api.apiFetch.mockImplementation(async (url) => {
    if (url.endsWith('/status')) return { ok: true, state: state({ status: 'error', processedCount: 40, lastError: 'disk full' }) }
    if (url.endsWith('/resume')) return { ok: true, state: state({ status: 'running', processedCount: 40 }) }
    throw new Error(url)
  })
  mount()
  await flush()
  expect(host.textContent).toContain('Stopped after 40 videos: disk full.')
  button('Resume').click()
  await flush()
  expect(api.apiFetch).toHaveBeenCalledWith('/api/admin/transcode-backfill/resume', expect.objectContaining({ method: 'POST' }))
  expect(host.textContent).toContain('Working: 40 checked')
})

it('hides itself for servers without backfill or non-admin sessions', async () => {
  api.apiFetch.mockRejectedValue(Object.assign(new Error('forbidden'), { status: 403 }))
  mount()
  await flush()
  expect(host.textContent.trim()).toBe('')
})
