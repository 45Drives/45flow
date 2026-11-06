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
}
afterEach(() => {
  app?.unmount()
  host?.remove()
  mocks.apiFetch.mockReset()
  mocks.notify.mockReset()
})

describe('LinkDetailsModal hosts the real email invitation panel', () => {
  it('renders Invite by Email always visible (Free, isPremiumActive=false), not standalone', async () => {
    await mount()
    expect(host.textContent).toContain('Invite by Email')
    // Confirm it is inside the real modal DOM (host), not a separately
    // mounted/mocked screen: its own input/button live under the same host.
    const emailInput = host.querySelector('input[type="email"]')
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
    const emailInput = host.querySelector('input[type="email"]')
    emailInput.value = 'reviewer@external.test'
    emailInput.dispatchEvent(new Event('input'))
    await flush()
    const sendButton = [...host.querySelectorAll('button')].find(b => b.textContent.includes('Send Invitation'))
    sendButton.click()
    await flush()
    expect(mocks.apiFetch).toHaveBeenCalledWith('/api/links/42/invite', {
      method: 'POST',
      body: JSON.stringify({ recipientEmail: 'reviewer@external.test' }),
    })
    expect(host.textContent).toContain('Not sent')
    expect(host.textContent).toContain('SMTP delivery is not configured')
    expect(host.textContent).not.toContain('Invitation sent')
  })
})
