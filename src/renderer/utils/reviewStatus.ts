// Words and tones for C2 review decisions, shared by the app's review screens
// and matching the share page (docs/track-c-ui-guide.md, "Version decision").

export type ReviewDecision = 'approved' | 'changes_requested' | 'rejected'
export type ReviewState = ReviewDecision | 'pending' | 'superseded'
export type ReviewTone = 'info' | 'success' | 'warning' | 'danger' | 'muted'

export function reviewStateView(state: ReviewState | string): { label: string; tone: ReviewTone; dot: boolean } {
  switch (state) {
    case 'approved': return { label: 'Approved', tone: 'success', dot: true }
    case 'changes_requested': return { label: 'Changes requested', tone: 'warning', dot: false }
    case 'rejected': return { label: 'Rejected', tone: 'danger', dot: false }
    case 'superseded': return { label: 'Superseded', tone: 'muted', dot: false }
    default: return { label: 'Awaiting approval', tone: 'info', dot: false }
  }
}

/** Rank of an all-approved link; anything lower still needs attention. */
export const REVIEW_APPROVED_RANK = 4

export type ReviewSummaryCounts = {
  hasApprover: boolean
  total: number
  pending: number
  approved: number
  changes_requested: number
  rejected: number
}

/**
 * One chip for a whole link in lists. Shows the state that most needs
 * attention: rejected, then changes requested, then waiting, then approved.
 * `rank` sorts the same way (lower = needs attention sooner). Null when the
 * link can't collect approvals or the server didn't send counts.
 */
export function reviewSummaryView(s: ReviewSummaryCounts | null | undefined):
  { label: string; tone: ReviewTone; dot: boolean; title: string; rank: number } | null {
  if (!s || !s.total) return null
  const parts = [
    s.approved && `${s.approved} approved`,
    s.pending && `${s.pending} awaiting approval`,
    s.changes_requested && `${s.changes_requested} with changes requested`,
    s.rejected && `${s.rejected} rejected`,
  ].filter(Boolean)
  const title = `${s.total === 1 ? '1 file' : `${s.total} files`}: ${parts.join(', ')}${s.hasApprover ? '' : '. No approver chosen.'}`
  if (s.rejected) return { label: `${s.rejected} rejected`, tone: 'danger', dot: false, title, rank: 0 }
  if (s.changes_requested) {
    return { label: s.changes_requested === 1 ? 'Needs changes' : `${s.changes_requested} need changes`, tone: 'warning', dot: false, title, rank: 1 }
  }
  if (s.pending) {
    return s.hasApprover
      ? { label: `${s.pending} awaiting`, tone: 'info', dot: false, title, rank: 2 }
      : { label: 'No approver', tone: 'muted', dot: false, title, rank: 3 }
  }
  return { label: 'Approved', tone: 'success', dot: true, title, rank: REVIEW_APPROVED_RANK }
}

/** SQLite's datetime('now') is UTC without a zone ("2026-11-09 18:30:56"); read it as UTC. */
export function parseServerTime(v: string | number | null | undefined): Date | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(v)) {
    const d = new Date(`${v.replace(' ', 'T')}Z`)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}
