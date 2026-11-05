import { afterEach, describe, expect, it, vi } from 'vitest'
import { writeClipboard } from './clipboard'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

const stubClipboard = (impl) => vi.stubGlobal('navigator', { clipboard: impl })

describe('writeClipboard', () => {
  it('uses the async clipboard API when it works', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubClipboard({ writeText })
    document.execCommand = vi.fn()

    await writeClipboard('https://share/x')

    expect(writeText).toHaveBeenCalledWith('https://share/x')
    expect(document.execCommand).not.toHaveBeenCalled()
  })

  it('falls back to selection-and-copy when the API is missing', async () => {
    vi.stubGlobal('navigator', {})
    let copied
    document.execCommand = vi.fn((command) => { copied = document.querySelector('textarea')?.value; return command === 'copy' })

    await writeClipboard('plain http fallback')

    expect(copied).toBe('plain http fallback')
    expect(document.querySelector('textarea')).toBeNull() // the temporary field is removed
  })

  it('falls back when the API rejects, for example on a permission error', async () => {
    stubClipboard({ writeText: vi.fn().mockRejectedValue(new Error('NotAllowedError')) })
    document.execCommand = vi.fn().mockReturnValue(true)

    await expect(writeClipboard('x')).resolves.toBeUndefined()
    expect(document.execCommand).toHaveBeenCalledWith('copy')
  })

  it('rejects, like writeText, when nothing can copy, so callers can show their error', async () => {
    vi.stubGlobal('navigator', {})
    document.execCommand = vi.fn().mockReturnValue(false)

    await expect(writeClipboard('x')).rejects.toThrow(/not allowed/i)
    expect(document.querySelector('textarea')).toBeNull()
  })
})
