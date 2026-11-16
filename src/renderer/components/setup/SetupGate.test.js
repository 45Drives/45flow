import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import SetupGate from './SetupGate.vue'

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn(), activeConnection: null, pending: vi.fn() }))
vi.mock('../../composables/useApi', () => ({ useApi: () => ({ apiFetch: mocks.apiFetch }) }))
vi.mock('../../composables/useConnections', () => ({ useConnections: () => ({ activeConnection: mocks.activeConnection }) }))
vi.mock('../../composables/useTourManager', () => ({ useTourManager: () => ({ setSetupPending: mocks.pending }) }))
vi.mock('./FirstRunSetup.vue', () => ({
  default: { emits: ['complete'], template: '<button data-wizard @click="$emit(\'complete\')">Complete setup</button>' },
}))
let app, host
const flush = async () => { for (let i = 0; i < 10; i++) { await Promise.resolve(); await nextTick() } }
const token = amr => `header.${btoa(JSON.stringify({ amr, exp: Date.now() / 1000 + 3600 }))}.signature`
const status = (ready, count = 0) => ({ ready, storageRoot: { configured: ready, path: ready ? '/tank' : '' }, projects: { count } })
async function mount() {
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp({ render: () => h(SetupGate, {}, { default: () => h('p', { 'data-content': '' }, 'Projects') }) })
  app.mount(host)
  await flush()
}
beforeEach(() => {
  sessionStorage.clear()
  mocks.activeConnection = ref({ connectionId: 'server-one', token: token(['pam']) })
  mocks.apiFetch.mockReset()
  mocks.pending.mockReset()
})
afterEach(() => { app?.unmount(); host?.remove(); vi.useRealTimers() })
describe('setup gate by server status and role', () => {
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
  it('allows skipping the first project only for the current connection', async () => {
    mocks.apiFetch.mockResolvedValue(status(true, 0))
    await mount()
    host.querySelector('[data-wizard]').click()
    await flush()
    expect(host.querySelector('[data-content]')).not.toBeNull()
    mocks.activeConnection.value = { connectionId: 'server-two', token: token(['pam']) }
    await flush()
    expect(host.querySelector('[data-wizard]')).not.toBeNull()
  })
  it('remembers skipping the first project after remount, but never bypasses missing storage', async () => {
    mocks.apiFetch.mockResolvedValue(status(true, 0))
    await mount()
    host.querySelector('[data-wizard]').click()
    await flush()
    app.unmount()
    host.remove()
    await mount()
    expect(host.querySelector('[data-content]')).not.toBeNull()
    app.unmount()
    host.remove()
    mocks.apiFetch.mockResolvedValue(status(false, 0))
    await mount()
    expect(host.querySelector('[data-wizard]')).not.toBeNull()
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
