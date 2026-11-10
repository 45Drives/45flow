// Tips for Settings → Email (SMTP), worked out from what the admin has typed.
// Kept short and only for problems people actually hit; the test email is the
// real check.

export type SmtpHint = {
  tone: 'info' | 'warning'
  text: string
  link?: { href: string; label: string }
}

export type SmtpForm = {
  host: string
  port: number | null
  tlsMode: 'implicit' | 'starttls'
  username: string
  fromAddress: string
}

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/

function domainOf(email: string) {
  const at = email.trim().toLowerCase().lastIndexOf('@')
  return at > 0 ? email.trim().toLowerCase().slice(at + 1) : ''
}

export function smtpProviderHints(form: SmtpForm): SmtpHint[] {
  const host = form.host.trim().toLowerCase()
  const hints: SmtpHint[] = []
  const from = form.fromAddress.trim().toLowerCase()
  const login = form.username.trim().toLowerCase()
  const loginIsEmail = EMAIL_RE.test(login)

  if (/(^|\.)gmail\.com$|googlemail\.com$|smtp-relay\.gmail\.com$/.test(host)) {
    hints.push({
      tone: 'info',
      text: 'Gmail needs an app password, not your normal Google password. 2-Step Verification must be on. Use smtp.gmail.com, port 587, STARTTLS, and your full Gmail address as the username.',
      link: { href: 'https://myaccount.google.com/apppasswords', label: 'Create a Google app password' },
    })
    if (from && loginIsEmail && from !== login) {
      hints.push({
        tone: 'warning',
        text: `Gmail sends as ${login} and replaces a different From unless ${from} is added under Gmail → Settings → Accounts → "Send mail as".`,
      })
    }
  } else if (/office365\.com$|outlook\.com$|hotmail\.com$|live\.com$/.test(host)) {
    hints.push({
      tone: 'info',
      text: 'Microsoft 365 / Outlook: use smtp.office365.com, port 587, STARTTLS and the full mailbox address as the username. An admin may need to turn on "Authenticated SMTP" for this mailbox. If it uses 2-step sign-in, use an app password.',
      link: { href: 'https://learn.microsoft.com/exchange/clients-and-mobile-in-exchange-online/authenticated-client-smtp-submission', label: 'Turn on Authenticated SMTP' },
    })
    if (from && loginIsEmail && from !== login) {
      hints.push({ tone: 'warning', text: `Microsoft 365 only sends as ${from} if ${login} has "Send As" permission for it; otherwise the mail server refuses the email.` })
    }
  } else if (/mail\.me\.com$|icloud\.com$/.test(host)) {
    hints.push({
      tone: 'info',
      text: 'iCloud Mail: use smtp.mail.me.com, port 587, STARTTLS and an app-specific password from your Apple Account.',
      link: { href: 'https://account.apple.com/account/manage', label: 'Apple Account sign-in and security' },
    })
  } else if (/yahoo\.com$/.test(host)) {
    hints.push({
      tone: 'info',
      text: 'Yahoo Mail: use smtp.mail.yahoo.com, port 465 with Implicit TLS, and an app password from Yahoo account security.',
      link: { href: 'https://login.yahoo.com/account/security', label: 'Yahoo account security' },
    })
  } else if (/mailtrap\.io$/.test(host) && host.includes('sandbox')) {
    hints.push({ tone: 'warning', text: "Mailtrap's sandbox catches emails in its own web inbox and never delivers them to real addresses. Use it for testing only." })
  } else if (/sendgrid\.net$|mailgun\.org$|amazonaws\.com$|postmarkapp\.com$|sparkpostmail\.com$|brevo\.com$|sendinblue\.com$/.test(host)) {
    hints.push({ tone: 'info', text: "Email services like this usually take an API key as the password (SendGrid's username is apikey), and only send from an address or domain you've verified with them." })
  }

  const port = Number(form.port)
  if (port === 465 && form.tlsMode === 'starttls') {
    hints.push({ tone: 'warning', text: 'Port 465 normally uses Implicit TLS. With STARTTLS the connection usually hangs and times out.' })
  } else if ((port === 587 || port === 25 || port === 2525) && form.tlsMode === 'implicit') {
    hints.push({ tone: 'warning', text: `Port ${port} normally uses STARTTLS. With Implicit TLS the connection usually fails right away.` })
  }
  if (port === 25) {
    hints.push({ tone: 'warning', text: 'Many internet providers and networks block port 25. Use 587 if your provider offers it.' })
  }

  if (from && EMAIL_RE.test(from) && loginIsEmail && domainOf(from) !== domainOf(login) && !hints.some(h => h.tone === 'warning' && h.text.includes(from))) {
    hints.push({ tone: 'warning', text: `The From address (${from}) is on a different domain from the login. Many providers rewrite or refuse that, and receivers may mark it as spam.` })
  }
  return hints
}
