import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import CreateProjectModal from './CreateProjectModal.vue'

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn() }))
vi.mock('../../composables/useApi', () => ({ useApi: () => ({ apiFetch: mocks.apiFetch }) }))
vi.mock('../../composables/useConnections', () => ({ useConnections: () => ({ activeConnection: ref({ username: 'root' }) }) }))
vi.mock('../../composables/useNotificationQueue', () => ({ pushNotification: vi.fn() }))
vi.mock('@45drives/houston-common-ui', () => ({ pushNotification: vi.fn(), Notification: class {} }))
vi.mock('../../composables/useProjectChoices', () => ({
  useProjectChoices: () => ({
    detecting: ref(false), detectingRoots: ref(false), projectRoots: ref([]),
    loadProjectChoices: vi.fn().mockResolvedValue(undefined),
    configuredProjectRoot: ref('/tank'), useConfiguredProjectRoot: ref(true),
  }),
}))
vi.mock('../TreeNode.vue', () => ({ default: { template: '<div />' } }))
vi.mock('../IconMode.vue', () => ({ default: { template: '<div />' } }))
vi.mock('../FolderSpaceNotice.vue', () => ({ default: { template: '<div />' } }))
vi.mock('../../ui/FlowModal.vue', () => ({
  default: { setup(_, { slots }) { return () => h('div', [slots.default?.(), slots.footer?.()]) } },
}))

let app, host
const flush = async () => { for (let i = 0; i < 10; i++) { await Promise.resolve(); await nextTick() } }
afterEach(() => { app?.unmount(); host?.remove(); localStorage.clear(); vi.clearAllMocks() })

describe('project folder typed paths', () => {
  it.each(['Enter', 'blur'])('submits the typed folder after %s even without autocomplete results', async method => {
    mocks.apiFetch.mockImplementation(async (_url, init) => init?.method === 'POST'
      ? { project: { id: 1 } } : { entries: [] })
    host = document.createElement('div')
    document.body.appendChild(host)
    app = createApp(CreateProjectModal, { modelValue: true, storageRoot: '/tank' })
    app.mount(host)
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
