import { onBeforeUnmount } from 'vue'
import { attachIdleMonitor, type IdleMonitor } from '../web-idle'
import { createDesktopKeepalive } from '../desktop-session'
import { useConnections } from './useConnections'
import { useTransferProgress } from './useTransferProgress'
import { handleUnauthorized } from './useApi'

/** Keep desktop sessions alive while the user is active, and pick up rotated tokens. */
export function useDesktopSession() {
  const { connections, updateConnection } = useConnections()
  const transfer = useTransferProgress()
  let detach: (() => void) | null = null

  function start() {
    if (detach) return
    const keepalive = createDesktopKeepalive({
      connections: () => connections.map(c => ({ connectionId: c.connectionId, baseUrl: c.baseUrl, token: c.token, status: c.status })),
      transfersActive: () => transfer.hasActive.value,
      onToken: (connectionId, usedToken, newToken) => {
        const current = connections.find(c => c.connectionId === connectionId)
        // A login or sign-out that happened meanwhile wins over a late replacement.
        if (current && current.token === usedToken) updateConnection(connectionId, { token: newToken, tokenIssuedAt: Date.now() })
      },
      onSessionEnded: (connectionId, usedToken) => { void handleUnauthorized(connectionId, usedToken) },
    })
    const monitor: IdleMonitor = {
      userActivity: () => keepalive.userActivity(),
      apiActivity: () => {},
      tick: async () => {},
      stay: async () => keepalive.run(),
      stop: () => {},
    }
    detach = attachIdleMonitor(monitor, () => () => {})
  }

  function stop() {
    detach?.()
    detach = null
  }

  onBeforeUnmount(stop)
  return { start, stop }
}
