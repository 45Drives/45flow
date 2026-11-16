// C3: tell staff when an email from any link wasn't delivered. Checks the
// server's cross-link problem list every few minutes and raises one
// notification (which also lands in the bell) for problems it hasn't
// reported before. Reported ids are remembered per server, so reopening the
// app doesn't repeat old ones; a problem that clears and comes back is new.
import { pushNotification, Notification } from '@45drives/houston-common-ui'

type ApiFetch = (url: string, opts?: any) => Promise<any>

type ProblemRow = {
  id: number
  kind?: string
  recipientEmail?: string
  linkTitle?: string | null
  linkId?: number
  status?: string
}

const KIND_WORDS: Record<string, string> = {
  invitation: 'invitation',
  download: 'download alert',
  review: 'review email',
}
const DEFAULT_INTERVAL_MS = 3 * 60 * 1000

function storageKey(connectionId: string) {
  return `45flow.emailProblemsReported.${connectionId}`
}

function readReported(connectionId: string): Set<number> {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey(connectionId)) || '[]')
    return new Set(Array.isArray(raw) ? raw.map(Number).filter(Number.isFinite) : [])
  } catch {
    return new Set()
  }
}

function writeReported(connectionId: string, ids: number[]) {
  try {
    localStorage.setItem(storageKey(connectionId), JSON.stringify(ids.slice(0, 500)))
  } catch { /* storage full or blocked: worst case we notify again */ }
}

export function describeEmailProblems(rows: ProblemRow[]): string {
  if (rows.length === 1) {
    const r = rows[0]!
    const what = KIND_WORDS[r.kind || ''] || 'email'
    const link = r.linkTitle ? ` for “${r.linkTitle}”` : ''
    const to = r.recipientEmail ? ` to ${r.recipientEmail}` : ''
    return `An ${what}${to}${link} wasn't delivered. See Settings → Email to retry.`
  }
  return `${rows.length} emails weren't delivered. See Settings → Email to retry.`
}

/**
 * Starts checking for undelivered email. Returns a stop function.
 * Quietly gives up on servers without the problems route (404).
 */
export function startEmailProblemAlerts(apiFetch: ApiFetch, connectionId: string, { intervalMs = DEFAULT_INTERVAL_MS } = {}) {
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | null = null

  async function check() {
    if (stopped) return
    try {
      const data = await apiFetch('/api/emails/problems', { retry: 0 })
      if (stopped) return
      const rows: ProblemRow[] = Array.isArray(data?.emails) ? data.emails : []
      const reported = readReported(connectionId)
      const fresh = rows.filter(r => !reported.has(Number(r.id)))
      if (fresh.length) {
        pushNotification(new Notification('Email not delivered', describeEmailProblems(fresh), 'warning', 10000))
      }
      writeReported(connectionId, rows.map(r => Number(r.id)))
    } catch (e: any) {
      if (e?.status === 404) { stopped = true; return }
      // Offline or signed out: try again next time.
    }
    if (!stopped) timer = setTimeout(check, intervalMs)
  }

  void check()
  return () => {
    stopped = true
    if (timer) clearTimeout(timer)
  }
}
