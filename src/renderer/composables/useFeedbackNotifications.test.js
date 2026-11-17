import { afterEach, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import { useFeedbackNotifications } from './useFeedbackNotifications'

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn(), active: null }))
vi.mock('./useApi', () => ({ useApi: () => ({ apiFetch: mocks.apiFetch }) }))
vi.mock('./useConnections', async () => {
    const { ref } = await import('vue')
    mocks.active = ref(null)
    return { useConnections: () => ({ activeConnection: mocks.active }) }
})
let app, host, inbox
const connection = (id, username = 'staff') => ({ connectionId: id, username, name: id, token: id, baseUrl: `https://${id}.test` })
const response = (id = 1) => ({
    items: [{ id, kind: 'comments', body: 'Feedback', token: 'share', actor: 'Client', filename: 'cut.mp4' }],
    cursor: id, unreadCount: 1, events: { comments: true, replies: true, reopened: true },
})
async function flush() { for (let i = 0; i < 12; i++) await nextTick() }
function mount() {
    host = document.createElement('div')
    document.body.appendChild(host)
    app = createApp({ setup() { inbox = useFeedbackNotifications(ref(false)); return () => h('div') } })
    app.mount(host)
}
afterEach(() => { app?.unmount(); host?.remove(); mocks.apiFetch.mockReset(); mocks.active.value = null })

it('polls passively and preserves loaded event choices when saving fails', async () => {
    mocks.active.value = connection('server-a')
    mocks.apiFetch.mockResolvedValue(response())
    mount()
    await flush()
    expect(mocks.apiFetch.mock.calls[0][1].headers).toEqual({ 'X-Background-Request': '1' })
    expect(inbox.unreadCount.value).toBe(1)
    mocks.apiFetch.mockRejectedValueOnce(new Error('offline'))
    await inbox.setEvents({ comments: false, replies: false, reopened: false })
    expect(inbox.events.value.comments).toBe(true)
    expect(inbox.error.value).toContain("Couldn't save")
})

it('discards late inbox responses after changing server or staff identity', async () => {
    let resolveOld
    mocks.active.value = connection('server-a')
    mocks.apiFetch.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve }))
    mocks.apiFetch.mockResolvedValue(response(2))
    mount()
    mocks.active.value = connection('server-b', 'another-staff')
    await flush()
    resolveOld(response(1))
    await flush()
    expect(inbox.items.value.map(item => item.id)).toEqual([2])
    expect(inbox.reviewUrl(inbox.items.value[0])).toBe('https://server-b.test/link/share')
})
