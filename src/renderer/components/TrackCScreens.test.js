// Track C screens in the app: Review tab, link email list, shared status words.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import LinkReviewPanel from './LinkReviewPanel.vue'
import LinkEmailsPanel from './LinkEmailsPanel.vue'
import { emailStatusView, canRetryEmail } from '../utils/emailStatus'
import { parseServerTime, reviewStateView, reviewSummaryView, REVIEW_APPROVED_RANK } from '../utils/reviewStatus'

let app
let host
async function flush() {
  for (let i = 0; i < 6; i++) await nextTick()
  await new Promise(r => setTimeout(r, 0))
  for (let i = 0; i < 3; i++) await nextTick()
}
function mount(component, props) {
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp({ render: () => h(component, props) })
  app.mount(host)
}
const buttons = text => [...host.querySelectorAll('button')].filter(b => b.textContent.trim() === text)

afterEach(() => {
  app?.unmount()
  host?.remove()
  document.body.innerHTML = ''
})

describe('status words', () => {
  it('maps every email outbox status to the guide words', () => {
    expect(emailStatusView('pending', true).label).toBe('Sending')
    expect(emailStatusView('pending', false)).toMatchObject({ label: 'Not sent', tone: 'warning' })
    expect(emailStatusView('pending', null)).toMatchObject({ label: 'Not sent', tone: 'warning' })
    expect(emailStatusView('sending').label).toBe('Sending')
    expect(emailStatusView('accepted')).toMatchObject({ label: 'Sent', tone: 'success' })
    expect(emailStatusView('rejected')).toMatchObject({ label: 'Failed', tone: 'danger' })
    expect(emailStatusView('timeout')).toMatchObject({ label: 'Unconfirmed', tone: 'warning' })
    expect(emailStatusView('ambiguous')).toMatchObject({ label: 'Unconfirmed', tone: 'warning' })
    expect(canRetryEmail('accepted')).toBe(false)
    expect(canRetryEmail('sending')).toBe(false)
    expect(canRetryEmail('timeout')).toBe(true)
  })

  it('maps review states to the guide words', () => {
    expect(reviewStateView('pending').label).toBe('Awaiting approval')
    expect(reviewStateView('approved')).toMatchObject({ label: 'Approved', tone: 'success', dot: true })
    expect(reviewStateView('changes_requested')).toMatchObject({ label: 'Changes requested', tone: 'warning' })
    expect(reviewStateView('rejected')).toMatchObject({ label: 'Rejected', tone: 'danger' })
    expect(reviewStateView('superseded')).toMatchObject({ label: 'Superseded', tone: 'muted' })
  })

  it('summarises a link for list rows, worst state first', () => {
    const s = (over) => ({ hasApprover: true, total: 3, pending: 0, approved: 0, changes_requested: 0, rejected: 0, ...over })
    expect(reviewSummaryView(null)).toBeNull()
    expect(reviewSummaryView(undefined)).toBeNull()
    expect(reviewSummaryView(s({ total: 0 }))).toBeNull()
    expect(reviewSummaryView(s({ approved: 1, changes_requested: 1, rejected: 1 }))).toMatchObject({ label: '1 rejected', tone: 'danger', rank: 0 })
    expect(reviewSummaryView(s({ approved: 1, changes_requested: 2 }))).toMatchObject({ label: '2 need changes', tone: 'warning' })
    expect(reviewSummaryView(s({ approved: 2, changes_requested: 1 })).label).toBe('Needs changes')
    expect(reviewSummaryView(s({ approved: 1, pending: 2 }))).toMatchObject({ label: '1/3 approved', tone: 'info', rank: 2 })
    expect(reviewSummaryView(s({ pending: 3 }))).toMatchObject({ label: '3 awaiting', tone: 'info', rank: 2 })
    expect(reviewSummaryView(s({ hasApprover: false, pending: 3 }))).toMatchObject({ label: 'No approver', tone: 'muted' })
    const done = reviewSummaryView(s({ approved: 3 }))
    expect(done).toMatchObject({ label: 'Approved', tone: 'success', dot: true, rank: REVIEW_APPROVED_RANK })
    expect(done.title).toBe('3 files: 3 approved')
    expect(reviewSummaryView(s({ hasApprover: false, total: 1, pending: 1 })).title).toBe('1 file: 1 awaiting approval. No approver chosen.')
  })

  it('reads SQLite timestamps as UTC', () => {
    expect(parseServerTime('2026-11-09 18:30:56').toISOString()).toBe('2026-11-09T18:30:56.000Z')
    expect(parseServerTime('2026-11-09T18:30:56Z').toISOString()).toBe('2026-11-09T18:30:56.000Z')
    expect(parseServerTime('')).toBeNull()
    expect(parseServerTime('nonsense')).toBeNull()
  })
})

