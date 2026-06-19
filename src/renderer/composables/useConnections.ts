// useConnections.ts
// Multi-server connection management
// Replaces singleton currentServer/connectionMeta with a collection of connections

import { reactive, computed, readonly, watch } from 'vue'
import type { Server } from '../../shared/types'

const { randomUUID } = window.crypto || { randomUUID: () => Date.now().toString(36) + Math.random().toString(36).slice(2) }

export interface Connection {
  // ── Identity ──
  connectionId: string              // UUID, stable across app restarts
  name: string                      // User-provided label (e.g., "Studio A", "Home Server")
  
  // ── Server Info ──
  serverIp: string                  // IP or hostname
  serverName?: string               // Advertised server name (from discovery or .well-known)
  baseUrl: string                   // Full API base (e.g., "https://box-a.protocase.local")
  
  // ── Auth ──
  username: string                  // Logged-in user
  token: string                     // JWT token (sensitive — encrypted at rest)
  tokenIssuedAt: number             // Timestamp for token refresh logic
  
  // ── Ports & SSH ──
  apiPort: number                   // Default 9095
  sshPort?: number                  // Default 22
  httpsPort?: number                // Default 443
  ssh?: {                           // SSH credentials for rsync uploads
    server: string
    username: string
    port: number
  }
  
  // ── Server Metadata (cached) ──
  serverInfo?: {
    moboMake: string
    moboModel: string
    serverModel: string
    aliasStyle: string
    chassisSize: string
  }
  setupComplete?: boolean
  
  // ── License Status (cached) ──
  licensed: boolean                 // Last known license state (false = unlicensed/basic mode)
  licenseCheckedAt?: number         // Timestamp of last check
  licenseInfo?: {                   // License details from server
    licenseId?: string
    perpetual?: boolean
    expiresAt?: string | null
    issuedAt?: string
    customerEmail?: string | null
    activatedAt?: string | null
    notes?: string | null
  }
  
  // ── Connection Health ──
  status: 'connected' | 'disconnected' | 'error' | 'checking'
  lastConnectedAt: number
  lastError?: string
  
  // ── UI State ──
  isActive: boolean                 // Currently selected connection
  isFavorite?: boolean              // Pin to top of list
}

interface ConnectionsState {
  connections: Connection[]
  activeConnectionId: string | null
  _migrated: boolean // Internal flag to track if old session was migrated
}

const STORAGE_KEY = '45flow_connections_v1'

// Global reactive state
const _state = reactive<ConnectionsState>({
  connections: [],
  activeConnectionId: null,
  _migrated: false
})

/**
 * Serialize connections to localStorage
 * Note: Tokens stored in plain text for now; will add encryption in future phase
 */
function persist() {
  try {
    const data = {
      connections: _state.connections,
      activeConnectionId: _state.activeConnectionId,
      _migrated: _state._migrated
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch (err) {
    console.warn('[connections] persist failed:', err)
  }
}

/**
 * Load connections from localStorage
 */
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    
    const data = JSON.parse(raw)
    if (!data || typeof data !== 'object') return
    
    if (Array.isArray(data.connections)) {
      // Ensure licensed field defaults to false for connections persisted before the field was required
      _state.connections = data.connections.map((c: any) => ({
        ...c,
        licensed: typeof c.licensed === 'boolean' ? c.licensed : false,
      }))
    }
    if (typeof data.activeConnectionId === 'string') {
      _state.activeConnectionId = data.activeConnectionId
    }
    if (typeof data._migrated === 'boolean') {
      _state._migrated = data._migrated
    }
  } catch (err) {
    console.warn('[connections] load failed:', err)
  }
}

/**
 * Migrate existing single-session storage to multi-connection model
 * NOTE: Migration creates connection but doesn't validate token.
 * Connect2Server auto-login will validate and remove if token is expired.
 */
function migrateExistingSession() {
  if (_state._migrated) return // Already migrated
  
  try {
    const oldSessionRaw = localStorage.getItem('hb_last_session_v1')
    if (!oldSessionRaw) {
      _state._migrated = true
      persist()
      return
    }
    
    const saved = JSON.parse(oldSessionRaw)
    if (!saved || !saved.serverIp || !saved.token) {
      _state._migrated = true
      persist()
      return
    }
    
    // Don't migrate if token is obviously stale (more than 7 days old)
    const tokenAge = Date.now() - (saved.savedAt || 0)
    const sevenDays = 7 * 24 * 60 * 60 * 1000
    if (tokenAge > sevenDays) {
      console.log('[connections] skipping migration: token too old')
      _state._migrated = true
      persist()
      return
    }
    
    const firstConnection: Connection = {
      connectionId: randomUUID(),
      name: saved.serverName || saved.serverIp,
      serverIp: saved.serverIp,
      serverName: saved.serverName,
      baseUrl: saved.apiBase || `http://${saved.serverIp}:${saved.apiPort || 9095}`,
      username: saved.username,
      token: saved.token,
      tokenIssuedAt: saved.savedAt || Date.now(),
      apiPort: saved.apiPort || 9095,
      sshPort: saved.sshPort,
      httpsPort: saved.httpsPort,
      ssh: {
        server: saved.serverIp,
        username: saved.username,
        port: saved.sshPort || 22
      },
      licensed: false,
      status: 'connected',
      lastConnectedAt: saved.savedAt || Date.now(),
      isActive: true
    }
    
    _state.connections.push(firstConnection)
    _state.activeConnectionId = firstConnection.connectionId
    _state._migrated = true
    
    persist()
    
    // Clear old storage
    localStorage.removeItem('hb_last_session_v1')
    sessionStorage.removeItem('hb_token')
    
    console.log('[connections] migrated existing session to multi-connection model')
  } catch (err) {
    console.warn('[connections] migration failed:', err)
    _state._migrated = true
    persist()
  }
}

