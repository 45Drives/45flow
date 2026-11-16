import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import FileExplorer from './FileExplorer.vue'
import FolderPicker from './FolderPicker.vue'

vi.mock('@45drives/houston-common-ui', () => ({ pushNotification: vi.fn(), Notification: class {} }))
vi.mock('../composables/useProjectChoices', () => ({
  useProjectChoices: () => ({
    detecting: ref(false), detectingRoots: ref(false), projectRoots: ref([]),
    loadProjectChoices: vi.fn().mockResolvedValue(undefined),
    forceProjectRoot: ref(false), configuredProjectRoot: ref('/tank'),
    useConfiguredProjectRoot: ref(true), hasConfiguredProjectRoot: ref(true),
  }),
}))
vi.mock('./PathInput.vue', () => ({
  default: {
    props: ['modelValue'], emits: ['update:modelValue', 'choose'],
    template: '<div :data-current-path="modelValue"><button @click="$emit(\'choose\', {path:\'/etc\',isDir:true})">Choose outside storage</button><button @click="$emit(\'choose\', {path:\'/tank/job\',isDir:true})">Choose job folder</button></div>',
  },
}))
vi.mock('./TreeNode.vue', () => ({ default: { template: '<div />' } }))
vi.mock('./IconMode.vue', () => ({ default: { template: '<div />' } }))
let app, host
const flush = async () => { for (let i = 0; i < 10; i++) { await Promise.resolve(); await nextTick() } }
const button = text => [...host.querySelectorAll('button')].find(item => item.textContent.includes(text))
afterEach(() => { app?.unmount(); host?.remove(); localStorage.clear() })
async function mount(component, props) {
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp(component, props)
  app.mount(host)
  await flush()
}
describe('storage browser boundary', () => {
  it('stops FileExplorer Up at the storage root and clamps explicit outside destinations', async () => {
    await mount(FileExplorer, { rootDir: '/tank', startDir: '/tank/job', apiFetch: vi.fn().mockResolvedValue({ entries: [] }) })
    const up = () => host.querySelector('button[title="Go up one directory"]')
    expect(up().disabled).toBe(false)
    up().click()
    await flush()
    expect(host.querySelector('[data-current-path]').dataset.currentPath).toBe('/tank/')
    expect(up().disabled).toBe(true)
    button('Choose outside storage').click()
    await flush()
    expect(host.querySelector('[data-current-path]').dataset.currentPath).toBe('/tank/')
    expect(up().disabled).toBe(true)
  })
  it('FolderPicker starts in storage, never offers old default-folder editing, and stays within it', async () => {
    const apiFetch = vi.fn().mockResolvedValue({ entries: [] })
    await mount(FolderPicker, { modelValue: '', apiFetch, allowEntireTree: true, isRootUser: true })
    expect(host.textContent).toContain('Browse from storage root')
    expect(host.textContent).not.toContain('default server folder')
    expect(host.textContent).not.toContain('entire directory tree')
    expect(host.querySelector('button[title="Go up one directory"]').disabled).toBe(true)
    button('Choose job folder').click()
    await flush()
    const up = host.querySelector('button[title="Go up one directory"]')
    expect(up.disabled).toBe(false)
    up.click()
    await flush()
    expect(host.querySelector('[data-current-path]').dataset.currentPath).toBe('/tank/')
    button('Choose outside storage').click()
    await flush()
    expect(host.querySelector('[data-current-path]').dataset.currentPath).toBe('/tank/')
    expect(apiFetch.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
  })
})
