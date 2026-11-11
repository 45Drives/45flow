// Shared rules for the email fields that send a link: what counts as an address,
// how a typed list is split, and who on a link can be emailed.

export const EMAIL_RE = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/

export type InvitePerson = { name?: string | null; user_name?: string | null; email?: string | null }
export type InvitePersonRow = { key: string; name: string; email: string | null }

export function normalizeEmail(raw: string) {
  return raw.trim().toLowerCase()
}

/** Split "a@x.com, b@y.com; c@z.com" (commas, semicolons, spaces, new lines). */
export function splitAddresses(text: string) {
  return text.split(/[\s,;]+/).map(e => e.trim()).filter(Boolean)
}

export function invalidAddresses(text: string) {
  return splitAddresses(text).filter(e => !EMAIL_RE.test(e))
}

/** One row per person, deduplicated by email; people without a usable address keep a row so the list is honest. */
export function invitePeopleRows(people: InvitePerson[] | null | undefined): InvitePersonRow[] {
  const rows: InvitePersonRow[] = []
  const seen = new Set<string>()
  for (const [i, p] of (people || []).entries()) {
    const email = p.email && EMAIL_RE.test(p.email.trim()) ? normalizeEmail(p.email) : null
    const key = email || `no-email-${i}`
    if (seen.has(key)) continue
    seen.add(key)
    rows.push({ key, name: (p.name || p.user_name || email || 'Unnamed').trim(), email })
  }
  return rows
}

/** Ticked people first, then typed addresses; normalized and deduplicated. */
export function collectRecipients(rows: InvitePersonRow[], selected: Set<string>, typed: string) {
  const out: string[] = []
  const seen = new Set<string>()
  for (const r of rows) {
    if (r.email && selected.has(r.email) && !seen.has(r.email)) {
      seen.add(r.email)
      out.push(r.email)
    }
  }
  for (const raw of splitAddresses(typed)) {
    if (!EMAIL_RE.test(raw)) continue
    const email = normalizeEmail(raw)
    if (seen.has(email)) continue
    seen.add(email)
    out.push(email)
  }
  return out
}
