import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import CheckPortForwarding from './CheckPortForwarding.vue'
import EmailInvitationPanel from './EmailInvitationPanel.vue'
import LinkEmailComposer from './LinkEmailComposer.vue'
import { emailStatusView } from '../utils/emailStatus'

let app
let host
async function flush() {
    for (let i = 0; i < 6; i++) await nextTick()
}
async function mount(component, props) {
    host = document.createElement('div')
    document.body.appendChild(host)
    app = createApp(component, props)
    app.mount(host)
    await flush()
}
afterEach(() => {
    app?.unmount()
    host?.remove()
})
const button = (text) => [...host.querySelectorAll('button')].find((b) => b.textContent.includes(text))

describe('port-forwarding check when the server turned it off', () => {
    it('says so up front and never calls the check', async () => {
        const apiFetch = vi.fn(async (url) => (url === '/api/egress/switches'
            ? { ok: true, switches: { port_check: false } } : { ok: true }))
        await mount(CheckPortForwarding, { apiFetch, endpoint: '/api/forwarding/check', autoCheckOnMount: true })
        expect(host.textContent).toContain('Check turned off')
        expect(host.textContent).toContain('port-forwarding check is turned off')
        expect(button('Check Port').disabled).toBe(true)
        expect(apiFetch).toHaveBeenCalledTimes(1)
    })

    it('explains a 409 from a server that turned it off after the page loaded', async () => {
        const apiFetch = vi.fn(async (url) => {
            if (url === '/api/egress/switches') return { ok: true, switches: {} }
            throw Object.assign(new Error('egress_disabled'), { status: 409, code: 'egress_disabled' })
        })
        await mount(CheckPortForwarding, { apiFetch, endpoint: '/api/forwarding/check', inline: true })
        button('Check Port').click()
        await flush()
        expect(host.textContent).toContain('Check turned off')
        expect(host.textContent).not.toContain("Couldn't run the check")
    })
})

describe('email turned off', () => {
    it('labels kept emails as not sent because email is off', () => {
        expect(emailStatusView('pending', false, null, true)).toMatchObject({ label: 'Not sent', tone: 'warning' })
        expect(emailStatusView('pending', false, null, true).help).toContain('turned off')
        expect(emailStatusView('pending', false).help).toContain("isn't set up")
    })

    it('shows the notice in the composer before the link is created', async () => {
        await mount(LinkEmailComposer, { emailOff: true })
        expect(host.textContent).toContain('Email is turned off on this server')
    })

    it('shows the notice from the invitations the server returns, and explains a refused retry', async () => {
        const inv = {
            id: 7, linkId: 3, recipientEmail: 'client@example.test', status: 'pending', attemptCount: 0,
            lastOutcome: null, reason: null, createdAt: '', updatedAt: '', invitationUrl: 'https://x/link/t',
            mail: { configured: false, disabled: true, sent: false, message: 'off' },
        }
        const apiFetch = vi.fn(async (url) => {
            if (url.endsWith('/retry')) throw Object.assign(new Error('email_disabled'), { status: 409, code: 'email_disabled' })
            return { ok: true, emails: [{ kind: 'invitation', ...inv }] }
        })
        await mount(EmailInvitationPanel, { linkId: 3, apiFetch })
        expect(host.textContent).toContain('Email is turned off on this server')
        expect(host.textContent).not.toContain("Email isn't set up")
        button('Retry').click()
        await flush()
        expect(host.textContent).toContain('so it was not retried')
    })
})
