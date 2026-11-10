// C3 email-invitation client — focused unit checks for EmailInvitationPanel.vue.
//
// Follows the repo's raw createApp/nextTick DOM mounting convention (no
// @vue/test-utils dependency added — none exists elsewhere in this repo's
// component tests). Bounded to the cases required by the gate contract:
// correct POST body/link id, honest unconfigured-mail rendering, a real
// Refresh-status GET, visible failure with input preserved, and the
// link-switch stale-response guard. No invented edge-case permutations.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import EmailInvitationPanel from './EmailInvitationPanel.vue'

let app
let host
async function flush() {
  for (let i = 0; i < 5; i++) await nextTick()
}
// The panel loads earlier invitations on open; answer that with `history` and
// hand every other request to the test's own mock, so call counts stay per-action.
function withHistory(apiFetch, history = []) {
  return (url, opts) => (String(url).endsWith('/emails')
    ? Promise.resolve({ ok: true, emails: history, owner: null })
    : (opts === undefined ? apiFetch(url) : apiFetch(url, opts)))
}
function mount(linkId, apiFetch, props = {}) {
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp(EmailInvitationPanel, { linkId, apiFetch: withHistory(apiFetch, props.history), compact: props.compact })
  const vm = app.mount(host)
  return vm
}
function setEmail(value) {
  const input = host.querySelector('input[type="email"]')
  input.value = value
  input.dispatchEvent(new Event('input'))
}
function sendButton() {
  return [...host.querySelectorAll('button')].find(b => b.textContent.includes('Send invitation'))
}
function refreshButton() {
  return [...host.querySelectorAll('button')].find(b => b.textContent.includes('Refresh status'))
}
function retryButton() {
  return [...host.querySelectorAll('button')].find(b => b.textContent.includes('Retry'))
}
const pendingInvitation = {
  id: 7, linkId: 42, recipientEmail: 'reviewer@external.test', status: 'pending',
  attemptCount: 0, lastOutcome: null, createdAt: '2026-11-06T00:00:00Z', updatedAt: '2026-11-06T00:00:00Z',
  invitationUrl: 'https://files.example.test/link/tok-abc',
  mail: { configured: false, sent: false, message: 'SMTP delivery is not configured for this installation; the invitation has been queued but not sent.' },
}

afterEach(() => {
  app?.unmount()
  host?.remove()
})

