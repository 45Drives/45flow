// useSessionPersistence.ts
// Persists manual servers and the last successful session so users
// don't have to re-enter connection details every time they open the app.

import type { Server, ConnectionMeta } from '../types'

const MANUAL_SERVERS_KEY = 'hb_saved_manual_servers_v1'
const LAST_SESSION_KEY  = 'hb_last_session_v1'

// ─── Manual-server persistence ───────────────────────────────────

export interface SavedManualServer {
  ip: string
  name: string
  savedAt: number
}

export function loadSavedManualServers(): SavedManualServer[] {
  try {
    const raw = localStorage.getItem(MANUAL_SERVERS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveManualServer(server: Pick<Server, 'ip' | 'name'>) {
  const list = loadSavedManualServers()
  const idx = list.findIndex(s => s.ip === server.ip)
  const entry: SavedManualServer = {
    ip: server.ip,
    name: server.name || server.ip,
    savedAt: Date.now(),
  }
  if (idx > -1) {
    list[idx] = entry
  } else {
    list.push(entry)
  }
  try { localStorage.setItem(MANUAL_SERVERS_KEY, JSON.stringify(list)) } catch { /* ignore */ }
}

export function removeSavedManualServer(ip: string) {
  const list = loadSavedManualServers().filter(s => s.ip !== ip)
  try { localStorage.setItem(MANUAL_SERVERS_KEY, JSON.stringify(list)) } catch { /* ignore */ }
}

// ─── Last-session persistence ────────────────────────────────────

export interface SavedSession {
  serverIp: string
  serverName: string
  username: string
  token: string
  apiPort: number
  sshPort?: number
  httpsPort?: number
  apiBase: string
  savedAt: number
}

export function loadLastSession(): SavedSession | null {
  try {
    const raw = localStorage.getItem(LAST_SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && parsed.serverIp && parsed.token) {
      return parsed as SavedSession
    }
    return null
  } catch {
    return null
  }
}

export function saveLastSession(session: SavedSession) {
  try { localStorage.setItem(LAST_SESSION_KEY, JSON.stringify(session)) } catch { /* ignore */ }
}

export function clearLastSession() {
  try { localStorage.removeItem(LAST_SESSION_KEY) } catch { /* ignore */ }
  try { sessionStorage.removeItem('hb_token') } catch { /* ignore */ }
}
