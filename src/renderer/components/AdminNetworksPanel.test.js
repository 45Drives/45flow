import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import AdminNetworksPanel from './AdminNetworksPanel.vue'
import { isAdminSession } from '../composables/adminSession'

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn(), connectionIds: [] }))
vi.mock('../composables/useApi', () => ({
    useApi: id => {
        mocks.connectionIds.push(id)
        return { apiFetch: mocks.apiFetch }
    },
}))

let app
let host
async function flush() {
    for (let i = 0; i < 5; i++) await nextTick()
}
async function mount() {
    host = document.createElement('div')
    document.body.appendChild(host)
    app = createApp(AdminNetworksPanel, { connectionId: 'server-one' })
    app.mount(host)
    await flush()
}
const button = text => [...host.querySelectorAll('button')].find(el => el.textContent.includes(text))
afterEach(() => {
    app?.unmount()
    host?.remove()
    mocks.apiFetch.mockReset()
    mocks.connectionIds.length = 0
})

describe('admin session UX hint', () => {
    const token = claims => `header.${btoa(JSON.stringify({ exp: Date.now() / 1000 + 600, ...claims }))}.signature`
    it('shows admin controls only for unexpired PAM/env session claims', () => {
        expect(isAdminSession(token({ amr: ['pam'] }))).toBe(true)
        expect(isAdminSession(token({ amr: ['env'] }))).toBe(true)
        for (const value of [
            undefined, 'invalid', token({ amr: ['open'] }), token({ role: 'admin' }),
            token({ amr: ['pam'], exp: 1 }), token({ amr: ['pam'], purpose: 'source-stream' }),
        ]) expect(isAdminSession(value)).toBe(false)
    })
})

describe('Admin Networks settings UI/API', () => {
    it.each(['0.0.0.0/0', '::/0', '192.168.1.1/0', '2001:db8::1/0'])(
        'shows legacy %s for removal and prevents applying it even after acknowledgment', async cidr => {
            mocks.apiFetch.mockResolvedValueOnce({ cidrs: [cidr, '10.0.0.0/8'] })
            await mount()
            expect(host.querySelector('textarea').value).toContain(cidr)
            expect(host.querySelector('[role=alert]').textContent).toContain('Remove all /0 ranges')
            const checkbox = host.querySelector('input[type=checkbox]')
            checkbox.checked = true
            checkbox.dispatchEvent(new Event('change'))
            await flush()
            expect(button('Apply').disabled).toBe(true)
            button('Apply').click()
            expect(mocks.apiFetch).toHaveBeenCalledTimes(1)
            const textarea = host.querySelector('textarea')
            textarea.value = '10.0.0.0/8'
            textarea.dispatchEvent(new Event('input'))
            await flush()
            expect(host.querySelector('[role=alert]')).toBeNull()
            expect(checkbox.checked).toBe(false)
            checkbox.checked = true
            checkbox.dispatchEvent(new Event('change'))
            await flush()
            expect(button('Apply').disabled).toBe(false)
        },
    )

    it('reports HTTP 400 as a definite rejection, not an uncertain transaction', async () => {
        mocks.apiFetch.mockResolvedValueOnce({ cidrs: ['10.0.0.0/8'] })
            .mockRejectedValueOnce(Object.assign(new Error('/0 ranges are not permitted.'), { status: 400 }))
        await mount()
        const checkbox = host.querySelector('input[type=checkbox]')
        checkbox.checked = true
        checkbox.dispatchEvent(new Event('change'))
        await flush()
        button('Apply').click()
        await flush()
        expect(host.querySelector('[role=alert]').textContent).toContain('/0 ranges are not permitted')
        expect(host.querySelector('[role=alert]').textContent).toContain('No changes were applied')
        expect(host.querySelector('[role=alert]').textContent).not.toContain('uncertain')
    })

    it('shows loading, then existing CIDRs; pins requests to the opened connection', async () => {
        let finish
        mocks.apiFetch.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
        await mount()
        expect(host.textContent).toContain('Loading admin networks')
        expect(host.querySelector('textarea')).toBeNull()
        finish({ cidrs: ['10.0.0.0/8', '::1/128'] })
        await flush()
        expect(host.querySelector('textarea').value).toBe('10.0.0.0/8\n::1/128')
        expect(mocks.connectionIds).toEqual(['server-one'])
        expect(mocks.apiFetch).toHaveBeenCalledWith('/api/admin/nginx-admin-cidrs', { exposeServerMessage: true })
        expect(button('Apply').disabled).toBe(true)
    })

    it('requires confirmation and sends trimmed CIDRs with no PUT retries', async () => {
        mocks.apiFetch.mockResolvedValueOnce({ cidrs: ['10.0.0.0/8'] }).mockResolvedValueOnce({ cidrs: ['fc00::/7'] })
        await mount()
        const textarea = host.querySelector('textarea')
        textarea.value = ' fc00::/7 \n\n'
        textarea.dispatchEvent(new Event('input'))
        await flush()
        const checkbox = host.querySelector('input[type=checkbox]')
        checkbox.checked = true
        checkbox.dispatchEvent(new Event('change'))
        await flush()
        button('Apply').click()
        await flush()
        expect(mocks.apiFetch).toHaveBeenLastCalledWith('/api/admin/nginx-admin-cidrs', expect.objectContaining({
            method: 'PUT', body: JSON.stringify({ cidrs: ['fc00::/7'] }), retry: 0, timeoutMs: 70000,
        }))
        expect(host.textContent).toContain('applied and nginx reloaded')
        expect(button('Apply').disabled).toBe(true)
    })

    it.each([
        [403, 'Admin access required'],
        [404, 'This server does not support admin network settings yet.'],
        [500, 'Existing admin allow file is unsupported'],
    ])('reports GET %s and provides retry without exposing an editable policy', async (status, message) => {
        mocks.apiFetch.mockRejectedValueOnce(Object.assign(new Error(message), { status }))
        await mount()
        expect(host.querySelector('[role=alert]').textContent).toContain(message)
        expect(host.querySelector('textarea')).toBeNull()
        mocks.apiFetch.mockResolvedValueOnce({ cidrs: [] })
        button('Reload admin').click()
        await flush()
        expect(host.querySelector('textarea').value).toBe('')
    })

    it('shows explicit PUT failures and does not claim success or discard edits', async () => {
        mocks.apiFetch.mockResolvedValueOnce({ cidrs: ['10.0.0.0/8'] })
            .mockRejectedValueOnce(new Error('prior file restored but recovery reload failed'))
        await mount()
        const checkbox = host.querySelector('input')
        checkbox.checked = true
        checkbox.dispatchEvent(new Event('change'))
        await flush()
        button('Apply').click()
        await flush()
        expect(host.querySelector('[role=alert]').textContent).toContain('recovery reload failed')
        expect(host.querySelector('[role=alert]').textContent).toContain('result is uncertain')
        expect(host.textContent).not.toContain('applied and nginx reloaded')
        expect(host.querySelector('textarea').value).toBe('10.0.0.0/8')
    })
})
