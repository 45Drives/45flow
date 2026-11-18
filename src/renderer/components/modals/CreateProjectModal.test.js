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

function mount(storageRoot = '/tank', extra = {}) {
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp(CreateProjectModal, { modelValue: true, ...(storageRoot ? { storageRoot } : {}), ...extra })
  app.mount(host)
}

describe('project folder typed paths', () => {
  it('opens nested folders in list view without creating the project until submitted', async () => {
    mocks.apiFetch.mockImplementation(async (url, init) => {
      if (init?.method === 'POST' && url === '/api/projects') return { project: { id: 1 } }
      if (url.startsWith('/api/files?')) {
        const dir = new URL(url, 'http://localhost').searchParams.get('dir')
        const entries = dir === 'tank' ? [{ name: 'parent', isDir: true }]
          : dir === 'tank/parent' ? [{ name: 'child', isDir: true }] : []
        return { dir, entries }
      }
      return { entries: [] }
    })
    mount()
    await flush()
    const name = host.querySelector('#new-project-name')
    name.value = 'Nested project'
    name.dispatchEvent(new Event('input', { bubbles: true }))
    host.querySelector('[aria-label="List view"]').click()
    await flush()
    host.querySelector('[title="tank/parent/"]').click()
    await flush()
    expect(host.querySelector('[title="tank/parent/child/"]')).not.toBeNull()
    host.querySelector('[title="tank/parent/child/"]').click()
    await flush()
    expect(host.querySelector('[data-path-input-root] input').value).toBe('/tank/parent/child/')
    expect(mocks.apiFetch.mock.calls.some(([url, init]) => url === '/api/projects' && init?.method === 'POST')).toBe(false)
    host.querySelector('#create-project-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flush()
    const [, init] = mocks.apiFetch.mock.calls.find(([url, opts]) => url === '/api/projects' && opts?.method === 'POST')
    expect(JSON.parse(init.body).rootDir).toBe('tank/parent/child')
  })

  it.each(['grid', 'list'])('uses the server path once when selecting a folder in %s view', async view => {
    mocks.apiFetch.mockImplementation(async (url, init) => {
      if (init?.method === 'POST' && url === '/api/projects') return { project: { id: 1 } }
      if (url.startsWith('/api/files?')) {
        const dir = new URL(url, 'http://localhost').searchParams.get('dir')
        return { dir: dir || 'tank', entries: dir === 'tank' || !dir ? [{ name: 'PROJECT_A', isDir: true }, { name: 'tank', isDir: true }] : [] }
      }
      return { entries: [] }
    })
    mount()
    await flush()
    const name = host.querySelector('#new-project-name')
    name.value = 'Project A'
    name.dispatchEvent(new Event('input', { bubbles: true }))
    if (view === 'list') {
      host.querySelector('[aria-label="List view"]').click()
      await flush()
      host.querySelector('[title="tank/PROJECT_A/"]').click()
    } else {
      host.querySelector('[aria-label="PROJECT_A folder"]').click()
    }
    await flush()
    expect(host.querySelector('[data-path-input-root] input').value).toBe('/tank/PROJECT_A/')
    if (view === 'grid') {
      expect(mocks.apiFetch.mock.calls.some(([url]) => url === '/api/files?dir=tank%2FPROJECT_A')).toBe(true)
    }
    host.querySelector('#create-project-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flush()
    const [, init] = mocks.apiFetch.mock.calls.find(([url, opts]) => url === '/api/projects' && opts?.method === 'POST')
    expect(JSON.parse(init.body).rootDir).toBe('tank/PROJECT_A')
  })

  it('preserves a real child folder with the same name as the storage root', async () => {
    mocks.apiFetch.mockImplementation(async url => url.startsWith('/api/files?')
      ? { dir: 'tank', entries: [{ name: 'tank', isDir: true }] }
      : { entries: [] })
    mount()
    await flush()
    host.querySelector('[aria-label="tank folder"]').click()
    await flush()
    expect(host.querySelector('[data-path-input-root] input').value).toBe('/tank/tank/')
  })

  it('edits a project using its current fields and allows selecting a sibling folder', async () => {
    const saved = vi.fn()
    const created = vi.fn()
    mocks.apiFetch.mockImplementation(async (url, init) => init?.method === 'PATCH'
      ? { project: { id: 8, name: 'Renamed project', root_dir: '/tank/second', description: 'Updated notes', show_flow_folder: false } }
      : url === '/api/projects' ? { showFlowFolderDefault: true }
      : { entries: [] })
    mount('/tank', { project: { id: 8, name: 'Original project', root_dir: '/tank/first', description: 'Notes', show_flow_folder: false }, onSaved: saved, onCreated: created })
    await flush()
    expect(host.querySelector('#new-project-name').value).toBe('Original project')
    expect(host.querySelector('#new-project-description').value).toBe('Notes')
    const visibilityLabel = [...host.querySelectorAll('label')].find(item => item.textContent.trim() === '.45flow folder visibility')
    expect(document.getElementById(visibilityLabel.htmlFor).value).toBe('false')
    expect(host.querySelector('[data-path-input-root] input').value).toBe('/tank/first/')
    const name = host.querySelector('#new-project-name')
    name.value = 'Renamed project'
    name.dispatchEvent(new Event('input', { bubbles: true }))
    const folder = host.querySelector('[data-path-input-root] input')
    folder.focus()
    folder.value = '/tank/second'
    folder.dispatchEvent(new Event('input', { bubbles: true }))
    folder.blur()
    const notes = host.querySelector('#new-project-description')
    notes.value = 'Updated notes'
    notes.dispatchEvent(new Event('input', { bubbles: true }))
    await flush()
    host.querySelector('#create-project-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flush()
    expect(mocks.apiFetch).toHaveBeenCalledWith('/api/projects/8', expect.objectContaining({
      method: 'PATCH', body: JSON.stringify({ name: 'Renamed project', rootDir: 'tank/second', description: 'Updated notes', showFlowFolder: false }),
    }))
    expect(saved).toHaveBeenCalledWith({ id: 8, name: 'Renamed project', root_dir: '/tank/second', description: 'Updated notes', show_flow_folder: false })
    expect(created).not.toHaveBeenCalled()
  })
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
    expect(mocks.apiFetch.mock.calls.some(([url, init]) => url === '/api/projects' && init?.method === 'POST')).toBe(false)
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
    expect(host.querySelector('[data-path-input-root] input').value).toBe('/tank/new-choice/')
    expect(mocks.apiFetch.mock.calls.some(([url, init]) => url === '/api/projects' && init?.method === 'POST')).toBe(false)
  })
  it.each([['Enter', null], ['blur', false]])('submits the typed folder after %s even without autocomplete results', async (method, override) => {
    mocks.apiFetch.mockImplementation(async (url, init) => init?.method === 'POST'
      ? { project: { id: 1 } }
      : url === '/api/projects' ? { showFlowFolderDefault: true } : { entries: [] })
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
    const label = [...host.querySelectorAll('label')].find(item => item.textContent.trim() === '.45flow folder visibility')
    const visibility = document.getElementById(label.htmlFor)
    expect(visibility.selectedOptions[0].textContent).toBe('Use server default (shown)')
    if (override === false) {
      visibility.selectedIndex = 2
      visibility.dispatchEvent(new Event('change', { bubbles: true }))
    }
    host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flush()
    const [, init] = mocks.apiFetch.mock.calls.find(([url, init]) => url === '/api/projects' && init?.method === 'POST')
    expect('/' + JSON.parse(init.body).rootDir.replace(/^\/+/, '')).toBe('/tank/typed-project')
    expect(JSON.parse(init.body).showFlowFolder).toBe(override)
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
