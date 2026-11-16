import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import SetupGate from './SetupGate.vue'
import { serverSetupKey, useSetupReplay } from '../../composables/useSetupStatus'

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn(), activeConnection: null, pending: vi.fn(), projectsConfigured: vi.fn() }))
vi.mock('../../composables/useApi', () => ({ useApi: () => ({ apiFetch: mocks.apiFetch }) }))
vi.mock('../../composables/useConnections', () => ({ useConnections: () => ({ activeConnection: mocks.activeConnection }) }))
vi.mock('../../composables/useTourManager', () => ({ useTourManager: () => ({ setSetupPending: mocks.pending }) }))
vi.mock('./FirstRunSetup.vue', () => ({
  default: { emits: ['complete'], template: '<button data-wizard @click="$emit(\'complete\', false)">Finish without a project</button><button data-created @click="$emit(\'complete\', true)">Finish after creating</button>' },
}))
let app, host
const flush = async () => { for (let i = 0; i < 10; i++) { await Promise.resolve(); await nextTick() } }
const token = amr => `header.${btoa(JSON.stringify({ amr, exp: Date.now() / 1000 + 3600 }))}.signature`
const status = (ready, count = 0) => ({ ready, storageRoot: { configured: ready, path: ready ? '/tank' : '' }, projects: { count } })
async function mount() {
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp({ render: () => h(SetupGate, { onProjectsConfigured: mocks.projectsConfigured }, { default: () => h('p', { 'data-content': '' }, 'Projects') }) })
  app.mount(host)
  await flush()
}
beforeEach(() => {
  sessionStorage.clear()
  mocks.activeConnection = ref({ connectionId: 'server-one', token: token(['pam']) })
  mocks.apiFetch.mockReset()
  mocks.pending.mockReset()
  mocks.projectsConfigured.mockReset()
})
afterEach(() => {
  app?.unmount()
  host?.remove()
  useSetupReplay(() => serverSetupKey(mocks.activeConnection.value)).finish()
  vi.useRealTimers()
})
describe('setup gate by server status and role', () => {
  it('centers and announces the server setup check while it is pending', async () => {
    mocks.apiFetch.mockReturnValue(new Promise(() => {}))
    await mount()
    const loading = host.querySelector('[role="status"]')
    expect(loading.textContent).toContain('Checking server setup…')
    expect(loading.classList.contains('items-center')).toBe(true)
    expect(loading.parentElement.classList.contains('justify-center')).toBe(true)
  })

  it.each([[false, 0], [true, 0]])('shows the wizard for admin ready=%s projects=%s', async (ready, count) => {
    mocks.apiFetch.mockResolvedValue(status(ready, count))
    await mount()
    expect(host.querySelector('[data-wizard]')).not.toBeNull()
    expect(host.querySelector('[data-content]')).toBeNull()
    expect(mocks.pending).toHaveBeenLastCalledWith(true)
  })
  it('shows normal content when an admin has configured storage and a project', async () => {
    mocks.apiFetch.mockResolvedValue(status(true, 1))
    await mount()
    expect(host.querySelector('[data-wizard]')).toBeNull()
    expect(host.querySelector('[data-content]')).not.toBeNull()
    expect(mocks.pending).toHaveBeenLastCalledWith(false)
  })
  it('reopens setup for the selected server and clears the request on completion without changing settings', async () => {
    mocks.apiFetch.mockResolvedValue(status(true, 3))
    await mount()
    const key = serverSetupKey(mocks.activeConnection.value)
    sessionStorage.setItem(key, JSON.stringify({ complete: true, step: 3 }))
    const replay = useSetupReplay(() => key)
    replay.request()
    await flush()
    expect(host.querySelector('[data-wizard]')).not.toBeNull()
    expect(JSON.parse(sessionStorage.getItem(key))).toEqual({ step: 0 })
    expect(sessionStorage.getItem(`${key}:replay`)).toBe('1')
    mocks.activeConnection.value = { ...mocks.activeConnection.value, connectionId: 'server-two' }
    await flush()
    expect(host.querySelector('[data-content]')).not.toBeNull()
    mocks.activeConnection.value = { ...mocks.activeConnection.value, connectionId: 'server-one' }
    await flush()
    expect(host.querySelector('[data-wizard]')).not.toBeNull()
    host.querySelector('[data-created]').click()
    await flush()
    expect(host.querySelector('[data-content]')).not.toBeNull()
    expect(replay.requested.value).toBe(false)
    expect(sessionStorage.getItem(`${key}:replay`)).toBeNull()
    expect(mocks.apiFetch.mock.calls.every(([url, init]) => url === '/api/setup/status' && !init?.method)).toBe(true)
  })
  it('restores a pending wizard replay after a page reload', async () => {
    mocks.activeConnection.value.connectionId = 'restored-server'
    const key = serverSetupKey(mocks.activeConnection.value)
    sessionStorage.setItem(`${key}:replay`, '1')
    mocks.apiFetch.mockResolvedValue(status(true, 2))
    await mount()
    expect(host.querySelector('[data-wizard]')).not.toBeNull()
  })
  it('does not force a replay on non-admin sessions', async () => {
    mocks.activeConnection.value.token = token(['open'])
    useSetupReplay(() => serverSetupKey(mocks.activeConnection.value)).request()
    mocks.apiFetch.mockResolvedValue(status(true, 2))
    await mount()
    expect(host.querySelector('[data-wizard]')).toBeNull()
    expect(host.querySelector('[data-content]')).not.toBeNull()
  })
  it('reports the first project after the setup wizard creates it', async () => {
    mocks.apiFetch.mockResolvedValue(status(true, 0))
    await mount()
    host.querySelector('[data-created]').click()
    await flush()
    expect(mocks.projectsConfigured).toHaveBeenLastCalledWith(true)
  })
  it.each([false, true])('never shows admin setup to non-admins (ready=%s)', async ready => {
    mocks.activeConnection.value.token = token(['open'])
    mocks.apiFetch.mockResolvedValue({ ready })
    await mount()
    expect(host.querySelector('[data-wizard]')).toBeNull()
    if (ready) expect(host.querySelector('[data-content]')).not.toBeNull()
    else expect(host.textContent).toContain('Ask your administrator')
  })
  it('keeps content blocked on a failed status check and allows retry', async () => {
    mocks.apiFetch.mockRejectedValueOnce(new Error('Connection interrupted'))
    await mount()
    expect(host.querySelector('[data-content]')).toBeNull()
    expect(host.textContent).toContain('Connection interrupted')
    mocks.apiFetch.mockResolvedValue(status(true, 1))
    host.querySelector('button').click()
    await flush()
    expect(host.querySelector('[data-content]')).not.toBeNull()
  })
  it('lets older servers without setup routes keep working, with an explicit compatibility notice', async () => {
    mocks.apiFetch.mockRejectedValue(Object.assign(new Error('Not found'), { status: 404, code: 'Not found' }))
    await mount()
    expect(host.querySelector('[data-content]')).not.toBeNull()
    expect(host.textContent).toContain('does not support storage setup')
    expect(mocks.projectsConfigured).toHaveBeenLastCalledWith(null)
    expect(mocks.pending).toHaveBeenLastCalledWith(false)
  })
  it.each([
    { status: 401 }, { status: 403 }, { status: 500 }, { status: 404, code: 'project_not_found' },
  ])('does not treat other errors as old-server compatibility (%j)', async details => {
    mocks.apiFetch.mockRejectedValue(Object.assign(new Error('Status unavailable'), details))
    await mount()
    expect(host.querySelector('[data-content]')).toBeNull()
    expect(host.textContent).toContain('Status unavailable')
  })
  it('does not complete setup without a first project and ignores legacy skip state', async () => {
    sessionStorage.setItem('45flow-setup:v1:server-one:', JSON.stringify({ complete: true, step: 5 }))
    mocks.apiFetch.mockResolvedValue(status(true, 0))
    await mount()
    host.querySelector('[data-wizard]').click()
    await flush()
    expect(host.querySelector('[data-wizard]')).not.toBeNull()
    expect(host.querySelector('[data-content]')).toBeNull()
    host.querySelector('[data-created]').click()
    await flush()
    expect(host.querySelector('[data-content]')).not.toBeNull()
    expect(mocks.projectsConfigured).toHaveBeenLastCalledWith(true)
  })
  it('uses background retries with a visible terminal timeout instead of polling forever', async () => {
    vi.useFakeTimers()
    mocks.apiFetch.mockRejectedValue(new Error('Offline'))
    await mount()
    await vi.advanceTimersByTimeAsync(60 * 2500)
    await flush()
    expect(mocks.apiFetch).toHaveBeenCalledTimes(60)
    expect(mocks.apiFetch.mock.calls.slice(1).every(([, init]) => init.headers['X-Background-Request'] === '1')).toBe(true)
    expect(host.textContent).toContain('after repeated attempts')
    expect(vi.getTimerCount()).toBe(0)
  })
  it('does not unmount ready content or discard setup state when the session token refreshes', async () => {
    mocks.apiFetch.mockResolvedValue(status(true, 1))
    await mount()
    const content = host.querySelector('[data-content]')
    let resolveStatus
    mocks.apiFetch.mockImplementation(() => new Promise(resolve => { resolveStatus = resolve }))
    mocks.activeConnection.value.token = token(['env'])
    await flush()
    expect(host.querySelector('[data-content]')).toBe(content)
    expect(mocks.apiFetch.mock.calls.at(-1)[1].headers['X-Background-Request']).toBe('1')
    resolveStatus(status(true, 1))
    await flush()
    expect(host.querySelector('[data-content]')).toBe(content)
  })
})
