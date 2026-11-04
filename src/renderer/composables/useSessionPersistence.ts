// useSessionPersistence.ts
// Persists manual servers and the last successful session so users
// don't have to re-enter connection details every time they open the app.

import type { Server } from '../types'
import { useConnections } from './useConnections'

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

// ─── In-memory compatibility view of the securely restored session ──

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
  const connection = useConnections().activeConnection.value
  if (!connection?.token) return null
  return {
    serverIp: connection.serverIp,
    serverName: connection.serverName || connection.name,
    username: connection.username,
    token: connection.token,
    apiPort: connection.apiPort,
    sshPort: connection.sshPort,
    httpsPort: connection.httpsPort,
    apiBase: connection.baseUrl,
    savedAt: connection.tokenIssuedAt,
  }
}

export function clearLastSession() {
  try { localStorage.removeItem(LAST_SESSION_KEY) } catch { /* ignore */ }
  try { sessionStorage.removeItem('hb_token') } catch { /* ignore */ }
}

// ─── License-based registry discovery ────────────────────

const REGISTRY_LICENSE_KEY = 'hb_registry_license_v1'

export function loadRegistryLicenseId(): string | null {
  try {
    return localStorage.getItem(REGISTRY_LICENSE_KEY) || null
  } catch {
    return null
  }
}

export function saveRegistryLicenseId(licenseId: string) {
  try { localStorage.setItem(REGISTRY_LICENSE_KEY, licenseId) } catch { /* ignore */ }
}
