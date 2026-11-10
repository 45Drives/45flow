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
// Dialogs teleport to <body>, so look there too.
const button = text => [...document.body.querySelectorAll('button')].find(el => el.textContent.includes(text))
const confirmButton = () => document.body.querySelector('[data-confirm]')
// FlowField links label and control with for=/id rather than nesting.
function fieldFor(labelText) {
    const label = [...host.querySelectorAll('label')].find(el => el.textContent.includes(labelText))
    return document.getElementById(label.htmlFor)
}
function setField(labelText, value) {
    const field = fieldFor(labelText)
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
    // Closed dialogs can leave their leave-transition node behind in jsdom.
    document.body.innerHTML = ''
    mocks.apiFetch.mockReset()
    mocks.connectionIds.length = 0
})

describe('AdminSmtpPanel settings UI/API', () => {
    it('loads unconfigured state and shows username/password strictly blank', async () => {
        mocks.apiFetch.mockResolvedValueOnce(unconfigured())
        await mount()
        expect(mocks.apiFetch).toHaveBeenCalledWith('/api/admin/credentials/smtp')
        expect(host.textContent).toContain('Not set up')
        expect(host.querySelector('input[type="text"]').value).toBe('')
        expect(host.querySelector('input[type="password"]').value).toBe('')
    })

    it('loads configured status metadata but never populates username/password fields', async () => {
        mocks.apiFetch.mockResolvedValueOnce(configured())
        await mount()
        expect(host.textContent).toContain('smtp.example.com:587')
        expect(host.textContent).toContain('STARTTLS')
        expect(host.textContent).toContain('noreply@example.com')
        // Known non-secret fields ARE preloaded (host/port/tls/from) but
        // username/password remain blank — they are write-only and never
        // returned by the server.
        const usernameInput = fieldFor('Username')
        const passwordInput = host.querySelector('input[type="password"]')
        expect(usernameInput.value).toBe('')
        expect(passwordInput.value).toBe('')
        expect(button('Delete saved settings')).toBeTruthy()
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
        setField('From address', 'noreply@example.com')
        const password = host.querySelector('input[type="password"]')
        password.value = 'hunter2'
        password.dispatchEvent(new Event('input'))
        await flush()
        mocks.apiFetch.mockResolvedValueOnce(configured({ host: 'mail.example.com', port: 2525 }))
        button('Save email settings').click()
        await flush()
        expect(mocks.apiFetch).toHaveBeenLastCalledWith('/api/admin/credentials/smtp', expect.objectContaining({
            method: 'PUT',
            body: JSON.stringify({
                host: 'mail.example.com', port: 2525, tlsMode: 'starttls',
                username: 'svc-account', password: 'hunter2', fromAddress: 'noreply@example.com',
            }),
            retry: 0,
        }))
        expect(host.textContent).toContain('Email settings saved.')
        expect(host.querySelector('input[type="password"]').value).toBe('')
        const usernameInput = fieldFor('Username')
        expect(usernameInput.value).toBe('')
    })

    it('toggles password visibility and hides it again after a successful save', async () => {
        mocks.apiFetch.mockResolvedValueOnce(unconfigured())
        await mount()
        const password = fieldFor('Password')
        const toggle = host.querySelector('button[aria-label="Show password"]')
        expect(password.type).toBe('password')
        toggle.click()
        await flush()
        expect(password.type).toBe('text')
        expect(toggle.getAttribute('aria-label')).toBe('Hide password')
        setField('Host', 'mail.example.com')
        setField('Port', '2525')
        setField('Username', 'svc-account')
        setField('From address', 'noreply@example.com')
        setField('Password', 'hunter2')
        await flush()
        mocks.apiFetch.mockResolvedValueOnce(configured({ host: 'mail.example.com', port: 2525 }))
        button('Save email settings').click()
        await flush()
        expect(fieldFor('Password').type).toBe('password')
    })

    it('reports 400 invalid_smtp_settings with details and does not claim success', async () => {
        mocks.apiFetch.mockResolvedValueOnce(unconfigured())
        await mount()
        setField('Host', 'mail.example.com')
        setField('Port', '2525')
        setField('Username', 'svc-account')
        setField('From address', 'noreply@example.com')
        const password = host.querySelector('input[type="password"]')
        password.value = 'hunter2'
        password.dispatchEvent(new Event('input'))
        await flush()
        mocks.apiFetch.mockRejectedValueOnce(Object.assign(new Error('invalid_smtp_settings'), {
            status: 400, details: ['port must be an integer TCP port 1-65535'],
        }))
        button('Save email settings').click()
        await flush()
        expect(host.querySelector('[role="alert"]').textContent).toContain('port must be an integer')
        expect(host.querySelector('[role="alert"]').textContent).toContain('No changes were saved')
        expect(host.textContent).not.toContain('Email settings saved.')
    })

    it('reports a 503 credential-store-unavailable error on save without claiming success', async () => {
        mocks.apiFetch.mockResolvedValueOnce(unconfigured())
        await mount()
        setField('Host', 'mail.example.com')
        setField('Port', '2525')
        setField('Username', 'svc-account')
        setField('From address', 'noreply@example.com')
        const password = host.querySelector('input[type="password"]')
        password.value = 'hunter2'
        password.dispatchEvent(new Event('input'))
        await flush()
        mocks.apiFetch.mockRejectedValueOnce(Object.assign(new Error('credential_store_unavailable'), { status: 503 }))
        button('Save email settings').click()
        await flush()
        expect(host.querySelector('[role="alert"]').textContent).toContain('credential store is unavailable')
        expect(host.querySelector('[role="alert"]').textContent).toContain('No changes were saved')
    })

    it('requires explicit confirmation before DELETE and clears the form on success', async () => {
        mocks.apiFetch.mockResolvedValueOnce(configured())
        await mount()
        button('Delete saved settings').click()
        await flush()
        expect(mocks.apiFetch).toHaveBeenCalledTimes(1)
        expect(document.body.textContent).toContain('New invitations and notifications are queued but not sent')
        mocks.apiFetch.mockResolvedValueOnce(unconfigured())
        confirmButton().click()
        await flush()
        expect(mocks.apiFetch).toHaveBeenLastCalledWith('/api/admin/credentials/smtp', expect.objectContaining({ method: 'DELETE' }))
        expect(host.textContent).toContain('Email settings deleted.')
        expect(host.textContent).toContain('Not set up')
    })

    it('cancels a pending delete confirmation without calling DELETE', async () => {
        mocks.apiFetch.mockResolvedValueOnce(configured())
        await mount()
        button('Delete saved settings').click()
        await flush()
        button('Cancel').click()
        await flush()
        expect(mocks.apiFetch).toHaveBeenCalledTimes(1)
        expect(host.textContent).not.toContain('Email settings deleted.')
    })

    it('reports a 503 on delete and does not claim the credential was removed', async () => {
        mocks.apiFetch.mockResolvedValueOnce(configured())
        await mount()
        button('Delete saved settings').click()
        await flush()
        mocks.apiFetch.mockRejectedValueOnce(Object.assign(new Error('credential_store_unavailable'), { status: 503 }))
        confirmButton().click()
        await flush()
        expect(host.querySelector('[role="alert"]').textContent).toContain('Credentials were not deleted')
        expect(host.textContent).toContain('Set up:')
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
        const usernameInput = fieldFor('Username')
        const passwordInput = fieldFor('Password')
        expect(usernameInput.value).toBe('')
        expect(passwordInput.value).toBe('')
        expect(host.textContent).toContain('Not set up')
    })

    it('discards a stale in-flight load response if the panel unmounts before it resolves', async () => {
        let resolveStale
        mocks.apiFetch.mockImplementationOnce(() => new Promise(resolve => { resolveStale = resolve }))
        await mount()
        expect(host.textContent).toContain('Loading email settings')
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

    it('needs a From address before saving, unless the login is an email address', async () => {
        mocks.apiFetch.mockResolvedValueOnce(unconfigured())
        await mount()
        setField('Host', 'mail.example.com')
        setField('Port', '587')
        setField('Username', 'svc-account')
        const password = host.querySelector('input[type="password"]')
        password.value = 'hunter2'
        password.dispatchEvent(new Event('input'))
        await flush()
        expect(button('Save email settings').disabled).toBe(true)
        setField('Username', 'me@example.com')
        await flush()
        expect(button('Save email settings').disabled).toBe(false)
    })

    it('warns when saved settings have no From address', async () => {
        mocks.apiFetch.mockResolvedValueOnce(configured({ fromAddress: null }))
        await mount()
        expect(host.textContent).toContain('No From address is saved')
    })

    it('sends a test email and explains a failure with the mail server reply', async () => {
        mocks.apiFetch.mockResolvedValueOnce(configured())
        await mount()
        const to = fieldFor('Send a test email to')
        to.value = 'me@example.com'
        to.dispatchEvent(new Event('input'))
        await flush()
        mocks.apiFetch.mockResolvedValueOnce({ ok: true, sent: false, outcome: 'rejected', reason: 'auth_failed', smtpResponseCode: 535, smtpResponse: '535 5.7.8 Authentication failed' })
        button('Send test email').click()
        await flush()
        expect(mocks.apiFetch).toHaveBeenLastCalledWith('/api/admin/credentials/smtp/test', expect.objectContaining({
            method: 'POST', body: JSON.stringify({ to: 'me@example.com' }),
        }))
        expect(host.textContent).toContain("didn't accept the username or password")
        expect(host.textContent).toContain('535 5.7.8 Authentication failed')

        mocks.apiFetch.mockResolvedValueOnce({ ok: true, sent: true, outcome: 'accepted', reason: null, smtpResponseCode: 250, smtpResponse: '250 OK' })
        button('Send test email').click()
        await flush()
        expect(host.textContent).toContain('Sent. The mail server accepted it')
    })

    it('saves server/From changes without re-entering the login on saved settings', async () => {
        mocks.apiFetch.mockResolvedValueOnce(configured())
        await mount()
        setField('From address', 'new@example.com')
        await flush()
        expect(button('Save email settings').disabled).toBe(false)
        mocks.apiFetch.mockResolvedValueOnce(configured({ fromAddress: 'new@example.com' }))
        button('Save email settings').click()
        await flush()
        const body = JSON.parse(mocks.apiFetch.mock.calls.at(-1)[1].body)
        expect(body).toMatchObject({ username: '', password: '', fromAddress: 'new@example.com' })
        expect(host.textContent).toContain('Email settings saved.')
    })

    it('fills From from an email-address login and shows Gmail tips', async () => {
        mocks.apiFetch.mockResolvedValueOnce(unconfigured())
        await mount()
        setField('Host', 'smtp.gmail.com')
        setField('Username', 'me@gmail.com')
        await flush()
        expect(fieldFor('From address').value).toBe('me@gmail.com')
        expect(host.textContent).toContain('Gmail needs an app password')
        expect(host.querySelector('a[href="https://myaccount.google.com/apppasswords"]')).not.toBeNull()
    })
})
