// useLicenseStatus.ts
// Reactive license status composable for feature gating.
// Sources state from useConnections().activeConnection.licensed.
// Server-side enforcement (requireLicense middleware) is the real gate;
// client-side gating via this composable is UX polish.

import { computed } from 'vue'
import { useConnections } from './useConnections'

export interface LicenseInfo {
  licenseId?: string
  perpetual?: boolean
  expiresAt?: string | null
  issuedAt?: string
}

export function useLicenseStatus() {
  const { activeConnection } = useConnections()

  const isPremiumActive = computed<boolean>(() => {
    return activeConnection.value?.licensed === true
  })

  const licenseInfo = computed<LicenseInfo | null>(() => {
    const conn = activeConnection.value
    if (!conn?.licensed) return null
    return (conn as any).licenseInfo ?? null
  })

  const isTrial = computed<boolean>(() => {
    const info = licenseInfo.value
    if (!info) return false
    return !info.perpetual && !!info.expiresAt
  })

  const trialDaysRemaining = computed<number | null>(() => {
    const info = licenseInfo.value
    if (!info?.expiresAt) return null
    const now = Date.now()
    const expires = new Date(info.expiresAt).getTime()
    const days = Math.ceil((expires - now) / (1000 * 60 * 60 * 24))
    return Math.max(0, days)
  })

  return {
    isPremiumActive,
    isTrial,
    trialDaysRemaining,
    licenseInfo,
  }
}
