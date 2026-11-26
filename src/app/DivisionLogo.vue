<template>
  <img :src="src" :alt="`${division} logo`" class="w-auto max-w-full max-h-12">
</template>

<script setup lang="ts">
// Stands in for houston-common-ui's DynamicBrandingLogo, whose library build inlines all ten
// logos as base64 (~2.4 MB in the entry chunk). These URLs become separate files, so the
// browser only downloads the one it shows.
import { computed } from 'vue'
import { useDarkModeState } from '@45drives/houston-common-ui'
import type { DivisionType } from '../renderer/types'

const props = defineProps<{ division: DivisionType }>()

const logos: Record<DivisionType, { light: string; dark: string }> = {
  default: {
    light: new URL('../../houston-common/houston-common-ui/lib/img/branding/45drives.png', import.meta.url).href,
    dark: new URL('../../houston-common/houston-common-ui/lib/img/branding/45drives-darkmode.png', import.meta.url).href,
  },
  enterprise: {
    light: new URL('../../houston-common/houston-common-ui/lib/img/branding/45enterprise.png', import.meta.url).href,
    dark: new URL('../../houston-common/houston-common-ui/lib/img/branding/45enterprise-darkmode.png', import.meta.url).href,
  },
  homelab: {
    light: new URL('../../houston-common/houston-common-ui/lib/img/branding/45homelab.png', import.meta.url).href,
    dark: new URL('../../houston-common/houston-common-ui/lib/img/branding/45homelab-darkmode.png', import.meta.url).href,
  },
  professional: {
    light: new URL('../../houston-common/houston-common-ui/lib/img/branding/45professional.png', import.meta.url).href,
    dark: new URL('../../houston-common/houston-common-ui/lib/img/branding/45professional-darkmode.png', import.meta.url).href,
  },
  studio: {
    light: new URL('../../houston-common/houston-common-ui/lib/img/branding/45studio.png', import.meta.url).href,
    dark: new URL('../../houston-common/houston-common-ui/lib/img/branding/45studio-darkmode.png', import.meta.url).href,
  },
}

const isDarkMode = useDarkModeState()
const src = computed(() => {
  const logo = logos[props.division] ?? logos.default
  return isDarkMode.value ? logo.dark : logo.light
})
</script>
