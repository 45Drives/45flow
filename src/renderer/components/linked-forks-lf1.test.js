// LF1 fork dialog and Versions tab, mounted inside the real LinkDetailsModal.
// The server is mocked to the C-FORK-API contract (POST /api/files/:id/forks,
// GET /api/fork-jobs/:id, POST /api/fork-jobs/:id/retry, GET /api/files/:id/lineage).

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import LinkDetailsModal from './modals/LinkDetailsModal.vue'

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn(), notify: vi.fn() }))

vi.mock('@45drives/houston-common-ui', () => ({
  pushNotification: mocks.notify,
  Notification: class { constructor(title, message) { Object.assign(this, { title, message }) } },
}))
vi.mock('../composables/useTimeFormat', () => ({ useTimeFormat: () => ({ hour12: { value: true } }) }))
vi.mock('../composables/useTransferProgress', () => ({
  useTransferProgress: () => ({
    splitActiveTranscodeAssetVersions: () => ({ active: [], inactive: [] }),
    startPlaybackTranscodeTask: vi.fn(),
    startAssetVersionTranscodeTask: vi.fn(),
    startTranscodeTask: vi.fn(),
    restoreActiveTranscodes: vi.fn(),
  }),
}))
vi.mock('../composables/useExternalAddressReadiness', () => ({
  useExternalAddressReadiness: () => ({ checkExternalAddressReady: vi.fn() }),
  describeExternalAddressNotReady: () => '',
  resolveCopyUrl: (url) => url,
}))
vi.mock('../composables/useConnections', () => ({
  useConnections: () => ({ activeConnection: { value: null }, connections: [] }),
}))
vi.mock('../composables/useLicenseStatus', () => ({
  useLicenseStatus: () => ({ isPremiumActive: { value: false } }),
}))
vi.mock('../composables/useRemoteTranscode', () => ({
  useRemoteTranscode: () => ({ runRemoteTranscode: vi.fn(), isRemoteTranscoding: () => false }),
}))
vi.mock('../composables/useClientTranscode', () => ({
  useClientTranscode: () => ({ enabled: { value: false } }),
}))
vi.mock('../composables/useCommentCategories', () => ({
  useCommentCategories: () => ({ getCategoriesForLink: vi.fn().mockResolvedValue([]) }),
}))
vi.mock('../composables/useTourManager', () => ({
  useTourManager: () => ({ requestTour: vi.fn(), cancelTour: vi.fn() }),
}))
vi.mock('../composables/useOnboarding', () => ({
  useOnboarding: () => ({ onboarding: { value: { linkDetailsTourDone: true, linkDetailsEditTourDone: true } }, markDone: vi.fn() }),
}))
vi.mock('./modals/AddUsersModal.vue', () => ({ default: {} }))
vi.mock('./modals/EditLinkFilesModal.vue', () => ({ default: {} }))
vi.mock('./modals/CommentsReviewModal.vue', () => ({ default: {} }))
vi.mock('./modals/CategoryManagementModal.vue', () => ({ default: {} }))
vi.mock('./PathInput.vue', () => ({ default: {} }))
vi.mock('./LinkTranscodeStatus.vue', () => ({ default: {} }))
vi.mock('./WatermarkCustomizer.vue', () => ({ default: {} }))
vi.mock('./WatermarkPreview.vue', () => ({ default: {} }))

const link = {
  id: 42, type: 'download', title: 'Sample link', notes: '', token: 'tok-abc',
  url: 'https://files.example.test/link/tok-abc', createdAt: Date.now(), expiresAt: null, isDisabled: false,
  access_mode: 'open', allow_comments: false, generateReviewProxy: false, proxyQualities: [], watermark: false,
  upload_enabled: false, share_enabled: true,
}
const versionRows = [1, 2, 3].map(n => ({
  asset_version_id: 100 + n, version_index: n, created_at: '2026-11-01 10:00:00',
  snapshot_rel: `.45flow/versions/${100 + n}/v${n}.mov`, snapshot_size_bytes: 1000 * n,
}))
const lineageWithFork = {
  ok: true,
  origin: null,
  family: [
    { fileId: 7, filename: 'Original.mov', label: null, forkedFrom: null, versions: [] },
    { fileId: 8, filename: 'Original - social.mov', label: 'Social Cut', forkedFrom: { fileId: 7, assetVersionId: 101, versionNumber: 1 }, versions: [] },
  ],
}
const lineageAlone = { ok: true, origin: null, family: [{ fileId: 7, filename: 'Original.mov', label: null, forkedFrom: null, versions: [] }] }

let app
let host
let modal
let server

async function flush() {
  for (let i = 0; i < 8; i++) { await Promise.resolve(); await nextTick() }
}

