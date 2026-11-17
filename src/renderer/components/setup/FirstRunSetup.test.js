import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import FirstRunSetup from './FirstRunSetup.vue'
import { setupSections } from '../../composables/useSetupStatus'

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn(), projects: [], nextId: 1, prepareContinue: vi.fn() }))
vi.mock('../../composables/useApi', () => ({ useApi: () => ({ apiFetch: mocks.apiFetch }) }))
vi.mock('../../ui/FlowModal.vue', () => ({
  default: { props: ['modelValue'], setup(props, { slots }) { return () => props.modelValue ? h('div', [h('main', slots.default?.()), h('footer', slots.footer?.())]) : null } },
}))
vi.mock('./SetupSettingsPanel.vue', () => ({
  default: {
    props: ['section', 'initialStatus'], emits: ['refreshed', 'restarting', 'can-continue'],
    methods: { prepareContinue: () => mocks.prepareContinue() },
    mounted() { this.$emit('can-continue', !!this.initialStatus?.storageRoot?.configured) },
    template: '<div :data-panel="section"><button @click="$emit(\'refreshed\', {ready:true,storageRoot:{configured:true,path:\'/tank\'},projects:{count:0}}); $emit(\'can-continue\', true)">Configure storage</button><button @click="$emit(\'restarting\', true)">Restart pending</button><button @click="$emit(\'restarting\', false)">Restart finished</button></div>',
  },
}))
vi.mock('./ShareSetupPanel.vue', () => ({
  default: { props: ['status'], template: '<div data-sharing>Sharing settings</div>' },
}))
vi.mock('../modals/CreateProjectModal.vue', () => ({
  default: {
    props: ['modelValue', 'storageRoot', 'project'], emits: ['created', 'saved'],
    setup(props, { emit }) {
      function save() {
        const project = props.project
          ? { ...props.project, name: 'Edited project', root_dir: '/tank/edited' }
          : { id: mocks.nextId++, name: `Project ${mocks.nextId - 1}`, root_dir: `/tank/project-${mocks.nextId - 1}`, description: null }
        emit(props.project ? 'saved' : 'created', project)
      }
      return () => props.modelValue ? h('button', { 'data-project-root': props.storageRoot, onClick: save }, 'Save project') : null
    },
  },
}))
let app, host
let refreshed
const flush = async () => {
  await new Promise(resolve => setTimeout(resolve)) // lets the async SettingsModal resolve
  for (let i = 0; i < 6; i++) await nextTick()
}
const button = text => [...host.querySelectorAll('button')].find(item => item.textContent === text)
async function mount(configured = false, persistenceKey, projectCount = 0) {
  mocks.projects = Array.from({ length: projectCount }, (_, i) => ({ id: i + 1, name: `Existing ${i + 1}`, root_dir: `/tank/existing-${i + 1}`, description: null }))
  const complete = vi.fn()
  refreshed = vi.fn()
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp(FirstRunSetup, { status: { ready: configured, storageRoot: { configured, path: configured ? '/tank' : '' }, projects: { count: projectCount } }, persistenceKey, onComplete: complete, onRefreshed: refreshed })
  app.mount(host)
  await flush()
  return complete
}
beforeEach(() => {
  mocks.nextId = 1
  mocks.prepareContinue.mockReset().mockResolvedValue(true)
  mocks.apiFetch.mockReset().mockImplementation(async (url, init) => {
    if (init?.method === 'DELETE') return { ok: true }
    return { projects: mocks.projects }
  })
})
afterEach(() => { app?.unmount(); host?.remove() })

