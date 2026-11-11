import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import NotificationBell from './NotificationBell.vue'

const center = vi.hoisted(() => ({ state: null }))
vi.mock('../composables/useNotificationCenter', async () => {
  const { ref, computed } = await import('vue')
  const history = ref([{ id: Symbol('n'), title: 'Upload done', body: 'x', level: 'success', timestamp: Date.now(), read: false }])
  const bellOpen = ref(false)
  center.state = {
    history,
    bellOpen,
    unreadCount: computed(() => history.value.filter(h => !h.read).length),
    toggleBell: () => {
      bellOpen.value = !bellOpen.value
      if (bellOpen.value) history.value.forEach(h => { h.read = true })
    },
    clearHistory: () => { history.value = [] },
  }
  return { useNotificationCenter: () => center.state }
})

let app
let host
afterEach(() => {
  app?.unmount()
  host?.remove()
})

describe('NotificationBell', () => {
  it('stays open when the clicked element is re-rendered away before the click reaches document', async () => {
    host = document.createElement('div')
    document.body.appendChild(host)
    app = createApp(NotificationBell)
    app.mount(host)

    const badge = host.querySelector('button span')
    expect(badge?.textContent?.trim()).toBe('1')

    // Browsers flush Vue's re-render (badge v-if goes false) between the button handler and the
    // document listener; jsdom does not, so detach the badge at that point manually and restore it
    // afterwards (this listener is added after the component's) so Vue's own patch still applies.
    const button = badge.parentNode
    host.firstElementChild.addEventListener('click', () => badge.remove(), { once: true })
    document.addEventListener('click', () => button.appendChild(badge), { once: true })
    badge.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()

    expect(center.state.bellOpen.value).toBe(true)

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(center.state.bellOpen.value).toBe(false)
  })
})
