import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import FirstRunSetup from './FirstRunSetup.vue'
import { setupSections } from '../../composables/useSetupStatus'

vi.mock('../../ui/FlowModal.vue', () => ({
  default: { setup(_, { slots }) { return () => h('div', [slots.default?.(), slots.footer?.()]) } },
}))
vi.mock('./SetupSettingsPanel.vue', () => ({
  default: {
    props: ['section', 'initialStatus'], emits: ['refreshed', 'restarting'],
    template: '<div :data-panel="section"><button @click="$emit(\'refreshed\', {ready:true,storageRoot:{configured:true,path:\'/tank\'},projects:{count:0}})">Configure storage</button><button @click="$emit(\'restarting\', true)">Restart pending</button></div>',
  },
}))
vi.mock('./ShareSetupPanel.vue', () => ({
  default: { props: ['status'], template: '<div data-sharing>Sharing settings</div>' },
}))
vi.mock('../modals/CreateProjectModal.vue', () => ({
  default: { props: ['modelValue', 'storageRoot'], emits: ['created'], template: '<button v-if="modelValue" :data-project-root="storageRoot" @click="$emit(\'created\', {id:1})">Save project</button>' },
}))
let app, host
let refreshed
const flush = async () => {
  await new Promise(resolve => setTimeout(resolve)) // lets the async SettingsModal resolve
  for (let i = 0; i < 6; i++) await nextTick()
}
const button = text => [...host.querySelectorAll('button')].find(item => item.textContent === text)
async function mount(configured = false, persistenceKey, projectCount = 0) {
  const complete = vi.fn()
  refreshed = vi.fn()
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp(FirstRunSetup, { status: { ready: configured, storageRoot: { configured, path: configured ? '/tank' : '' }, projects: { count: projectCount } }, persistenceKey, onComplete: complete, onRefreshed: refreshed })
  app.mount(host)
  await flush()
  return complete
}
afterEach(() => { app?.unmount(); host?.remove() })

describe('first-run setup', () => {
  it('lets existing projects satisfy the final step when reviewing setup', async () => {
    const complete = await mount(true, undefined, 3)
    expect(host.textContent).toContain('Existing projects and files are kept.')
    for (let i = 0; i < 3; i++) {
      button('Next').click()
      await flush()
    }
    expect(host.textContent).toContain('Your existing projects are ready.')
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
    expect(complete).not.toHaveBeenCalled()
    expect(refreshed).not.toHaveBeenCalled()
    button('Create another project').click()
    await flush()
    button('Save project').click()
    await flush()
    expect(host.querySelector('[data-project-root]')).toBeNull()
    button('Finish setup').click()
    expect(complete).toHaveBeenCalledWith(true)
    expect(setupSections.map(item => item.key)).toEqual(expect.arrayContaining(['storage', 'staff', 'uploads', 'watermarks']))
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
