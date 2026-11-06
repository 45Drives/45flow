<template>
  <component :is="as" class="flow-card" :class="rootClass">
    <div v-if="$slots.header" :class="[headerPad, headerClass]">
      <slot name="header" />
    </div>
    <div :class="[bodyPad, bodyClass]">
      <slot />
    </div>
    <div v-if="$slots.footer" :class="[footerPad, footerClass]">
      <slot name="footer" />
    </div>
  </component>
</template>

<script setup lang="ts">
import { computed, useSlots } from 'vue'

type ClassProp = string | Array<string | Record<string, boolean>> | Record<string, boolean>

const props = withDefaults(defineProps<{
  /**
   * surface  elevated top-level panel (theme-tinted, rounded, shadow)
   * inset    section nested inside another surface (border only)
   * plain    houston CardContainer look, kept for screens that already style on top of it
   */
  variant?: 'surface' | 'inset' | 'plain'
  padding?: 'none' | 'sm' | 'md' | 'lg'
  as?: string
  headerClass?: ClassProp
  bodyClass?: ClassProp
  footerClass?: ClassProp
}>(), {
  variant: 'surface',
  padding: 'md',
  as: 'div',
})

const slots = useSlots()
const sectioned = computed(() => !!(slots.header || slots.footer))

const rootClass = computed(() => {
  if (props.variant === 'plain') return 'bg-default md:shadow-lg shadow-md divide-y divide-default'
  const base = props.variant === 'inset' ? 'flow-card--inset border-default' : 'flow-card--surface'
  return sectioned.value ? `${base} divide-y divide-default` : base
})

const PAD: Record<string, string> = { none: '', sm: 'p-3', md: 'p-4', lg: 'p-6' }
const SECTION_PAD: Record<string, string> = { none: '', sm: 'px-3 py-2', md: 'px-4 py-3', lg: 'px-6 py-4' }

const headerPad = computed(() => props.variant === 'plain'
  ? 'px-4 py-2 sm:px-6 sm:py-5 text-header'
  : SECTION_PAD[props.padding])
const bodyPad = computed(() => {
  if (props.variant === 'plain') return ['flex-grow', props.padding === 'none' ? '' : 'px-4 py-5 sm:px-6 sm:py-5']
  return ['flex-grow min-h-0', PAD[props.padding]]
})
const footerPad = computed(() => props.variant === 'plain'
  ? 'px-4 py-2 sm:px-6 sm:py-5'
  : SECTION_PAD[props.padding])
</script>
