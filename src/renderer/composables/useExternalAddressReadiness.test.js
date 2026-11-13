import { describe, expect, it, vi } from 'vitest'

vi.mock('./useApi', () => ({ useApi: () => ({ apiFetch: vi.fn() }) }))

import { describeExternalLinkCreateError } from './useExternalAddressReadiness'

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
