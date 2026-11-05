// C1 "Professional Public Address & No-IP" — G4 client guard coverage.
//
// G4 requires the client to check external-address readiness BEFORE
// copying an external recipient link, rather than emitting a stale or
// locally-fabricated external URL (server remains authoritative even if
// this client-side check is bypassed — see server G2 route wiring in
// server/api/links.js & server/test/track-c-c1.test.js).
//
// This exercises the real, actually-consumed guard/action: QuickShareOverlay.vue's
// copyLink(), which is the real "copy external link" action wired to the new
// useExternalAddressReadiness composable (GET /api/links/external-address-readiness).
// Internal/local-mode copying (usePublicBase === false) must remain unaffected —
// G5's legacy/local access is never gated by this check.

import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createApp, nextTick, ref } from 'vue'
import QuickShareOverlay from '../components/QuickShareOverlay.vue'
import { connectionMetaInjectionKey, currentServerInjectionKey } from '../keys/injection-keys'

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  createUploadTask: vi.fn(),
  finishUpload: vi.fn(),
  httpUploadStart: vi.fn(),
  notify: vi.fn(),
  logError: vi.fn(),
  state: { suppressAutoOpen: false, tasks: [] },
}))
vi.mock('vue-router', () => ({ useRoute: () => ({ path: '/' }) }))
vi.mock('@45drives/houston-common-ui', () => ({
  pushNotification: mocks.notify,
  Notification: class { constructor(title, message) { Object.assign(this, { title, message }) } },
}))
vi.mock('../composables/useLog', () => ({ appLog: { info: vi.fn(), error: mocks.logError } }))
vi.mock('../composables/useApi', () => ({ useApi: () => ({ apiFetch: mocks.apiFetch }) }))
vi.mock('../composables/useConnections', () => ({ useConnections: () => ({ activeConnection: { value: null } }) }))
vi.mock('../composables/useActiveProject', () => ({ useActiveProject: () => ({ activeProject: { value: null } }) }))
vi.mock('../composables/useProjectMode', () => ({ useProjectMode: () => ({ projectModeEnabled: { value: false } }) }))
vi.mock('../composables/useClientTranscode', () => ({
  useClientTranscode: () => ({ enabled: { value: false }, hwAccel: { value: false } }),
}))
vi.mock('../composables/useUploadTranscode', () => ({ useUploadTranscode: vi.fn() }))
vi.mock('../composables/useTransferProgress', () => ({
  useTransferProgress: () => ({
    state: mocks.state, createUploadTask: mocks.createUploadTask,
    finishUpload: mocks.finishUpload, updateUpload: vi.fn(),
  }),
}))
vi.mock('../composables/useLinkRefresh', () => ({ signalLinkCreated: vi.fn() }))
vi.mock('../composables/useTourManager', () => ({ useTourManager: () => ({ requestTour: vi.fn(), cancelTour: vi.fn() }) }))
vi.mock('../composables/useOnboarding', () => ({
  useOnboarding: () => ({ onboarding: { value: { quickShareTourDone: true } }, markDone: vi.fn() }),
}))
vi.mock('../composables/useLicenseStatus', () => ({ useLicenseStatus: () => ({ isPremiumActive: { value: false } }) }))
vi.mock('../composables/useCommentCategories', () => ({ useCommentCategories: () => ({ getDefaultCategories: vi.fn() }) }))
vi.mock('../components/FolderPicker.vue', () => ({ default: {} }))
vi.mock('../components/modals/AddUsersModal.vue', () => ({ default: {} }))
vi.mock('../components/modals/PortForwardingModal.vue', () => ({ default: {} }))
vi.mock('../components/modals/CategoryManagementModal.vue', () => ({ default: {} }))
vi.mock('../components/LinkAccessMode.vue', () => ({ default: {} }))
vi.mock('../components/VideoOptionsPanel.vue', () => ({ default: {} }))
vi.mock('../components/WatermarkCustomizer.vue', () => ({ default: {} }))
vi.mock('../components/WatermarkPreview.vue', () => ({ default: {} }))

let app
let host
let state
let writeText

beforeEach(async () => {
  vi.clearAllMocks()
  mocks.state.suppressAutoOpen = false
  mocks.apiFetch.mockResolvedValue({})
  window.electron = { httpUploadStart: mocks.httpUploadStart }
  writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  host = document.createElement('div')
  app = createApp({ ...QuickShareOverlay, render: () => null })
  app.provide(connectionMetaInjectionKey, ref({ apiBase: 'http://server', token: 'test-token' }))
  app.provide(currentServerInjectionKey, ref(null))
  const vm = app.mount(host)
  await nextTick()
  state = vm.$.setupState
  mocks.apiFetch.mockClear()
})
afterEach(() => {
  app.unmount()
  host.remove()
  delete window.electron
})

it('C1 blocks external copying until hostname and TLS are ready', async () => {
    // a. Unready (untrusted cert): copy is blocked with an actionable notice.
    state.viewUrl = 'https://share.example.com/link/abc123'
    state.usePublicBase = true
    mocks.apiFetch.mockResolvedValue({ ready: false, reason: 'certificate_not_trusted' })

    await state.copyLink()
    await nextTick()

    expect(mocks.apiFetch).toHaveBeenCalledWith('/api/links/external-address-readiness', { method: 'GET' })
    expect(writeText).not.toHaveBeenCalled()
    expect(mocks.notify).toHaveBeenCalledOnce()
    let notification = mocks.notify.mock.calls[0][0]
    expect(notification.title).toBe('External Address Not Ready')
    expect(notification.message).toMatch(/certificate/i)

    // b. Ready: ready confirmed, the real URL is actually copied.
    mocks.apiFetch.mockClear()
    writeText.mockClear()
    mocks.notify.mockClear()
    mocks.apiFetch.mockResolvedValue({ ready: true })

    await state.copyLink()
    await nextTick()

    expect(mocks.apiFetch).toHaveBeenCalledWith('/api/links/external-address-readiness', { method: 'GET' })
    expect(writeText).toHaveBeenCalledWith('https://share.example.com/link/abc123')

    // c. Fail closed: a readiness-check error never falls back to allowing copy.
    mocks.apiFetch.mockClear()
    writeText.mockClear()
    mocks.notify.mockClear()
    mocks.apiFetch.mockRejectedValue(new Error('network down'))

    await state.copyLink()
    await nextTick()

    expect(writeText).not.toHaveBeenCalled()
    expect(mocks.notify).toHaveBeenCalledOnce()

    // d. Legacy/local links are never gated by this check (G5 preserved).
    mocks.apiFetch.mockClear()
    writeText.mockClear()
    mocks.notify.mockClear()
    state.viewUrl = 'http://192.168.1.50:9095/link/abc123'
    state.usePublicBase = false

    await state.copyLink()
    await nextTick()

    expect(mocks.apiFetch).not.toHaveBeenCalled()
    expect(writeText).toHaveBeenCalledWith('http://192.168.1.50:9095/link/abc123')
  })
