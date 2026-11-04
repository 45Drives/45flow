import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useLicenseStatus } from './useLicenseStatus'

const mocks = vi.hoisted(() => ({ connection: null, updateConnection: vi.fn() }))
vi.mock('./useConnections', () => ({
  useConnections: () => ({
    activeConnection: mocks.connection,
    updateConnection: mocks.updateConnection,
  }),
}))

const trialInfo = expiresAt => ({ notes: 'trial', perpetual: false, expiresAt })

beforeEach(() => {
  mocks.connection = ref(null)
})

describe('license presentation and feature eligibility', () => {
  it('keeps an active trial and its countdown', () => {
    mocks.connection.value = {
      licensed: true,
      licenseInfo: trialInfo(new Date(Date.now() + 5 * 86400000).toISOString()),
    }
    const status = useLicenseStatus()
    expect(status.isTrial.value).toBe(true)
    expect(status.trialDaysRemaining.value).toBe(5)
    expect(status.isTrialExpired.value).toBe(false)
    expect(status.isFallback.value).toBe(false)
    expect(status.isPremiumActive.value).toBe(true)
    expect(status.isUpdateEligible.value).toBe(true)
  })

  it.each([undefined, trialInfo('2020-01-01T00:00:00Z')])(
    'presents expired Pro as legacy, even with old trial metadata: %j', licenseInfo => {
      mocks.connection.value = { licensed: false, licenseFallback: true, licenseInfo }
      const status = useLicenseStatus()
      expect(status.isTrial.value).toBe(false)
      expect(status.isFallback.value).toBe(true)
      expect(status.isPremiumActive.value).toBe(true)
      expect(status.isUpdateEligible.value).toBe(false)
    },
  )

  it('does not present an expired Community trial as an active trial with zero days', () => {
    mocks.connection.value = {
      licensed: false,
      licenseFallback: false,
      licenseReason: 'trial_expired',
      licenseInfo: trialInfo('2020-01-01T00:00:00Z'),
    }
    const status = useLicenseStatus()
    expect(status.isTrial.value).toBe(false)
    expect(status.isTrialExpired.value).toBe(true)
    expect(status.trialDaysRemaining.value).toBe(0)
    expect(status.isPremiumActive.value).toBe(false)
    expect(status.isUpdateEligible.value).toBe(false)
  })

  it('updates presentation when switching servers or renewing a legacy license', () => {
    const status = useLicenseStatus()
    expect(status.isPremiumActive.value).toBe(false)
    expect(status.isTrial.value).toBe(false)
    mocks.connection.value = {
      licensed: false, licenseFallback: true, licenseInfo: trialInfo('2020-01-01T00:00:00Z'),
    }
    expect(status.isFallback.value).toBe(true)
    expect(status.isTrial.value).toBe(false)
    mocks.connection.value = {
      licensed: true, licenseFallback: false, licenseInfo: { perpetual: true },
    }
    expect(status.isFallback.value).toBe(false)
    expect(status.isTrial.value).toBe(false)
    expect(status.isPremiumActive.value).toBe(true)
    expect(status.isUpdateEligible.value).toBe(true)
    mocks.connection.value = { licensed: false, licenseFallback: false }
    expect(status.isPremiumActive.value).toBe(false)
    expect(status.isTrial.value).toBe(false)
    expect(status.licenseInfo.value).toBeNull()
  })
})
