// useWebSocketManager.ts
// WebSocket manager for real-time progress updates
// Manages one WebSocket per server connection

import { ref, watch } from 'vue'
import { useConnections } from './useConnections'
import type { Connection } from './useConnections'

interface WebSocketConnection {
  connectionId: string
  ws: WebSocket
  status: 'connecting' | 'open' | 'closed' | 'error'
  subscriptions: Set<string> // Set of "channel:id"
  reconnectTimeout?: number
  reconnectAttempts: number
  authFailed?: boolean  // Track auth failures to prevent reconnect loops
  everOpened?: boolean  // Track if connection ever succeeded (to detect 404s)
}

// Map<connectionId, WebSocketConnection>
const wsConnections = new Map<string, WebSocketConnection>()

// Callback registry for progress updates
// Map<"connectionId:channel:id", Set<callback>>
const updateCallbacks = new Map<string, Set<(data: any) => void>>()

// Track connections that failed authentication to prevent reconnection loops
const authFailedConnections = new Set<string>()

const MAX_RECONNECT_ATTEMPTS = 5
const RECONNECT_DELAY_MS = 3000

/**
 * Generate callback key for routing updates
 */
function makeCallbackKey(connectionId: string, channel: string, id: number | string) {
  return `${connectionId}:${channel}:${id}`
}

/**
 * Register a callback for progress updates
 */
function registerCallback(connectionId: string, channel: string, id: number | string, callback: (data: any) => void) {
  const key = makeCallbackKey(connectionId, channel, id)
  if (!updateCallbacks.has(key)) {
    updateCallbacks.set(key, new Set())
  }
  updateCallbacks.get(key)!.add(callback)
}

/**
 * Unregister a callback
 */
function unregisterCallback(connectionId: string, channel: string, id: number | string, callback: (data: any) => void) {
  const key = makeCallbackKey(connectionId, channel, id)
  const callbacks = updateCallbacks.get(key)
  if (callbacks) {
    callbacks.delete(callback)
    if (callbacks.size === 0) {
      updateCallbacks.delete(key)
    }
  }
}

/**
 * Dispatch update to registered callbacks
 */
function dispatchUpdate(connectionId: string, channel: string, id: number | string, data: any) {
  const key = makeCallbackKey(connectionId, channel, id)
  const callbacks = updateCallbacks.get(key)
  if (!callbacks) return
  
  for (const cb of callbacks) {
    try {
      cb(data)
    } catch (err) {
      console.warn('[ws] callback error:', err)
    }
  }
}

/**
 * Connect to a server's WebSocket endpoint
 */
function connect(connection: Connection) {
  const { connectionId, baseUrl, token } = connection
  
  // Don't connect if this connection previously failed auth
  if (authFailedConnections.has(connectionId)) {
    console.warn('[ws] skipping connection - previous auth failure:', connection.name)
    return
  }
  
  // Don't reconnect if already connected
  const existing = wsConnections.get(connectionId)
  if (existing && existing.status === 'open') {
    return existing
  }
  
  // Close existing connection if present
  if (existing) {
    existing.ws.close()
    wsConnections.delete(connectionId)
  }
  
  const wsUrl = baseUrl.replace(/^http/, 'ws') + '/api/ws'
  
  try {
    const ws = new WebSocket(wsUrl)
    
    const wsConn: WebSocketConnection = {
      connectionId,
      ws,
      status: 'connecting',
      subscriptions: new Set(),
      reconnectAttempts: 0
    }
    
    wsConnections.set(connectionId, wsConn)
    
    ws.onopen = () => {
      wsConn.status = 'open'
      wsConn.reconnectAttempts = 0
      wsConn.everOpened = true  // Mark that connection succeeded at least once
      
      // Authenticate
      ws.send(JSON.stringify({ 
        type: 'auth', 
        token 
      }))
      
      console.log('[ws] connected to', connection.name, connection.serverIp)
    }
    
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        
        if (msg.type === 'auth_ok') {
          console.log('[ws] authenticated:', msg.username)
          
          // Re-subscribe to all channels after reconnect
          for (const sub of wsConn.subscriptions) {
            const [channel, id] = sub.split(':')
            ws.send(JSON.stringify({
              type: 'subscribe',
              channel,
              id: Number(id) || id
            }))
          }
          return
        }
        
        if (msg.type === 'auth_error') {
          console.error('[ws] auth failed:', msg.message)
          wsConn.authFailed = true
          authFailedConnections.add(connectionId)  // Prevent future reconnection attempts
          ws.close()
          return
        }
        
        if (msg.type === 'subscribed') {
          console.log('[ws] subscribed to', msg.channel, msg.id)
          return
        }
        
        if (msg.type === 'unsubscribed') {
          console.log('[ws] unsubscribed from', msg.channel, msg.id)
          return
        }
        
        if (msg.type === 'error') {
          console.warn('[ws] server error:', msg.message)
          return
        }
        
        if (msg.type === 'pong') {
          // Heartbeat response
          return
        }
        
        // Progress update message
        if (msg.channel && msg.id != null && msg.data) {
          dispatchUpdate(connectionId, msg.channel, msg.id, msg.data)
        }
      } catch (err) {
        console.warn('[ws] message parse error:', err)
      }
    }
    
    ws.onerror = (err) => {
      console.warn('[ws] error:', connection.name, err)
      wsConn.status = 'error'
    }
    
    ws.onclose = () => {
      wsConn.status = 'closed'
      wsConnections.delete(connectionId)
      
      // Don't reconnect if auth failed (token expired/invalid)
      if (wsConn.authFailed) {
        console.warn('[ws] not reconnecting - authentication failed for', connection.name)
        return
      }
      
      // Don't reconnect if connection never opened (404, connection refused, etc.)
      if (!wsConn.everOpened && wsConn.reconnectAttempts === 0) {
        console.warn('[ws] not reconnecting - server does not support WebSocket for', connection.name)
        authFailedConnections.add(connectionId)  // Prevent future attempts
        return
      }
      
      // Auto-reconnect with exponential backoff
      if (wsConn.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        wsConn.reconnectAttempts++
        const delay = RECONNECT_DELAY_MS * Math.pow(2, wsConn.reconnectAttempts - 1)
        
        console.log(`[ws] reconnecting to ${connection.name} in ${delay}ms (attempt ${wsConn.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`)
        
        wsConn.reconnectTimeout = window.setTimeout(() => {
          connect(connection)
        }, delay)
      } else {
        console.warn('[ws] max reconnect attempts reached for', connection.name)
      }
    }
    
    return wsConn
  } catch (err) {
    console.error('[ws] connection failed:', connection.name, err)
    return null
  }
}

