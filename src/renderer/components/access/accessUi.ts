// Small helpers shared by the Client Access screens (clients, teams, roles).

export function initials(name?: string | null, fallback = '?'): string {
  // Ignore punctuation such as "(Editor)" so it can't become an initial
  const parts = String(name || '').replace(/[^\p{L}\p{N}\s._-]+/gu, '').trim().split(/[\s._-]+/).filter(Boolean)
  if (!parts.length) return fallback
  const first = parts[0][0] || ''
  const last = parts.length > 1 ? parts[parts.length - 1][0] : (parts[0][1] || '')
  return (first + last).toUpperCase()
}

export function avatarStyle(color?: string | null) {
  return { '--flow-avatar-color': color || '#cbd5e1' }
}

export function randomPastel(): string {
  const h = Math.floor(Math.random() * 360)
  const s = 60 + Math.floor(Math.random() * 20)
  const l = 70 + Math.floor(Math.random() * 10)
  const H = h / 360, S = s / 100, L = l / 100
  const q = L < 0.5 ? L * (1 + S) : L + S - L * S
  const p = 2 * L - q
  const h2rgb = (t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  const toHex = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0')
  return `#${toHex(h2rgb(H + 1 / 3))}${toHex(h2rgb(H))}${toHex(h2rgb(H - 1 / 3))}`
}

export function normalizeHex(x?: string | null): string | undefined {
  const s = (x || '').trim()
  if (!s) return undefined
  const m = s.match(/^#?([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/)
  if (!m) return undefined
  const v = m[1]
  const full = v.length === 3 ? v.split('').map(c => c + c).join('') : v
  return `#${full.toLowerCase()}`
}

type RoleFlags = { id: number; name?: string | null; can_comment?: unknown; can_upload?: unknown }

// Role picked for an invitee with no saved default role. Review links get a
// role that can comment but not upload (the system "feedback" role).
export function pickLinkRoleId(roles: RoleFlags[], hint?: 'upload' | 'comment' | 'view' | null): number | null {
  if (!roles.length) return null
  const named = (n: string) => roles.find(r => r.name?.toLowerCase() === n)
  if (hint === 'upload') return (roles.find(r => r.can_upload) ?? roles[0]).id
  const reviewer = named('feedback') ?? roles.find(r => r.can_comment && !r.can_upload)
  if (reviewer) return reviewer.id
  if (hint === 'comment') return (roles.find(r => r.can_comment) ?? roles[0]).id
  return (named('viewer') ?? roles[0]).id
}

const USERNAME_MAX = 32

export function usernameFromName(name?: string | null): string {
  return String(name || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/\s+/)
    .map(word => word.replace(/[^a-z0-9_-]/g, ''))
    .filter(Boolean)
    .join('.')
    .slice(0, USERNAME_MAX)
    .replace(/[.]+$/, '')
}

export const ROLE_PERMISSIONS = [
  { key: 'can_view', api: 'view', label: 'View', help: 'Open the link and play or preview files.' },
  { key: 'can_comment', api: 'comment', label: 'Comment', help: 'Leave comments and review notes.' },
  { key: 'can_download', api: 'download', label: 'Download', help: 'Download the original files.' },
  { key: 'can_upload', api: 'upload', label: 'Upload', help: 'Send files to you through the link.' },
] as const
