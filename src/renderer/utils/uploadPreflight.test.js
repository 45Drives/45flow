import { describe, expect, it, vi } from 'vitest'
import { validateUploadBatch } from './uploadPreflight'

const files = [
  { name: 'document.pdf', size: 100 },
  { name: 'report.xlsx', size: 200 },
  { name: 'budget.xls', size: 300 },
  { name: 'sheet.ods', size: 400 },
]
const allowed = batch => ({
  ok: true, allAllowed: true,
  files: batch.map(file => ({ name: file.name, allowed: true })),
})

describe('Quick Share batch preflight', () => {
  it('sends the entire selection and destination before allowing upload', async () => {
    let finish
    const apiFetch = vi.fn(() => new Promise(resolve => { finish = resolve }))
    const upload = vi.fn()
    const pending = validateUploadBatch(apiFetch, files, '/uploads').then(upload)
    expect(apiFetch).toHaveBeenCalledWith('/api/local-upload/validate', {
      method: 'POST', retry: 0,
      body: JSON.stringify({ dest: '/uploads', files: files.map(file => ({ filename: file.name, fileSize: file.size })) }),
    })
    expect(upload).not.toHaveBeenCalled()
    finish(allowed(files))
    await pending
    expect(upload).toHaveBeenCalledOnce()
  })

  it('lists every rejected file and never starts uploading even if the PDF is allowed', async () => {
    const apiFetch = vi.fn().mockResolvedValue({
      ok: true, allAllowed: false,
      files: [
        { name: 'document.pdf', allowed: true },
        { name: 'report.xlsx', allowed: false, reason: 'File too large' },
        { name: 'budget.xls', allowed: false, reason: 'Invalid filename' },
        { name: 'sheet.ods', allowed: true },
      ],
    })
    const upload = vi.fn()
    await expect(validateUploadBatch(apiFetch, files, '/uploads').then(upload))
      .rejects.toThrow('Nothing was uploaded. Fix or remove these files and try again:\nreport.xlsx: File too large\nbudget.xls: Invalid filename')
    expect(upload).not.toHaveBeenCalled()
  })

  it('checks batches beyond the 500-file API limit before any upload', async () => {
    const batch = Array.from({ length: 501 }, (_, i) => ({ name: `file-${i}.csv`, size: 10 }))
    const apiFetch = vi.fn()
      .mockResolvedValueOnce(allowed(batch.slice(0, 500)))
      .mockResolvedValueOnce({
        ok: true, allAllowed: false,
        files: [{ name: 'file-500.csv', allowed: false, reason: 'File too large' }],
      })
    const upload = vi.fn()
    await expect(validateUploadBatch(apiFetch, batch, '/uploads').then(upload)).rejects.toThrow('file-500.csv: File too large')
    expect(apiFetch).toHaveBeenCalledTimes(2)
    expect(upload).not.toHaveBeenCalled()
  })

  it.each([
    null, {}, { ok: false }, { ...allowed(files), files: [] },
    { ...allowed(files), allAllowed: false },
    { ...allowed(files), files: files.map(() => ({ name: 'wrong.xlsx', allowed: true })) },
    { ...allowed(files), files: files.map(file => ({ name: file.name, allowed: 'true' })) },
  ])('fails closed on malformed server responses: %j', async response => {
    await expect(validateUploadBatch(vi.fn().mockResolvedValue(response), files, '/uploads'))
      .rejects.toThrow('invalid upload check. Nothing was uploaded')
  })

  it('requires a server update rather than silently skipping preflight on older servers', async () => {
    await expect(validateUploadBatch(vi.fn().mockRejectedValue(Object.assign(new Error('Not found'), { status: 404 })), files, '/uploads'))
      .rejects.toThrow('server needs an update')
  })

  it('reports network failures without starting uploads', async () => {
    await expect(validateUploadBatch(vi.fn().mockRejectedValue(new Error('Network failed')), files, '/uploads'))
      .rejects.toThrow('Network failed. Nothing was uploaded.')
  })

  it('rejects empty selections without calling the server', async () => {
    const apiFetch = vi.fn()
    await expect(validateUploadBatch(apiFetch, [], '/uploads')).rejects.toThrow('No files selected')
    expect(apiFetch).not.toHaveBeenCalled()
  })
})
