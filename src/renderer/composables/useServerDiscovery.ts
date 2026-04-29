// useServerDiscovery.ts
import { reactive, onMounted, onBeforeUnmount } from 'vue'
import type { Server } from '../types'
import { loadSavedManualServers } from './useSessionPersistence'

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

  onMounted(() => {
    window.electron?.ipcRenderer.on('discovered-servers', onDiscovered)
    setTimeout(runFallbackScanOnce, 1200)
  })

  onBeforeUnmount(() => {
    window.electron?.ipcRenderer.removeListener?.('discovered-servers', onDiscovered)
  })

  return { discoveryState }
}
