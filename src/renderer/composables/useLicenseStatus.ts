// useLicenseStatus.ts
// Reactive license status composable for feature gating.
// Sources state from useConnections().activeConnection.licensed.
// Server-side enforcement (requireLicense middleware) is the real gate;
// client-side gating via this composable is UX polish.

import { computed, ref, watch, onUnmounted } from 'vue'
import { useConnections } from './useConnections'

export interface LicenseInfo {
  licenseId?: string
  perpetual?: boolean
  expiresAt?: string | null
  issuedAt?: string
  customerEmail?: string | null
  activatedAt?: string | null
  notes?: string | null
}

const LICENSE_CHECK_INTERVAL_MS = 30 * 60 * 1000 // 30 minutes
let _bgCheckTimer: ReturnType<typeof setInterval> | null = null
let _bgCheckRefCount = 0

export function useLicenseStatus() {
  const { activeConnection, updateConnection } = useConnections()

  /**
   * Premium features are active when:
   *  - Server is actively licensed, OR
   *  - Server was previously licensed (fallback mode — keeps features, no updates)
   */
  const isPremiumActive = computed<boolean>(() => {
    const conn = activeConnection.value
    return conn?.licensed === true || conn?.licenseFallback === true
  })

  /**
   * Update eligibility requires an ACTIVE license (not fallback).
   * Community (never licensed) and fallback (expired) users don't get updates.
   */
  const isUpdateEligible = computed<boolean>(() => {
    return activeConnection.value?.licensed === true
  })

  /**
   * True when the server was previously licensed but the license has expired.
   * Features still work but no new app updates.
   */
  const isFallback = computed<boolean>(() => {
    const conn = activeConnection.value
    return conn?.licenseFallback === true && conn?.licensed !== true
  })

  const licenseInfo = computed<LicenseInfo | null>(() => {
    const conn = activeConnection.value
    if (!conn?.licensed && !conn?.licenseFallback && conn?.licenseReason !== 'trial_expired') return null
    return (conn as any).licenseInfo ?? null
  })

  const isTrial = computed<boolean>(() => {
    const info = licenseInfo.value
    if (!info) return false
    return info.notes === 'trial' && !info.perpetual && !!info.expiresAt
  })

  const isTrialExpired = computed<boolean>(() => {
    const conn = activeConnection.value
    return conn?.licenseReason === 'trial_expired'
  })

  const trialDaysRemaining = computed<number | null>(() => {
    const info = licenseInfo.value
    if (!info?.expiresAt) return null
    const now = Date.now()
    const expires = new Date(info.expiresAt).getTime()
    const days = Math.ceil((expires - now) / (1000 * 60 * 60 * 24))
    return Math.max(0, days)
  })

  /** Perform a background license status check against the active connection's server */
  async function checkLicenseInBackground() {
    const conn = activeConnection.value
    if (!conn?.baseUrl || !conn?.token) return

    try {
      const res = await fetch(`${conn.baseUrl}/api/license/status`, {
        headers: { 'Authorization': `Bearer ${conn.token}` },
      })
      if (!res.ok) return

      const body = await res.json().catch(() => null)
      if (!body?.ok) return

      const updates: Record<string, any> = {
        licensed: !!body.licensed,
        licenseFallback: !!body.fallback,
        licenseReason: body.reason || undefined,
        licenseCheckedAt: Date.now(),
      }

      // Merge license + metadata into licenseInfo
      if (body.license || body.metadata) {
        updates.licenseInfo = {
          ...(body.license || {}),
          ...(body.metadata || {}),
        }
      }

      updateConnection(conn.connectionId, updates)
    } catch {
      // Silently fail — background check should not disrupt the user
    }
  }

  // Start/stop background polling with ref counting (shared across components)
  function startBackgroundCheck() {
    _bgCheckRefCount++
    if (_bgCheckRefCount === 1) {
      // Immediate check if stale (> interval since last check)
      const conn = activeConnection.value
      if (conn && (!conn.licenseCheckedAt || Date.now() - conn.licenseCheckedAt > LICENSE_CHECK_INTERVAL_MS)) {
        checkLicenseInBackground()
      }
      _bgCheckTimer = setInterval(checkLicenseInBackground, LICENSE_CHECK_INTERVAL_MS)
    }
  }

  function stopBackgroundCheck() {
    _bgCheckRefCount = Math.max(0, _bgCheckRefCount - 1)
    if (_bgCheckRefCount === 0 && _bgCheckTimer) {
      clearInterval(_bgCheckTimer)
      _bgCheckTimer = null
    }
  }

  return {
    isPremiumActive,
    isUpdateEligible,
    isFallback,
    isTrial,
    isTrialExpired,
    trialDaysRemaining,
    licenseInfo,
    checkLicenseInBackground,
    startBackgroundCheck,
    stopBackgroundCheck,
  }
}
