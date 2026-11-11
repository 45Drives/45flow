import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import AdminScannerPanel from './AdminScannerPanel.vue'
import AdminEgressPanel from './AdminEgressPanel.vue'

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn() }))
vi.mock('../composables/useApi', () => ({ useApi: () => ({ apiFetch: mocks.apiFetch }) }))

let app
let host
async function flush() {
    for (let i = 0; i < 5; i++) await nextTick()
}
async function mount(component) {
    host = document.createElement('div')
    document.body.appendChild(host)
    app = createApp(component, { connectionId: 'server-one' })
    app.mount(host)
    await flush()
}
afterEach(() => {
    app?.unmount()
    host?.remove()
    mocks.apiFetch.mockReset()
})

const scannerReport = (engine = {}, stats = {}) => ({
    ok: true,
    required: true,
    limits: { maxFileSizeMb: 2047, maxScanSizeMb: 2047, maxFiles: 10000, maxRecursion: 17, timeoutMs: 120000, minMbPerSec: 5 },
    engine: {
        available: true, engineVersion: '1.5.2', signatureVersion: 28180, signatureDate: '2026-11-11T06:24:00.000Z',
        databaseUpdatedAt: '2026-11-11T16:44:00.000Z', ageDays: 0.5, stale: false, staleAfterDays: 3,
        freshclam: { timer: { installed: true, active: true, lastRunAt: null }, daemon: null, scheduled: true },
        ...engine,
    },
    stats: {
        days: 90, total: 12, clean: 9, infected: 1, error: 0, skipped: 2,
        reasons: { 'skipped:over_size_limit': 2 },
        recent: [{ ts: '2026-11-10 12:00:00', result: 'infected', reason: null, signature: 'Eicar-Test-Signature',
            file: 'eicar.txt', source: 'upload_link', action: 'deleted_from_quarantine', linkId: 7 }],
        ...stats,
    },
})

describe('AdminScannerPanel', () => {
    it('shows engine, signatures, 90-day counts, detections and the documented limits', async () => {
        mocks.apiFetch.mockResolvedValueOnce(scannerReport())
        await mount(AdminScannerPanel)
        expect(mocks.apiFetch).toHaveBeenCalledWith('/api/admin/scanner', { exposeServerMessage: true })
        for (const text of ['ClamAV 1.5.2', 'Version 28180', '12 scanned', '1 infected', '2 not fully scanned',
            '2 too large to scan', 'Eicar-Test-Signature', 'deleted', 'Infected files are deleted',
            'Files up to 2 GB are scanned in full', 'Larger files can\'t be scanned', '1 second per 5 MB']) {
            expect(host.textContent).toContain(text)
        }
        expect(host.textContent).not.toContain('out of date')
    })

    it('warns when signatures are stale and updates are not scheduled', async () => {
        mocks.apiFetch.mockResolvedValueOnce(scannerReport({
            ageDays: 5.2, stale: true,
            freshclam: { timer: { installed: false, active: false, lastRunAt: null }, daemon: null, scheduled: false },
        }))
        await mount(AdminScannerPanel)
        expect(host.textContent).toContain('Virus signatures are out of date')
        expect(host.textContent).toContain('5 days old')
        expect(host.textContent).toContain('clamav-freshclam.timer')
    })

    it('says when ClamAV is missing and what happens to uploads', async () => {
        mocks.apiFetch.mockResolvedValueOnce(scannerReport({ available: false, engineVersion: null }))
        await mount(AdminScannerPanel)
        expect(host.textContent).toContain('Uploads are being rejected until it works')
    })
})

const call = (over = {}) => ({
    id: 'public_ip', name: 'Public IP lookup', destination: 'api.ipify.org', dataSent: 'Nothing',
    frequency: 'Every 30 minutes', whenOff: 'Uses the last address found.', optional: true, enabled: true,
    scope: 'internet', inProcess: true, lastCall: null, recent: { calls: 48, failures: 0, lastAt: null }, ...over,
})

describe('AdminEgressPanel', () => {
    it('lists each call with what it sends, and switches only optional ones', async () => {
        mocks.apiFetch.mockResolvedValueOnce({ ok: true, statsDays: 30, calls: [
            call(),
            call({ id: 'license', name: 'License activation and refresh', optional: false }),
        ] })
        await mount(AdminEgressPanel)
        expect(host.textContent).toContain('Public IP lookup')
        expect(host.textContent).toContain('48 calls in the last 30 days')
        expect(host.textContent).toContain('Required')
        const switches = host.querySelectorAll('[role="switch"]')
        expect(switches).toHaveLength(1)

        mocks.apiFetch.mockResolvedValueOnce({ ok: true, id: 'public_ip', enabled: false })
        switches[0].click()
        await flush()
        expect(mocks.apiFetch).toHaveBeenLastCalledWith('/api/admin/egress/public_ip', expect.objectContaining({
            method: 'PUT', body: JSON.stringify({ enabled: false }), retry: 0,
        }))
        expect(host.textContent).toContain('Off: Uses the last address found.')
    })

    it('puts the switch back and explains when the server refuses', async () => {
        mocks.apiFetch.mockResolvedValueOnce({ ok: true, statsDays: 30, calls: [call()] })
        await mount(AdminEgressPanel)
        mocks.apiFetch.mockRejectedValueOnce(new Error('Admin access required'))
        host.querySelector('[role="switch"]').click()
        await flush()
        expect(host.querySelector('[role="switch"]').getAttribute('aria-checked')).toBe('true')
        expect(host.textContent).toContain("Couldn't turn Public IP lookup off: Admin access required")
    })
})
