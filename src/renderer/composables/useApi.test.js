import { afterEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@45drives/houston-common-ui', () => ({ pushNotification: vi.fn(), Notification: vi.fn() }))
vi.mock('./useSessionPersistence', () => ({ clearLastSession: vi.fn() }))
vi.mock('./useConnections', () => ({
    useConnections: () => {
        const connection = { connectionId: 'test-connection', baseUrl: 'https://test.invalid', token: 'session', apiPort: 9095 }
        return { activeConnection: ref(connection), getConnection: () => connection, updateConnection: vi.fn() }
    },
}))
import { useApi } from './useApi'

afterEach(() => { vi.unstubAllGlobals() })

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
