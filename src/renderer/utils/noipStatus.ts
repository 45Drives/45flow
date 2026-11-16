// Plain words for the No-IP dynamic DNS status (C1). Outcomes follow No-IP's
// documented responses (https://www.noip.com/integrate/response).

export type NoipState = {
  stopped: boolean
  retryAfterTs: number | null
  lastOutcome: string | null
  lastCode: string | null
  lastIp: string | null
  lastAttemptAt: string | null
  lastSuccessAt: string | null
}

export type NoipStatus = {
  entitled: boolean
  entitlementReason?: string
  enabled: boolean
  hostname: string | null
  hasCredentials: boolean
  state: NoipState
}

export type NoipTone = 'success' | 'warning' | 'danger' | 'muted'

const OUTCOME_TEXT: Record<string, { text: string; tone: NoipTone }> = {
  auth_error: { text: "No-IP didn't accept the username or password. Enter them again and save.", tone: 'danger' },
  hostname_error: { text: "That hostname isn't in this No-IP account. Check it on noip.com and save again.", tone: 'danger' },
  client_disabled: { text: 'No-IP has blocked updates from this app. Contact 45Drives support.', tone: 'danger' },
  feature_unavailable: { text: "This No-IP account can't use that feature. Check the hostname type on noip.com.", tone: 'danger' },
  abuse_blocked: { text: 'No-IP has blocked this hostname for too many updates. Check your account on noip.com.', tone: 'danger' },
  unrecognized_response: { text: 'No-IP sent a reply 45Flow didn\'t recognise, so updates are paused. Save again to retry.', tone: 'danger' },
  provider_fatal_error: { text: 'No-IP had a problem on its side. 45Flow will try again in 30 minutes.', tone: 'warning' },
  network_error: { text: "Couldn't reach No-IP. 45Flow will try again at the next check.", tone: 'warning' },
  egress_disabled: { text: 'No-IP updates are turned off under Scanning & privacy.', tone: 'warning' },
}

const SKIP_TEXT: Record<string, string> = {
  disabled: 'Updates are off. Turn on "Keep it updated" and save.',
  no_hostname: 'Enter the No-IP hostname and save.',
  no_credentials: 'Enter the No-IP username and password and save.',
  premium_required: 'No-IP setup needs 45Flow Pro.',
  stopped: 'Updates are paused until the settings are fixed and saved.',
  waiting: 'Waiting before trying No-IP again.',
  unchanged: 'Nothing to send: the address hasn\'t changed.',
  network_error: OUTCOME_TEXT.network_error!.text,
  egress_disabled: OUTCOME_TEXT.egress_disabled!.text,
}

/** Why an update wasn't sent, from the server's reason code. */
export function noipSkipText(reason: string): string {
  return SKIP_TEXT[reason] || 'No update was sent.'
}

/** One status line for the setup screen. */
export function noipStatusView(s: NoipStatus): { text: string; tone: NoipTone } {
  if (!s.hostname || !s.hasCredentials) return { text: '', tone: 'muted' }
  const st = s.state || ({} as NoipState)
  const outcome = st.lastOutcome
  if (outcome && OUTCOME_TEXT[outcome]) return OUTCOME_TEXT[outcome]!
  if (outcome === 'updated' || outcome === 'no_change') {
    const ip = st.lastIp ? ` to ${st.lastIp}` : ''
    return { text: `${s.hostname} points${ip}.${s.enabled ? ' 45Flow keeps it updated.' : ' Updates are off.'}`, tone: 'success' }
  }
  return { text: s.enabled ? 'Saved. Click Update now to point the hostname at this server.' : 'Saved. Updates are off.', tone: 'muted' }
}
