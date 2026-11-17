import { describe, expect, it, vi } from 'vitest'
import { checkExistingOutputs, findExistingUploads } from './existingUploads'

describe('findExistingUploads', () => {
  it('matches the name the server saves under, and only calls same-size files identical', async () => {
    const apiFetch = vi.fn(async () => ({
      entries: [
        { name: 'Final Cut.mp4', size: 100, isDir: false },
        { name: 'b-roll.mov', size: 5, isDir: false },
      ],
    }))
    const res = await findExistingUploads(apiFetch, [
      { name: 'Final  Cut.MP4', size: 100 },
      { name: 'b-roll.mov', size: 6 },
      { name: 'new.mp4', size: 1 },
    ], '/Projects/Promo/')
    expect(apiFetch).toHaveBeenCalledWith('/api/files?dir=Projects%2FPromo', { method: 'GET' })
    expect(res).toEqual([
      { serverName: 'Final Cut.mp4', exists: true, identical: true },
      { serverName: 'b-roll.mov', exists: true, identical: false },
      { serverName: 'new.mp4', exists: false, identical: false },
    ])
  })
})

describe('checkExistingOutputs', () => {
  it('reports the version and outputs per path', async () => {
    const apiFetch = vi.fn(async () => ({
      ok: true,
      items: [{ exists: true, assetVersionId: 7, outputs: ['proxy_720p.mp4', 'master.m3u8'] }],
    }))
    const res = await checkExistingOutputs(apiFetch, ['/p/a.mp4'], { proxyQualities: ['720p'], hls: true, watermark: false })
    expect(res).toEqual([{ exists: true, assetVersionId: 7, outputs: ['proxy_720p.mp4', 'master.m3u8'] }])
    expect(JSON.parse(apiFetch.mock.calls[0][1].body)).toEqual({ filePaths: ['/p/a.mp4'], proxyQualities: ['720p'], hls: true, watermark: false })
  })

  it('returns null when the server cannot answer, so the caller keeps its old path', async () => {
    const missing = vi.fn(async () => { throw Object.assign(new Error('Not Found'), { status: 404 }) })
    expect(await checkExistingOutputs(missing, ['/p/a.mp4'], { proxyQualities: [], hls: true, watermark: false })).toBeNull()
  })
})
