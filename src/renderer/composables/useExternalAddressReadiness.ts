// src/renderer/composables/useExternalAddressReadiness.ts
// Narrow, authenticated check of whether the server's configured public
// address (hostname + certificate) is currently ready for external
// recipient links (C1/G2 contract). Used to gate "copy external link"
// actions so the client never hands out a stale or locally-fabricated
// external URL once the configured hostname/cert is no longer trusted —
// the server remains authoritative (it already rejects new external link
// creation when unready; this composable protects *copying* an
// already-created external link whose readiness may have changed since).
//
// This intentionally calls GET /api/links/external-address-readiness,
// a narrow owner-scoped endpoint that returns only { ready, reason } —
// never admin diagnostics, hostnames, or certificate paths.

import { useApi } from './useApi'

export interface ExternalAddressReadiness {
	ready: boolean
	reason?: string
}

const READINESS_MESSAGES: Record<string, string> = {
	missing_hostname: 'Set a public hostname in Settings → URLs & Access before sharing external links.',
	raw_ip_address_not_allowed:
		'Configure a real hostname instead of a raw IP address in Settings → URLs & Access.',
	certificate_not_trusted:
		'The HTTPS certificate for your configured hostname is not valid or trusted yet. Finish certificate setup in Settings → URLs & Access.',
	readiness_check_failed:
		'Could not verify your external address is ready. Check Settings → URLs & Access and try again.',
}

export function describeExternalAddressNotReady(reason?: string): string {
	return (
		(reason && READINESS_MESSAGES[reason]) ||
		'External sharing is not ready yet. Check Settings → URLs & Access.'
	)
}

export function useExternalAddressReadiness() {
	const { apiFetch } = useApi()

	async function checkExternalAddressReady(): Promise<ExternalAddressReadiness> {
		try {
			const res = await apiFetch('/api/links/external-address-readiness', { method: 'GET' })
			return { ready: !!res?.ready, reason: res?.reason }
		} catch {
			// Fail closed: if we can't confirm readiness, treat the address as not ready
			// rather than silently allowing a copy of a possibly-stale external URL.
			return { ready: false, reason: 'readiness_check_failed' }
		}
	}

	return { checkExternalAddressReady }
}
