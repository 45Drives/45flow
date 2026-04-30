// useServerDiscovery.ts
import { reactive, onMounted, onBeforeUnmount } from 'vue'
import type { Server } from '../types'
import { loadSavedManualServers, loadRegistryLicenseId } from './useSessionPersistence'

const LICENSE_SERVER_URL = 'https://studio-license.45d.io'

export function useServerDiscovery() {
  const discoveryState = reactive<{ servers: Server[]; fallbackTriggered: boolean }>({
    servers: [],
    fallbackTriggered: false,
  })

  // Pre-populate with any manually-saved servers from previous sessions
  const savedManual = loadSavedManualServers()
  for (const s of savedManual) {
    discoveryState.servers.push({
      ip: s.ip,
      name: s.name || s.ip,
      lastSeen: s.savedAt,
      status: 'unknown',
      manuallyAdded: true,
    })
  }

  function mergeServer(server: Server) {
    const idx = discoveryState.servers.findIndex(s => s.ip === server.ip)
    if (idx > -1) {
      const current = discoveryState.servers[idx]
      // Don't overwrite a real hostname with an IP
      const hasRealHostname = server.name && server.name !== server.ip
      const updated = {
        ...current, ...server,
        name: hasRealHostname ? server.name : current.name,
        fallbackAdded: server.fallbackAdded ?? (hasRealHostname ? false : current.fallbackAdded),
      }
      discoveryState.servers.splice(idx, 1, updated)
    } else {
      discoveryState.servers.push(server)
    }
  }

  function sortServers() {
    discoveryState.servers.sort((a, b) => {
      if (a.name === a.ip && b.name !== b.ip) return 1
      if (a.name !== a.ip && b.name === b.ip) return -1
      return 0
    })
  }

  function onDiscovered(_evt:any, mdnsList: Server[]) {
    mdnsList.forEach(m => mergeServer(m))
    sortServers()
  }

  async function runFallbackScanOnce() {
    if (discoveryState.fallbackTriggered) return
    discoveryState.fallbackTriggered = true
    try {
      const fallback: Server[] = await window.electron.ipcRenderer.invoke('scan-network-fallback')
      const toAdd = fallback.filter(fb => !discoveryState.servers.some(existing => existing.ip === fb.ip))
      if (toAdd.length) {
        discoveryState.servers.push(...toAdd)
      }
    } catch (err) {
      console.error('Fallback scan failed:', err)
    }
  }

  /** Query VPS registry for servers on the same license */
  async function queryRegistryServers() {
    try {
      const licenseId = loadRegistryLicenseId()
      if (!licenseId) return

      const resp = await fetch(`${LICENSE_SERVER_URL}/api/servers/discover`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ licenseId }),
        signal: AbortSignal.timeout(8000),
      })
      if (!resp.ok) return

      const data = await resp.json()
      if (!data?.ok || !Array.isArray(data.servers)) return

      for (const entry of data.servers) {
        // Each entry has ips[] — add each IP as a discoverable server
        const ips: string[] = Array.isArray(entry.ips) ? entry.ips : []
        for (const ip of ips) {
          mergeServer({
            ip,
            name: entry.serverName || ip,
            status: 'unknown',
            lastSeen: entry.lastSeen || Date.now(),
            setupComplete: entry.setupComplete,
            serverName: entry.serverName || ip,
            serverInfo: entry.info || {},
            manuallyAdded: false,
            fallbackAdded: false,
            registryDiscovered: true,
          } as Server)
        }
      }
      sortServers()
    } catch (err) {
      console.error('Registry discovery failed:', err)
    }
  }

  onMounted(() => {
    window.electron?.ipcRenderer.on('discovered-servers', onDiscovered)
    // Query VPS registry first (fast, works cross-subnet), then local fallback scan
    queryRegistryServers()
    setTimeout(runFallbackScanOnce, 1200)
  })

  onBeforeUnmount(() => {
    window.electron?.ipcRenderer.removeListener?.('discovered-servers', onDiscovered)
  })

  return { discoveryState }
}
