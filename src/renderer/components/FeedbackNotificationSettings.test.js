import { afterEach, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, reactive } from 'vue'
import StaffAlerts from './AdminStaffAlertsPanel.vue'
import ResolutionEmails from './LinkFeedbackNotificationsPanel.vue'

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn() }))
vi.mock('../composables/useApi', () => ({ useApi: () => ({ apiFetch: mocks.apiFetch }) }))
let app, host
async function flush() { for (let i = 0; i < 12; i++) await nextTick() }
function mount(component, props) {
    host = document.createElement('div')
    document.body.appendChild(host)
    const state = reactive(props)
    app = createApp({ render: () => h(component, state) })
    app.mount(host)
    return state
}
afterEach(() => { app?.unmount(); host?.remove(); mocks.apiFetch.mockReset() })

it('saves per-address feedback choices without changing existing decision/download subscriptions', async () => {
    const email = 'ops@example.test'
    const initial = { emails: [email], subscriptions: [{ email, events: {
        comments: false, replies: false, reopened: false, decisions: true, downloads: true,
    } }] }
    mocks.apiFetch.mockImplementation(async (_path, init) => init?.method === 'PUT' ? JSON.parse(init.body) : initial)
    mount(StaffAlerts, { connectionId: 'server-a' })
    await flush()
    const comments = host.querySelector('input[aria-label="ops@example.test: New comments"]')
    expect(comments.checked).toBe(false)
    comments.click()
    await flush()
    const save = [...host.querySelectorAll('button')].find(button => button.textContent.includes('Save staff alerts'))
    expect(save.disabled).toBe(false)
    save.click()
    await flush()
    const request = mocks.apiFetch.mock.calls.find(([, init]) => init?.method === 'PUT')
    expect(JSON.parse(request[1].body).subscriptions).toEqual([{ email, events: {
        comments: true, replies: false, reopened: false, decisions: true, downloads: true,
    } }])
    expect(save.disabled).toBe(true)
})

it('requires explicit client opt-in and keeps the saved state when the request fails', async () => {
    const initial = { items: [{ id: 7, name: 'Client', user_email: 'client@example.test', enabled: 0 }] }
    mocks.apiFetch.mockResolvedValue(initial)
    mount(ResolutionEmails, { linkId: 4, apiFetch: mocks.apiFetch })
    await flush()
    const toggle = host.querySelector('input[type="checkbox"]')
    expect(toggle.checked).toBe(false)
    mocks.apiFetch.mockRejectedValueOnce(new Error('offline'))
    toggle.click()
    await flush()
    expect(toggle.checked).toBe(false)
    expect(host.textContent).toContain("Couldn't save")
    mocks.apiFetch.mockResolvedValueOnce({ items: [{ ...initial.items[0], enabled: 1 }] })
    toggle.click()
    await flush()
    expect(toggle.checked).toBe(true)
    expect(JSON.parse(mocks.apiFetch.mock.calls.at(-1)[1].body)).toEqual({ userId: 7, enabled: true })
})

it('reloads recipient settings and discards late results when the selected link changes', async () => {
    let resolveOld
    mocks.apiFetch.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve }))
    mocks.apiFetch.mockResolvedValue({ items: [{ id: 8, name: 'New client', user_email: 'new@example.test', enabled: 0 }] })
    const props = mount(ResolutionEmails, { linkId: 4, apiFetch: mocks.apiFetch })
    props.linkId = 5
    await flush()
    resolveOld({ items: [{ id: 7, name: 'Old client', user_email: 'old@example.test', enabled: 1 }] })
    await flush()
    expect(host.textContent).toContain('New client')
    expect(host.textContent).not.toContain('Old client')
    expect(host.querySelector('input[type="checkbox"]').checked).toBe(false)
    expect(mocks.apiFetch.mock.calls.map(([path]) => path)).toEqual([
        '/api/links/4/feedback-notifications', '/api/links/5/feedback-notifications',
    ])
})