/** Mock server answering the endpoints the Versions tab and fork dialog use. */
function serve(overrides = {}) {
  server = {
    lineage: lineageAlone,
    postFork: async () => ({ ok: true, jobId: 5 }),
    job: async () => ({ ok: true, state: 'copying', progress: 40, errorCode: null, fileId: null }),
    retry: async () => ({ ok: true, jobId: 5 }),
    ...overrides,
  }
  mocks.apiFetch.mockImplementation(async (url, init = {}) => {
    if (url === '/api/links/42/details') {
      return { link: { token: 'tok-abc' }, files: [{ id: 7, name: 'Original.mov', relPath: '/tank/P/Original.mov' }] }
    }
    if (url === '/api/files/7/versions') return { ok: true, versions: versionRows }
    if (url === '/api/files/7/lineage') return server.lineage
    if (url === '/api/files/8/location') return { ok: true, fileId: 8, relPath: 'P/Original - social.mov' }
    if (url === '/api/files/7/forks' && init.method === 'POST') return server.postFork(JSON.parse(init.body))
    if (/^\/api\/fork-jobs\/\d+$/.test(url)) return server.job()
    if (/^\/api\/fork-jobs\/\d+\/retry$/.test(url) && init.method === 'POST') return server.retry()
    return {}
  })
}

async function mountVersionsTab(linkProps = link) {
  host = document.createElement('div')
  document.body.appendChild(host)
  // The modal loads its files when it opens, so mount it closed and then open it.
  const open = ref(false)
  app = createApp({ render: () => h(LinkDetailsModal, { modelValue: open.value, link: linkProps, apiFetch: mocks.apiFetch }) })
  app.mount(host)
  await flush()
  open.value = true
  await flush()
  modal = document.querySelector('.flow-modal__panel')
  const tab = [...modal.querySelectorAll('[role="tab"]')].find(t => t.textContent.trim().startsWith('Versions'))
  tab.click()
  await flush()
}

const rowFor = (n) => [...modal.querySelectorAll('tbody tr')].find(tr => tr.querySelector('td')?.textContent.trim() === `v${n}`)
const buttonIn = (root, text) => [...root.querySelectorAll('button')].find(b => b.textContent.trim() === text)
const dialog = () => [...document.querySelectorAll('.flow-modal__panel')].find(p => p.querySelector('#fork-version-form'))
const field = (id) => dialog().querySelector(`[data-testid="${id}"]`)
const forkPosts = () => mocks.apiFetch.mock.calls.filter(([url, init]) => url === '/api/files/7/forks' && init?.method === 'POST')
const submitForm = async () => {
  dialog().querySelector('#fork-version-form').dispatchEvent(new Event('submit', { cancelable: true }))
  await flush()
}
async function openForkOnV3() {
  buttonIn(rowFor(3), 'Fork from this version').click()
  await flush()
}

afterEach(() => {
  vi.useRealTimers()
  app?.unmount()
  host?.remove()
  document.body.innerHTML = ''
  mocks.apiFetch.mockReset()
  mocks.notify.mockReset()
})

