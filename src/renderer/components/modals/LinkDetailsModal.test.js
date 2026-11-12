// C3 email-invitation client integration — bounded parent-host check.
//
// Mounts the REAL LinkDetailsModal.vue with the REAL EmailInvitationPanel.vue
// child (not stubbed), using the same createApp harness convention as
// QuickShareOverlay.test.js. Heavy, unrelated sibling modals/composables are
// stubbed so this stays a bounded check of the invitation integration point,
// not a full re-test of the whole modal. Confirms: the panel renders inside
// the modal's real template (not a standalone mocked screen), is visible with
// isPremiumActive=false (Free — must not be hidden behind the Pro-gated
// Comments/Activity/watermark areas), uses the host's injected apiFetch prop
// for the real POST, and the honest "not sent" wording from the server DTO
// reaches the DOM.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import LinkDetailsModal from './LinkDetailsModal.vue'

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn(), notify: vi.fn() }))

vi.mock('@45drives/houston-common-ui', () => ({
  pushNotification: mocks.notify,
  Notification: class { constructor(title, message) { Object.assign(this, { title, message }) } },
}))
vi.mock('../../composables/useTimeFormat', () => ({ useTimeFormat: () => ({ hour12: { value: true } }) }))
vi.mock('../../composables/useTransferProgress', () => ({
  useTransferProgress: () => ({
    splitActiveTranscodeAssetVersions: () => ({ active: [], inactive: [] }),
    startPlaybackTranscodeTask: vi.fn(),
    startAssetVersionTranscodeTask: vi.fn(),
    startTranscodeTask: vi.fn(),
    restoreActiveTranscodes: vi.fn(),
  }),
}))
vi.mock('../../composables/useExternalAddressReadiness', () => ({
  useExternalAddressReadiness: () => ({ checkExternalAddressReady: vi.fn() }),
  describeExternalAddressNotReady: () => '',
  resolveCopyUrl: (url) => url,
}))
vi.mock('../../composables/useConnections', () => ({
  useConnections: () => ({ activeConnection: { value: null }, connections: [] }),
}))
vi.mock('../../composables/useLicenseStatus', () => ({
  useLicenseStatus: () => ({ isPremiumActive: { value: false } }),
}))
vi.mock('../../composables/useRemoteTranscode', () => ({
  useRemoteTranscode: () => ({ runRemoteTranscode: vi.fn(), isRemoteTranscoding: () => false }),
}))
vi.mock('../../composables/useClientTranscode', () => ({
  useClientTranscode: () => ({ enabled: { value: false } }),
}))
vi.mock('../../composables/useCommentCategories', () => ({
  useCommentCategories: () => ({ getCategoriesForLink: vi.fn().mockResolvedValue([]) }),
}))
vi.mock('../../composables/useTourManager', () => ({
  useTourManager: () => ({ requestTour: vi.fn(), cancelTour: vi.fn() }),
}))
vi.mock('../../composables/useOnboarding', () => ({
  useOnboarding: () => ({ onboarding: { value: { linkDetailsTourDone: true, linkDetailsEditTourDone: true } }, markDone: vi.fn() }),
}))
vi.mock('./AddUsersModal.vue', () => ({ default: {} }))
vi.mock('./EditLinkFilesModal.vue', () => ({ default: {} }))
vi.mock('./CommentsReviewModal.vue', () => ({ default: {} }))
vi.mock('./CategoryManagementModal.vue', () => ({ default: {} }))
vi.mock('../PathInput.vue', () => ({ default: {} }))
vi.mock('../LinkTranscodeStatus.vue', () => ({ default: {} }))
vi.mock('../WatermarkCustomizer.vue', () => ({ default: {} }))
vi.mock('../WatermarkPreview.vue', () => ({ default: {} }))

