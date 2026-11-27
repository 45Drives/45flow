import { afterEach, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'

vi.mock('../ui/FlowNotice.vue', () => ({ default: { template: '<div><slot /></div>' } }))
vi.mock('../ui/FlowSwitch.vue', () => ({ default: { template: '<div />' } }))
vi.mock('./WatermarkCustomizer.vue', () => ({ default: { template: '<div />' } }))

import LinkRecipientCopies from './LinkRecipientCopies.vue'

let app
let host

async function flush() {
  for (let i = 0; i < 6; i++) await nextTick()
}

function response(state) {
  return {
    ok: true,
    enabled: true,
    defaultSpec: { image: null, text: null },
    recipients: [{
      userId: 7,
      name: 'Reviewer',
      mode: 'default',
      status: { state, done: 0, total: 1, failed: state === 'failed' ? 1 : 0 },
      files: [{ fileId: 11, name: 'clip.mp4', jobs: { proxy_mp4: { status: state, error: 'processing failed' } } }],
    }],
  }
}

afterEach(() => {
  app?.unmount()
  host?.remove()
})

it('retries failed recipient copies and reloads their status', async () => {
  const apiFetch = vi.fn()
    .mockResolvedValueOnce(response('failed'))
    .mockResolvedValueOnce({ ok: true, retried: 1 })
    .mockResolvedValueOnce(response('processing'))
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp(LinkRecipientCopies, { linkId: 42, apiFetch })
  app.mount(host)
  await flush()

  const retry = [...host.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Retry')
  expect(retry).toBeDefined()
  retry.click()
  await vi.waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(3))

  expect(apiFetch).toHaveBeenNthCalledWith(2, '/api/links/42/recipient-watermarks/7/retry', {
    method: 'POST',
    retry: 0,
    exposeServerMessage: true,
  })
  expect(host.textContent).toContain('Preparing 0/1')
})
