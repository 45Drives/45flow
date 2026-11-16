import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import StorageSetupPanel from './StorageSetupPanel.vue'

vi.mock('../../ui/FlowModal.vue', () => ({
  default: {
    props: ['modelValue'],
    setup(props, { slots }) { return () => props.modelValue ? h('div', { 'data-confirm': '' }, [slots.default?.(), slots.footer?.()]) : null },
  },
}))
let app, host
const flush = async () => { for (let i = 0; i < 10; i++) { await Promise.resolve(); await nextTick() } }
const button = text => [...host.querySelectorAll('button')].find(item => item.textContent.includes(text))
afterEach(() => { app?.unmount(); host?.remove(); vi.useRealTimers() })
describe('storage selection and restart', () => {
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
    button('Browse').click()
    await flush()
    button('New folder').click()
    await flush()
    const input = host.querySelector('input[type=text]')
    input.value = 'media'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await flush()
    host.querySelector('#setup-new-directory').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flush()
    expect(apiFetch).toHaveBeenCalledWith('/api/admin/storage/dirs', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ path: '/tank', name: 'media' }),
    }))
    expect(host.querySelector('[aria-label="Storage path"]').textContent).toContain('media')
    expect(apiFetch.mock.calls.some(([url]) => url.endsWith('/root'))).toBe(false)
    expect(button('New ZFS dataset')).toBeUndefined()
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
    button('Browse').click()
    await flush()
    expect(button('New ZFS dataset')).toBeUndefined()
    button('New folder').click()
    await flush()
    const input = host.querySelector('input[type=text]')
    input.value = 'media'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await flush()
    host.querySelector('#setup-new-directory').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flush()
    expect(host.querySelector('#setup-new-directory')).not.toBeNull()
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
    button('Browse').click()
    await flush()
    expect(button('Use this folder').disabled).toBe(false)
    expect(host.querySelector('[aria-label="Storage path"]')).not.toBeNull()
    expect(button('Up')).toBeUndefined()
    expect(button('Open')).toBeUndefined()
    button('45flow-data').click()
    await flush()
    expect(host.querySelector('[aria-label="Storage path"]').textContent).toContain('45flow-data')
    button('Use this folder').click()
    await flush()
    expect(host.textContent).toContain('Outside project')
    expect(host.textContent).toContain('Client review')
    expect(button('Confirm storage root').disabled).toBe(true)
    const checkbox = host.querySelector('input[type=checkbox]')
    checkbox.checked = true
    checkbox.dispatchEvent(new Event('change'))
    await flush()
    button('Confirm storage root').click()
    await flush()
    expect(apiFetch).toHaveBeenCalledWith('/api/admin/storage/root', expect.objectContaining({ method: 'POST', body: JSON.stringify({ path: '/srv/45flow-data' }) }))
    await vi.advanceTimersByTimeAsync(5000)
    await flush()
    expect(refreshed).toHaveBeenCalledWith(expect.objectContaining({ storageRoot: expect.objectContaining({ path: '/srv/45flow-data' }) }))
    expect(host.textContent).not.toContain('Waiting for the server')
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