let app
let host
let modal
async function flush() {
  for (let i = 0; i < 5; i++) await nextTick()
}
const link = {
  id: 42,
  type: 'download',
  title: 'Sample link',
  notes: '',
  token: 'tok-abc',
  url: 'https://files.example.test/link/tok-abc',
  createdAt: Date.now(),
  expiresAt: null,
  isDisabled: false,
  access_mode: 'open',
  allow_comments: false,
  generateReviewProxy: false,
  proxyQualities: [],
  watermark: false,
  upload_enabled: false,
  share_enabled: true,
}
async function mount() {
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp(LinkDetailsModal, { modelValue: true, link, apiFetch: mocks.apiFetch })
  app.mount(host)
  await flush()
  // FlowModal teleports its panel to <body>, so query the real modal panel.
  modal = document.querySelector('.flow-modal__panel')
}
afterEach(() => {
  app?.unmount()
  host?.remove()
  mocks.apiFetch.mockReset()
  mocks.notify.mockReset()
})

describe('LinkDetailsModal hosts the real email invitation panel', () => {
  it('renders Invite by email always visible (Free, isPremiumActive=false), not standalone', async () => {
    await mount()
    expect(modal.textContent).toContain('Invite by email')
    // Confirm it is inside the real modal DOM, not a separately
    // mounted/mocked screen: its own input/button live under the same modal panel.
    const emailInput = modal.querySelector('input[type="email"]')
    expect(emailInput).not.toBeNull()
  })

  it('posts through the host apiFetch prop to the exact link id and shows the honest unsent state', async () => {
    await mount()
    mocks.apiFetch.mockResolvedValueOnce({
      ok: true,
      invitation: {
        id: 7, linkId: 42, recipientEmail: 'reviewer@external.test', status: 'pending',
        attemptCount: 0, lastOutcome: null, createdAt: '2026-11-06T00:00:00Z', updatedAt: '2026-11-06T00:00:00Z',
        invitationUrl: 'https://files.example.test/link/tok-abc',
        mail: { configured: false, sent: false, message: 'SMTP delivery is not configured for this installation; the invitation has been queued but not sent.' },
      },
    })
    const emailInput = modal.querySelector('input[type="email"]')
    emailInput.value = 'reviewer@external.test'
    emailInput.dispatchEvent(new Event('input'))
    await flush()
    const sendButton = [...modal.querySelectorAll('button')].find(b => b.textContent.includes('Send invitation'))
    sendButton.click()
    await flush()
    expect(mocks.apiFetch).toHaveBeenCalledWith('/api/links/42/invite', {
      method: 'POST',
      body: JSON.stringify({ recipientEmail: 'reviewer@external.test' }),
    })
    expect(modal.textContent).toContain('Not sent')
    expect(modal.textContent).toContain("Email isn't set up on this server yet")
    expect(modal.textContent).not.toContain('Invitation sent')
  })
})

describe('LinkDetailsModal edit: Review and Upload switches', () => {
  const sharing = { ...link, target: { files: [{ relPath: '/tank/P/a.mov' }, { relPath: '/tank/P/sub/b.mov' }] } }
  const button = (text) => [...modal.querySelectorAll('button')].find(b => b.textContent.trim() === text)
  const toggle = (name) => [...modal.querySelectorAll('[role="switch"]')].find(s => s.textContent.trim() === name)
  const selectedTab = () => modal.querySelector('[role="tablist"][aria-label="Edit link"] [aria-selected="true"]').textContent.trim()

  it('summarises what each one does and jumps to its tab when turned on', async () => {
    host = document.createElement('div')
    document.body.appendChild(host)
    app = createApp(LinkDetailsModal, { modelValue: true, link: sharing, apiFetch: mocks.apiFetch })
    app.mount(host)
    await flush()
    modal = document.querySelector('.flow-modal__panel')
    button('Edit').click()
    await flush()
    expect(modal.textContent).toContain('2 files from /tank/P/')
    expect(button('Manage files…')).toBeDefined()

    toggle('Upload').click()
    await flush()
    expect(selectedTab()).toBe('Uploads')

    button('Details').click()
    await flush()
    expect(modal.textContent).toContain('Uploads go to /tank/P/')

    toggle('Review').click()
    await flush()
    expect(selectedTab()).toBe('Details')
    toggle('Review').click()
    await flush()
    expect(selectedTab()).toBe('Files')
  })
})
