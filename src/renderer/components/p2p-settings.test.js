import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import AdminEgressPanel from './AdminEgressPanel.vue'

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn() }))
vi.mock('../composables/useApi', () => ({ useApi: () => ({ apiFetch: mocks.apiFetch }) }))

let app
let host
async function flush() {
    for (let i = 0; i < 6; i++) await nextTick()
}
async function mount() {
    host = document.createElement('div')
    document.body.appendChild(host)
    app = createApp(AdminEgressPanel, { connectionId: 'server-one' })
    app.mount(host)
    await flush()
}
afterEach(() => {
    app?.unmount()
    host?.remove()
    mocks.apiFetch.mockReset()
})

const p2pCall = (extra = {}) => ({
    id: 'p2p-handshake', name: 'Peer-to-peer access (P2P)', destination: 'The P2P relay for your P2P address',
    dataSent: 'This server\'s ID and public key.', frequency: 'Continuously while P2P is on.',
    whenOff: 'New share links use your direct internet address again.', optional: true, enabled: false,
    licensed: true, scope: 'internet', inProcess: true, lastCall: null,
    recent: { calls: 0, failures: 0, lastAt: null }, ...extra,
})
const list = (call) => ({ ok: true, statsDays: 30, calls: [call] })
const p2pSwitch = () => host.querySelector('button[role="switch"], input[type="checkbox"]')

describe('P5 Settings P2P toggle', () => {
    it('P5 toggle is visible', async () => {
        mocks.apiFetch.mockResolvedValueOnce(list(p2pCall()))
        await mount()
        expect(host.textContent).toContain('Peer-to-peer access (P2P)')
        expect(p2pSwitch()).toBeTruthy()
        expect(p2pSwitch().disabled).toBeFalsy()
    })

    it('P5 toggle is disabled with an explanation when unlicensed', async () => {
        mocks.apiFetch.mockResolvedValueOnce(list(p2pCall({ licensed: false })))
        await mount()
        expect(p2pSwitch().disabled).toBe(true)
        expect(host.textContent).toContain('Needs a 45Flow Premium license')
    })

    it('P5 toggle calls the settings API when changed', async () => {
        mocks.apiFetch.mockResolvedValueOnce(list(p2pCall())).mockResolvedValueOnce({ ok: true })
        await mount()
        p2pSwitch().click()
        await flush()
        expect(mocks.apiFetch).toHaveBeenCalledWith('/api/admin/egress/p2p-handshake', expect.objectContaining({
            method: 'PUT', body: JSON.stringify({ enabled: true }),
        }))
    })
})

describe('P13 Settings P2P activation', () => {
    const NAME = 'abcdefghijklmnop.45flow.45d.io'
    const state = (p2p, enabled = true) => list(p2pCall({ enabled, p2p }))
    const copyButton = () => [...host.querySelectorAll('button')].find((b) => b.textContent.includes('Copy address'))

    it('P13 shows the waiting-for-activation request while P2P is on and pending', async () => {
        const writeText = vi.fn().mockResolvedValue()
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
        mocks.apiFetch.mockResolvedValueOnce(state({ address: NAME, state: 'pending', checkedAt: null }))
        await mount()
        expect(host.textContent).toContain(`Waiting for 45Drives to activate ${NAME}`)
        expect(host.textContent).toContain('support@45drives.com')
        expect(copyButton()).toBeTruthy()
        copyButton().click()
        await flush()
        expect(writeText).toHaveBeenCalledWith(NAME)
    })

    it('P13 shows the address as active once activated', async () => {
        mocks.apiFetch.mockResolvedValueOnce(state({ address: NAME, state: 'active', checkedAt: '2026-11-19T12:00:00Z' }))
        await mount()
        expect(host.textContent).toContain('Your P2P address is active')
        expect(host.textContent).toContain(NAME)
        expect(host.textContent).not.toContain('Waiting for 45Drives')
        expect(copyButton()).toBeFalsy()
    })

    it('P13 shows nothing about activation while P2P is off', async () => {
        mocks.apiFetch.mockResolvedValueOnce(state({ address: NAME, state: 'off', checkedAt: null }, false))
        await mount()
        expect(host.textContent).not.toContain('Waiting for 45Drives')
        expect(host.textContent).not.toContain('Your P2P address is active')
    })
})
