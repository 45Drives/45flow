import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import FirstRunSetup from './FirstRunSetup.vue'
import { setupSections } from '../../composables/useSetupStatus'

vi.mock('../../ui/FlowModal.vue', () => ({
  default: { setup(_, { slots }) { return () => h('div', [slots.default?.(), slots.footer?.()]) } },
}))
vi.mock('./SetupSettingsPanel.vue', () => ({
  default: {
    props: ['section'], emits: ['refreshed', 'restarting'],
    template: '<div :data-panel="section"><button @click="$emit(\'refreshed\', {ready:true,storageRoot:{configured:true,path:\'/tank\'},projects:{count:0}})">Configure storage</button><button @click="$emit(\'restarting\', true)">Restart pending</button></div>',
  },
}))
vi.mock('../modals/SettingsModal.vue', () => ({
  default: { props: ['initialSection'], template: '<div :data-settings-section="initialSection">Shared settings</div>' },
}))
vi.mock('../modals/CreateProjectModal.vue', () => ({
  default: { props: ['modelValue', 'storageRoot'], emits: ['created'], template: '<button v-if="modelValue" :data-project-root="storageRoot" @click="$emit(\'created\', {id:1})">Save project</button>' },
}))
let app, host
const flush = async () => { for (let i = 0; i < 6; i++) await nextTick() }
const button = text => [...host.querySelectorAll('button')].find(item => item.textContent === text)
async function mount(configured = false, persistenceKey) {
  const complete = vi.fn()
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp(FirstRunSetup, { status: { ready: configured, storageRoot: { configured, path: configured ? '/tank' : '' }, projects: { count: 0 } }, persistenceKey, onComplete: complete })
  app.mount(host)
  await flush()
  return complete
}
afterEach(() => { app?.unmount(); host?.remove() })

describe('first-run setup', () => {
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

  it('skips optional steps, reuses share settings, and creates a project within the storage root', async () => {
    const complete = await mount(true)
    button('Next').click()
    await flush()
    expect(host.querySelector('[data-panel="staff"]')).not.toBeNull()
    button('Skip for now').click()
    await flush()
    button('Edit share addresses').click()
    await flush()
    expect(host.querySelector('[data-settings-section="sharing"]')).not.toBeNull()
    button('Check internet sharing').click()
    await flush()
    expect(host.querySelector('[data-settings-section="publicSharing"]')).not.toBeNull()
    for (const section of ['uploads', 'watermarks']) {
      button('Skip for now').click()
      await flush()
      expect(host.querySelector(`[data-panel="${section}"]`)).not.toBeNull()
    }
    button('Skip for now').click()
    await flush()
    button('Create first project').click()
    await flush()
    expect(host.querySelector('[data-project-root="/tank"]')).not.toBeNull()
    button('Save project').click()
    await flush()
    button('Finish setup').click()
    expect(complete).toHaveBeenCalledOnce()
    expect(setupSections.map(item => item.key)).toEqual(expect.arrayContaining(['storage', 'staff', 'uploads', 'watermarks']))
  })

  it('resumes the saved step after remount and cannot restore past unconfigured storage', async () => {
    sessionStorage.setItem('test-progress', JSON.stringify({ step: 4 }))
    await mount(true, 'test-progress')
    expect(host.querySelector('[data-panel="watermarks"]')).not.toBeNull()
    button('Back').click()
    await flush()
    expect(JSON.parse(sessionStorage.getItem('test-progress')).step).toBe(3)
    app.unmount()
    host.remove()
    await mount(true, 'test-progress')
    expect(host.querySelector('[data-panel="uploads"]')).not.toBeNull()
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
