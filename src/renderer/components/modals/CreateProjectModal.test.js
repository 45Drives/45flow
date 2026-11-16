import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn(), configuredProjectRoot: '/tank' }))
vi.mock('../../composables/useApi', () => ({ useApi: () => ({ apiFetch: mocks.apiFetch }) }))
vi.mock('../../composables/useConnections', () => ({ useConnections: () => ({ activeConnection: ref({ username: 'root' }) }) }))
vi.mock('../../composables/useNotificationQueue', () => ({ pushNotification: vi.fn() }))
vi.mock('@45drives/houston-common-ui', () => ({ pushNotification: vi.fn(), Notification: class {} }))
vi.mock('../../composables/useProjectChoices', () => ({
  useProjectChoices: () => ({
    detecting: ref(false), detectingRoots: ref(false), projectRoots: ref([]),
    loadProjectChoices: vi.fn().mockResolvedValue(undefined),
    configuredProjectRoot: ref(mocks.configuredProjectRoot),
    useConfiguredProjectRoot: ref(!!mocks.configuredProjectRoot),
  }),
}))
vi.mock('../TreeNode.vue', () => ({ default: { template: '<div />' } }))
vi.mock('../IconMode.vue', () => ({ default: { template: '<div />' } }))
vi.mock('../FolderSpaceNotice.vue', () => ({ default: { template: '<div />' } }))
vi.mock('../../ui/FlowModal.vue', () => ({
  default: { setup(_, { slots }) { return () => h('div', [slots.default?.(), slots.footer?.()]) } },
}))

import CreateProjectModal from './CreateProjectModal.vue'

let app, host
const flush = async () => { for (let i = 0; i < 10; i++) { await Promise.resolve(); await nextTick() } }
afterEach(() => {
  app?.unmount()
  host?.remove()
  localStorage.clear()
  mocks.configuredProjectRoot = '/tank'
  vi.clearAllMocks()
})

function mount(storageRoot = '/tank') {
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp(CreateProjectModal, { modelValue: true, ...(storageRoot ? { storageRoot } : {}) })
  app.mount(host)
}

describe('project folder typed paths', () => {
  it('does not create a project when navigating up after entering a valid name and folder', async () => {
    mocks.apiFetch.mockResolvedValue({ entries: [] })
    mount()
    await flush()
    const name = host.querySelector('#new-project-name')
    name.value = 'Still choosing'
    name.dispatchEvent(new Event('input', { bubbles: true }))
    const input = host.querySelector('[data-path-input-root] input')
    input.focus()
    input.value = '/tank/first-choice'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.blur()
    await flush()
    const up = host.querySelector('[title="Go up one directory"]')
    expect(up.disabled).toBe(false)
    up.click()
    await flush()
    expect(mocks.apiFetch.mock.calls.some(([url]) => url === '/api/projects')).toBe(false)
    expect(input.value).toBe('/tank/')
  })
  it('creates a folder without submitting the project form', async () => {
    mocks.apiFetch.mockImplementation(async (url) => url === '/api/mkdir' ? { success: true } : { entries: [] })
    mount()
    await flush()
    const name = host.querySelector('#new-project-name')
    name.value = 'Still choosing'
    name.dispatchEvent(new Event('input', { bubbles: true }))
    host.querySelector('[title="Create a new folder in current directory"]').click()
    await flush()
    const folder = host.querySelector('[aria-label="Folder name"]')
    folder.value = 'new-choice'
    folder.dispatchEvent(new Event('input', { bubbles: true }))
    await flush()
    host.querySelector('#fp-new-folder-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flush()
    expect(mocks.apiFetch).toHaveBeenCalledWith('/api/mkdir', expect.objectContaining({ body: JSON.stringify({ path: '/tank/new-choice' }) }))
    expect(mocks.apiFetch.mock.calls.some(([url]) => url === '/api/projects')).toBe(false)
  })
  it.each(['Enter', 'blur'])('submits the typed folder after %s even without autocomplete results', async method => {
    mocks.apiFetch.mockImplementation(async (_url, init) => init?.method === 'POST'
      ? { project: { id: 1 } } : { entries: [] })
    mount()
    await flush()
    const name = host.querySelector('#new-project-name')
    name.value = 'Typed folder proof'
    name.dispatchEvent(new Event('input', { bubbles: true }))
    const input = host.querySelector('[data-path-input-root] input')
    input.focus()
    input.value = '/tank/typed-project'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    if (method === 'Enter') input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    else input.blur()
    await flush()
    host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flush()
    const [, init] = mocks.apiFetch.mock.calls.find(([url, init]) => url === '/api/projects' && init?.method === 'POST')
    expect('/' + JSON.parse(init.body).rootDir.replace(/^\/+/, '')).toBe('/tank/typed-project')
  })
})

describe('CreateProjectModal disabled-Create hint', () => {
  it('says what is missing and clears once the form is complete', async () => {
    mocks.apiFetch.mockResolvedValue({ entries: [] })
    mocks.configuredProjectRoot = null
    mount(null)
    await flush()
    const hint = () => host.querySelector('[data-testid="create-project-blocked"]')?.textContent.trim() || ''
    const createButton = () => host.querySelector('button[form="create-project-form"]')

    expect(createButton().disabled).toBe(true)
    expect(hint()).toBe('Enter a project name and choose a project folder to continue.')

    const name = host.querySelector('#new-project-name')
    name.value = 'Spring Edit'
    name.dispatchEvent(new Event('input', { bubbles: true }))
    await flush()
    expect(hint()).toBe('Choose a project folder to continue.')

    const folder = host.querySelector('[data-path-input-root] input')
    folder.focus()
    folder.value = '/tank/SpringEdit'
    folder.dispatchEvent(new Event('input', { bubbles: true }))
    folder.blur()
    await flush()
    expect(hint()).toBe('')
    expect(createButton().disabled).toBe(false)

    name.value = '   '
    name.dispatchEvent(new Event('input', { bubbles: true }))
    await flush()
    expect(hint()).toBe('Enter a project name to continue.')
    expect(createButton().disabled).toBe(true)
  })
})
