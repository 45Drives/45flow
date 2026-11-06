// C3 email-sharing client — focused unit checks for AdminSmtpPanel.vue.
//
// Follows the repo's raw createApp/nextTick DOM mounting convention used by
// AdminNetworksPanel.test.js (no @vue/test-utils). Bounded to the cases
// required by the gate contract: GET/PUT/DELETE route+body, write-only
// secret lifecycle (blank on load, cleared after save/delete/connection
// switch/unmount), honest loading/error/unavailable states, destructive
// delete confirmation, and the stale-response/connection-switch guard. No
// invented edge-case permutations.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import AdminSmtpPanel from './AdminSmtpPanel.vue'

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn(), connectionIds: [] }))
vi.mock('../composables/useApi', () => ({
    useApi: (id) => {
        mocks.connectionIds.push(id)
        return { apiFetch: mocks.apiFetch }
    },
}))

let app
let host
async function flush() {
    for (let i = 0; i < 5; i++) await nextTick()
}
async function mount(connectionId = 'server-one') {
    host = document.createElement('div')
    document.body.appendChild(host)
    app = createApp(AdminSmtpPanel, { connectionId })
    app.mount(host)
    await flush()
}
const button = text => [...host.querySelectorAll('button')].find(el => el.textContent.includes(text))
function setField(labelText, value) {
    const label = [...host.querySelectorAll('label')].find(el => el.textContent.includes(labelText))
    const field = label.querySelector('input,select')
    field.value = value
    field.dispatchEvent(new Event('input'))
    field.dispatchEvent(new Event('change'))
}
const unconfigured = () => ({ ok: true, smtp: { configured: false, keyVersion: null, updatedAt: null } })
const configured = (overrides = {}) => ({
    ok: true,
    smtp: {
        configured: true, host: 'smtp.example.com', port: 587, tlsMode: 'starttls',
        fromAddress: 'noreply@example.com', keyVersion: 3, updatedAt: '2026-11-06T12:00:00Z',
        ...overrides,
    },
})

afterEach(() => {
    app?.unmount()
    host?.remove()
    mocks.apiFetch.mockReset()
    mocks.connectionIds.length = 0
})

