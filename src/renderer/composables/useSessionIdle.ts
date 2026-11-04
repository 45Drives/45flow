import { ref } from 'vue'
import { Notification, pushNotification } from '@45drives/houston-common-ui'
import { useConnections } from './useConnections'
import { attachIdleMonitor, createIdleMonitor, type IdleMonitor } from '../web-idle'
import { checkSessionIdle, getWebSession, keepSessionAlive, onApiActivity } from '../web-session'

// Seconds left while the "Stay signed in" prompt is showing, otherwise null.
const secondsLeft = ref<number | null>(null)
let monitor: IdleMonitor | null = null
let detach: (() => void) | null = null

const SIGNED_OUT_MESSAGE = 'You were signed out after a period of inactivity. Please sign in again.'

/** Idle handling for browser sessions: keepalive while active, warning before sign-out. */
export function useSessionIdle() {
  function stop() {
    detach?.()
    detach = null
    monitor = null
    secondsLeft.value = null
  }

  // Dropping the token sends the app back to the sign-in view (see AppShell).
  function signOutLocally() {
    const { activeConnection, updateConnection } = useConnections()
    const connection = activeConnection.value
    if (connection) {
      updateConnection(connection.connectionId, { token: '', savedPassword: undefined, status: 'disconnected', lastError: SIGNED_OUT_MESSAGE })
    }
    pushNotification(new Notification('Signed out', SIGNED_OUT_MESSAGE, 'warning', 10000))
  }

  function start() {
    const session = getWebSession()
    if (monitor || !session?.idleTimeoutSeconds) return
    monitor = createIdleMonitor({
      idleSeconds: session.idleTimeoutSeconds,
      keepAlive: keepSessionAlive,
      checkIdle: checkSessionIdle,
      onWarning: (seconds) => { secondsLeft.value = seconds },
      onExpired: () => { stop(); signOutLocally() },
    })
    detach = attachIdleMonitor(monitor, onApiActivity)
  }

  return { secondsLeft, start, stop, stay: () => monitor?.stay() }
}
