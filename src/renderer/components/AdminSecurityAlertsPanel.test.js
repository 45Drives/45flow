import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import AdminSecurityAlertsPanel from './AdminSecurityAlertsPanel.vue'

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn() }))
vi.mock('../composables/useApi', () => ({ useApi: () => ({ apiFetch: mocks.apiFetch }) }))

let app
let host
async function flush() { for (let i = 0; i < 6; i++) await nextTick() }
async function mount() {
    host = document.createElement('div')
    document.body.appendChild(host)
    app = createApp(AdminSecurityAlertsPanel, { connectionId: 'server' })
    app.mount(host)
    await flush()
}
afterEach(() => {
    app?.unmount()
    host?.remove()
    mocks.apiFetch.mockReset()
})

describe('security alert recipients', () => {
    it('saves a separate list and shows pending mail', async () => {
        mocks.apiFetch.mockResolvedValueOnce({ emails: [], max: 20, pending: 2 })
        await mount()
        expect(host.textContent).toContain('2 security alert emails are waiting')
        const area = host.querySelector('textarea')
        area.value = 'ops@example.test, OPS@example.test'
        area.dispatchEvent(new Event('input'))
        await flush()
        mocks.apiFetch.mockResolvedValueOnce({ emails: ['ops@example.test'], max: 20 })
        mocks.apiFetch.mockResolvedValueOnce({ emails: ['ops@example.test'], max: 20, pending: 0 })
        const button = [...host.querySelectorAll('button')].find(el => el.textContent.includes('Save security alerts'))
        button.click()
        await flush()
        const [, options] = mocks.apiFetch.mock.calls[1]
        expect(JSON.parse(options.body)).toEqual({ emails: ['ops@example.test'] })
        expect(host.textContent).toContain('Security alert recipients saved')
    })

    it('explains an unavailable server without presenting a working setting', async () => {
        mocks.apiFetch.mockRejectedValueOnce(Object.assign(new Error('not found'), { status: 404 }))
        await mount()
        expect(host.textContent).toContain('Update the server')
        expect(host.querySelector('textarea')).toBeNull()
    })

    it('says when recipients were saved but the completion audit failed', async () => {
        mocks.apiFetch.mockResolvedValueOnce({ emails: [], max: 20, pending: 0 })
        await mount()
        const area = host.querySelector('textarea')
        area.value = 'ops@example.test'
        area.dispatchEvent(new Event('input'))
        await flush()
        mocks.apiFetch.mockRejectedValueOnce(Object.assign(new Error('Internal server error'), {
            code: 'audit_write_failed_after_save', status: 503,
        }))
        host.querySelector('button').click()
        await flush()
        expect(host.textContent).toContain('Recipients were saved, but the audit record failed')
    })
})
