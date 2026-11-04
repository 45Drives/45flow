import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createWebUploadApi } from './web-upload'

const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body })

describe('browser file upload', () => {
  let emit
  let api

  beforeEach(() => {
    vi.restoreAllMocks()
    emit = vi.fn()
    api = createWebUploadApi(emit)
  })

  const opts = (src) => ({ src, apiBase: 'https://srv', apiToken: 'tok', dest: '/tank/in' })

  it('uploads a chosen file in chunks, then finalizes and announces the ingest', async () => {
    const file = new File(['abcde'], 'clip.mp4', { type: 'video/mp4' })
    const path = api.getPathForFile(file)
    const fetch = vi.fn()
      .mockResolvedValueOnce(json({ ok: true, sessionId: 's1', chunkSize: 2, totalChunks: 3 }))
      .mockResolvedValueOnce(json({ ok: true }))
      .mockResolvedValueOnce(json({ ok: true }))
      .mockResolvedValueOnce(json({ ok: true }))
      .mockResolvedValueOnce(json({ ok: true, fileId: 7, assetVersionId: 9, filename: 'clip.mp4', transcodes: { queued: ['hls'], skipped: [] } }))
    vi.stubGlobal('fetch', fetch)
    const progress = vi.fn()

    const { id, done } = await api.httpUploadStart(opts(path), progress)
    const result = await done

    const calls = fetch.mock.calls
    expect(calls.map(([url, init]) => [url, init.method, init.headers['Content-Range']])).toEqual([
      ['https://srv/api/local-upload/init', 'POST', undefined],
      ['https://srv/api/local-upload/s1', 'PATCH', 'bytes 0-1/5'],
      ['https://srv/api/local-upload/s1', 'PATCH', 'bytes 2-3/5'],
      ['https://srv/api/local-upload/s1', 'PATCH', 'bytes 4-4/5'],
      ['https://srv/api/local-upload/s1/complete', 'POST', undefined],
    ])
    expect(calls[0][1].headers.Authorization).toBe('Bearer tok')
    expect(result.ok).toBe(true)
    expect(result.file).toMatchObject({ id: 7, assetVersionId: 9, name: 'clip.mp4', size: 5, relDir: '/tank/in' })
    expect(progress.mock.calls.map(([p]) => p.phase)).toEqual(['uploading', 'uploading', 'uploading', 'finalizing', 'complete'])
    expect(emit).toHaveBeenCalledWith(`upload:ingest:${id}`, expect.objectContaining({ fileId: 7, assetVersionId: 9 }))
    expect(emit).toHaveBeenCalledWith(`http-upload:done:${id}`, result)
  })

  it('reports a server rejection without sending any data', async () => {
    const path = api.getPathForFile(new File(['x'], 'a.txt'))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json({ ok: false, error: 'Destination not allowed' }, 400)))

    const { done } = await api.httpUploadStart(opts(path))

    await expect(done).resolves.toEqual({ ok: false, error: 'Destination not allowed' })
  })

  it('cancels the server session when the user cancels mid-upload', async () => {
    const path = api.getPathForFile(new File(['abcd'], 'a.bin'))
    let id
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ ok: true, sessionId: 's2', chunkSize: 2, totalChunks: 2 }))
      .mockImplementationOnce(async () => {
        api.httpUploadCancel(id)
        throw new DOMException('aborted', 'AbortError')
      })
      .mockResolvedValue(json({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    const started = await api.httpUploadStart(opts(path))
    id = started.id

    await expect(started.done).resolves.toEqual({ ok: false, error: 'canceled' })
    const last = fetchMock.mock.calls.at(-1)
    expect([last[0], last[1].method]).toEqual(['https://srv/api/local-upload/s2', 'DELETE'])
  })

  it('fails clearly when the selected file is unknown', async () => {
    const { done } = await api.httpUploadStart(opts('browser-file://missing/a.bin'))

    await expect(done).resolves.toMatchObject({ ok: false, error: expect.stringContaining('Select it again') })
  })

  it('does not register the same file twice', () => {
    const file = new File(['abc'], 'same.mov', { lastModified: 1 })

    expect(api.getPathForFile(file)).toBe(api.getPathForFile(file))
  })

  const choose = (picked) => vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function () {
    Object.defineProperty(this, 'files', { value: picked })
    this.dispatchEvent(new Event('change'))
  })
  const inFolder = (name, relative) => Object.defineProperty(new File(['x'], name), 'webkitRelativePath', { value: relative })

  it('picks only the direct files of a chosen folder, like the desktop picker', async () => {
    choose([inFolder('a.mp4', 'shoot/a.mp4'), inFolder('b.mp4', 'shoot/sub/b.mp4')])

    await expect(api.pickFolder()).resolves.toMatchObject([{ name: 'a.mp4', size: 1 }])
  })

  it('returns a watermark with a preview image and an uploadable path', async () => {
    choose([new File(['png'], 'logo.png', { type: 'image/png' })])

    const watermark = await api.pickWatermark()

    expect(watermark).toMatchObject({ name: 'logo.png', dataUrl: expect.stringMatching(/^data:image\/png/) })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json({ ok: false, error: 'stop' }, 400)))
    const { done } = await api.httpUploadStart(opts(watermark.path))
    await expect(done).resolves.toEqual({ ok: false, error: 'stop' })
  })

  it('treats a cancelled picker as no selection', async () => {
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function () {
      this.dispatchEvent(new Event('cancel'))
    })

    await expect(api.pickFiles()).resolves.toEqual([])
    await expect(api.pickWatermark()).resolves.toBeNull()
  })
})
