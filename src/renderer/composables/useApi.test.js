import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive, ref } from 'vue'

const mocks = vi.hoisted(() => ({ connections: [], activeConnection: null, updateConnection: vi.fn() }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@45drives/houston-common-ui', () => ({ pushNotification: vi.fn(), Notification: vi.fn() }))
vi.mock('./useSessionPersistence', () => ({ clearLastSession: vi.fn() }))
vi.mock('./useConnections', () => ({
    useConnections: () => ({
        activeConnection: mocks.activeConnection,
        getConnection: id => mocks.connections.find(connection => connection.connectionId === id),
        updateConnection: mocks.updateConnection,
    }),
}))
import { useApi } from './useApi'

beforeEach(() => {
    mocks.connections = [reactive({
        connectionId: 'test-connection', baseUrl: 'https://test.invalid', token: 'session', apiPort: 9095,
    })]
    mocks.activeConnection = ref(mocks.connections[0])
})
afterEach(() => {
    vi.unstubAllGlobals()
    mocks.updateConnection.mockReset()
})

describe('nginx HTTPS transport for admin networks', () => {
    it('verifies HTTPS through saved SSH before fetching and reuses verification for policy confirmation', async () => {
        Object.assign(mocks.connections[0], {
            baseUrl: 'http://192.168.1.50:9095', httpsPort: 8443,
            ssh: { server: '192.168.1.50', username: 'admin', port: 2222, keyPath: '/keys/client-key' },
        })
        const invoke = vi.fn().mockResolvedValue({ ok: true })
        vi.stubGlobal('electron', { ipcRenderer: { invoke } })
        const fetch = vi.fn(async () => {
            expect(invoke).toHaveBeenCalledOnce()
            return new Response('{}')
        })
        vi.stubGlobal('fetch', fetch)
        const { apiFetch } = useApi('test-connection', { transport: 'nginx-https' })
        await apiFetch('/api/admin/nginx-admin-cidrs')
        await apiFetch('/api/admin/nginx-admin-cidrs/confirm', { method: 'POST', body: '{}', retry: 0 })
        expect(invoke).toHaveBeenCalledWith('verify-nginx-certificate-over-ssh', {
            httpsUrl: 'https://192.168.1.50:8443', host: '192.168.1.50',
            username: 'admin', port: 2222, keyPath: '/keys/client-key',
        })
        expect(fetch).toHaveBeenCalledTimes(2)
    })

    it('does not send the admin token after SSH verification failure and permits a deliberate retry', async () => {
        mocks.connections[0].ssh = { server: 'test.invalid', username: 'admin' }
        const invoke = vi.fn().mockResolvedValueOnce({ ok: false, error: 'SSH host key changed' })
            .mockResolvedValueOnce({ ok: true })
        vi.stubGlobal('electron', { ipcRenderer: { invoke } })
        const fetch = vi.fn(async () => new Response('{}'))
        vi.stubGlobal('fetch', fetch)
        const { apiFetch } = useApi('test-connection', { transport: 'nginx-https' })
        await expect(apiFetch('/api/admin/nginx-admin-cidrs')).rejects.toThrow('SSH host key changed')
        expect(fetch).not.toHaveBeenCalled()
        await apiFetch('/api/admin/nginx-admin-cidrs')
        expect(invoke).toHaveBeenCalledTimes(2)
        expect(fetch).toHaveBeenCalledOnce()
    })

    it('requires saved SSH details in the desktop rather than bypassing verification', async () => {
        vi.stubGlobal('electron', { ipcRenderer: { invoke: vi.fn() } })
        const fetch = vi.fn()
        vi.stubGlobal('fetch', fetch)
        await expect(useApi('test-connection', { transport: 'nginx-https' })
            .apiFetch('/api/admin/nginx-admin-cidrs')).rejects.toThrow('establish SSH access')
        expect(fetch).not.toHaveBeenCalled()
    })

    it('rechecks SSH verification when the HTTPS port changes', async () => {
        Object.assign(mocks.connections[0], {
            baseUrl: 'http://192.168.1.50:9095', httpsPort: 443,
            ssh: { server: '192.168.1.50', username: 'admin', port: 22 },
        })
        const invoke = vi.fn().mockResolvedValue({ ok: true })
        vi.stubGlobal('electron', { ipcRenderer: { invoke } })
        vi.stubGlobal('fetch', vi.fn(async () => new Response('{}')))
        const { apiFetch } = useApi('test-connection', { transport: 'nginx-https' })
        await apiFetch('/api/admin/nginx-admin-cidrs')
        mocks.connections[0].httpsPort = 8443
        await apiFetch('/api/admin/nginx-admin-cidrs')
        expect(invoke).toHaveBeenCalledTimes(2)
        expect(invoke.mock.calls[1][1].httpsUrl).toBe('https://192.168.1.50:8443')
    })

    it.each([
        ['http://192.168.1.50:9095', undefined, 'https://192.168.1.50'],
        ['http://192.168.1.50:9095', 8443, 'https://192.168.1.50:8443'],
        ['http://studio.local:19095', 8443, 'https://studio.local:8443'],
        ['http://[fd00::50]:9095', 8443, 'https://[fd00::50]:8443'],
        ['https://studio.local:9443', 443, 'https://studio.local:9443'],
    ])('routes all policy operations from %s through %s HTTPS port', async (baseUrl, httpsPort, expectedBase) => {
        Object.assign(mocks.connections[0], { baseUrl, httpsPort })
        const fetch = vi.fn(async () => new Response('{}', { headers: { 'Content-Type': 'application/json' } }))
        vi.stubGlobal('fetch', fetch)
        const { apiFetch } = useApi('test-connection', { transport: 'nginx-https' })
        const operations = [
            ['', 'GET', undefined],
            ['/preview', 'POST', { cidrs: ['192.168.1.0/24'] }],
            ['', 'PUT', { cidrs: ['192.168.1.0/24'], overrideCurrentConnection: false }],
            ['/confirm', 'POST', { id: 'transaction-one' }],
        ]
        for (const [suffix, method, body] of operations) {
            await apiFetch(`/api/admin/nginx-admin-cidrs${suffix}`, {
                method, body: body ? JSON.stringify(body) : undefined, retry: 0,
            })
            const [url, init] = fetch.mock.calls.at(-1)
            expect(url).toBe(`${expectedBase}/api/admin/nginx-admin-cidrs${suffix}`)
            expect(init.method).toBe(method)
            expect(init.headers.get('Authorization')).toBe('Bearer session')
            expect(init.body).toBe(body ? JSON.stringify(body) : undefined)
        }
        expect(fetch).toHaveBeenCalledTimes(4)
        expect(mocks.connections[0].baseUrl).toBe(baseUrl)
    })

    it('keeps normal API requests on the existing direct connection', async () => {
        mocks.connections[0].baseUrl = 'http://192.168.1.50:9095'
        const fetch = vi.fn(async () => new Response('{}'))
        vi.stubGlobal('fetch', fetch)
        await useApi('test-connection').apiFetch('/api/settings')
        expect(fetch.mock.calls[0][0]).toBe('http://192.168.1.50:9095/api/settings')
    })

    it('pins HTTPS host, port and token to the opened server when the active server changes', async () => {
        Object.assign(mocks.connections[0], { baseUrl: 'http://192.168.1.50:9095', httpsPort: 8443 })
        const { apiFetch } = useApi('test-connection', { transport: 'nginx-https' })
        mocks.activeConnection.value = {
            connectionId: 'other-server', baseUrl: 'http://10.0.0.9:9095', token: 'other-token', httpsPort: 9443,
        }
        const fetch = vi.fn(async () => new Response('{}'))
        vi.stubGlobal('fetch', fetch)
        await apiFetch('/api/admin/nginx-admin-cidrs')
        expect(fetch.mock.calls[0][0]).toBe('https://192.168.1.50:8443/api/admin/nginx-admin-cidrs')
        expect(fetch.mock.calls[0][1].headers.get('Authorization')).toBe('Bearer session')
    })

    it('uses an updated HTTPS port without changing the direct API connection', async () => {
        Object.assign(mocks.connections[0], { baseUrl: 'http://192.168.1.50:9095', httpsPort: 443 })
        const { apiFetch } = useApi('test-connection', { transport: 'nginx-https' })
        mocks.connections[0].httpsPort = 8443
        const fetch = vi.fn(async () => new Response('{}'))
        vi.stubGlobal('fetch', fetch)
        await apiFetch('/api/admin/nginx-admin-cidrs')
        expect(fetch.mock.calls[0][0]).toBe('https://192.168.1.50:8443/api/admin/nginx-admin-cidrs')
    })

    it('does not fall back to the direct backend when HTTPS fails', async () => {
        mocks.connections[0].baseUrl = 'http://192.168.1.50:9095'
        const fetch = vi.fn(async () => { throw new TypeError('Failed to fetch') })
        vi.stubGlobal('fetch', fetch)
        await expect(useApi('test-connection', { transport: 'nginx-https' })
            .apiFetch('/api/admin/nginx-admin-cidrs', { method: 'PUT', body: '{}', retry: 0 }))
            .rejects.toThrow('Failed to fetch')
        expect(fetch).toHaveBeenCalledOnce()
        expect(fetch.mock.calls[0][0]).toBe('https://192.168.1.50/api/admin/nginx-admin-cidrs')
    })

    it.each([0, -1, 65536, 443.5, '8443'])('rejects an invalid HTTPS port %s before sending credentials', async httpsPort => {
        Object.assign(mocks.connections[0], { baseUrl: 'http://192.168.1.50:9095', httpsPort })
        const fetch = vi.fn()
        vi.stubGlobal('fetch', fetch)
        await expect(useApi('test-connection', { transport: 'nginx-https' })
            .apiFetch('/api/admin/nginx-admin-cidrs')).rejects.toThrow('Invalid server HTTPS port')
        expect(fetch).not.toHaveBeenCalled()
    })
})

describe('admin API error propagation without changing existing defaults', () => {
    it('preserves non-premium 403 JSON after checking the premium error code', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
            error: 'admin_required', message: 'Admin access required.',
        }), { status: 403, headers: { 'Content-Type': 'application/json' } })))
        await expect(useApi().apiFetch('/api/admin/nginx-admin-cidrs'))
            .rejects.toMatchObject({ status: 403, code: 'admin_required', message: 'Admin access required.' })
    })

    it('allows explicit admin operational messages but keeps existing generic 500 behavior', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
            error: 'admin_cidrs_failed', message: 'Prior file restored; recovery reload failed.',
        }), { status: 500, headers: { 'Content-Type': 'application/json' } })))
        const { apiFetch } = useApi()
        await expect(apiFetch('/api/admin/nginx-admin-cidrs', { exposeServerMessage: true }))
            .rejects.toMatchObject({ status: 500, message: 'Prior file restored; recovery reload failed.' })
        await expect(apiFetch('/api/settings')).rejects.toMatchObject({ message: 'Internal server error' })
    })

    it('authenticates PUT and does not retry a failed mutation', async () => {
        const fetch = vi.fn(async () => { throw new Error('network lost') })
        vi.stubGlobal('fetch', fetch)
        await expect(useApi('test-connection').apiFetch('/api/admin/nginx-admin-cidrs', {
            method: 'PUT', body: JSON.stringify({ cidrs: [] }), retry: 0,
        })).rejects.toThrow('network lost')
        expect(fetch).toHaveBeenCalledOnce()
        expect(fetch.mock.calls[0][1].headers.get('Authorization')).toBe('Bearer session')
        expect(fetch.mock.calls[0][1].headers.get('Content-Type')).toBe('application/json')
    })
})
