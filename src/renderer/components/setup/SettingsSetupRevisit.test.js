import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import SettingsModal from '../modals/SettingsModal.vue'

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn(), connection: null }))
vi.mock('../../composables/useApi', () => ({ useApi: () => ({ apiFetch: mocks.apiFetch, baseUrl: ref('https://server.example'), meta: ref({}) }) }))
vi.mock('../../composables/useConnections', () => ({ useConnections: () => ({ activeConnection: mocks.connection, connections: ref([]), updateConnection: vi.fn() }) }))
vi.mock('../../composables/useThemeFromAlias', () => ({ useThemeFromAlias: () => ({ setCustomThemeColors: vi.fn(), setCustomThemeEnabled: vi.fn() }) }))
vi.mock('@45drives/houston-common-ui', () => ({ pushNotification: vi.fn(), Notification: class {} }))
vi.mock('./SetupSettingsPanel.vue', () => ({ default: { props: ['section'], template: '<div :data-settings-panel="section">Shared setup controls</div>' } }))
vi.mock('../../ui/FlowModal.vue', () => ({
  default: { setup(_, { slots }) { return () => h('div', [slots.default?.(), slots.footer?.()]) } },
}))
let app, host
afterEach(() => { app?.unmount(); host?.remove(); vi.useRealTimers() })
describe('revisiting skipped setup from Settings', () => {
  it('opens every shared panel from the existing Settings section rail and removes old folder editing', async () => {
    vi.useFakeTimers()
    const token = `header.${btoa(JSON.stringify({ amr: ['pam'], exp: Date.now() / 1000 + 600 }))}.signature`
    mocks.connection = ref({ connectionId: 'server-one', token })
    mocks.apiFetch.mockResolvedValue({})
    window.electron = { isWeb: true }
    host = document.createElement('div')
    document.body.appendChild(host)
    app = createApp(SettingsModal, { initialSection: 'storage' })
    app.mount(host)
    for (let i = 0; i < 12; i++) { await Promise.resolve(); await nextTick() }
    for (const [label, section] of [['Storage', 'storage'], ['Staff server accounts', 'staff'], ['Uploads', 'uploads'], ['Watermarks', 'watermarks']]) {
      const nav = [...host.querySelectorAll('.settings-nav-btn')].find(item => item.textContent.trim() === label)
      expect(nav, label).toBeDefined()
      nav.click()
      await nextTick()
      expect(host.querySelector(`[data-settings-panel="${section}"]`)).not.toBeNull()
    }
    const preferences = [...host.querySelectorAll('.settings-nav-btn')].find(item => item.textContent.trim() === 'Preferences')
    preferences.click()
    await nextTick()
    expect(host.textContent).not.toContain('Default server folder')
  })
})
