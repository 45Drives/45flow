import { describe, expect, it, vi } from 'vitest'

vi.mock('../web-notify', () => ({ notifyIfHidden: vi.fn() }))
vi.mock('./transcodeProgress', () => ({ startProgressPolling: vi.fn(() => () => {}) }))
vi.mock('./useWebSocketManager', () => ({
  useWebSocketManager: () => ({ subscribe: vi.fn(() => false), unsubscribe: vi.fn() }),
}))

const { useTransferProgress } = await import('./useTransferProgress')

function activeItem(assetVersionId) {
  return {
    assetVersionId,
    fileId: assetVersionId,
    relDir: 'tank/project',
    filename: `clip-${assetVersionId}.mov`,
    jobs: [{ kind: 'hls', status: 'running' }],
  }
}

describe('transfer dock background polling', () => {
  it('opens for newly found work but never re-opens after the user closes it', async () => {
    const transfer = useTransferProgress()
    let items = [activeItem(1)]
    const apiFetch = vi.fn(async (path) => (path === '/api/progress/active' ? { ok: true, items } : {}))

    await transfer.restoreActiveTranscodes(apiFetch)
    expect(transfer.state.open).toBe(true)

    transfer.setOpen(false)
    await transfer.restoreActiveTranscodes(apiFetch)
    expect(transfer.state.open).toBe(false)

    items = [activeItem(1), activeItem(2)]
    await transfer.restoreActiveTranscodes(apiFetch)
    expect(transfer.state.open).toBe(false)
    expect(transfer.state.tasks.length).toBe(2)
  })
})
