import { afterEach, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import FolderSpaceNotice from './FolderSpaceNotice.vue'

let app, host
afterEach(() => {
    app?.unmount()
    host?.remove()
    vi.useRealTimers()
})

it.each([null, 96.4])('shows low space without inventing an unknown percentage (%s)', async (usedPercent) => {
    vi.useFakeTimers()
    host = document.createElement('div')
    document.body.appendChild(host)
    app = createApp(FolderSpaceNotice, {
        path: '/media/review',
        apiFetch: vi.fn().mockResolvedValue({
            path: '/media/review', checkedPath: '/media/review', exists: true,
            totalBytes: 10000, freeBytes: 100, availBytes: 100, usedPercent,
            isZfs: false, zfsDataset: null, zfsPool: null, mountpoint: '/media',
        }),
    })
    app.mount(host)
    await vi.advanceTimersByTimeAsync(350)
    await nextTick()
    expect(host.textContent).toContain('Low space: only 100 B left')
    if (usedPercent === null) expect(host.textContent).not.toContain('% used')
    else expect(host.textContent).toContain('(96% used)')
})
