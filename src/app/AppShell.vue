<template>
  <div
    class="w-screen h-screen overflow-hidden flex flex-col text-default bg-default app-bg-textured">
    <header
      v-if="!hideHeader"
      class="grid grid-cols-3 items-center w-full h-16 px-4 bg-accent"       :class="''"
    >
      <!-- Left (logo) -->
      <div class="justify-self-start">
        <DynamicBrandingLogo :division="divisionCode" :height="12"/>
      </div>

      <!-- Center (title) -->
      <div class="justify-self-center text-center items-center text-2xl font-semibold whitespace-nowrap">
        <!-- {{ headerTitle || (route.meta.title as string) || '45Flow' }} -->
        <div class="flow-logo-gradient mx-auto my-auto" role="img" aria-label="45Flow" data-tour="flow-logo" :style="{
          '--flow-logo-src': `url(${flowLogo})`,
        }" />
      </div>

      <!-- Right (menu) -->
      <div class="justify-self-end text-right flex items-center gap-2">
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
    <TransferProgressDock v-if="!hideTransfers" />
    <GuidedTour v-if="ENABLE_TOUR && activeTour" :steps="activeTour.steps" :active="true" @done="finishTour" @skip="finishTour" />
  </div>
</template>

<script setup lang="ts">
import { ref, provide, onMounted, onBeforeUnmount, watch, computed } from 'vue'
import { DynamicBrandingLogo, GlobalModalConfirm, NotificationView, reportError, reportSuccess, toggleDarkMode, useDarkModeState } from '@45drives/houston-common-ui'
import { MoonIcon, SunIcon } from '@heroicons/vue/24/outline'
import { divisionCodeInjectionKey, currentServerInjectionKey, discoveryStateInjectionKey, thisOsInjectionKey, connectionMetaInjectionKey } from '../renderer/keys/injection-keys'
import type { Server, DivisionType, DiscoveryState, ConnectionMeta } from '../renderer/types'
import { useServerDiscovery } from '../renderer/composables/useServerDiscovery'
import { useThemeFromAlias } from '../renderer/composables/useThemeFromAlias'
import { useRoute, useRouter } from 'vue-router'
import { useHeaderTitle } from '../renderer/composables/useHeaderTitle'
import { registerIpcActionListener } from "../renderer/composables/registerIpcActionListener";
import TransferProgressDock from '../renderer/components/TransferProgressDock.vue'
import GlobalMenu from '../renderer/components/GlobalMenu.vue'
import GuidedTour from '../renderer/components/GuidedTour.vue'
import QuickShareOverlay from '../renderer/components/QuickShareOverlay.vue'
import { useTourManager } from '../renderer/composables/useTourManager'
import flowLogo from '../../assets/logos/45Flow-w.png'

/** Flip to true to re-enable the guided tour */
const ENABLE_TOUR = true

const { activeTour, finishTour, cancelTour } = useTourManager()

// provide shared refs
const currentServer = ref<Server | null>(null)
const divisionCode = ref<DivisionType>('default')
const thisOS = ref<string>('')
const route = useRoute()
const router = useRouter()

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
  if (connectionMeta.value?.token) return true
  try { return !!sessionStorage.getItem('hb_token') } catch { return false }
})

provide(currentServerInjectionKey, currentServer)
provide(divisionCodeInjectionKey, divisionCode)
provide(thisOsInjectionKey, thisOS)

const { discoveryState } = useServerDiscovery()
provide(discoveryStateInjectionKey, discoveryState as DiscoveryState)

const connectionMeta = ref<ConnectionMeta>({ port: 9095 })
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