describe('LinkReviewPanel', () => {
  const users = [
    { user_id: 5, name: 'Dana Client' },
    { user_id: 6, name: 'Off Client', is_disabled: true },
  ]
  const state = {
    accessMode: 'restricted',
    approver: null,
    files: [
      { fileId: 1, name: 'cut.mp4', currentAssetVersionId: 12, currentVersionIndex: 2, status: 'pending', latest: null },
      { fileId: 2, name: 'deck.pdf', currentAssetVersionId: 20, currentVersionIndex: 1, status: 'changes_requested',
        latest: { id: 3, decision: 'changes_requested', note: 'Fix p2', decided_at: '2026-11-09 10:00:00' } },
    ],
    history: [
      { id: 3, fileId: 2, fileName: 'deck.pdf', assetVersionId: 20, versionIndex: 1, decision: 'changes_requested',
        note: 'Fix p2', decided_at: '2026-11-09 10:00:00', actor: { name: 'Dana Client' }, superseded: false },
      { id: 2, fileId: 1, fileName: 'cut.mp4', assetVersionId: 11, versionIndex: 1, decision: 'approved',
        note: null, decided_at: '2026-11-08 10:00:00', actor: { name: 'Dana Client' }, superseded: true },
    ],
  }

  it('offers CSV and JSON exports of the review history', async () => {
    const onExport = vi.fn()
    mount(LinkReviewPanel, { state, linkAccessMode: 'restricted', users, onExport })
    await flush()
    buttons('Export CSV')[0].click()
    buttons('Export JSON')[0].click()
    expect(onExport.mock.calls).toEqual([['csv'], ['json']])

    app.unmount(); host.remove()
    mount(LinkReviewPanel, { state, linkAccessMode: 'restricted', users, exporting: 'csv' })
    await flush()
    expect(buttons('Exporting…')).toHaveLength(1)
    expect(buttons('Export JSON')[0].disabled).toBe(true)
  })

  it('shows each file with its current status and the history with superseded marks', async () => {
    mount(LinkReviewPanel, { state: { ...state, approver: { user_id: 5, name: 'Dana Client' } }, linkAccessMode: 'restricted', users })
    await flush()
    const rows = [...host.querySelectorAll('tbody tr')].map(r => r.textContent)
    expect(rows[0]).toContain('cut.mp4')
    expect(rows[0]).toContain('v2')
    expect(rows[0]).toContain('Awaiting approval')
    expect(rows[1]).toContain('Changes requested')
    const history = host.querySelector('.flow-list').textContent
    expect(history).toContain('Fix p2')
    expect(history).toContain('Superseded')
    expect(history).toContain('Approved')
  })

  it('does not claim a file is awaiting approval when nobody can approve it', async () => {
    mount(LinkReviewPanel, { state, linkAccessMode: 'restricted', users })
    await flush()
    const first = host.querySelector('tbody tr').textContent
    expect(first).not.toContain('Awaiting approval')
    expect(first).toContain('—')
  })

  it('shows the approver read-only and asks to change it', async () => {
    const onChangeApprover = vi.fn()
    mount(LinkReviewPanel, { state: { ...state, approver: { user_id: 5, name: 'Dana Client' } }, linkAccessMode: 'restricted', users, onChangeApprover })
    await flush()
    expect(host.querySelector('select')).toBeNull()
    expect(host.textContent).toContain('Dana Client')
    buttons('Change')[0].click()
    expect(onChangeApprover).toHaveBeenCalled()
  })

  it('offers Choose when no approver is set', async () => {
    const onChangeApprover = vi.fn()
    mount(LinkReviewPanel, { state, linkAccessMode: 'restricted', users, onChangeApprover })
    await flush()
    expect(host.textContent).toContain('No approver')
    buttons('Choose')[0].click()
    expect(onChangeApprover).toHaveBeenCalled()
  })

  it('explains that open links cannot collect approvals', async () => {
    const onEdit = vi.fn()
    mount(LinkReviewPanel, { state: { ...state, accessMode: 'open' }, linkAccessMode: 'open', users, onEdit })
    await flush()
    expect(host.textContent).toContain('Approvals need an invite-only link')
    expect(buttons('Choose')).toHaveLength(0)
    buttons('Edit link')[0].click()
    expect(onEdit).toHaveBeenCalled()
  })

  it('flags an approver who is no longer invited', async () => {
    mount(LinkReviewPanel, {
      state: { ...state, approver: { user_id: 99, name: 'Gone Person', user_name: 'gone' } },
      linkAccessMode: 'restricted', users,
    })
    await flush()
    expect(host.textContent).toContain('Gone Person')
    expect(host.textContent).toContain('no longer invited')
  })
})

