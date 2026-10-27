import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, reactive, ref } from 'vue'
import AppShell from './AppShell.vue'

const mocks = vi.hoisted(() => ({
  connection: null, route: null, unmounted: vi.fn(), replace: vi.fn(async () => {}),
}))
vi.mock('vue-router', () => ({
  useRoute: () => mocks.route,
  useRouter: () => ({ replace: mocks.replace }),
}))
vi.mock('../renderer/composables/useConnections', () => ({
  useConnections: () => ({ activeConnection: mocks.connection }),
}))
vi.mock('../renderer/composables/useLicenseStatus', async () => {
  const { ref } = await import('vue')
  return {
    useLicenseStatus: () => ({
      isPremiumActive: ref(false), isUpdateEligible: ref(false), isFallback: ref(false),
      isTrial: ref(false), isTrialExpired: ref(false), trialDaysRemaining: ref(null),
    }),
  }
})
vi.mock('@45drives/houston-common-ui', () => ({
  DynamicBrandingLogo: { template: '<div />' },
  GlobalModalConfirm: { template: '<div />' },
  NotificationView: { template: '<div />' },
  toggleDarkMode: vi.fn(),
  useDarkModeState: () => false,
}))
vi.mock('../renderer/composables/useNotificationQueue', () => ({
  reportError: vi.fn(), reportSuccess: vi.fn(),
}))
vi.mock('../renderer/composables/useServerDiscovery', () => ({
  useServerDiscovery: () => ({ discoveryState: {} }),
}))
vi.mock('../renderer/composables/useThemeFromAlias', async () => {
  const { ref } = await import('vue')
  return {
    useThemeFromAlias: () => ({ currentDivision: ref('default'), setThemeControlsUnlocked: vi.fn() }),
  }
})
vi.mock('../renderer/composables/useHeaderTitle', () => ({
  useHeaderTitle: () => ({}),
}))
vi.mock('../renderer/composables/registerIpcActionListener', () => ({
  registerIpcActionListener: vi.fn(),
}))
vi.mock('../renderer/composables/useActiveProject', () => ({
  useActiveProject: () => ({}),
}))
vi.mock('../renderer/composables/useWebSocketManager', () => ({
  useWebSocketManager: vi.fn(),
}))
vi.mock('../renderer/composables/useApi', () => ({
  useApi: () => ({ apiFetch: vi.fn() }),
}))
vi.mock('../renderer/composables/useTransferProgress', () => ({
  useTransferProgress: () => ({ restoreActiveTranscodes: vi.fn() }),
}))
vi.mock('../renderer/composables/useNotificationCenter', () => ({
  initNotificationCenter: vi.fn(),
}))
vi.mock('../renderer/composables/useTourManager', async () => {
  const { ref } = await import('vue')
  return {
    useTourManager: () => ({ activeTour: ref(null), cancelTour: vi.fn() }),
  }
})
vi.mock('../renderer/components/TransferProgressDock.vue', () => ({ default: { template: '<div />' } }))
vi.mock('../renderer/components/UpdateBanner.vue', () => ({ default: { template: '<div />' } }))
vi.mock('../renderer/components/GlobalMenu.vue', () => ({ default: { template: '<div />' } }))
vi.mock('../renderer/components/ConnectionSwitcher.vue', () => ({ default: { template: '<div />' } }))
vi.mock('../renderer/components/BasicServerBadge.vue', () => ({ default: { template: '<div />' } }))
vi.mock('../renderer/components/GuidedTour.vue', () => ({ default: { template: '<div />' } }))
vi.mock('../renderer/components/NotificationBell.vue', () => ({ default: { template: '<div />' } }))
vi.mock('../renderer/components/QuickShareOverlay.vue', async () => {
  const { h, onUnmounted, ref } = await import('vue')
  return {
    default: {
      setup() {
        const minimized = ref(false)
        onUnmounted(mocks.unmounted)
        return () => h('button', {
          'data-quick-share': '',
          onClick: () => { minimized.value = !minimized.value },
        }, minimized.value ? 'Quick Share minimized' : 'Quick Share dialog')
      },
    },
  }
})

let app
let host
const connected = () => ({
  connectionId: 'server-one', status: 'connected', token: 'test-token',
  baseUrl: 'https://server.example', serverIp: 'server.example', username: 'admin', name: 'Test server',
})
const quickShare = () => host.querySelector('[data-quick-share]')

