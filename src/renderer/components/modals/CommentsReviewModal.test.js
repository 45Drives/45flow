import { afterEach, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import CommentsReviewModal from './CommentsReviewModal.vue'

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn(), notify: vi.fn() }))
vi.mock('../../composables/useApi', () => ({ useApi: () => ({ apiFetch: mocks.apiFetch }) }))
vi.mock('../../composables/useTimeFormat', () => ({ useTimeFormat: () => ({ hour12: { value: false } }) }))
vi.mock('../../composables/useCommentCategories', () => ({
  useCommentCategories: () => ({ getCategoriesForLink: vi.fn().mockResolvedValue([]) }),
}))
vi.mock('@45drives/houston-common-ui', () => ({
  pushNotification: mocks.notify,
  Notification: class { constructor(title, message) { Object.assign(this, { title, message }) } },
}))
vi.mock('./AnnotationViewerModal.vue', () => ({ default: {} }))
vi.mock('./CategoryManagementModal.vue', () => ({ default: {} }))

let app, host
async function flush() { for (let i = 0; i < 12; i++) await nextTick() }
afterEach(() => {
  app?.unmount()
  host?.remove()
  mocks.apiFetch.mockReset()
  mocks.notify.mockReset()
})

it('shows the server resolution timestamp and clears it on reopening', async () => {
  const comment = {
    id: 7, file_id: 1, parent_id: null, author_id: 2, user_name: 'Reviewer',
    body: 'Adjust the audio', file_name: 'review.mp4', created_at: '2026-11-13 10:00:00',
    start_seconds: 0, resolved: false, resolved_at: null, resolved_by: null,
  }
  const stamp = '2026-11-13 12:34:00'
  mocks.apiFetch.mockImplementation(async (_url, init) => {
    if (init?.method === 'PATCH') {
      const { resolved } = JSON.parse(init.body)
      return { ok: true, comment: { ...comment, resolved, resolved_at: resolved ? stamp : null } }
    }
    return { ok: true, comments: [comment], stats: { total: 1, resolved: 0, unresolved: 1 } }
  })
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp(CommentsReviewModal, { modelValue: true, link: { id: 1, token: 'review-token' } })
  app.mount(host)
  await flush()
  const button = () => [...document.querySelectorAll('button')].find(b => ['Resolve', 'Reopen'].includes(b.textContent.trim()))
  button().click()
  await flush()
  const formatted = new Date('2026-11-13T12:34:00Z').toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  })
  expect(document.querySelector('.crm-body').parentElement.textContent).toContain(`Resolved at ${formatted}`)
  expect(button().textContent.trim()).toBe('Reopen')
  button().click()
  await flush()
  expect(document.querySelector('.crm-body').parentElement.textContent).not.toContain('Resolved at')
  expect(button().textContent.trim()).toBe('Resolve')
})
