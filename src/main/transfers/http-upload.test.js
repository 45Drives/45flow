// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ handlers: new Map() }))
vi.mock('electron', () => ({
  ipcMain: { on: (channel, handler) => mocks.handlers.set(channel, handler) },
  BrowserWindow: {},
}))
vi.mock('fs', () => ({
  statSync: () => ({ isFile: () => true, size: 4 }),
  openSync: () => 1,
  readSync: () => 4,
  closeSync: () => {},
}))

import { registerHttpUploadHandlers } from './http-upload'

beforeEach(() => {
  mocks.handlers.clear()
  registerHttpUploadHandlers()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function upload({ advertised = true, security, status = 200, cancel = false } = {}) {
  const sender = { send: vi.fn() }
  let resolveComplete
  const pending = new Promise(resolve => { resolveComplete = resolve })
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    if (url.endsWith('/init')) return {
      ok: true,
      json: async () => ({ ok: true, sessionId: 'test', chunkSize: 4, totalChunks: 1, malwareScan: advertised }),
    }
    if (url.endsWith('/complete')) return pending
    return { ok: true }
  }))
  const done = mocks.handlers.get('http-upload:start')({ sender }, {
    id: 'test', src: '/tmp/test.mp4', apiBase: 'http://server:9095', apiToken: 'test-token', dest: 'uploads',
  })
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledWith(
    'http://server:9095/api/local-upload/test/complete', expect.any(Object)))
  const progress = () => sender.send.mock.calls
    .filter(([channel]) => channel === 'http-upload:progress:test').map(([, payload]) => payload)
  const waiting = progress().at(-1)
  expect(waiting).toMatchObject({
    phase: advertised ? 'scanning' : 'finalizing', percent: 100, bytesTransferred: 4,
  })
  expect(waiting.rate).toBeUndefined()
  expect(waiting.eta).toBeUndefined()
  expect(sender.send.mock.calls.some(([channel]) => channel === 'http-upload:done:test')).toBe(false)
  if (cancel) mocks.handlers.get('http-upload:cancel')({}, 'test')
  resolveComplete({
    ok: status === 200, status,
    json: async () => status === 200 ? {
      ok: true, fileId: 1, assetVersionId: 2, filename: 'test.mp4', security,
    } : { ok: false, error: 'File failed malware scan', code: 'malware_detected' },
  })
  await done
  return {
    progress: progress(),
    result: sender.send.mock.calls.find(([channel]) => channel === 'http-upload:done:test')[1],
  }
}

describe('desktop upload scan progress', () => {
  it('shows scanning while completion is pending and passed only after the server confirms', async () => {
    const result = await upload({ security: { scanner: 'clamscan', scannerSkipped: false } })
    expect(result.progress.at(-1)).toMatchObject({ phase: 'complete', message: 'Malware scan passed' })
    expect(result.result.ok).toBe(true)
  })

  it('reports an optional scanner skip without claiming a clean scan', async () => {
    const result = await upload({ security: { scanner: null, scannerSkipped: true } })
    expect(result.progress.at(-1).message).toBe('Malware scan skipped: scanner unavailable')
  })

  it('uses generic finalization for legacy servers without reporting a scan passed', async () => {
    const result = await upload({ advertised: false })
    expect(result.progress.at(-1).message).toBe('Upload finalized')
    expect(result.progress.some(p => p.phase === 'scanning')).toBe(false)
  })

  it('preserves malware errors without emitting successful scan progress', async () => {
    const result = await upload({ status: 415 })
    expect(result.result).toEqual({ ok: false, error: 'File failed malware scan' })
    expect(result.progress.some(p => p.phase === 'complete')).toBe(false)
  })

  it('does not report scan success when canceled during finalization', async () => {
    const result = await upload({ cancel: true, security: { scanner: 'clamscan' } })
    expect(result.result).toEqual({ ok: false, error: 'canceled' })
    expect(result.progress.some(p => p.phase === 'complete')).toBe(false)
  })
})
