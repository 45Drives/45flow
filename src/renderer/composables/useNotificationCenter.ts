import { ref, computed, watch } from 'vue'
import {
  Notification,
  notificationList,
} from '@45drives/houston-common-ui'

export interface NotificationHistoryItem {
  id: symbol
  title: string
  body: string
  level: string
  timestamp: number
  read: boolean
}

const MAX_VISIBLE = 3
const history = ref<NotificationHistoryItem[]>([])
const unreadCount = computed(() => history.value.filter(h => !h.read).length)
const bellOpen = ref(false)
const _seenKeys = new Set<symbol>()
let _initialized = false

/**
 * Initialize the notification center. Call once at app startup.
 * Watches the global notificationList and:
 * 1. Records new notifications in history
 * 2. Enforces a visible limit (auto-dismisses oldest toasts)
 */
export function initNotificationCenter() {
  if (_initialized) return
  _initialized = true

  watch(notificationList, (list) => {
    // Track new notifications in history
    for (const notif of list) {
      if (!_seenKeys.has(notif.key)) {
        _seenKeys.add(notif.key)
        history.value.unshift({
          id: notif.key,
          title: notif.title,
          body: notif.body,
          level: notif.level,
          timestamp: Date.now(),
          read: false,
        })
      }
    }

    // Trim history to 50
    if (history.value.length > 50) history.value.length = 50

    // Enforce visible limit
    if (list.length > MAX_VISIBLE) {
      // Remove the oldest (last in array) notifications beyond the limit
      const excess = list.slice(MAX_VISIBLE)
      for (const n of excess) {
        n.remove()
      }
    }
  }, { deep: true })
}

export function useNotificationCenter() {
  function markAllRead() {
    for (const item of history.value) {
      item.read = true
    }
  }

  function clearHistory() {
    history.value = []
  }

  function toggleBell() {
    bellOpen.value = !bellOpen.value
    if (bellOpen.value) markAllRead()
  }

  function closeBell() {
    bellOpen.value = false
  }

  return {
    history,
    unreadCount,
    bellOpen,
    markAllRead,
    clearHistory,
    toggleBell,
    closeBell,
    MAX_VISIBLE,
  }
}
