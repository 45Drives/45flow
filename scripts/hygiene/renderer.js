import { nextTick } from 'vue'
import { initializeConnections, useConnections, flushCredentialWrites } from '../../src/renderer/composables/useConnections'

const storageKey = '45flow_connections_v1'
const id = 'qa-primary'
const otherId = 'qa-secondary'

function check(condition, name, checks) {
  if (!condition) throw Object.assign(new Error(name), { qaCheck: name })
  checks.push(name)
}

function metadata(connectionId = id) {
  return {
    connectionId, name: 'Hygiene QA', serverIp: `${connectionId}.invalid`,
    baseUrl: 'https://hygiene-qa.invalid', username: 'synthetic-qa-user', apiPort: 9095,
    tokenIssuedAt: Date.now(), lastConnectedAt: Date.now(), isActive: true,
    status: 'connected', licensed: false, licenseFallback: false,
  }
}

function cleanStorage(checks) {
  const data = JSON.parse(localStorage.getItem(storageKey))
  check(data.connections.every(c => !('token' in c) && !('savedPassword' in c)),
    'Browser metadata has no token/password properties', checks)
  check(localStorage.getItem('hb_last_session_v1') === null, 'Legacy localStorage token removed', checks)
  check(sessionStorage.getItem('hb_token') === null, 'Legacy sessionStorage token removed', checks)
}

window.hygieneQa = {
  async run({ phase, secret, persistent }) {
    try {
      return await this.runPhase({ phase, secret, persistent })
    } catch (error) {
      return { failedCheck: error.qaCheck || 'Renderer credential operation failed' }
    }
  },
  async runPhase({ phase, secret, persistent }) {
    const checks = []
    const original = { token: `qa-token-${secret}`, savedPassword: `qa-password-${secret}` }
    if (phase === 'seed') {
      localStorage.setItem(storageKey, JSON.stringify({
        connections: [{ ...metadata(), ...original }], activeConnectionId: id, _migrated: true,
      }))
      localStorage.setItem('hb_last_session_v1', JSON.stringify({
        token: original.token, serverIp: metadata().serverIp, savedAt: Date.now(),
      }))
      sessionStorage.setItem('hb_token', original.token)
      checks.push('Seeded synthetic legacy credentials for next-process migration')
      return { checks }
    }

    await initializeConnections()
    const store = useConnections()
    const connection = store.getConnection(id)
    check(!!connection, 'Connection metadata restored after process restart', checks)
    check(connection.licensed === false, 'Unlicensed connection uses the same storage protection', checks)
    cleanStorage(checks)
    if (persistent) {
      check(!store.credentialStorageNotice.value, 'No secure-storage warning with usable backend', checks)
    } else {
      check(store.credentialStorageNotice.value.includes('only for this app session'),
        'Memory-only warning available to UI', checks)
    }

    if (phase === 'migrate') {
      check(connection.token === original.token && connection.savedPassword === original.savedPassword,
        'Legacy token and remembered password migrated into usable session', checks)
    } else if (phase === 'restore') {
      check(connection.token === (persistent ? original.token : ''),
        persistent ? 'Token survives full Electron process restart' : 'Token does not survive memory-only restart', checks)
      check(connection.savedPassword === (persistent ? original.savedPassword : undefined),
        persistent ? 'Remembered password survives restart' : 'Password does not survive memory-only restart', checks)
      store.updateConnection(id, { token: `qa-refreshed-${secret}`, savedPassword: undefined })
      await flushCredentialWrites()
      check(connection.token === `qa-refreshed-${secret}` && connection.savedPassword === undefined,
        'Token replacement and password opt-out applied', checks)
    } else if (phase === 'logout') {
      check(connection.token === (persistent ? `qa-refreshed-${secret}` : ''),
        'Replacement token restored with expected persistence policy', checks)
      check(connection.savedPassword === undefined, 'Password opt-out survives restart', checks)
      store.addConnection({ ...metadata(otherId), token: `qa-secondary-${secret}` })
      await flushCredentialWrites()
      await store.clearConnectionCredentials(id)
      checks.push('Explicit logout clears primary credentials')
    } else if (phase === 'remove') {
      check(connection.token === '' && connection.savedPassword === undefined,
        'Logout remains effective after process restart', checks)
      const other = store.getConnection(otherId)
      check(other?.token === (persistent ? `qa-secondary-${secret}` : ''),
        'Logging out one connection preserves the other according to storage policy', checks)
      store.removeConnection(otherId)
      await nextTick()
      await flushCredentialWrites()
      checks.push('Secondary connection removed')
    } else if (phase === 'final') {
      check(!connection.token && !connection.savedPassword, 'Logged-out connection cannot resume', checks)
      check(!store.getConnection(otherId), 'Removed connection stays removed after process restart', checks)
    } else {
      throw new Error('Unknown QA phase')
    }
    await nextTick()
    await flushCredentialWrites()
    cleanStorage(checks)
    return { checks }
  },
}
