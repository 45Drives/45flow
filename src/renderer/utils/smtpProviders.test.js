import { describe, expect, it } from 'vitest'
import { smtpProviderHints } from './smtpProviders'

const base = { host: '', port: 587, tlsMode: 'starttls', username: '', fromAddress: '' }
const hints = (over) => smtpProviderHints({ ...base, ...over })

describe('smtpProviderHints', () => {
  it('says nothing for an ordinary, consistent setup', () => {
    expect(hints({ host: 'mail.studio.test', username: 'me@studio.test', fromAddress: 'me@studio.test' })).toEqual([])
  })

  it('points Gmail users at app passwords and warns when From differs from the login', () => {
    const h = hints({ host: 'smtp.gmail.com', username: 'me@gmail.com', fromAddress: 'keo@45flow.com' })
    expect(h[0]).toMatchObject({ tone: 'info', link: { href: 'https://myaccount.google.com/apppasswords' } })
    expect(h[0].text).toContain('app password')
    expect(h.some(x => x.tone === 'warning' && x.text.includes('Send mail as'))).toBe(true)
    // The Gmail warning already covers the mismatch; no second, generic one.
    expect(h.filter(x => x.text.includes('keo@45flow.com'))).toHaveLength(1)
  })

  it('explains Microsoft 365 Authenticated SMTP', () => {
    expect(hints({ host: 'smtp.office365.com' })[0].text).toContain('Authenticated SMTP')
  })

  it('flags the Mailtrap sandbox as test-only', () => {
    expect(hints({ host: 'sandbox.smtp.mailtrap.io' })[0].text).toContain('never delivers')
  })

  it('catches port and encryption mismatches and port 25', () => {
    expect(hints({ host: 'x.test', port: 465, tlsMode: 'starttls' })[0].text).toContain('Port 465 normally uses Implicit TLS')
    expect(hints({ host: 'x.test', port: 587, tlsMode: 'implicit' })[0].text).toContain('Port 587 normally uses STARTTLS')
    expect(hints({ host: 'x.test', port: 25 }).some(h => h.text.includes('block port 25'))).toBe(true)
  })

  it('warns about a From on another domain for other providers', () => {
    const h = hints({ host: 'mail.studio.test', username: 'me@studio.test', fromAddress: 'me@other.test' })
    expect(h).toHaveLength(1)
    expect(h[0].text).toContain('different domain')
  })
})
