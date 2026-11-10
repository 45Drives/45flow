// Settings → Email → Staff alerts (AdminStaffAlertsPanel.vue).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import AdminStaffAlertsPanel from './AdminStaffAlertsPanel.vue'

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn() }))
vi.mock('../composables/useApi', () => ({ useApi: () => ({ apiFetch: mocks.apiFetch }) }))

let app
let host
async function flush() {
    for (let i = 0; i < 5; i++) await nextTick()
}
async function mount() {
    host = document.createElement('div')
    document.body.appendChild(host)
    app = createApp(AdminStaffAlertsPanel, { connectionId: 'server-one' })
    app.mount(host)
    await flush()
}
const button = text => [...host.querySelectorAll('button')].find(el => el.textContent.includes(text))
function type(value) {
    const area = host.querySelector('textarea')
    area.value = value
    area.dispatchEvent(new Event('input'))
}

afterEach(() => {
    app?.unmount()
    host?.remove()
    mocks.apiFetch.mockReset()
})

describe('AdminStaffAlertsPanel', () => {
    it('loads the saved list into the box, one per line', async () => {
        mocks.apiFetch.mockResolvedValueOnce({ ok: true, emails: ['a@x.test', 'b@x.test'], max: 20 })
        await mount()
        expect(mocks.apiFetch).toHaveBeenCalledWith('/api/admin/mail/staff-alerts')
        expect(host.querySelector('textarea').value).toBe('a@x.test\nb@x.test')
        expect(button('Save staff alerts').disabled).toBe(true)
    })

    it('saves a cleaned list from commas and lines', async () => {
        mocks.apiFetch.mockResolvedValueOnce({ ok: true, emails: [], max: 20 })
        await mount()
        type(' ops@x.test, pm@x.test\nOPS@x.test ')
        await flush()
        mocks.apiFetch.mockResolvedValueOnce({ ok: true, emails: ['ops@x.test', 'pm@x.test'], max: 20 })
        button('Save staff alerts').click()
        await flush()
        const [url, opts] = mocks.apiFetch.mock.calls.at(-1)
        expect(url).toBe('/api/admin/mail/staff-alerts')
        expect(opts.method).toBe('PUT')
        expect(JSON.parse(opts.body)).toEqual({ emails: ['ops@x.test', 'pm@x.test'] })
        expect(host.textContent).toContain('2 addresses will get alerts')
    })

    it('shows the server validation details and keeps the draft', async () => {
        mocks.apiFetch.mockResolvedValueOnce({ ok: true, emails: [], max: 20 })
        await mount()
        type('nope')
        await flush()
        mocks.apiFetch.mockRejectedValueOnce(Object.assign(new Error('invalid_staff_alert_emails'), {
            status: 400, details: ['not a valid email address: nope'],
        }))
        button('Save staff alerts').click()
        await flush()
        expect(host.textContent).toContain('not a valid email address: nope')
        expect(host.textContent).toContain('Nothing was saved')
        expect(host.querySelector('textarea').value).toBe('nope')
    })

    it('explains when the server is too old', async () => {
        mocks.apiFetch.mockRejectedValueOnce(Object.assign(new Error('Not found'), { status: 404 }))
        await mount()
        expect(host.textContent).toContain("can't send staff alerts yet")
        expect(host.querySelector('textarea')).toBeNull()
    })
})
