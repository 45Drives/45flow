import { afterEach, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
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

it.each([true, false])('checks the exact picker folder and reports its existence (%s)', async exists => {
    vi.useFakeTimers()
    const apiFetch = vi.fn(async url => ({
        path: new URL(url, 'http://localhost').searchParams.get('path'),
        exists: url.includes('path=%2Ftank%2FPROJECT_A') && exists,
        isZfs: true, zfsPool: 'tank', availBytes: null, totalBytes: null,
    }))
    host = document.createElement('div')
    document.body.appendChild(host)
    app = createApp(FolderSpaceNotice, { path: 'tank/PROJECT_A', apiFetch })
    app.mount(host)
    await vi.advanceTimersByTimeAsync(350)
    await nextTick()
    expect(apiFetch).toHaveBeenCalledWith('/api/fs/space?path=%2Ftank%2FPROJECT_A')
    expect(host.textContent.includes("This folder doesn't exist yet.")).toBe(!exists)
})

it('does not show results from a previous folder while a new selection is pending', async () => {
    vi.useFakeTimers()
    let resolveFirst
    const apiFetch = vi.fn()
        .mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve }))
        .mockResolvedValue({ exists: true, isZfs: true, zfsPool: 'tank' })
    const path = ref('tank/old')
    host = document.createElement('div')
    document.body.appendChild(host)
    app = createApp({ setup: () => () => h(FolderSpaceNotice, { path: path.value, apiFetch }) })
    app.mount(host)
    await vi.advanceTimersByTimeAsync(350)
    path.value = 'tank/new'
    await nextTick()
    resolveFirst({ exists: false, isZfs: true, zfsPool: 'tank' })
    await Promise.resolve()
    await nextTick()
    expect(host.textContent).not.toContain("This folder doesn't exist yet.")
    await vi.advanceTimersByTimeAsync(350)
    await nextTick()
    expect(apiFetch).toHaveBeenLastCalledWith('/api/fs/space?path=%2Ftank%2Fnew')
    expect(host.textContent).not.toContain("This folder doesn't exist yet.")
})