describe('first-run setup', () => {
  it('keeps current storage in the footer independently of folder selection', async () => {
    await mount()
    const storage = host.querySelector('footer p')
    expect(storage.textContent).toContain('Current storage: Not configured')
    button('Configure storage').click()
    await flush()
    expect(host.querySelector('footer p')).toBe(storage)
    expect(storage.textContent).toContain('Current storage: /tank')
    expect(host.querySelector('main').textContent).not.toContain('Current storage:')
    button('Next').click()
    await flush()
    expect(host.querySelector('footer p')).toBeNull()
  })

  it('lets existing projects satisfy the final step when reviewing setup', async () => {
    const complete = await mount(true, undefined, 3)
    for (let i = 0; i < 3; i++) {
      button('Next').click()
      await flush()
    }
    expect(host.textContent).toContain('Project folders and files are kept, even when removing a project.')
    expect(host.textContent).toContain('Existing 1')
    expect(host.textContent).toContain('/tank/existing-1')
    expect(button('Create another project')).toBeDefined()
    button('Finish setup').click()
    expect(complete).toHaveBeenCalledWith(true)
  })
  it('blocks Next and offers no skip until storage is configured', async () => {
    await mount()
    expect(button('Next').disabled).toBe(true)
    expect(button('Skip for now')).toBeUndefined()
    button('Configure storage').click()
    await flush()
    expect(button('Next').disabled).toBe(false)
    button('Restart pending').click()
    await flush()
    expect(button('Next').disabled).toBe(true)
  })
  it('lets Next review the selected folder and waits for confirmation and recovery before advancing', async () => {
    await mount(true)
    mocks.prepareContinue.mockResolvedValue(false)
    button('Next').click()
    await flush()
    expect(mocks.prepareContinue).toHaveBeenCalledOnce()
    expect(host.querySelector('[data-panel="storage"]')).not.toBeNull()
    button('Restart pending').click()
    await flush()
    expect(button('Next').disabled).toBe(true)
    button('Restart finished').click()
    await flush()
    expect(host.querySelector('[data-panel="staff"]')).not.toBeNull()
  })

  it('keeps the wizard to four steps and requires the first project', async () => {
    const complete = await mount(true)
    button('Next').click()
    await flush()
    expect(host.textContent).toContain('Step 2 of 4')
    expect(host.querySelector('[data-panel="staff"]')).not.toBeNull()
    button('Skip for now').click()
    await flush()
    expect(host.textContent).toContain('Step 3 of 4')
    expect(host.querySelector('[data-sharing]')).not.toBeNull()
    button('Skip for now').click()
    await flush()
    expect(host.textContent).toContain('Step 4 of 4')
    expect(button('Skip for now')).toBeUndefined()
    expect(button('Finish setup')).toBeUndefined()
    expect(complete).not.toHaveBeenCalled()
    button('Create project').click()
    await flush()
    expect(host.querySelector('[data-project-root="/tank"]')).not.toBeNull()
    button('Save project').click()
    await flush()
    expect(host.textContent).toContain('Project 1')
    expect(host.textContent).toContain('/tank/project-1')
    expect(complete).not.toHaveBeenCalled()
    expect(refreshed).not.toHaveBeenCalled()
    button('Create another project').click()
    await flush()
    button('Save project').click()
    await flush()
    expect(host.querySelectorAll('[aria-label="Projects"] li')).toHaveLength(2)
    expect(host.querySelector('[data-project-root]')).toBeNull()
    button('Finish setup').click()
    expect(complete).toHaveBeenCalledWith(true)
    expect(setupSections.map(item => item.key)).toEqual(expect.arrayContaining(['storage', 'staff', 'uploads', 'watermarks']))
  })
  it('edits listed projects and removes them only after confirmation, keeping files and links', async () => {
    const complete = await mount(true, undefined, 1)
    for (let i = 0; i < 3; i++) { button('Next').click(); await flush() }
    host.querySelector('[aria-label="Edit Existing 1"]').click()
    await flush()
    button('Save project').click()
    await flush()
    expect(host.textContent).toContain('Edited project')
    expect(host.textContent).toContain('/tank/edited')
    expect(host.textContent).not.toContain('/tank/existing-1')
    host.querySelector('[aria-label="Delete Edited project"]').click()
    await flush()
    expect(host.textContent).toContain('Its folder and files will be kept.')
    expect(mocks.apiFetch.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false)
    button('Cancel').click()
    await flush()
    expect(host.querySelectorAll('[aria-label="Projects"] li')).toHaveLength(1)
    host.querySelector('[aria-label="Delete Edited project"]').click()
    await flush()
    button('Delete project').click()
    await flush()
    expect(mocks.apiFetch).toHaveBeenCalledWith('/api/projects/1?hard=1', expect.objectContaining({ method: 'DELETE', retry: 0 }))
    expect(host.querySelector('[aria-label="Projects"]')).toBeNull()
    expect(button('Finish setup')).toBeUndefined()
    expect(complete).not.toHaveBeenCalled()
    button('Create project').click()
    await flush()
    button('Save project').click()
    await flush()
    expect(button('Finish setup')).toBeDefined()
  })
  it('preserves the project and shows an error when removal fails', async () => {
    await mount(true, undefined, 1)
    for (let i = 0; i < 3; i++) { button('Next').click(); await flush() }
    mocks.apiFetch.mockRejectedValueOnce(new Error('Delete denied'))
    host.querySelector('[aria-label="Delete Existing 1"]').click()
    await flush()
    button('Delete project').click()
    await flush()
    expect(host.textContent).toContain('Delete denied')
    expect(host.querySelectorAll('[aria-label="Projects"] li')).toHaveLength(1)
    expect(button('Finish setup')).toBeDefined()
  })
  it('shows a load error instead of trusting a stale project count and supports retry', async () => {
    await mount(true, undefined, 1)
    mocks.apiFetch.mockRejectedValueOnce(new Error('Projects unavailable'))
    for (let i = 0; i < 3; i++) { button('Next').click(); await flush() }
    expect(host.textContent).toContain('Projects unavailable')
    expect(button('Finish setup')).toBeUndefined()
    button('Refresh projects').click()
    await flush()
    expect(host.querySelectorAll('[aria-label="Projects"] li')).toHaveLength(1)
    expect(button('Finish setup')).toBeDefined()
    expect(refreshed).not.toHaveBeenCalled()
  })

  it('does not complete if the first project has not been created', async () => {
    const complete = await mount(true)
    button('Next').click()
    await flush()
    button('Skip for now').click()
    await flush()
    button('Skip for now').click()
    await flush()
    expect(button('Skip for now')).toBeUndefined()
    expect(button('Finish setup')).toBeUndefined()
    expect(complete).not.toHaveBeenCalled()
  })

  it('maps saved steps from the old wizard and cannot restore past unconfigured storage', async () => {
    sessionStorage.setItem('test-progress', JSON.stringify({ step: 4 }))
    await mount(true, 'test-progress')
    expect(host.textContent).toContain('Step 4 of 4')
    expect(button('Skip for now')).toBeUndefined()
    button('Back').click()
    await flush()
    expect(JSON.parse(sessionStorage.getItem('test-progress')).step).toBe(2)
    app.unmount()
    host.remove()
    await mount(true, 'test-progress')
    expect(host.querySelector('[data-sharing]')).not.toBeNull()
    app.unmount()
    host.remove()
    await mount(false, 'test-progress')
    expect(host.querySelector('[data-panel="storage"]')).not.toBeNull()
    expect(button('Next').disabled).toBe(true)
    sessionStorage.removeItem('test-progress')
  })

  it('resumes after the storage step when its restart has configured the selected folder', async () => {
    await mount(false, 'test-restart-progress')
    button('Restart pending').click()
    await flush()
    expect(JSON.parse(sessionStorage.getItem('test-restart-progress')).step).toBe(1)
    app.unmount()
    host.remove()
    await mount(true, 'test-restart-progress')
    expect(host.querySelector('[data-panel="staff"]')).not.toBeNull()
    sessionStorage.removeItem('test-restart-progress')
  })
})