/**
 * Disconnect from a server's WebSocket
 */
function disconnect(connectionId: string) {
  const wsConn = wsConnections.get(connectionId)
  if (!wsConn) return
  
  if (wsConn.reconnectTimeout) {
    clearTimeout(wsConn.reconnectTimeout)
  }
  
  wsConn.ws.close()
  wsConnections.delete(connectionId)
  authFailedConnections.delete(connectionId)  // Clear auth failure flag on manual disconnect
  
  console.log('[ws] disconnected:', connectionId)
}

/**
 * Subscribe to progress updates for a specific task
 */
function subscribe(
  connectionId: string,
  channel: 'transcode' | 'upload',
  id: number,
  callback: (data: any) => void
) {
  const wsConn = wsConnections.get(connectionId)
  
  if (!wsConn || wsConn.status !== 'open') {
    // WebSocket not available - caller should fallback to polling
    return false
  }
  
  const key = `${channel}:${id}`
  wsConn.subscriptions.add(key)
  registerCallback(connectionId, channel, id, callback)
  
  wsConn.ws.send(JSON.stringify({
    type: 'subscribe',
    channel,
    id
  }))
  
  return true
}

/**
 * Unsubscribe from progress updates
 */
function unsubscribe(
  connectionId: string,
  channel: 'transcode' | 'upload',
  id: number,
  callback: (data: any) => void
) {
  const wsConn = wsConnections.get(connectionId)
  
  if (!wsConn) return
  
  const key = `${channel}:${id}`
  wsConn.subscriptions.delete(key)
  unregisterCallback(connectionId, channel, id, callback)
  
  if (wsConn.status === 'open') {
    wsConn.ws.send(JSON.stringify({
      type: 'unsubscribe',
      channel,
      id
    }))
  }
}

/**
 * Get WebSocket connection status
 */
function getStatus(connectionId: string): 'disconnected' | 'connecting' | 'open' | 'error' {
  const wsConn = wsConnections.get(connectionId)
  return wsConn?.status || 'disconnected'
}

/**
 * Clear auth failure flag for a connection (e.g., after successful re-login)
 */
function clearAuthFailure(connectionId: string) {
  authFailedConnections.delete(connectionId)
  console.log('[ws] cleared auth failure flag for:', connectionId)
}

/**
 * Get stats for all WebSocket connections
 */
function getStats() {
  return Array.from(wsConnections.entries()).map(([id, conn]) => ({
    connectionId: id,
    status: conn.status,
    subscriptions: conn.subscriptions.size,
    reconnectAttempts: conn.reconnectAttempts
  }))
}

export function useWebSocketManager() {
  const { connections, activeConnection } = useConnections()
  
  // Track which connections we've already tried to connect
  const attemptedConnections = new Set<string>()
  
  // Auto-connect to active connection when it changes
  watch(activeConnection, (conn) => {
    if (conn && conn.token) {
      connect(conn)
    }
  }, { immediate: true })
  
  // Auto-connect to new connections and handle token changes
  // Watch array length and individual connection tokens only (not deep)
  watch(() => connections.map(c => ({ id: c.connectionId, token: c.token })), (current, previous) => {
    for (const { id, token } of current) {
      if (!token) continue
      
      const conn = connections.find(c => c.connectionId === id)
      if (!conn) continue
      
      // Find previous version
      const prev = previous?.find(p => p.id === id)
      
      // If token changed, clear auth failure and reconnect
      if (prev && prev.token !== token) {
        console.log('[ws] token changed for', conn.name, '- clearing auth failure and reconnecting')
        clearAuthFailure(id)
        connect(conn)
        continue
      }
      
      // If this is a new connection we haven't tried yet, attempt connection
      if (!prev && !attemptedConnections.has(id)) {
        attemptedConnections.add(id)
        connect(conn)
      }
    }
  }, { immediate: true })
  
  return {
    connect,
    disconnect,
    subscribe,
    unsubscribe,
    clearAuthFailure,
    getStatus,
    getStats
  }
}
