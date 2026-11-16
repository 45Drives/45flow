import { describe, expect, it, vi } from 'vitest'
import { loadProjectWatermarks, canonicalWatermarkSelection } from './projectWatermarks'
import { uploadErrorMessage } from '../utils/uploadErrorMessage'

describe('project-scoped watermark list', () => {
  it('uses the selected project and preserves the server source and canonical path', async () => {
    const items = [
      { name: 'Built in', path: '/opt/watermarks/default.png', source: 'builtin' },
      { name: 'Shared', path: '/tank/shared/logo.png', source: 'global' },
      { name: 'Project', path: '/tank/job/.45flow/watermarks/logo.png', source: 'project' },
    ]
    const apiFetch = vi.fn().mockResolvedValue({ items })
    const result = await loadProjectWatermarks(apiFetch, 42)
    expect(apiFetch).toHaveBeenCalledExactlyOnceWith('/api/watermarks?projectId=42', { method: 'GET' })
    expect(result.items).toEqual(items)
    expect(result.custom).toEqual(items.slice(1).map(item => item.path))
    expect(result.defaults[0]).toMatchObject(items[0])
  })
  it('lists only server-provided global and built-in images when no project is selected', async () => {
    const apiFetch = vi.fn().mockResolvedValue({ items: [] })
    expect(await loadProjectWatermarks(apiFetch)).toEqual({ items: [], custom: [], defaults: [] })
    expect(apiFetch).toHaveBeenCalledWith('/api/watermarks', { method: 'GET' })
  })
  it('keeps saved built-in ids and legacy virtual paths usable with canonical server paths', async () => {
    const apiFetch = vi.fn().mockResolvedValue({ items: [{ name: '45Drives', path: '/opt/watermarks/45drives.png', source: 'builtin' }] })
    const { defaults } = await loadProjectWatermarks(apiFetch)
    expect(defaults[0].id).toBe('45drives')
    expect(canonicalWatermarkSelection('45drives', defaults)).toBe('/opt/watermarks/45drives.png')
    expect(canonicalWatermarkSelection('/.watermarks-builtin/45drives.png', defaults)).toBe('/opt/watermarks/45drives.png')
    expect(canonicalWatermarkSelection('/tank/custom/logo.png', defaults)).toBe('/tank/custom/logo.png')
  })
})
describe('missing scanner upload error', () => {
  it.each(['scanner_unavailable', 'Malware scanner unavailable'])('explains how to resolve %s', error => {
    expect(uploadErrorMessage(error)).toContain('An administrator can install it or turn scanning off in Settings.')
  })
  it('preserves unrelated upload failures', () => { expect(uploadErrorMessage('Permission denied')).toBe('Permission denied') })
})
