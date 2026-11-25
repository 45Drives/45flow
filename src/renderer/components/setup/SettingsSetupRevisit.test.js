import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import SettingsModal from '../modals/SettingsModal.vue'
import { serverSetupKey, useSetupReplay } from '../../composables/useSetupStatus'

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn(), connection: null }))
vi.mock('../../composables/useApi', () => ({ useApi: () => ({ apiFetch: mocks.apiFetch, baseUrl: ref('https://server.example'), meta: ref({}) }) }))
vi.mock('../../composables/useConnections', () => ({ useConnections: () => ({ activeConnection: mocks.connection, connections: ref([]), updateConnection: vi.fn() }) }))
vi.mock('../../composables/useThemeFromAlias', () => ({ useThemeFromAlias: () => ({ setCustomThemeColors: vi.fn(), setCustomThemeEnabled: vi.fn() }) }))
vi.mock('@45drives/houston-common-ui', () => ({ pushNotification: vi.fn(), Notification: class {} }))
vi.mock('./SetupSettingsPanel.vue', () => ({ default: { props: ['section'], template: '<div :data-settings-panel="section">Shared setup controls</div>' } }))
vi.mock('../AdminStaffMfaPanel.vue', () => ({ default: { template: '<div data-settings-panel="staff-mfa">Staff sign-in policy</div>' } }))
vi.mock('../StaffMfaRecovery.vue', () => ({ default: { template: '<div data-settings-panel="recovery-codes">Your recovery codes</div>' } }))
vi.mock('../../ui/FlowModal.vue', () => ({
  default: { setup(_, { slots }) { return () => h('div', [slots.default?.(), slots.footer?.()]) } },
}))
let app, host
afterEach(() => {
  app?.unmount()
  host?.remove()
  useSetupReplay(() => serverSetupKey(mocks.connection.value)).finish()
  vi.useRealTimers()
})
describe('revisiting skipped setup from Settings', () => {
  it.each([
    ['token cleared', connection => { connection.token = '' }],
    ['connection disconnected', connection => { connection.status = 'disconnected' }],
  ])('closes Settings on sign-out (%s) and keeps it closed after signing in', async (_label, signOut) => {
    vi.useFakeTimers()
    const token = `header.${btoa(JSON.stringify({ amr: ['pam'], exp: Date.now() / 1000 + 600 }))}.signature`
    mocks.connection = ref({ connectionId: 'server-one', status: 'connected', token })
    mocks.apiFetch.mockReset().mockResolvedValue({ showFlowFolderDefault: false })
    window.electron = { isWeb: true }
    const confirm = vi.spyOn(window, 'confirm')
    const open = ref(true)
    const closed = vi.fn(() => { open.value = false })
    host = document.createElement('div')
    document.body.appendChild(host)
    app = createApp({ setup: () => () => open.value ? h(SettingsModal, { initialSection: 'fileBrowsing', onClose: closed }) : null })
    app.mount(host)
    for (let i = 0; i < 12; i++) { await Promise.resolve(); await nextTick() }

    const toggle = [...host.querySelectorAll('[role="switch"]')].find(item => item.textContent.trim() === 'Show .45flow by default')
    toggle.click()
    await nextTick()
    expect([...host.querySelectorAll('button')].find(item => item.textContent.trim() === 'Save changes').disabled).toBe(false)

    mocks.connection.value.token = `${token}-refreshed`
    await nextTick()
    expect(closed).not.toHaveBeenCalled()
    signOut(mocks.connection.value)
    await nextTick()
    expect(closed).toHaveBeenCalledOnce()
    expect(confirm).not.toHaveBeenCalled()
    expect(host.querySelector('.settings-nav')).toBeNull()
    mocks.connection.value = { connectionId: 'server-one', status: 'connected', token }
    await nextTick()
    expect(host.querySelector('.settings-nav')).toBeNull()
    confirm.mockRestore()
  })

  it.each([true, false])('keeps two-step sign-in and recovery in a dedicated Settings section (admin=%s)', async admin => {
    vi.useFakeTimers()
    const token = `header.${btoa(JSON.stringify({ amr: [admin ? 'pam' : 'open'], exp: Date.now() / 1000 + 600 }))}.signature`
    mocks.connection = ref({ connectionId: 'server-one', token })
    mocks.apiFetch.mockReset().mockResolvedValue({})
    window.electron = { isWeb: true }
    host = document.createElement('div')
    document.body.appendChild(host)
    app = createApp(SettingsModal, { initialSection: 'app' })
    app.mount(host)
    for (let i = 0; i < 12; i++) { await Promise.resolve(); await nextTick() }
    expect(host.querySelector('[data-settings-panel="recovery-codes"]')).toBeNull()
    const nav = [...host.querySelectorAll('.settings-nav-btn')].find(item => item.textContent.trim() === 'Two-step sign-in')
    expect(nav).toBeDefined()
    nav.click()
    await nextTick()
    expect(host.querySelector('[data-settings-panel="recovery-codes"]')).not.toBeNull()
    expect(!!host.querySelector('[data-settings-panel="staff-mfa"]')).toBe(admin)
    expect(host.querySelector('.settings-page-title').textContent).toBe('Two-step sign-in')
    if (admin) {
      const scanning = [...host.querySelectorAll('.settings-nav-btn')].find(item => item.textContent.trim() === 'Scanning & privacy')
      scanning.click()
      await nextTick()
      expect(host.querySelector('[data-settings-panel="staff-mfa"]')).toBeNull()
      expect(host.querySelector('[data-settings-panel="recovery-codes"]')).toBeNull()
    }
  })

  it.each([true, false])('offers a non-destructive wizard replay only to admins (admin=%s)', async admin => {
    vi.useFakeTimers()
    const token = `header.${btoa(JSON.stringify({ amr: [admin ? 'pam' : 'open'], exp: Date.now() / 1000 + 600 }))}.signature`
    mocks.connection = ref({ connectionId: 'server-one', token })
    mocks.apiFetch.mockReset().mockResolvedValue({})
    window.electron = { isWeb: true }
    const closed = vi.fn()
    host = document.createElement('div')
    document.body.appendChild(host)
    app = createApp(SettingsModal, { initialSection: 'maintenance', onClose: closed })
    app.mount(host)
    for (let i = 0; i < 12; i++) { await Promise.resolve(); await nextTick() }
    const button = [...host.querySelectorAll('button')].find(item => item.textContent.trim() === 'Run setup again')
    expect(!!button).toBe(admin)
    if (!admin) return
    expect(host.textContent).toContain('Nothing is reset or deleted')
    const callsBefore = mocks.apiFetch.mock.calls.length
    button.click()
    await nextTick()
    expect(closed).toHaveBeenCalledOnce()
    expect(useSetupReplay(() => serverSetupKey(mocks.connection.value)).requested.value).toBe(true)
    expect(mocks.apiFetch).toHaveBeenCalledTimes(callsBefore)
  })

  it('saves the server-wide .45flow default without a Pro license', async () => {
    vi.useFakeTimers()
    const token = `header.${btoa(JSON.stringify({ amr: ['pam'], exp: Date.now() / 1000 + 600 }))}.signature`
    mocks.connection = ref({ connectionId: 'server-one', token })
    mocks.apiFetch.mockReset().mockResolvedValue({ showFlowFolderDefault: false })
    window.electron = { isWeb: true }
    host = document.createElement('div')
    document.body.appendChild(host)
    app = createApp(SettingsModal, { initialSection: 'fileBrowsing' })
    app.mount(host)
    for (let i = 0; i < 12; i++) { await Promise.resolve(); await nextTick() }
    const toggle = [...host.querySelectorAll('[role="switch"]')].find(item => item.textContent.trim() === 'Show .45flow by default')
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    toggle.click()
    await nextTick()
    const save = [...host.querySelectorAll('button')].find(item => item.textContent.trim() === 'Save changes')
    expect(save.disabled).toBe(false)
    save.click()
    await nextTick()
    const [, init] = mocks.apiFetch.mock.calls.find(([url, opts]) => url === '/api/settings' && opts?.method === 'POST')
    expect(JSON.parse(init.body).showFlowFolderDefault).toBe(true)
  })
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
    for (const [label, section] of [['Storage', 'storage'], ['Staff users', 'staff'], ['Upload security', 'uploads'], ['Watermarks', 'watermarks']]) {
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
