import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, ref } from 'vue'
import QuickShareOverlay from './QuickShareOverlay.vue'
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
vi.mock('./FolderPicker.vue', () => ({ default: {} }))
vi.mock('./modals/AddUsersModal.vue', () => ({ default: {} }))
vi.mock('./modals/PortForwardingModal.vue', () => ({ default: {} }))
vi.mock('./modals/CategoryManagementModal.vue', () => ({ default: {} }))
vi.mock('./LinkAccessMode.vue', () => ({ default: {} }))
vi.mock('./VideoOptionsPanel.vue', () => ({ default: {} }))
vi.mock('./WatermarkCustomizer.vue', () => ({ default: {} }))
vi.mock('./WatermarkPreview.vue', () => ({ default: {} }))

let app
let host
let state
const files = [
  { path: '/local/document.pdf', name: 'document.pdf', size: 100 },
  { path: '/local/report.xlsx', name: 'report.xlsx', size: 200 },
]

beforeEach(async () => {
  vi.clearAllMocks()
  mocks.state.suppressAutoOpen = false
  mocks.apiFetch.mockResolvedValue({})
  window.electron = { httpUploadStart: mocks.httpUploadStart }
  host = document.createElement('div')
  app = createApp({ ...QuickShareOverlay, render: () => null })
  app.provide(connectionMetaInjectionKey, ref({ apiBase: 'http://server', token: 'test-token' }))
  app.provide(currentServerInjectionKey, ref(null))
  const vm = app.mount(host)
  await nextTick()
  state = vm.$.setupState
  state.droppedFiles = files
  state.destFolder = '/uploads'
  mocks.apiFetch.mockClear()
})
afterEach(() => {
  app.unmount()
  host.remove()
  delete window.electron
})

describe('Quick Share preflight wiring', () => {
  it('does not upload the allowed PDF when another file is rejected', async () => {
    mocks.apiFetch.mockResolvedValue({
      ok: true, allAllowed: false,
      files: [
        { name: 'document.pdf', allowed: true },
        { name: 'report.xlsx', allowed: false, reason: 'File too large' },
      ],
    })
    await state.startUploadAndShare()
    expect(mocks.httpUploadStart).not.toHaveBeenCalled()
    expect(mocks.createUploadTask).not.toHaveBeenCalled()
    expect(mocks.apiFetch).toHaveBeenCalledOnce()
    expect(state.uploadPhase).toBe('error')
    expect(state.errorMsg).toContain('Nothing was uploaded')
    expect(state.errorMsg).toContain('report.xlsx: File too large')
    expect(state.busy).toBe(false)
    expect(mocks.state.suppressAutoOpen).toBe(false)
    expect(mocks.logError).toHaveBeenCalledWith('quick_share.failed', expect.any(Object))
  })

  it('waits for the entire check before creating transfer tasks or starting uploads', async () => {
    let finish
    mocks.apiFetch.mockReturnValue(new Promise(resolve => { finish = resolve }))
    mocks.httpUploadStart.mockResolvedValue({ id: 'upload-one', done: Promise.resolve({ ok: false, error: 'Test transfer stopped' }) })
    const pending = state.startUploadAndShare()
    expect(state.uploadPhase).toBe('validating')
    expect(mocks.httpUploadStart).not.toHaveBeenCalled()
    expect(mocks.createUploadTask).not.toHaveBeenCalled()
    state.cancel()
    expect(state.droppedFiles).toHaveLength(2)
    finish({ ok: true, allAllowed: true, files: files.map(file => ({ name: file.name, allowed: true })) })
    await pending
    expect(mocks.createUploadTask).toHaveBeenCalledOnce()
    expect(mocks.httpUploadStart).toHaveBeenCalledOnce()
    expect(state.errorMsg).toBe('Test transfer stopped')
  })
})
