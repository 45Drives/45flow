import { describe, expect, it, vi } from 'vitest'

const apiFetch = vi.fn()
vi.mock('./useApi', () => ({ useApi: () => ({ apiFetch }) }))

import { describeExternalLinkCreateError, useExternalAddressReadiness } from './useExternalAddressReadiness'

describe('describeExternalLinkCreateError', () => {
  it('turns a missing-hostname refusal into plain guidance with a Local Network hint', () => {
    const err = Object.assign(new Error('external_address_not_ready: missing_hostname'), {
      status: 409,
      code: 'external_address_not_ready: missing_hostname',
    })
    const msg = describeExternalLinkCreateError(err)
    expect(msg).toContain('Settings → Share addresses')
    expect(msg).toContain('choose Local Network')
    expect(msg).not.toContain('external_address_not_ready')
  })

  it('reads the reason from the message when no code is present', () => {
    const msg = describeExternalLinkCreateError(new Error('external_address_not_ready: certificate_not_trusted'))
    expect(msg).toContain('HTTPS certificate')
  })

  it('falls back to generic guidance for an unknown reason', () => {
    const msg = describeExternalLinkCreateError(new Error('external_address_not_ready: something_new'))
    expect(msg).toContain("Internet sharing isn't ready yet")
  })

  it('returns null for unrelated errors', () => {
    expect(describeExternalLinkCreateError(new Error('outputs_exist'))).toBeNull()
    expect(describeExternalLinkCreateError(null)).toBeNull()
  })
})

describe('checkExternalAddressReady with P2P', () => {
  const notReady = { ready: false, reason: 'certificate_not_trusted', base: null, p2pBase: 'https://abc.45flow.45d.io' }

  it('treats a link on the active P2P address as ready and keeps its origin', async () => {
    apiFetch.mockResolvedValueOnce(notReady)
    const r = await useExternalAddressReadiness().checkExternalAddressReady('https://abc.45flow.45d.io/link/tok')
    expect(r).toMatchObject({ ready: true, base: 'https://abc.45flow.45d.io' })
  })

  it('still blocks a direct-address link when the public address is not ready', async () => {
    apiFetch.mockResolvedValueOnce(notReady)
    const r = await useExternalAddressReadiness().checkExternalAddressReady('https://share.example.com/link/tok')
    expect(r).toMatchObject({ ready: false, reason: 'certificate_not_trusted' })
  })

  it('without a url reports only the public address', async () => {
    apiFetch.mockResolvedValueOnce(notReady)
    const r = await useExternalAddressReadiness().checkExternalAddressReady()
    expect(r.ready).toBe(false)
  })
})
