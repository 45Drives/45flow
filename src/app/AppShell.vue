<template>
  <div
    class="w-screen h-screen overflow-hidden flex flex-col text-default bg-default app-bg-textured">
    <header
      v-if="!hideHeader"
      class="grid grid-cols-3 items-center w-full h-16 px-4 bg-accent"       :class="''"
    >
      <!-- Left (logo) -->
      <div class="justify-self-start">
        <!-- <DynamicBrandingLogo :division="divisionCode" :height="12"/> -->
        <div class="flow-logo-gradient mx-auto my-auto ml-2" role="img" aria-label="45Flow" data-tour="flow-logo"
          :style="{
            '--flow-logo-src': `url(${flowLogo})`,
          }" />
      </div>

      <!-- Center (title) -->
      <div class="justify-self-center text-center items-center text-2xl font-semibold whitespace-nowrap">
        <!-- {{ headerTitle || (route.meta.title as string) || '45Flow' }} -->
        <!-- <div class="flow-logo-gradient mx-auto my-auto ml-2" role="img" aria-label="45Flow" data-tour="flow-logo" :style="{
          '--flow-logo-src': `url(${flowLogo})`,
        }" /> -->
        <DynamicBrandingLogo :division="divisionCode" :height="12" />
        
      </div>

      <!-- Right (menu) -->
      <div class="justify-self-end text-right flex items-center gap-2">
        <div data-tour="connection-switcher">
          <ConnectionSwitcher v-if="route.name !== 'server-selection' && isPremiumActive" />
          <BasicServerBadge v-else-if="route.name !== 'server-selection'" />
        </div>
        <span v-if="isTrial && trialDaysRemaining !== null" class="text-xs px-2 py-1 rounded-full bg-amber-500/20 text-amber-800 dark:text-amber-300 font-medium whitespace-nowrap">
          Pro Trial — {{ trialDaysRemaining }} {{ trialDaysRemaining === 1 ? 'day' : 'days' }} left
        </span>
        <span v-else-if="isTrialExpired" class="text-xs px-2 py-1 rounded-full bg-red-500/20 text-red-800 dark:text-red-300 font-medium whitespace-nowrap">
          Trial Expired
        </span>
        <NotificationBell />
        <GlobalMenu />
        <button
          class="theme-icon-btn"
          :class="darkMode ? 'theme-icon-btn--sun' : 'theme-icon-btn--moon'"
          :title="darkMode ? 'Switch to light mode' : 'Switch to dark mode'"
          @click="toggleDarkMode()"
        >
          <component :is="darkMode ? SunIcon : MoonIcon" class="w-6 h-6" />
        </button>
      </div>
    </header>


    <main class="flex-1 min-h-0 w-full overflow-hidden">
      <router-view />
    </main>
    <QuickShareOverlay />
    <GlobalModalConfirm />
    <NotificationView />
    <UpdateBanner />
    <TransferProgressDock v-if="!hideTransfers" />
    <GuidedTour v-if="ENABLE_TOUR && activeTour" :steps="activeTour.steps" :active="true" @done="finishTour" @skip="finishTour" />
  </div>
</template>

<script setup lang="ts">
import { ref, provide, onMounted, onBeforeUnmount, watch, computed } from 'vue'
import { DynamicBrandingLogo, GlobalModalConfirm, NotificationView, toggleDarkMode, useDarkModeState } from '@45drives/houston-common-ui'
import { reportError, reportSuccess } from '../renderer/composables/useNotificationQueue'
import { MoonIcon, SunIcon } from '@heroicons/vue/24/outline'
import { divisionCodeInjectionKey, currentServerInjectionKey, discoveryStateInjectionKey, thisOsInjectionKey, connectionMetaInjectionKey } from '../renderer/keys/injection-keys'
import type { Server, DivisionType, DiscoveryState, ConnectionMeta } from '../renderer/types'
import { useServerDiscovery } from '../renderer/composables/useServerDiscovery'
import { useThemeFromAlias } from '../renderer/composables/useThemeFromAlias'
import { useRoute, useRouter } from 'vue-router'
import { useHeaderTitle } from '../renderer/composables/useHeaderTitle'
import { registerIpcActionListener } from "../renderer/composables/registerIpcActionListener";
import { useConnections } from '../renderer/composables/useConnections'
import { useLicenseStatus } from '../renderer/composables/useLicenseStatus'
import { useActiveProject } from '../renderer/composables/useActiveProject'
import { useWebSocketManager } from '../renderer/composables/useWebSocketManager'
import TransferProgressDock from '../renderer/components/TransferProgressDock.vue'
import UpdateBanner from '../renderer/components/UpdateBanner.vue'
import GlobalMenu from '../renderer/components/GlobalMenu.vue'
import ConnectionSwitcher from '../renderer/components/ConnectionSwitcher.vue'
import BasicServerBadge from '../renderer/components/BasicServerBadge.vue'
import GuidedTour from '../renderer/components/GuidedTour.vue'
import QuickShareOverlay from '../renderer/components/QuickShareOverlay.vue'
import NotificationBell from '../renderer/components/NotificationBell.vue'
import { initNotificationCenter } from '../renderer/composables/useNotificationCenter'
import { useTourManager } from '../renderer/composables/useTourManager'
import flowLogo from '../../assets/logos/45Flow-w.png'

/** Flip to true to re-enable the guided tour */
const ENABLE_TOUR = true

const { activeTour, finishTour, cancelTour } = useTourManager()