describe('EmailInvitationPanel', () => {
  it('POSTs the exact body to the given link id and shows the honest unsent state', async () => {
    const apiFetch = vi.fn().mockResolvedValue({ ok: true, invitation: pendingInvitation })
    mount(42, apiFetch)
    await flush()
    setEmail('reviewer@external.test')
    await flush()
    sendButton().click()
    await flush()
    expect(apiFetch).toHaveBeenCalledTimes(1)
    expect(apiFetch).toHaveBeenCalledWith('/api/links/42/invite', {
      method: 'POST',
      body: JSON.stringify({ recipientEmail: 'reviewer@external.test' }),
    })
    expect(host.textContent).toContain('reviewer@external.test')
    expect(host.textContent).toContain('Not sent')
    expect(host.textContent).toContain("Email isn't set up on this server yet")
    expect(host.querySelector('.flow-chip').textContent).toContain('Not sent')
    expect(host.textContent).not.toContain('Invitation sent')
  })

  it('disables duplicate submission for the same pending invitation but still shows no fake success', async () => {
    const apiFetch = vi.fn().mockResolvedValue({ ok: true, invitation: pendingInvitation })
    mount(42, apiFetch)
    await flush()
    setEmail('reviewer@external.test')
    await flush()
    sendButton().click()
    await flush()
    expect(apiFetch).toHaveBeenCalledTimes(1)
    // Same recipient, still pending: the Send button must now be disabled
    // (guards the duplicate submission; this is NOT a fake retry button).
    expect(sendButton().disabled).toBe(true)
  })

  it('refreshes via a real GET to the saved invitation id and reflects the newly observed state', async () => {
    const apiFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, invitation: pendingInvitation })
      .mockResolvedValueOnce({ ok: true, invitation: { ...pendingInvitation, status: 'accepted', attemptCount: 1, lastOutcome: 'smtp-accepted' } })
    mount(42, apiFetch)
    await flush()
    setEmail('reviewer@external.test')
    await flush()
    sendButton().click()
    await flush()
    refreshButton().click()
    await flush()
    expect(apiFetch).toHaveBeenNthCalledWith(2, '/api/links/42/invite/7')
    expect(host.querySelector('.flow-chip').textContent).toContain('Sent')
    // Honest caveat required by the gate contract: accepted by the mail
    // server is not proof of inbox delivery.
    expect(host.textContent).toContain('Delivery to the inbox is up to')
  })

  it('shows a visible error and keeps the typed email on a failed submission', async () => {
    const apiFetch = vi.fn().mockRejectedValue(new Error('link not found'))
    mount(42, apiFetch)
    await flush()
    setEmail('reviewer@external.test')
    await flush()
    sendButton().click()
    await flush()
    const input = host.querySelector('input[type="email"]')
    expect(input.value).toBe('reviewer@external.test')
    expect(host.querySelector('[role="alert"]').textContent).toContain('link not found')
    expect(host.textContent).not.toContain('Invitation sent')
  })

  it('refreshes unknown SMTP configuration without stale status or an error', async () => {
    const neutralMessage = 'SMTP configuration could not be determined; no send attempt has completed for this invitation.'
    const apiFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, invitation: pendingInvitation })
      .mockResolvedValueOnce({
        ok: true,
        invitation: {
          ...pendingInvitation,
          mail: { configured: null, sent: false, message: neutralMessage },
        },
      })
    mount(42, apiFetch)
    await flush()
    setEmail('reviewer@external.test')
    await flush()
    sendButton().click()
    await flush()
    refreshButton().click()
    await flush()
    expect(apiFetch).toHaveBeenNthCalledWith(2, '/api/links/42/invite/7')
    expect(host.textContent).toContain("couldn't check the email settings")
    expect(host.textContent).not.toContain("Email isn't set up on this server yet")
    expect(host.querySelector('[role="alert"]')).toBeNull()
  })

  it.each([undefined, 'unknown', 0])('rejects malformed configured value %s on refresh', async (configured) => {
    const apiFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, invitation: pendingInvitation })
      .mockResolvedValueOnce({
        ok: true,
        invitation: {
          ...pendingInvitation,
          mail: { configured, sent: false, message: 'Malformed response' },
        },
      })
    mount(42, apiFetch)
    await flush()
    setEmail('reviewer@external.test')
    await flush()
    sendButton().click()
    await flush()
    refreshButton().click()
    await flush()
    expect(host.querySelector('[role="alert"]').textContent).toContain('Unexpected invitation mail response')
    expect(host.textContent).not.toContain('Malformed response')
  })

  it('discards a stale in-flight response after the link changes and does not leak prior state', async () => {
    let resolveFirst
    const apiFetch = vi.fn()
      .mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve }))
    const linkId = ref(42)
    host = document.createElement('div')
    document.body.appendChild(host)
    // Tiny reactive host wrapper: the real integration always remounts via
    // :key on link switch, but the panel's OWN generation guard must also
    // hold on a bare reactive prop change, without relying on remount.
    const wrapped = withHistory(apiFetch)
    app = createApp({ render: () => h(EmailInvitationPanel, { linkId: linkId.value, apiFetch: wrapped }) })
    app.mount(host)
    await flush()
    setEmail('reviewer@external.test')
    await flush()
    sendButton().click()
    await flush()
    // Switch link out from under the still-pending POST.
    linkId.value = 99
    await flush()
    resolveFirst({ ok: true, invitation: pendingInvitation })
    await flush()
    // The panel now showing link 99 must show neither the stale recipient
    // nor the stale pending status from link 42's dropped response.
    expect(host.textContent).not.toContain('reviewer@external.test')
    expect(host.querySelector('input[type="email"]').value).toBe('')
  })

  it('POSTs retry to the exact invitation id and consumes the returned DTO, not an optimistic success', async () => {
    const apiFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, invitation: pendingInvitation })
      .mockResolvedValueOnce({
        ok: true,
        invitation: { ...pendingInvitation, status: 'rejected', attemptCount: 1, lastOutcome: 'rejected' },
      })
    mount(42, apiFetch)
    await flush()
    setEmail('reviewer@external.test')
    await flush()
    sendButton().click()
    await flush()
    retryButton().click()
    await flush()
    expect(apiFetch).toHaveBeenNthCalledWith(2, '/api/links/42/invite/7/retry', { method: 'POST' })
    expect(host.querySelector('.flow-chip').textContent).toContain('Failed')
    expect(host.textContent).not.toContain('Invitation sent')
  })

  it('blocks retry for an accepted invitation without ever calling enqueue or the retry route', async () => {
    const apiFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      invitation: { ...pendingInvitation, status: 'accepted', attemptCount: 1, lastOutcome: 'accepted' },
    })
    mount(42, apiFetch)
    await flush()
    setEmail('reviewer@external.test')
    await flush()
    sendButton().click()
    await flush()
    expect(retryButton().disabled).toBe(true)
    retryButton().click()
    await flush()
    expect(apiFetch).toHaveBeenCalledTimes(1)
  })

  it('blocks retry while a delivery attempt is actively sending', async () => {
    const apiFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      invitation: { ...pendingInvitation, status: 'sending', attemptCount: 1 },
    })
    mount(42, apiFetch)
    await flush()
    setEmail('reviewer@external.test')
    await flush()
    sendButton().click()
    await flush()
    expect(retryButton().disabled).toBe(true)
  })

  it.each([
    ['already_sent', 'already accepted by the mail server'],
    ['recovery_required', 'already in progress for this invitation; retry is blocked'],
    ['retry_conflict', 'Another retry or delivery attempt is already in progress'],
    ['credential_store_unavailable', 'SMTP credential store is unavailable'],
  ])('shows an honest message for retry %s and preserves the last known DTO', async (code, expectedText) => {
    const apiFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, invitation: { ...pendingInvitation, status: 'rejected', attemptCount: 1 } })
      .mockRejectedValueOnce(Object.assign(new Error(code), { status: 409, code }))
    mount(42, apiFetch)
    await flush()
    setEmail('reviewer@external.test')
    await flush()
    sendButton().click()
    await flush()
    retryButton().click()
    await flush()
    expect(host.querySelectorAll('[role="alert"]').length).toBeGreaterThan(0)
    expect([...host.querySelectorAll('[role="alert"]')].some(el => el.textContent.includes(expectedText))).toBe(true)
    // Preserved DTO: still shows the pre-retry rejected status, not a
    // manufactured success or a cleared invitation.
    expect(host.querySelector('.flow-chip').textContent).toContain('Failed')
  })

  it('discards a stale retry response after the link changes', async () => {
    let resolveRetry
    const apiFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, invitation: { ...pendingInvitation, status: 'rejected', attemptCount: 1 } })
      .mockImplementationOnce(() => new Promise(resolve => { resolveRetry = resolve }))
    const linkId = ref(42)
    host = document.createElement('div')
    document.body.appendChild(host)
    const wrapped = withHistory(apiFetch)
    app = createApp({ render: () => h(EmailInvitationPanel, { linkId: linkId.value, apiFetch: wrapped }) })
    app.mount(host)
    await flush()
    setEmail('reviewer@external.test')
    await flush()
    sendButton().click()
    await flush()
    retryButton().click()
    await flush()
    linkId.value = 99
    await flush()
    resolveRetry({ ok: true, invitation: { ...pendingInvitation, status: 'accepted', attemptCount: 2 } })
    await flush()
    // Link 99's fresh (empty) panel must not show link 42's late retry result.
    expect(host.textContent).not.toContain('reviewer@external.test')
    expect(host.querySelector('input[type="email"]').value).toBe('')
  })

  it('shows earlier invitations for the link when it opens, with the reason a send failed', async () => {
    const apiFetch = vi.fn()
    mount(42, apiFetch, {
      history: [
        { ...pendingInvitation, id: 9, kind: 'invitation', status: 'rejected', attemptCount: 1, reason: 'no_from_address',
          mail: { configured: true, sent: false, message: 'x' } },
        { ...pendingInvitation, id: 3, kind: 'review', recipientEmail: 'staff@studio.test' },
      ],
    })
    await flush()
    expect(host.textContent).toContain('reviewer@external.test')
    expect(host.textContent).toContain('No From address is set')
    // Only invitations belong here; review/download alerts live in Activity → Emails.
    expect(host.textContent).not.toContain('staff@studio.test')
    expect(apiFetch).not.toHaveBeenCalled()
  })

  it('compact mode on a new link: optional wording and no history request', async () => {
    const calls = []
    const apiFetch = vi.fn((url) => { calls.push(url); return Promise.resolve({ ok: true, invitation: pendingInvitation }) })
    host = document.createElement('div')
    document.body.appendChild(host)
    app = createApp(EmailInvitationPanel, { linkId: 42, apiFetch, compact: true })
    app.mount(host)
    await flush()
    expect(calls).toEqual([])
    expect(host.textContent).toContain('Email this link')
    expect(host.textContent).toContain('(optional)')
    setEmail('reviewer@external.test')
    await flush()
    ;[...host.querySelectorAll('button')].find(b => b.textContent.trim() === 'Send').click()
    await flush()
    expect(calls).toEqual(['/api/links/42/invite'])
    expect(host.textContent).toContain('reviewer@external.test')
  })
})