beforeEach(() => {
  mocks.connection = ref(connected())
  mocks.route = reactive({ name: 'dashboard', path: '/dashboard', meta: {} })
  mocks.unmounted.mockClear()
  mocks.replace.mockClear()
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp(AppShell)
  app.component('router-view', { template: '<div data-route-view />' })
  app.mount(host)
})

afterEach(() => {
  app.unmount()
  host.remove()
})

describe('Quick Share session lifetime', () => {
  it.each([false, true])('discards the open overlay on logout (minimized: %s)', async minimized => {
    if (minimized) {
      quickShare().click()
      await nextTick()
      expect(quickShare().textContent).toBe('Quick Share minimized')
    }
    mocks.connection.value.token = ''
    mocks.connection.value.status = 'disconnected'
    await nextTick()
    expect(quickShare()).toBeNull()
    expect(mocks.unmounted).toHaveBeenCalledTimes(1)
    mocks.route.name = 'server-selection'
    await nextTick()
    expect(quickShare()).toBeNull()
    mocks.connection.value = connected()
    mocks.route.name = 'dashboard'
    await nextTick()
    expect(quickShare().textContent).toBe('Quick Share dialog')
  })

  describe('active-server authentication guard', () => {
    it.each(['dashboard', 'upload-file', 'create-link'])(
      'requires reconnect when switching to a logged-out server from %s', async routeName => {
        mocks.route.name = routeName
        mocks.connection.value = {
          ...connected(), connectionId: 'logged-out-server', serverIp: 'other.example',
          username: 'other-user', token: '', status: 'disconnected',
        }
        await nextTick()
        expect(host.querySelector('[data-route-view]')).toBeNull()
        expect(mocks.replace).toHaveBeenCalledWith({
          name: 'server-selection',
          query: {
            reconnect: 'logged-out-server', serverIp: 'other.example', username: 'other-user',
          },
        })
      },
    )

    it.each([
      { token: '', status: 'connected' },
      { token: 'retained-token', status: 'disconnected' },
      { token: 'retained-token', status: 'error' },
      { token: 'retained-token', status: 'checking' },
    ])('does not trust an incomplete session: %j', async session => {
      Object.assign(mocks.connection.value, session)
      await nextTick()
      expect(host.querySelector('[data-route-view]')).toBeNull()
      expect(mocks.replace).toHaveBeenCalledWith({
        name: 'server-selection',
        query: { reconnect: 'server-one', serverIp: 'server.example', username: 'admin' },
      })
    })

    it('shows the connection screen without auto-login when no active server remains', async () => {
      mocks.connection.value = null
      await nextTick()
      expect(host.querySelector('[data-route-view]')).toBeNull()
      expect(mocks.replace).toHaveBeenCalledWith({
        name: 'server-selection', query: { skipAutoLogin: 'true' },
      })
    })

    it('leaves the reconnect form visible without redirecting it again', async () => {
      mocks.route.name = 'server-selection'
      mocks.connection.value = { ...connected(), token: '', status: 'disconnected' }
      await nextTick()
      expect(host.querySelector('[data-route-view]')).not.toBeNull()
      expect(mocks.replace).not.toHaveBeenCalled()
    })

    it('preserves authenticated server switching and token refresh', async () => {
      mocks.connection.value = { ...connected(), connectionId: 'server-two' }
      await nextTick()
      mocks.connection.value.token = 'refreshed-token'
      await nextTick()
      expect(host.querySelector('[data-route-view]')).not.toBeNull()
      expect(mocks.replace).not.toHaveBeenCalled()
    })
  })

  it.each(['missing-token', 'disconnected', 'no-connection', 'connection-screen'])(
    'removes Quick Share for %s', async state => {
      if (state === 'missing-token') mocks.connection.value.token = ''
      if (state === 'disconnected') mocks.connection.value.status = 'disconnected'
      if (state === 'no-connection') mocks.connection.value = null
      if (state === 'connection-screen') mocks.route.name = 'server-selection'
      await nextTick()
      expect(quickShare()).toBeNull()
      expect(mocks.unmounted).toHaveBeenCalledTimes(1)
    },
  )

  it('preserves the minimized overlay during normal authenticated navigation', async () => {
    quickShare().click()
    mocks.route.name = 'manage-links'
    mocks.route.path = '/links'
    await nextTick()
    expect(quickShare().textContent).toBe('Quick Share minimized')
    expect(mocks.unmounted).not.toHaveBeenCalled()
  })
})
