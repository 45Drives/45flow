// Words and tones for the C3 email outbox, shared by every screen that shows
// an email's state (docs/track-c-ui-guide.md, "Email delivery (C3)").
// "Sent" means the mail server accepted it, not that it reached an inbox.

export type EmailStatus = 'pending' | 'sending' | 'accepted' | 'rejected' | 'timeout' | 'ambiguous'
export type EmailTone = 'info' | 'success' | 'warning' | 'danger' | 'muted'

export type EmailStatusView = {
  label: string
  tone: EmailTone
  /** One short sentence for a tooltip or help line. */
  help: string
}

export type EmailReason = 'no_from_address' | 'app_password_required' | 'auth_failed' | 'connection_failed' | 'tls_failed' | 'refused' | 'interrupted'

/** What to do about a failed email, from the server's safe reason code. */
export function emailReasonHelp(reason?: EmailReason | string | null): string | null {
  switch (reason) {
    case 'no_from_address': return 'No From address is set. Add one in Settings → Email (SMTP), then retry.'
    case 'app_password_required': return 'This account uses 2-step sign-in, so it needs an app password instead of its normal password. For Gmail, create one at myaccount.google.com/apppasswords, then enter it as the password in Settings → Email (SMTP).'
    case 'auth_failed': return "The mail server didn't accept the username or password in Settings → Email (SMTP)."
    case 'connection_failed': return "Couldn't reach the mail server. Check the host, port and encryption in Settings → Email (SMTP)."
    case 'tls_failed': return "The mail server's security certificate wasn't trusted. Check the host and encryption in Settings → Email (SMTP)."
    case 'refused': return 'The mail server refused it. Check the address, then retry.'
    case 'interrupted': return 'The server restarted while sending, so it may or may not have arrived. Retrying could send it twice.'
    default: return null
  }
}

export function emailStatusView(status: EmailStatus | string, mailConfigured?: boolean | null, reason?: EmailReason | string | null, mailDisabled?: boolean): EmailStatusView {
  const why = emailReasonHelp(reason)
  switch (status) {
    case 'pending':
      if (mailDisabled) {
        return { label: 'Not sent', tone: 'warning', help: 'Email is turned off on this server. Retry once an admin turns it back on in Settings → Scanning & privacy.' }
      }
      if (mailConfigured === false) {
        return { label: 'Not sent', tone: 'warning', help: "Email isn't set up on this server, so it's waiting to be sent." }
      }
      if (mailConfigured === null) {
        return { label: 'Not sent', tone: 'warning', help: "45Flow couldn't check the email settings, so it hasn't been sent yet. Use Retry to try again." }
      }
      return { label: 'Sending', tone: 'info', help: 'Waiting for the mail server.' }
    case 'sending':
      return { label: 'Sending', tone: 'info', help: 'Waiting for the mail server.' }
    case 'accepted':
      return { label: 'Sent', tone: 'success', help: 'The mail server accepted it. Delivery to the inbox is up to the recipient\'s provider.' }
    case 'rejected':
      return { label: 'Failed', tone: 'danger', help: why || 'The mail server refused it. Check the address, then retry.' }
    case 'timeout':
    case 'ambiguous':
      return { label: 'Unconfirmed', tone: 'warning', help: why || "The mail server didn't confirm it, so it may or may not have arrived. Retrying could send it twice." }
    default:
      return { label: String(status || 'Unknown'), tone: 'muted', help: '' }
  }
}

/** Statuses the server refuses to retry: one is mid-send, the other already went out. */
export function canRetryEmail(status: EmailStatus | string): boolean {
  return status !== 'sending' && status !== 'accepted'
}
