import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import StorageSetupPanel from './StorageSetupPanel.vue'

const mocks = vi.hoisted(() => ({ loadProjectChoices: vi.fn() }))
vi.mock('../../composables/useProjectChoices', () => ({
  useProjectChoices: () => ({
    detecting: ref(false), detectingRoots: ref(false), projectRoots: ref([]),
    loadProjectChoices: mocks.loadProjectChoices,
    configuredProjectRoot: ref(''), useConfiguredProjectRoot: ref(false),
  }),
}))
vi.mock('@45drives/houston-common-ui', () => ({ pushNotification: vi.fn(), Notification: class {} }))
vi.mock('../../ui/FlowModal.vue', () => ({
  default: {
    props: ['modelValue'],
    setup(props, { slots }) { return () => props.modelValue ? h('div', { 'data-confirm': '' }, [slots.default?.(), slots.footer?.()]) : null },
  },
}))
let app, host
const flush = async () => { for (let i = 0; i < 10; i++) { await Promise.resolve(); await nextTick() } }
const button = text => [...host.querySelectorAll('button')].find(item => item.textContent.includes(text) || item.getAttribute('aria-label') === text)
afterEach(() => { app?.unmount(); host?.remove(); vi.useRealTimers(); localStorage.clear(); vi.clearAllMocks() })
describe('storage selection and restart', () => {
  it('starts in the configured subfolder of the closest filesystem and continues without changing storage', async () => {
    const apiFetch = vi.fn(async url => {
      if (url.endsWith('/candidates')) return { candidates: [{ path: '/tank', fstype: 'zfs' }, { path: '/tank/media', fstype: 'zfs' }] }
      return { path: '/tank/media/projects', dirs: [] }
    })
    host = document.createElement('div')
    document.body.appendChild(host)
    app = createApp(StorageSetupPanel, {
      apiFetch, wizard: true,
      status: { ready: true, storageRoot: { configured: true, path: '/tank/media/projects' } },
    })
    const panel = app.mount(host)
    await flush()
    expect(host.querySelector('select').value).toBe('/tank/media')
    expect(host.querySelector('[data-path-input-root] input').value).toBe('/tank/media/projects/')
    expect(host.textContent).not.toContain('Current storage:')
    expect(button('Save storage location')).toBeUndefined()
    expect(button('Use this folder')).toBeUndefined()
    expect(await panel.prepareContinue()).toBe(true)
    expect(apiFetch.mock.calls.some(([url]) => url.includes('/impact') || url.endsWith('/root'))).toBe(false)
  })

  it('reviews a changed filesystem on Next and lets users cancel without changing storage', async () => {
    const apiFetch = vi.fn(async url => {
      if (url.endsWith('/candidates')) return { candidates: [{ path: '/srv', fstype: 'ext4' }, { path: '/tank', fstype: 'zfs' }] }
      if (url.includes('/impact?')) return { projects: [], activeLinks: [], transfers: [] }
      return { path: new URL(url, 'http://localhost').searchParams.get('path'), dirs: [] }
    })
    const canContinue = vi.fn()
    host = document.createElement('div')
    document.body.appendChild(host)
    app = createApp(StorageSetupPanel, {
      apiFetch, wizard: true, onCanContinue: canContinue,
      status: { ready: true, storageRoot: { configured: true, path: '/tank' } },
    })
    const panel = app.mount(host)
    await flush()
    const select = host.querySelector('select')
    select.value = '/srv'
    select.dispatchEvent(new Event('change'))
    await flush()
    expect(host.textContent).not.toContain('Current storage:')
    expect(canContinue).toHaveBeenLastCalledWith(true)
    expect(apiFetch.mock.calls.some(([url]) => url.includes('/impact'))).toBe(false)
    expect(await panel.prepareContinue()).toBe(false)
    await flush()
    expect(apiFetch).toHaveBeenCalledWith('/api/admin/storage/impact?path=%2Fsrv')
    expect(host.querySelector('[data-confirm]')).not.toBeNull()
    expect(canContinue).toHaveBeenLastCalledWith(false)
    button('Cancel').click()
    await flush()
    expect(host.querySelector('[data-confirm]')).toBeNull()
    expect(select.value).toBe('/srv')
    expect(canContinue).toHaveBeenLastCalledWith(true)
    expect(apiFetch.mock.calls.some(([url]) => url.endsWith('/root'))).toBe(false)
  })

  it('creates a folder in the selected filesystem without selecting it as the root', async () => {
    const apiFetch = vi.fn(async (url, init) => {
      if (url.endsWith('/candidates')) return { candidates: [{ path: '/tank', fstype: 'zfs', zfsDataset: 'tank' }] }
      if (init?.method === 'POST') return { ok: true, path: '/tank/media' }
      if (url.includes('path=%2Ftank%2Fmedia')) return { path: '/tank/media', dirs: [] }
      return { path: '/tank', dirs: [] }
    })
    host = document.createElement('div')
    document.body.appendChild(host)
    app = createApp(StorageSetupPanel, { apiFetch, status: { ready: false } })
    app.mount(host)
    await flush()
    button('New Folder').click()
    await flush()
    const input = host.querySelector('[aria-label="Folder name"]')
    input.value = 'media'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await flush()
    host.querySelector('#fp-new-folder-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flush()
    expect(apiFetch).toHaveBeenCalledWith('/api/admin/storage/dirs', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ path: '/tank', name: 'media' }),
    }))
    expect(host.querySelector('[data-path-input-root] input').value).toBe('/tank/media/')
    expect(apiFetch.mock.calls.some(([url]) => url.endsWith('/root'))).toBe(false)
    expect(button('New ZFS dataset')).toBeUndefined()
    expect(mocks.loadProjectChoices).not.toHaveBeenCalled()
    expect(apiFetch.mock.calls.some(([url]) => url.includes('/api/expand-paths') || url.includes('/api/mkdir'))).toBe(false)
  })
  it('keeps the creation dialog and error visible if filesystem creation fails', async () => {
    const apiFetch = vi.fn(async (url, init) => {
      if (init?.method === 'POST') throw new Error('Storage permission denied')
      if (url.endsWith('/candidates')) return { candidates: [{ path: '/srv', fstype: 'ext4' }] }
      return { path: '/srv', dirs: [] }
    })
    host = document.createElement('div')
    document.body.appendChild(host)
    app = createApp(StorageSetupPanel, { apiFetch, status: { ready: false } })
    app.mount(host)
    await flush()
    expect(button('New ZFS dataset')).toBeUndefined()
    button('New Folder').click()
    await flush()
    const input = host.querySelector('[aria-label="Folder name"]')
    input.value = 'media'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await flush()
    host.querySelector('#fp-new-folder-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flush()
    expect(host.querySelector('#fp-new-folder-form')).not.toBeNull()
    expect(host.textContent).toContain('Storage permission denied')
  })
  it('uses a non-ZFS storage mount and folder navigation before confirming a root change', async () => {
    vi.useFakeTimers()
    let statusCalls = 0
    const apiFetch = vi.fn(async (url, init) => {
      if (url.endsWith('/candidates')) return { candidates: [{ path: '/srv', fstype: 'ext4', source: '/dev/sda', size: 10e9, avail: 5e9 }] }
      if (url.includes('/dirs?path=%2Fsrv') && !url.includes('45flow-data')) return { path: '/srv', dirs: [{ name: '45flow-data', path: '/srv/45flow-data' }] }
      if (url.includes('/dirs?')) return { path: '/srv/45flow-data', dirs: [] }
      if (url.includes('/impact?')) return { projects: [{ id: 2, name: 'Outside project' }], activeLinks: [{ title: 'Client review' }], transfers: [{ filename: 'Upload.mov' }] }
      if (url.endsWith('/root') && init?.method === 'POST') return { restartPending: true }
      if (url === '/api/setup/status') {
        if (++statusCalls === 1) throw new Error('Restarting')
        return { ready: true, storageRoot: { configured: true, path: '/srv/45flow-data', fstype: 'ext4' } }
      }
      throw new Error(url)
    })
    const refreshed = vi.fn()
    host = document.createElement('div')
    document.body.appendChild(host)
    app = createApp(StorageSetupPanel, { apiFetch, status: { ready: false }, onRefreshed: refreshed })
    app.mount(host)
    await flush()
    expect(button('Save storage location').disabled).toBe(false)
    expect(host.querySelector('[title="Go up one directory"]').disabled).toBe(true)
    host.querySelector('[aria-label="45flow-data folder"]').click()
    await flush()
    expect(host.querySelector('[data-path-input-root] input').value).toBe('/srv/45flow-data/')
    button('Save storage location').click()
    await flush()
    expect(host.textContent).toContain('Outside project')
    expect(host.textContent).toContain('Client review')
    expect(button('Confirm storage location').disabled).toBe(true)
    const checkbox = host.querySelector('input[type=checkbox]')
    checkbox.checked = true
    checkbox.dispatchEvent(new Event('change'))
    await flush()
    button('Confirm storage location').click()
    await flush()
    expect(apiFetch).toHaveBeenCalledWith('/api/admin/storage/root', expect.objectContaining({ method: 'POST', body: JSON.stringify({ path: '/srv/45flow-data' }) }))
    await vi.advanceTimersByTimeAsync(5000)
    await flush()
    expect(refreshed).toHaveBeenCalledWith(expect.objectContaining({ storageRoot: expect.objectContaining({ path: '/srv/45flow-data' }) }))
    expect(host.textContent).not.toContain('Waiting for the server')
  })
  it('reuses visited listings, leaves filesystem controls enabled, and refreshes on request', async () => {
    let resolveChild
    const apiFetch = vi.fn(async url => {
      if (url.endsWith('/candidates')) return { candidates: [{ path: '/srv', fstype: 'ext4' }] }
      if (url.includes('path=%2Fsrv%2Fmedia')) return new Promise(resolve => { resolveChild = resolve })
      if (url.includes('path=%2Fsrv')) return { path: '/srv', dirs: [{ name: 'media', path: '/srv/media' }] }
      throw new Error(url)
    })
    host = document.createElement('div')
    document.body.appendChild(host)
    app = createApp(StorageSetupPanel, { apiFetch, status: { ready: false } })
    app.mount(host)
    await flush()
    host.querySelector('[aria-label="media folder"]').click()
    await flush()
    expect(button('Refresh filesystems').disabled).toBe(false)
    expect(host.querySelector('select').disabled).toBe(false)
    expect(button('Save storage location').disabled).toBe(true)
    resolveChild({ path: '/srv/media', dirs: [] })
    await flush()
    host.querySelector('[title="Go up one directory"]').click()
    await flush()
    expect(apiFetch.mock.calls.filter(([url]) => url === '/api/admin/storage/dirs?path=%2Fsrv')).toHaveLength(1)
    host.querySelector('[title="Refresh file listing"]').click()
    await flush()
    expect(apiFetch.mock.calls.filter(([url]) => url === '/api/admin/storage/dirs?path=%2Fsrv')).toHaveLength(2)
    expect(apiFetch.mock.calls.every(([url]) => url.startsWith('/api/admin/storage/'))).toBe(true)
  })
  it('shows listing failures and allows retry without selecting the failed folder', async () => {
    let fail = true
    const apiFetch = vi.fn(async url => {
      if (url.endsWith('/candidates')) return { candidates: [{ path: '/srv', fstype: 'ext4' }] }
      if (fail) throw new Error('Storage listing denied')
      return { path: '/srv', dirs: [] }
    })
    host = document.createElement('div')
    document.body.appendChild(host)
    app = createApp(StorageSetupPanel, { apiFetch, status: { ready: false } })
    app.mount(host)
    await flush()
    expect(host.textContent).toContain('Storage listing denied')
    expect(button('Save storage location').disabled).toBe(true)
    fail = false
    host.querySelector('[title="Refresh file listing"]').click()
    await flush()
    expect(host.textContent).not.toContain('Storage listing denied')
    expect(button('Save storage location').disabled).toBe(false)
  })
  it('supports the shared list view without recursively scanning folders for files', async () => {
    localStorage.setItem('folderpicker:viewMode', 'tree')
    const apiFetch = vi.fn(async url => {
      if (url.endsWith('/candidates')) return { candidates: [{ path: '/srv', fstype: 'ext4' }] }
      if (url.includes('path=%2Fsrv%2Fmedia')) return { path: '/srv/media', dirs: [] }
      if (url.includes('path=%2Fsrv')) return { path: '/srv', dirs: [{ name: 'media', path: '/srv/media' }] }
      throw new Error(url)
    })
    host = document.createElement('div')
    document.body.appendChild(host)
    app = createApp(StorageSetupPanel, { apiFetch, status: { ready: false } })
    app.mount(host)
    await flush()
    expect(host.querySelector('[aria-label="List view"]').getAttribute('aria-pressed')).toBe('true')
    host.querySelector('[aria-label="Expand"]').click()
    await flush()
    expect(host.textContent).toContain('This folder is empty')
    expect(apiFetch.mock.calls.map(([url]) => url)).toEqual([
      '/api/admin/storage/candidates',
      '/api/admin/storage/dirs?path=%2Fsrv',
      '/api/admin/storage/dirs?path=%2Fsrv%2Fmedia',
    ])
  })
  it('continues polling a pending root after session recovery without reapplying the change', async () => {
    vi.useFakeTimers()
    sessionStorage.setItem('storage-recovery', JSON.stringify({ restartPath: '/tank' }))
    const apiFetch = vi.fn()
      .mockRejectedValueOnce(new Error('Server restarting'))
      .mockResolvedValue({ ready: true, storageRoot: { configured: true, path: '/tank', fstype: 'zfs' } })
    const refreshed = vi.fn()
    host = document.createElement('div')
    document.body.appendChild(host)
    app = createApp(StorageSetupPanel, { apiFetch, status: null, persistenceKey: 'storage-recovery', onRefreshed: refreshed })
    app.mount(host)
    await flush()
    expect(host.textContent).toContain('Waiting for the server')
    await vi.advanceTimersByTimeAsync(2500)
    await flush()
    expect(apiFetch.mock.calls.every(([url, init]) => url === '/api/setup/status' && init?.headers?.['X-Background-Request'] === '1')).toBe(true)
    expect(refreshed).toHaveBeenCalledOnce()
    expect(JSON.parse(sessionStorage.getItem('storage-recovery'))).toEqual({})
    sessionStorage.removeItem('storage-recovery')
  })
  it('stops polling with a visible timeout and cancels recovery timers on unmount', async () => {
    vi.useFakeTimers()
    sessionStorage.setItem('storage-timeout', JSON.stringify({ restartPath: '/tank' }))
    const apiFetch = vi.fn().mockRejectedValue(new Error('Offline'))
    host = document.createElement('div')
    document.body.appendChild(host)
    app = createApp(StorageSetupPanel, { apiFetch, status: null, persistenceKey: 'storage-timeout' })
    app.mount(host)
    await flush()
    await vi.advanceTimersByTimeAsync(60 * 2500)
    await flush()
    expect(apiFetch).toHaveBeenCalledTimes(60)
    expect(host.textContent).toContain('has not confirmed the storage change')
    expect(vi.getTimerCount()).toBe(0)
    button('Check again').click()
    await flush()
    expect(vi.getTimerCount()).toBe(1)
    app.unmount()
    app = undefined
    expect(vi.getTimerCount()).toBe(0)
    sessionStorage.removeItem('storage-timeout')
  })
})
