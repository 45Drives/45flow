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
	/**
	 * The CURRENT server-authoritative external base origin (e.g.
	 * "https://share.example.com"), present only when ready===true. Narrow:
	 * this is exactly the origin already embedded in every external
	 * recipient link shown to an authenticated user, not a new secret.
	 * Callers should use `resolveCopyUrl` to refresh an already-cached
	 * recipient URL with this origin at copy time, rather than trusting a
	 * possibly-stale hostname fetched at an earlier list/mount/render.
	 */
	base?: string | null
}

const READINESS_MESSAGES: Record<string, string> = {
	missing_hostname: 'Set a public web address in Settings → Share addresses before sharing links on the internet.',
	raw_ip_address_not_allowed:
		'Internet links need a domain name, not an IP address. Set one in Settings → Share addresses.',
	insecure_scheme_not_allowed:
		'Your public address must start with https://. Fix it in Settings → Share addresses.',
	certificate_not_trusted:
		"The HTTPS certificate for your public address isn't trusted yet. Finish setup in Settings → HTTPS certificate.",
	readiness_check_failed:
		"45Flow couldn't check your public address. Try again, or open Settings → Internet sharing.",
}

/**
 * Rebuilds `originalUrl` using the CURRENT server-authoritative `base`
 * origin (scheme + host + port), preserving the original path, query and
 * fragment exactly. Used at copy time so a recipient URL cached from an
 * earlier list/mount/render never ships a stale hostname/IP after the
 * admin changes the configured public address while the view stays open.
 *
 * Uses real URL parsing (never raw string/host substring replacement) so
 * path/query/fragment semantics are preserved exactly. Returns
 * `originalUrl` unchanged when there is no fresh `base` to apply, or when
 * `originalUrl` isn't a parseable absolute URL (e.g. already local/relative) —
 * never throws.
 */
export function resolveCopyUrl(originalUrl: string, base?: string | null): string {
	if (!base) return originalUrl
	try {
		const current = new URL(originalUrl)
		const fresh = new URL(base)
		current.protocol = fresh.protocol
		current.host = fresh.host // host covers hostname + explicit port together
		return current.toString()
	} catch {
		return originalUrl
	}
}

export function describeExternalAddressNotReady(reason?: string): string {
	return (
		(reason && READINESS_MESSAGES[reason]) ||
		"Internet sharing isn't ready yet. Check Settings → Internet sharing."
	)
}

const NOT_READY_PATTERN = /external_address_not_ready:\s*([a-z_]+)/

/**
 * When link creation was refused because the public address isn't ready
 * (server 409 "external_address_not_ready: <reason>"), returns a plain
 * message for the user that also points at Local Network sharing, which the
 * server never gates. Returns null for any other error.
 */
export function describeExternalLinkCreateError(e: any): string | null {
	const match = NOT_READY_PATTERN.exec(String(e?.code || '')) || NOT_READY_PATTERN.exec(String(e?.message || ''))
	if (!match) return null
	return `${describeExternalAddressNotReady(match[1])} To share on your own network instead, choose Local Network.`
}

export function useExternalAddressReadiness() {
	const { apiFetch } = useApi()

	async function checkExternalAddressReady(): Promise<ExternalAddressReadiness> {
		try {
			const res = await apiFetch('/api/links/external-address-readiness', { method: 'GET' })
			return { ready: !!res?.ready, reason: res?.reason, base: res?.base ?? null }
		} catch {
			// Fail closed: if we can't confirm readiness, treat the address as not ready
			// rather than silently allowing a copy of a possibly-stale external URL.
			return { ready: false, reason: 'readiness_check_failed' }
		}
	}

	return { checkExternalAddressReady }
}