// Initialize on module load
load()
migrateExistingSession()

// Auto-persist on changes
watch(() => _state.connections, persist, { deep: true })
watch(() => _state.activeConnectionId, persist)

export function useConnections() {
  const activeConnection = computed<Connection | null>(() => {
    if (!_state.activeConnectionId) return null
    return _state.connections.find(c => c.connectionId === _state.activeConnectionId) ?? null
  })
  
  const sortedConnections = computed<Connection[]>(() => {
    return [..._state.connections].sort((a, b) => {
      // Favorites first
      if (a.isFavorite && !b.isFavorite) return -1
      if (!a.isFavorite && b.isFavorite) return 1
      // Then by last connected (most recent first)
      return (b.lastConnectedAt || 0) - (a.lastConnectedAt || 0)
    })
  })
  
  function addConnection(conn: Connection): string {
    // Normalize for comparison
    const normalizedIp = conn.serverIp.trim().toLowerCase()
    const normalizedUsername = conn.username.trim().toLowerCase()
    
    // Check for duplicate connectionId
    const existingById = _state.connections.find(c => c.connectionId === conn.connectionId)
    if (existingById) {
      console.warn('[connections] connection with this ID already exists:', conn.connectionId)
      return existingById.connectionId
    }
    
    // Check for existing connection to same server+username (case-insensitive)
    const existingByServer = _state.connections.find(c => 
      c.serverIp.trim().toLowerCase() === normalizedIp && 
      c.username.trim().toLowerCase() === normalizedUsername
    )
    
    if (existingByServer) {
      console.log('[connections] updating existing connection:', {
        existing: { id: existingByServer.connectionId, name: existingByServer.name, ip: existingByServer.serverIp, user: existingByServer.username },
        new: { name: conn.name, ip: conn.serverIp, user: conn.username }
      })
      // Update existing connection with new token and metadata
      Object.assign(existingByServer, {
        ...conn,
        connectionId: existingByServer.connectionId, // Keep original ID
        isFavorite: existingByServer.isFavorite, // Preserve favorite status
      })
      _state.activeConnectionId = existingByServer.connectionId
      persist()
      return existingByServer.connectionId  // Return the existing ID
    }
    
    _state.connections.push(conn)
    
    // If this is the first connection, make it active
    if (_state.connections.length === 1) {
      _state.activeConnectionId = conn.connectionId
    }
    
    console.log('[connections] added new connection:', { id: conn.connectionId, name: conn.name, ip: conn.serverIp, user: conn.username })
    persist()
    return conn.connectionId  // Return the new ID
  }
  
  function removeConnection(connectionId: string) {
    const idx = _state.connections.findIndex(c => c.connectionId === connectionId)
    if (idx === -1) return
    
    const conn = _state.connections[idx]
    _state.connections.splice(idx, 1)
    
    // If we removed the active connection, switch to next available
    if (_state.activeConnectionId === connectionId) {
      _state.activeConnectionId = _state.connections.length > 0
        ? _state.connections[0].connectionId
        : null
    }
    
    console.log('[connections] removed:', conn.name, conn.serverIp)
  }
  
  function setActive(connectionId: string) {
    const conn = _state.connections.find(c => c.connectionId === connectionId)
    if (!conn) {
      console.warn('[connections] cannot set active: connection not found:', connectionId)
      return
    }
    
    // Mark previous active as inactive
    _state.connections.forEach(c => { c.isActive = false })
    
    // Mark new active
    conn.isActive = true
    _state.activeConnectionId = connectionId
    
    console.log('[connections] switched to:', conn.name, conn.serverIp)
  }
  
  function updateConnection(connectionId: string, updates: Partial<Connection>) {
    const conn = _state.connections.find(c => c.connectionId === connectionId)
    if (!conn) {
      console.warn('[connections] cannot update: connection not found:', connectionId)
      return
    }
    
    Object.assign(conn, updates)
  }
  
  function getConnection(connectionId: string): Connection | null {
    return _state.connections.find(c => c.connectionId === connectionId) ?? null
  }
  
  return {
    connections: readonly(_state.connections) as Readonly<Connection[]>,
    sortedConnections,
    activeConnectionId: readonly(computed(() => _state.activeConnectionId)),
    activeConnection,
    addConnection,
    removeConnection,
    setActive,
    updateConnection,
    getConnection
  }
}
