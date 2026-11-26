import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import AdminLoginLockoutsPanel from './AdminLoginLockoutsPanel.vue'

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn() }))
vi.mock('../composables/useApi', () => ({ useApi: () => ({ apiFetch: mocks.apiFetch }) }))

let app
let host
async function flush() { for (let i = 0; i < 6; i++) await nextTick() }
async function mount() {
    host = document.createElement('div')
    document.body.appendChild(host)
    app = createApp(AdminLoginLockoutsPanel, { connectionId: 'server' })
    app.mount(host)
    await flush()
}
afterEach(() => {
    app?.unmount()
    host?.remove()
    mocks.apiFetch.mockReset()
})

describe('staff login lockouts', () => {
    it('lists locked staff accounts and unlocks the selected account', async () => {
        mocks.apiFetch.mockResolvedValueOnce({
            lockouts: [{ username: 'admin', failedAttempts: 5, lockedUntil: '2026-11-23T12:15:00.000Z' }],
        })
        mocks.apiFetch.mockResolvedValueOnce(undefined)
        await mount()

        expect(host.textContent).toContain('admin')
        expect(host.textContent).toContain('5 failed attempts')
        host.querySelector('button').click()
        await flush()

        expect(mocks.apiFetch.mock.calls[1][0]).toBe('/api/admin/login-lockouts/admin')
        expect(mocks.apiFetch.mock.calls[1][1]).toMatchObject({ method: 'DELETE', retry: 0 })
        expect(host.textContent).toContain('admin was unlocked')
        expect(host.textContent).not.toContain('5 failed attempts')
    })

    it('explains when the server does not yet support lockout management', async () => {
        mocks.apiFetch.mockRejectedValueOnce(Object.assign(new Error('not found'), { status: 404 }))
        await mount()

        expect(host.textContent).toContain('Update the server')
        expect(host.querySelector('button')).toBeNull()
    })
})