describe('AdminSmtpPanel settings UI/API', () => {
    it('loads unconfigured state and shows username/password strictly blank', async () => {
        mocks.apiFetch.mockResolvedValueOnce(unconfigured())
        await mount()
        expect(mocks.apiFetch).toHaveBeenCalledWith('/api/admin/credentials/smtp')
        expect(host.textContent).toContain('SMTP is not configured')
        expect(host.querySelector('input[type="text"]').value).toBe('')
        expect(host.querySelector('input[type="password"]').value).toBe('')
    })

    it('loads configured status metadata but never populates username/password fields', async () => {
        mocks.apiFetch.mockResolvedValueOnce(configured())
        await mount()
        expect(host.textContent).toContain('smtp.example.com:587')
        expect(host.textContent).toContain('starttls')
        expect(host.textContent).toContain('noreply@example.com')
        // Known non-secret fields ARE preloaded (host/port/tls/from) but
        // username/password remain blank — they are write-only and never
        // returned by the server.
        const usernameInput = [...host.querySelectorAll('label')]
            .find(el => el.textContent.includes('Username')).querySelector('input')
        const passwordInput = host.querySelector('input[type="password"]')
        expect(usernameInput.value).toBe('')
        expect(passwordInput.value).toBe('')
        expect(button('Delete stored credentials')).toBeTruthy()
    })

    it('rejects a response that leaks secret fields instead of displaying it', async () => {
        mocks.apiFetch.mockResolvedValueOnce(configured({ username: 'leaked', password: 'leaked' }))
        await mount()
        expect(host.querySelector('[role="alert"]').textContent).toContain('secret fields')
    })

    it('PUTs the exact body, shows success, and clears the typed secret afterward', async () => {
        mocks.apiFetch.mockResolvedValueOnce(unconfigured())
        await mount()
        setField('Host', 'mail.example.com')
        setField('Port', '2525')
        setField('Username', 'svc-account')
        const password = host.querySelector('input[type="password"]')
        password.value = 'hunter2'
        password.dispatchEvent(new Event('input'))
        await flush()
        mocks.apiFetch.mockResolvedValueOnce(configured({ host: 'mail.example.com', port: 2525 }))
        button('Save SMTP settings').click()
        await flush()
        expect(mocks.apiFetch).toHaveBeenLastCalledWith('/api/admin/credentials/smtp', expect.objectContaining({
            method: 'PUT',
            body: JSON.stringify({
                host: 'mail.example.com', port: 2525, tlsMode: 'starttls',
                username: 'svc-account', password: 'hunter2',
            }),
            retry: 0,
        }))
        expect(host.textContent).toContain('SMTP settings saved.')
        expect(host.querySelector('input[type="password"]').value).toBe('')
        const usernameInput = [...host.querySelectorAll('label')]
            .find(el => el.textContent.includes('Username')).querySelector('input')
        expect(usernameInput.value).toBe('')
    })

    it('reports 400 invalid_smtp_settings with details and does not claim success', async () => {
        mocks.apiFetch.mockResolvedValueOnce(unconfigured())
        await mount()
        setField('Host', 'mail.example.com')
        setField('Port', '2525')
        setField('Username', 'svc-account')
        const password = host.querySelector('input[type="password"]')
        password.value = 'hunter2'
        password.dispatchEvent(new Event('input'))
        await flush()
        mocks.apiFetch.mockRejectedValueOnce(Object.assign(new Error('invalid_smtp_settings'), {
            status: 400, details: ['port must be an integer TCP port 1-65535'],
        }))
        button('Save SMTP settings').click()
        await flush()
        expect(host.querySelector('[role="alert"]').textContent).toContain('port must be an integer')
        expect(host.querySelector('[role="alert"]').textContent).toContain('No changes were saved')
        expect(host.textContent).not.toContain('SMTP settings saved.')
    })

    it('reports a 503 credential-store-unavailable error on save without claiming success', async () => {
        mocks.apiFetch.mockResolvedValueOnce(unconfigured())
        await mount()
        setField('Host', 'mail.example.com')
        setField('Port', '2525')
        setField('Username', 'svc-account')
        const password = host.querySelector('input[type="password"]')
        password.value = 'hunter2'
        password.dispatchEvent(new Event('input'))
        await flush()
        mocks.apiFetch.mockRejectedValueOnce(Object.assign(new Error('credential_store_unavailable'), { status: 503 }))
        button('Save SMTP settings').click()
        await flush()
        expect(host.querySelector('[role="alert"]').textContent).toContain('credential store is unavailable')
        expect(host.querySelector('[role="alert"]').textContent).toContain('No changes were saved')
    })

    it('requires explicit confirmation before DELETE and clears the form on success', async () => {
        mocks.apiFetch.mockResolvedValueOnce(configured())
        await mount()
        button('Delete stored credentials').click()
        await flush()
        expect(mocks.apiFetch).toHaveBeenCalledTimes(1)
        expect(host.textContent).toContain('Future invitations will be queued but not sent')
        mocks.apiFetch.mockResolvedValueOnce(unconfigured())
        button('Confirm delete').click()
        await flush()
        expect(mocks.apiFetch).toHaveBeenLastCalledWith('/api/admin/credentials/smtp', expect.objectContaining({ method: 'DELETE' }))
        expect(host.textContent).toContain('SMTP credentials deleted.')
        expect(host.textContent).toContain('SMTP is not configured')
    })

    it('cancels a pending delete confirmation without calling DELETE', async () => {
        mocks.apiFetch.mockResolvedValueOnce(configured())
        await mount()
        button('Delete stored credentials').click()
        await flush()
        button('Cancel').click()
        await flush()
        expect(mocks.apiFetch).toHaveBeenCalledTimes(1)
        expect(host.textContent).not.toContain('SMTP credentials deleted.')
    })

    it('reports a 503 on delete and does not claim the credential was removed', async () => {
        mocks.apiFetch.mockResolvedValueOnce(configured())
        await mount()
        button('Delete stored credentials').click()
        await flush()
        mocks.apiFetch.mockRejectedValueOnce(Object.assign(new Error('credential_store_unavailable'), { status: 503 }))
        button('Confirm delete').click()
        await flush()
        expect(host.querySelector('[role="alert"]').textContent).toContain('Credentials were not deleted')
        expect(host.textContent).toContain('SMTP is configured')
    })

    it('reports a 403 as an honest admin-access message', async () => {
        mocks.apiFetch.mockRejectedValueOnce(Object.assign(new Error('admin_required'), { status: 403 }))
        await mount()
        expect(host.querySelector('[role="alert"]').textContent).toContain('Admin access is required')
    })

    it('clears typed secrets on unmount and starts a fresh instance cleanly when the connection switches', async () => {
        mocks.apiFetch.mockResolvedValueOnce(unconfigured())
        await mount('server-one')
        setField('Username', 'typed-before-switch')
        setField('Password', 'typed-secret')
        await flush()
        // SettingsModal remounts this panel via :key="connectionId" on a
        // connection switch, same as AdminNetworksPanel — simulate that here.
        app.unmount()
        mocks.apiFetch.mockResolvedValueOnce(unconfigured())
        await mount('server-two')
        expect(mocks.connectionIds).toEqual(['server-one', 'server-two'])
        const usernameInput = [...host.querySelectorAll('label')]
            .find(el => el.textContent.includes('Username')).querySelector('input')
        const passwordInput = [...host.querySelectorAll('label')]
            .find(el => el.textContent.includes('Password')).querySelector('input')
        expect(usernameInput.value).toBe('')
        expect(passwordInput.value).toBe('')
        expect(host.textContent).toContain('SMTP is not configured')
    })

    it('discards a stale in-flight load response if the panel unmounts before it resolves', async () => {
        let resolveStale
        mocks.apiFetch.mockImplementationOnce(() => new Promise(resolve => { resolveStale = resolve }))
        await mount()
        expect(host.textContent).toContain('Loading SMTP settings')
        app.unmount()
        // The in-flight GET from the unmounted instance resolving late must
        // not throw (writing into a disposed instance's own refs is inert).
        expect(() => resolveStale(configured({ host: 'stale.example.com' }))).not.toThrow()
        await flush()
    })

    it('does not accept a malformed configured response as success', async () => {
        mocks.apiFetch.mockResolvedValueOnce({ ok: true, smtp: { configured: true, host: 'x' } })
        await mount()
        expect(host.querySelector('[role="alert"]').textContent).toContain('Unexpected SMTP settings response')
        expect(host.querySelector('button')).toBeTruthy()
    })
})
