import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import AdminNetworksPanel from './AdminNetworksPanel.vue'
import { isAdminSession } from '../composables/adminSession'

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn(), connectionIds: [], apiOptions: [] }))
vi.mock('../composables/useApi', () => ({
    useApi: (id, options) => {
        mocks.connectionIds.push(id)
        mocks.apiOptions.push(options)
        return { apiFetch: mocks.apiFetch, baseUrl: { value: 'https://192.168.1.50:8443' } }
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
const safety = {
    available: true, clientAddress: '192.168.1.42', hostCidr: '192.168.1.42/32',
    matchedCidr: '192.168.0.0/16',
}
const policy = (cidrs = ['192.168.0.0/16'], extra = {}) => ({ cidrs, safety, pending: null, ...extra })
const pending = { id: 'transaction-one', expiresAt: new Date(Date.now() + 120000).toISOString() }
async function checkPolicy(allowed = true) {
    mocks.apiFetch.mockResolvedValueOnce({ cidrs: [], safety: { ...safety, allowed } })
    button('Check proposed').click()
    await flush()
}
async function acknowledge() {
    const checkbox = [...host.querySelectorAll('input')].at(-1)
    checkbox.checked = true
    checkbox.dispatchEvent(new Event('change'))
    await flush()
}
afterEach(() => {
    app?.unmount()
    host?.remove()
    mocks.apiFetch.mockReset()
    mocks.connectionIds.length = 0
    mocks.apiOptions.length = 0
    vi.useRealTimers()
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
            mocks.apiFetch.mockResolvedValueOnce(policy([cidr, '10.0.0.0/8']))
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
            expect(button('Apply').disabled).toBe(true)
            await checkPolicy()
            expect(button('Apply').disabled).toBe(false)
        },
    )

    it('reports HTTP 400 as a definite rejection, not an uncertain transaction', async () => {
        mocks.apiFetch.mockResolvedValueOnce(policy())
        await mount()
        await checkPolicy()
        mocks.apiFetch.mockRejectedValueOnce(Object.assign(new Error('/0 ranges are not permitted.'), { status: 400 }))
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
        finish(policy(['10.0.0.0/8', '::1/128']))
        await flush()
        expect(host.querySelector('textarea').value).toBe('10.0.0.0/8\n::1/128')
        expect(mocks.connectionIds).toEqual(['server-one'])
        expect(mocks.apiOptions).toEqual([{ transport: 'nginx-https' }])
        expect(mocks.apiFetch).toHaveBeenCalledWith('/api/admin/nginx-admin-cidrs', { exposeServerMessage: true })
        expect(button('Apply').disabled).toBe(true)
    })

    it('keeps the device and preview buttons in a spaced, wrapping row', async () => {
        mocks.apiFetch.mockResolvedValueOnce(policy())
        await mount()
        const deviceButton = button('Allow this device')
        const previewButton = button('Check proposed')
        expect(deviceButton.parentElement).toBe(previewButton.parentElement)
        expect(deviceButton.parentElement.className).toContain('flex')
        expect(deviceButton.parentElement.className).toContain('flex-wrap')
        expect(deviceButton.parentElement.className).toContain('gap-2')
    })

    it('previews, sends trimmed CIDRs without retries, and only claims success after confirmation', async () => {
        mocks.apiFetch.mockResolvedValueOnce(policy())
        await mount()
        const textarea = host.querySelector('textarea')
        textarea.value = ' fc00::/7 \n\n'
        textarea.dispatchEvent(new Event('input'))
        await flush()
        await checkPolicy()
        mocks.apiFetch.mockResolvedValueOnce(policy(['fc00::/7'], { pending }))
        const checkbox = host.querySelector('input[type=checkbox]')
        checkbox.checked = true
        checkbox.dispatchEvent(new Event('change'))
        await flush()
        button('Apply').click()
        await flush()
        expect(mocks.apiFetch).toHaveBeenLastCalledWith('/api/admin/nginx-admin-cidrs', expect.objectContaining({
            method: 'PUT', body: JSON.stringify({ cidrs: ['fc00::/7'], overrideCurrentConnection: false }), retry: 0, timeoutMs: 70000,
        }))
        expect(host.textContent).toContain('Temporary policy active')
        expect(host.textContent).not.toContain('confirmed through reloaded')
        expect(button('Apply').disabled).toBe(true)
        mocks.apiFetch.mockResolvedValueOnce(policy(['fc00::/7']))
        button('Reconnect and confirm').click()
        await flush()
        expect(mocks.apiFetch).toHaveBeenLastCalledWith('/api/admin/nginx-admin-cidrs/confirm', expect.objectContaining({
            method: 'POST', body: JSON.stringify({ id: pending.id }), retry: 0, suppressAuthRedirect: true,
        }))
        expect(host.textContent).toContain('confirmed through reloaded nginx')
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
        mocks.apiFetch.mockResolvedValueOnce(policy([]))
        button('Reload admin').click()
        await flush()
        expect(host.querySelector('textarea').value).toBe('')
    })

    it('explains LAN HTTPS connection failures without exposing an editable policy', async () => {
        mocks.apiFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'))
        await mount()
        expect(host.querySelector('[role=alert]').textContent).toContain('https://192.168.1.50:8443')
        expect(host.querySelector('[role=alert]').textContent).toContain('certificate trust')
        expect(host.textContent).toContain('No public domain or port forwarding is required')
        expect(host.querySelector('textarea')).toBeNull()
        expect(button('Apply')).toBeUndefined()
    })

    it('shows explicit PUT failures and does not claim success or discard edits', async () => {
        mocks.apiFetch.mockResolvedValueOnce(policy(['10.0.0.0/8']))
        await mount()
        await checkPolicy()
        mocks.apiFetch.mockRejectedValueOnce(new Error('prior file restored but recovery reload failed'))
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

    it('explains default ranges and shows the nginx-observed address without claiming network trust', async () => {
        mocks.apiFetch.mockResolvedValueOnce(policy())
        await mount()
        for (const text of ['What are these networks?', '127.0.0.0/8', '100.64.0.0/10',
            'fc00::/7', 'fe80::/10', '192.168.1.42', '192.168.0.0/16',
            'not a discovery', 'does not identify your whole LAN']) expect(host.textContent).toContain(text)
    })

    it.each(['192.168.1.42/32', '2001:db8::42/128'])('adds only observed host %s and invalidates preview', async hostCidr => {
        mocks.apiFetch.mockResolvedValueOnce(policy(['10.0.0.0/8'], {
            safety: { ...safety, hostCidr, clientAddress: hostCidr.split('/')[0] },
        }))
        await mount()
        await checkPolicy()
        await acknowledge()
        button('Allow this device').click()
        await flush()
        expect(host.querySelector('textarea').value).toBe(`10.0.0.0/8\n${hostCidr}`)
        expect(button('Apply').disabled).toBe(true)
        expect(host.querySelector('input').checked).toBe(false)
        button('Allow this device').click()
        await flush()
        expect(host.querySelector('textarea').value.split(hostCidr)).toHaveLength(2)
    })

    it('requires a separate explicit override to exclude the current caller and resets it on edits', async () => {
        mocks.apiFetch.mockResolvedValueOnce(policy())
        await mount()
        await checkPolicy(false)
        await acknowledge()
        expect(button('Apply').disabled).toBe(true)
        expect(host.textContent).toContain('excludes your current connection')
        const override = host.querySelector('input')
        override.checked = true
        override.dispatchEvent(new Event('change'))
        await flush()
        expect(button('Apply').disabled).toBe(false)
        mocks.apiFetch.mockResolvedValueOnce(policy([], { pending }))
        button('Apply').click()
        await flush()
        expect(JSON.parse(mocks.apiFetch.mock.calls.at(-1)[1].body).overrideCurrentConnection).toBe(true)
        expect(host.querySelector('textarea').disabled).toBe(true)
    })

    it.each([undefined, {
        available: false, clientAddress: null, hostCidr: null, matchedCidr: null, reason: 'Missing trusted nginx context.',
    }])('fails closed for legacy servers or missing trusted context', async unavailable => {
        mocks.apiFetch.mockResolvedValueOnce(policy([], { safety: unavailable }))
        await mount()
        await acknowledge()
        expect(host.textContent).toContain('Connection safety is unavailable')
        expect(button('Check proposed').disabled).toBe(true)
        expect(button('Apply').disabled).toBe(true)
    })

    it('resets acknowledgment, override and preview whenever the proposed text changes', async () => {
        mocks.apiFetch.mockResolvedValueOnce(policy())
        await mount()
        await checkPolicy()
        await acknowledge()
        expect(button('Apply').disabled).toBe(false)
        const textarea = host.querySelector('textarea')
        textarea.value = '10.0.0.0/8'
        textarea.dispatchEvent(new Event('input'))
        await flush()
        expect(button('Apply').disabled).toBe(true)
        expect(host.querySelector('input').checked).toBe(false)
    })

    it('reports preview failure without enabling Apply', async () => {
        mocks.apiFetch.mockResolvedValueOnce(policy())
        await mount()
        mocks.apiFetch.mockRejectedValueOnce(new Error('Invalid CIDR'))
        button('Check proposed').click()
        await flush()
        await acknowledge()
        expect(host.querySelector('[role=alert]').textContent).toContain('Invalid CIDR')
        expect(button('Apply').disabled).toBe(true)
    })

    it('does not accept malformed safety or confirmation responses as success', async () => {
        mocks.apiFetch.mockResolvedValueOnce(policy([], { safety: { available: true } }))
        await mount()
        expect(host.querySelector('textarea')).toBeNull()
        expect(host.textContent).toContain('Incomplete connection safety')
    })

    it('keeps pending changes unconfirmed on reconnect failure and can retry', async () => {
        mocks.apiFetch.mockResolvedValueOnce(policy([], { pending }))
        await mount()
        mocks.apiFetch.mockRejectedValueOnce(Object.assign(new Error('Use a new nginx connection'), { status: 409 }))
        button('Reconnect and confirm').click()
        await flush()
        expect(host.textContent).toContain('Confirmation was not verified')
        expect(host.textContent).toContain('Temporary policy active')
        expect(host.textContent).not.toContain('confirmed through reloaded nginx')
        mocks.apiFetch.mockResolvedValueOnce(policy())
        button('Reconnect and confirm').click()
        await flush()
        expect(host.textContent).toContain('confirmed through reloaded nginx')
    })

    it('refreshes a pending policy to observe rollback and stops timers when unmounted', async () => {
        vi.useFakeTimers()
        mocks.apiFetch.mockResolvedValueOnce(policy([], { pending })).mockResolvedValueOnce(policy())
        await mount()
        expect(host.textContent).toContain('Temporary policy active')
        await vi.advanceTimersByTimeAsync(3000)
        await flush()
        expect(host.textContent).not.toContain('Temporary policy active')
        expect(host.textContent).not.toContain('confirmed through reloaded nginx')
        expect(host.querySelector('textarea').value).toBe('192.168.0.0/16')
        app.unmount()
        app = null
        await vi.advanceTimersByTimeAsync(10000)
        expect(mocks.apiFetch).toHaveBeenCalledTimes(2)
    })

    it('automatically retries only old-worker confirmation rejections', async () => {
        vi.useFakeTimers()
        mocks.apiFetch.mockResolvedValueOnce(policy([], { pending }))
        await mount()
        mocks.apiFetch.mockRejectedValueOnce(Object.assign(new Error('Old worker'), {
            status: 409, code: 'confirmation_requires_new_connection',
        })).mockResolvedValueOnce(policy())
        button('Reconnect and confirm').click()
        await flush()
        expect(host.textContent).toContain('Reconnecting to reloaded nginx')
        await vi.advanceTimersByTimeAsync(1000)
        await flush()
        expect(host.textContent).toContain('confirmed through reloaded nginx')
        expect(mocks.apiFetch).toHaveBeenCalledTimes(3)
    })

    it('refuses to confirm after the server deadline', async () => {
        mocks.apiFetch.mockResolvedValueOnce(policy([], {
            pending: { ...pending, expiresAt: new Date(Date.now() - 1000).toISOString() },
        }))
        await mount()
        button('Reconnect and confirm').click()
        await flush()
        expect(host.textContent).toContain('confirmation deadline has passed')
        expect(mocks.apiFetch).toHaveBeenCalledTimes(1)
    })

    it('stops old-worker retries when the panel is closed', async () => {
        vi.useFakeTimers()
        mocks.apiFetch.mockResolvedValueOnce(policy([], { pending }))
        await mount()
        mocks.apiFetch.mockRejectedValueOnce(Object.assign(new Error('Old worker'), {
            code: 'confirmation_requires_new_connection',
        }))
        button('Reconnect and confirm').click()
        await flush()
        app.unmount()
        app = null
        await vi.advanceTimersByTimeAsync(10000)
        expect(mocks.apiFetch).toHaveBeenCalledTimes(2)
    })

    it('does not claim successful confirmation for a malformed response', async () => {
        mocks.apiFetch.mockResolvedValueOnce(policy([], { pending }))
        await mount()
        mocks.apiFetch.mockResolvedValueOnce({ cidrs: [false], pending: null })
        button('Reconnect and confirm').click()
        await flush()
        expect(host.textContent).toContain('Unexpected policy confirmation response')
        expect(host.textContent).not.toContain('confirmed through reloaded nginx')
    })
})
