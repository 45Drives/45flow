// useServerFilter.ts
// Global server filter state - persists across sessions
// Determines which servers' data to show in aggregated views

import { ref, computed, watch } from 'vue'
import { useConnections } from './useConnections'

const STORAGE_KEY = '45flow_server_filter_v1'

// Filter mode: 'all' or a specific connectionId
const selectedFilter = ref<'all' | string>('all')

/**
 * Load filter from localStorage
 */
function loadFilter() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      selectedFilter.value = saved
    }
  } catch (err) {
    console.warn('[server-filter] load failed:', err)
  }
}

/**
 * Save filter to localStorage
 */
function saveFilter() {
  try {
    localStorage.setItem(STORAGE_KEY, selectedFilter.value)
  } catch (err) {
    console.warn('[server-filter] save failed:', err)
  }
}

// Load on module init
loadFilter()

// Auto-save when filter changes
watch(selectedFilter, saveFilter)

export function useServerFilter() {
  const { connections, activeConnection } = useConnections()
  
  /**
   * Set filter to 'all' or a specific connectionId
   */
  function setFilter(filter: 'all' | string) {
    selectedFilter.value = filter
  }
  
  /**
   * Filtered list of connections based on current filter
   * Returns all connections if filter is 'all', otherwise just the selected one
   */
  const filteredConnections = computed(() => {
    if (selectedFilter.value === 'all') {
      return connections.filter(c => c.status === 'connected')
    }
    
    const conn = connections.find(c => c.connectionId === selectedFilter.value)
    return conn && conn.status === 'connected' ? [conn] : []
  })
  
  /**
   * All connected servers (for fetching data from multiple servers)
   */
  const allConnectedServers = computed(() => {
    return connections.filter(c => c.status === 'connected')
  })
  
  /**
   * Current filter display name
   */
  const filterDisplayName = computed(() => {
    if (selectedFilter.value === 'all') {
      return 'All Servers'
    }
    
    const conn = connections.find(c => c.connectionId === selectedFilter.value)
    return conn?.name || 'Unknown Server'
  })
  
  /**
   * Validate filter - if selected server no longer exists, reset to 'all'
   */
  watch(connections, (conns) => {
    if (selectedFilter.value !== 'all') {
      const exists = conns.find(c => c.connectionId === selectedFilter.value)
      if (!exists) {
        console.log('[server-filter] selected server removed, resetting to all')
        selectedFilter.value = 'all'
      }
    }
  }, { deep: true })
  
  return {
    selectedFilter,
    setFilter,
    filteredConnections,
    allConnectedServers,
    filterDisplayName
  }
}