describe('LF1 fork dialog', () => {
  it('LF1 opens from v3 with the source read-only and sensible defaults', async () => {
    serve()
    await mountVersionsTab()
    await openForkOnV3()
    expect(dialog()).toBeTruthy()
    expect(field('fork-source').value).toBe('Original.mov · v3')
    expect(field('fork-source').readOnly).toBe(true)
    expect(field('fork-filename').value).toBe('Original - fork.mov')
    expect(field('fork-folder').value).toBe('tank/P')
    expect(field('fork-attach').checked).toBe(false)
  })

  it('LF1 posts the contract body and a double click reuses one key', async () => {
    serve()
    await mountVersionsTab()
    await openForkOnV3()
    field('fork-label').value = 'Social Cut'
    field('fork-label').dispatchEvent(new Event('input'))
    await submitForm()
    await submitForm()
    const posts = forkPosts()
    expect(posts.length).toBeGreaterThanOrEqual(1)
    const bodies = posts.map(([, init]) => JSON.parse(init.body))
    expect(Object.keys(bodies[0]).sort()).toEqual(['attachLinkId', 'destRelDir', 'filename', 'idempotencyKey', 'label', 'sourceVersionId'])
    expect(bodies[0]).toMatchObject({
      sourceVersionId: 103, destRelDir: 'tank/P', filename: 'Original - fork.mov', label: 'Social Cut', attachLinkId: null,
    })
    expect(typeof bodies[0].idempotencyKey).toBe('string')
    expect(bodies[0].idempotencyKey.length).toBeGreaterThan(8)
    expect(new Set(bodies.map(b => b.idempotencyKey)).size).toBe(1)
  })

  it('LF1 shows name_taken as a plain message, keeps the dialog open and keeps the same key on resubmit', async () => {
    let calls = 0
    serve({
      postFork: async () => {
        calls += 1
        if (calls === 1) throw Object.assign(new Error('A file with that name already exists'), { status: 409, code: 'name_taken' })
        return { ok: true, jobId: 5 }
      },
    })
    await mountVersionsTab()
    await openForkOnV3()
    await submitForm()
    expect(dialog()).toBeTruthy()
    expect(field('fork-error').textContent).toContain('A file with that name already exists')
    field('fork-filename').value = 'Original - fork 2.mov'
    field('fork-filename').dispatchEvent(new Event('input'))
    await submitForm()
    const bodies = forkPosts().map(([, init]) => JSON.parse(init.body))
    expect(bodies).toHaveLength(2)
    expect(bodies[1].filename).toBe('Original - fork 2.mov')
    expect(bodies[1].idempotencyKey).toBe(bodies[0].idempotencyKey)
  })

  it('LF1 follows the job to done, and shows the error with Retry when it fails', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const states = [
      { ok: true, state: 'copying', progress: 40, errorCode: null, fileId: null },
      { ok: true, state: 'failed', progress: 40, errorCode: 'not_enough_space', fileId: null },
      { ok: true, state: 'done', progress: 100, errorCode: null, fileId: 9 },
    ]
    let next = 0
    serve({ job: async () => states[Math.min(next++, states.length - 1)] })
    await mountVersionsTab()
    await openForkOnV3()
    await submitForm()
    expect(field('fork-progress').textContent).toContain('40%')
    expect(mocks.apiFetch).toHaveBeenCalledWith('/api/fork-jobs/5')

    await vi.advanceTimersByTimeAsync(1000)
    await flush()
    expect(field('fork-error').textContent).toContain('not enough free space')
    const retry = field('fork-retry')
    expect(retry).toBeTruthy()

    retry.click()
    await flush()
    expect(mocks.apiFetch).toHaveBeenCalledWith('/api/fork-jobs/5/retry', expect.objectContaining({ method: 'POST' }))
    await vi.advanceTimersByTimeAsync(1000)
    await flush()
    expect(field('fork-progress').textContent).toContain('Fork created')
    expect(field('fork-path').textContent).toMatch(/ - fork/)
    expect(field('fork-progress').textContent).toContain('It is not on this link.')
    expect(field('fork-retry')).toBeNull()
  })
})

describe('LF1 versions tab', () => {
  it('LF1 shows Kept in place of Delete for a fork-source version only', async () => {
    serve({ lineage: lineageWithFork })
    await mountVersionsTab()
    const v1 = rowFor(1)
    expect(v1.textContent).toContain('Kept: Social Cut was forked from this version')
    expect(buttonIn(v1, 'Delete')).toBeUndefined()
    const v2 = rowFor(2)
    expect(v2.textContent).not.toContain('Kept:')
    expect(buttonIn(v2, 'Delete')).toBeDefined()
    expect(buttonIn(v2, 'Delete').disabled).toBe(false)
  })
})

describe('fork visibility', () => {
  it('offers to add a fork that is not on the link, through Edit', async () => {
    serve({ lineage: lineageWithFork })
    await mountVersionsTab()
    const add = buttonIn(rowFor(1), 'Add Social Cut to link…')
    expect(add).toBeDefined()
    add.click()
    await flush()
    expect(mocks.apiFetch).toHaveBeenCalledWith('/api/files/8/location')
    expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ title: 'Fork Added to Files' }))
  })

  it('says where a fork came from and keeps the earlier history on the source', async () => {
    serve({ lineage: {
      ok: true,
      origin: { fileId: 3, filename: 'Root.mov', assetVersionId: 50, versionNumber: 2, available: true },
      family: [
        { fileId: 3, filename: 'Root.mov', label: null, forkedFrom: null, versions: [1, 2, 3].map(n => ({ assetVersionId: 48 + n, versionNumber: n })) },
        { fileId: 7, filename: 'Original.mov', label: null, forkedFrom: { fileId: 3, assetVersionId: 50, versionNumber: 2 }, versions: [] },
      ],
    } })
    await mountVersionsTab()
    const notice = modal.querySelector('[data-testid="fork-origin"]')
    expect(notice.textContent).toContain('Forked from Root.mov · v2')
    expect(notice.textContent).toContain('(v1, v2) stays on the source')
    expect(notice.textContent).toContain("The source isn't on this link.")
  })

  it('turns Compare with… off on an expired link', async () => {
    serve({ lineage: lineageWithFork })
    await mountVersionsTab({ ...link, expiresAt: Date.now() - 60_000 })
    const btn = rowFor(2).querySelector('[data-testid="compare-with"]')
    expect(btn.disabled).toBe(true)
    expect(btn.title).toContain('expired')
  })
})
