import { afterEach, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'

const api = vi.hoisted(() => ({ apiFetch: vi.fn() }))
vi.mock('../composables/useApi', () => ({ useApi: () => ({ apiFetch: api.apiFetch }) }))

import EmailProblemsPanel from './EmailProblemsPanel.vue'

let app, host
async function flush() { for (let i = 0; i < 8; i++) await nextTick(); await new Promise(r => setTimeout(r, 0)) }
afterEach(() => { app?.unmount(); host?.remove(); api.apiFetch.mockReset() })

function mount() {
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp({ render: () => h(EmailProblemsPanel, { connectionId: 'c1' }) })
  app.mount(host)
}

const problem = (id, extra = {}) => ({
  id, linkId: 4, linkTitle: 'Spring cut', kind: 'invitation', recipientEmail: `c${id}@x.test`,
  status: 'rejected', attemptCount: 1, reason: 'refused', createdAt: '2026-11-13 12:00:00',
  updatedAt: '2026-11-13 12:00:00', mail: { configured: true, sent: false, message: '' }, ...extra,
})

it('lists problems from every link and clears a row once a retry is accepted', async () => {
  api.apiFetch.mockImplementation(async (url) => {
    if (url === '/api/emails/problems') return { ok: true, emails: [problem(1), problem(2, { status: 'timeout', linkTitle: null, linkId: 9 })] }
    if (url === '/api/links/4/invite/1/retry') return { ok: true, invitation: { id: 1, status: 'accepted' } }
    throw new Error(`unexpected ${url}`)
  })
  mount()
  await flush()

  const first = host.querySelector('[data-testid="email-problem-1"]')
  expect(first.textContent).toContain('Spring cut')
  expect(first.textContent).toContain('Failed')
  expect(host.querySelector('[data-testid="email-problem-2"]').textContent).toContain('Link 9')
  expect(host.querySelector('[data-testid="email-problem-2"]').textContent).toContain('Unconfirmed')

  ;[...first.querySelectorAll('button')].find(b => b.textContent.trim() === 'Retry').click()
  await flush()
  expect(api.apiFetch).toHaveBeenCalledWith('/api/links/4/invite/1/retry', { method: 'POST', retry: 0 })
  expect(host.querySelector('[data-testid="email-problem-1"]')).toBeNull()
})

it('says so when nothing needs attention, and hides on servers without the route', async () => {
  api.apiFetch.mockResolvedValue({ ok: true, emails: [] })
  mount()
  await flush()
  expect(host.textContent).toContain('No delivery problems')

  app.unmount(); host.remove()
  api.apiFetch.mockRejectedValue(Object.assign(new Error('missing'), { status: 404 }))
  mount()
  await flush()
  expect(host.textContent.trim()).toBe('')
})
