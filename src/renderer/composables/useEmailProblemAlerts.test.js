import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const pushed = vi.hoisted(() => [])
vi.mock('@45drives/houston-common-ui', () => ({
  pushNotification: (n) => pushed.push(n),
  Notification: function Notification(title, body, level) { Object.assign(this, { title, body, level }) },
}))

import { startEmailProblemAlerts, describeEmailProblems } from './useEmailProblemAlerts'

const flush = () => new Promise(r => setTimeout(r, 0))
const row = (id, extra = {}) => ({ id, kind: 'invitation', recipientEmail: `c${id}@x.test`, linkTitle: 'Spot', status: 'rejected', ...extra })

beforeEach(() => { pushed.length = 0; localStorage.clear() })
afterEach(() => vi.useRealTimers())

describe('email problem alerts', () => {
  it('notifies once per new problem and remembers what it reported per server', async () => {
    const apiFetch = vi.fn(async () => ({ emails: [row(1)] }))
    const stop = startEmailProblemAlerts(apiFetch, 'srv-a', { intervalMs: 60_000 })
    await flush()
    stop()
    expect(apiFetch).toHaveBeenCalledWith('/api/emails/problems', { retry: 0 })
    expect(pushed).toHaveLength(1)
    expect(pushed[0].title).toBe('Email not delivered')
    expect(pushed[0].body).toBe('An invitation to c1@x.test for “Spot” wasn\'t delivered. See Settings → Email to retry.')

    // Reopening the app: same problem, no repeat. A new one is reported.
    const again = startEmailProblemAlerts(vi.fn(async () => ({ emails: [row(1), row(2, { kind: 'download' })] })), 'srv-a')
    await flush()
    again()
    expect(pushed).toHaveLength(2)
    expect(pushed[1].body).toContain('download alert to c2@x.test')

    // Another server keeps its own list.
    const other = startEmailProblemAlerts(vi.fn(async () => ({ emails: [row(1)] })), 'srv-b')
    await flush()
    other()
    expect(pushed).toHaveLength(3)
  })

  it('checks again on its interval and stops for servers without the route', async () => {
    vi.useFakeTimers()
    const apiFetch = vi.fn(async () => ({ emails: [] }))
    const stop = startEmailProblemAlerts(apiFetch, 'srv-c', { intervalMs: 1000 })
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(1000)
    expect(apiFetch).toHaveBeenCalledTimes(2)
    stop()
    await vi.advanceTimersByTimeAsync(5000)
    expect(apiFetch).toHaveBeenCalledTimes(2)

    const old = vi.fn(async () => { throw Object.assign(new Error('nope'), { status: 404 }) })
    startEmailProblemAlerts(old, 'srv-d', { intervalMs: 1000 })
    await vi.advanceTimersByTimeAsync(5000)
    expect(old).toHaveBeenCalledTimes(1)
    expect(pushed).toHaveLength(0)
  })

  it('summarises several problems in one line', () => {
    expect(describeEmailProblems([row(1), row(2), row(3)])).toBe("3 emails weren't delivered. See Settings → Email to retry.")
  })
})