// Initialize multi-server connection management
const { activeConnection } = useConnections()
const { isPremiumActive, isUpdateEligible, isFallback, isTrial, isTrialExpired, trialDaysRemaining } = useLicenseStatus()
const { activeProject } = useActiveProject()

// Initialize WebSocket manager (auto-connects to active connection)
useWebSocketManager()

// Initialize notification center (tracks history + enforces visible limit)
initNotificationCenter()

// Reactive window title based on license status
watch([isPremiumActive, isFallback], ([licensed, fallback]) => {
  const version = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : ''
  if (licensed && fallback) {
    document.title = `45Flow (Pro — Legacy) v${version}`
  } else if (licensed) {
    document.title = `45Flow (Pro Edition) v${version}`
  } else {
    document.title = `45Flow (Community Edition) v${version}`
  }
}, { immediate: true })

// Notify main process of update eligibility changes (only active license = eligible)
watch(isUpdateEligible, (eligible) => {
  window.electron?.ipcRenderer.send('license:update-eligible', eligible)
}, { immediate: true })

// Legacy provide for backwards compatibility during migration
// Components will gradually migrate to useConnections() directly
const currentServer = ref<Server | null>(null)
const divisionCode = ref<DivisionType>('default')
const thisOS = ref<string>('')
const route = useRoute()
const router = useRouter()

// Sync legacy currentServer ref with active connection
watch(activeConnection, (conn) => {
  if (conn) {
    currentServer.value = {
      ip: conn.serverIp,
      name: conn.name,
      lastSeen: conn.lastConnectedAt,
      status: conn.status === 'connected' ? 'complete' : 'not complete',
      setupComplete: conn.setupComplete,
      serverName: conn.serverName,
      serverInfo: conn.serverInfo
    } as Server
  } else {
    currentServer.value = null
  }
}, { immediate: true })

// Cancel any active tour when the route changes (user navigated away)
watch(() => route.path, () => {
  if (activeTour.value) {
    cancelTour(activeTour.value.id)
  }
})

const hideHeader = computed(() => route.meta.hideHeader === true)
const { headerTitle } = useHeaderTitle()
const hideTransfers = computed(() => route.meta.hideTransfers === true)
const darkMode = useDarkModeState()

const hasToken = computed(() => {
  if (activeConnection.value?.token) return true
  try { return !!sessionStorage.getItem('hb_token') } catch { return false }
})

provide(currentServerInjectionKey, currentServer)
provide(divisionCodeInjectionKey, divisionCode)
provide(thisOsInjectionKey, thisOS)

const { discoveryState } = useServerDiscovery()
provide(discoveryStateInjectionKey, discoveryState as DiscoveryState)

// Build ConnectionMeta from active connection for legacy compatibility
// Use a writable ref so Connect2Server can set it during login before activeConnection exists
const connectionMeta = ref<ConnectionMeta>({ port: 9095 })
watch(activeConnection, (conn) => {
  if (!conn) return
  connectionMeta.value = {
    token: conn.token,
    port: conn.apiPort,
    httpsHost: conn.baseUrl ? new URL(conn.baseUrl).hostname : undefined,
    apiBase: conn.baseUrl,
    ssh: conn.ssh
  }
}, { immediate: true })
provide(connectionMetaInjectionKey, connectionMeta)

const { currentDivision, currentTheme, setThemeControlsUnlocked } = useThemeFromAlias()

watch(currentDivision, (d) => { divisionCode.value = d as DivisionType }, { immediate: true })

let unregisterIpcListener: (() => void) | null = null

onMounted(() => {
  setThemeControlsUnlocked(true)

  const isJson = (s: string) => { try { JSON.parse(s); return true } catch { return false } }

  const notificationHandler = (_e: any, message: string) => {
    if (message.startsWith('Error')) return reportError(new Error(message))
    if (isJson(message)) {
      const m = JSON.parse(message)
      m.error ? reportError(new Error(m.error)) : reportSuccess(message)
    } else {
      reportSuccess(message)
    }
  }

  window.electron?.ipcRenderer.on('notification', notificationHandler)

  unregisterIpcListener = registerIpcActionListener({
    vueRouter: router,
  })

  onBeforeUnmount(() => {
    window.electron?.ipcRenderer.removeListener('notification', notificationHandler)
  })
})

onBeforeUnmount(() => {
  unregisterIpcListener?.()
})
</script>

<style scoped>
.theme-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  background: transparent;
  line-height: 1;
  cursor: pointer;
  transition: all 0.2s ease-in-out;
}

.theme-icon-btn--moon {
  color: #60a5fa;
  text-shadow: 0 0 10px rgba(96, 165, 250, 0.45);
}

.theme-icon-btn--moon:hover {
  color: #bfdbfe;
}

.theme-icon-btn--sun {
  color: #f59e0b;
  text-shadow: 0 0 10px rgba(245, 158, 11, 0.45);
}

.theme-icon-btn--sun:hover {
  color: #fde68a;
}

.flow-logo-gradient {
   height: clamp(3rem, 6vw, 3.45rem);
   width: clamp(3rem, 6vw, 3.45rem);

   background: var(--flow-logo-theme-fill, var(--btn-primary-fill));
   background-size: var(--flow-logo-bg-size, 100% 100%);
   background-position: var(--flow-logo-bg-position, center);
   background-repeat: no-repeat;

   -webkit-mask-image: var(--flow-logo-src);
   -webkit-mask-size: contain;
   -webkit-mask-repeat: no-repeat;
   -webkit-mask-position: center;

   mask-image: var(--flow-logo-src);
   mask-size: contain;
   mask-repeat: no-repeat;
   mask-position: center;
 }
</style>