describe('LinkEmailsPanel', () => {
  const row = (over) => ({
    id: 1, kind: 'invitation', recipientEmail: 'a@x.test', status: 'accepted', attemptCount: 1,
    createdAt: '2026-11-09 10:00:00', updatedAt: '2026-11-09 10:00:00',
    mail: { configured: true, sent: true, message: '' }, ...over,
  })

  it('lists every kind of email with guide words and only offers Retry where the server allows it', async () => {
    const apiFetch = vi.fn().mockResolvedValue({
      ok: true,
      owner: { id: 3, name: 'Owner', hasEmail: true },
      emails: [
        row({ id: 1 }),
        row({ id: 2, kind: 'download', status: 'rejected' }),
        row({ id: 3, kind: 'review', status: 'timeout' }),
      ],
    })
    mount(LinkEmailsPanel, { linkId: 42, apiFetch })
    await flush()
    expect(apiFetch).toHaveBeenCalledWith('/api/links/42/emails')
    const rows = [...host.querySelectorAll('tbody tr')].map(r => r.textContent)
    expect(rows[0]).toContain('Invitation')
    expect(rows[0]).toContain('Sent')
    expect(rows[1]).toContain('Download alert')
    expect(rows[1]).toContain('Failed')
    expect(rows[2]).toContain('Review decision')
    expect(rows[2]).toContain('Unconfirmed')
    expect(buttons('Retry')).toHaveLength(2)
    expect(host.textContent).not.toContain("aren't emailed")
  })

  it('retries the exact email and shows the new status', async () => {
    const apiFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, owner: { id: 3, name: 'Owner', hasEmail: true }, emails: [row({ id: 7, status: 'rejected' })] })
      .mockResolvedValueOnce({ ok: true, invitation: { ...row({ id: 7 }), status: 'accepted', attemptCount: 2 } })
    mount(LinkEmailsPanel, { linkId: 42, apiFetch })
    await flush()
    buttons('Retry')[0].click()
    await flush()
    expect(apiFetch).toHaveBeenLastCalledWith('/api/links/42/invite/7/retry', { method: 'POST', retry: 0 })
    expect(host.querySelector('tbody tr').textContent).toContain('Sent')
    expect(host.querySelector('tbody tr').textContent).toContain('2 tries')
  })

  it('warns when nobody on the team can get alerts, even with no emails yet', async () => {
    const apiFetch = vi.fn().mockResolvedValue({ ok: true, owner: null, emails: [] })
    mount(LinkEmailsPanel, { linkId: 42, apiFetch })
    await flush()
    expect(host.textContent).toContain("isn't tied to a 45Flow account with an email address")
    expect(host.textContent).toContain('Settings → Email')
  })

  it('does not warn when staff alert addresses are set', async () => {
    const apiFetch = vi.fn().mockResolvedValue({ ok: true, owner: null, emails: [], staffAlertCount: 2 })
    mount(LinkEmailsPanel, { linkId: 42, apiFetch })
    await flush()
    expect(host.textContent).not.toContain("aren't emailed")
  })

  it('stays hidden on servers without the route', async () => {
    const apiFetch = vi.fn().mockRejectedValue(Object.assign(new Error('Not found'), { status: 404 }))
    mount(LinkEmailsPanel, { linkId: 42, apiFetch })
    await flush()
    expect(host.textContent.trim()).toBe('')
  })
})
