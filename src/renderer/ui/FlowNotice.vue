<template>
  <div
    class="flow-notice"
    :class="[`flow-notice--${tone}`, { 'flow-notice--sm': size === 'sm', 'flow-notice--plain': plain }]"
    :role="live ? (tone === 'danger' ? 'alert' : 'status') : undefined"
  >
    <span v-if="!hideIcon" class="flow-notice__icon" aria-hidden="true">
      <slot name="icon"><component :is="icon" class="w-full h-full" /></slot>
    </span>
    <div class="flow-notice__body">
      <div v-if="title || $slots.title" class="flow-notice__title"><slot name="title">{{ title }}</slot></div>
      <slot />
      <div v-if="$slots.actions" class="flow-notice__actions"><slot name="actions" /></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { CheckCircleIcon, ExclamationTriangleIcon, InformationCircleIcon, XCircleIcon } from '@heroicons/vue/20/solid'

export type FlowTone = 'info' | 'success' | 'warning' | 'danger'

const props = withDefaults(defineProps<{
  tone?: FlowTone
  title?: string
  size?: 'sm' | 'md'
  /** Tone colour only, no box. For inline status lines. */
  plain?: boolean
  hideIcon?: boolean
  /** Announce changes to screen readers (status, or alert for danger). */
  live?: boolean
}>(), {
  tone: 'info',
  size: 'md',
})

const ICONS = {
  info: InformationCircleIcon,
  success: CheckCircleIcon,
  warning: ExclamationTriangleIcon,
  danger: XCircleIcon,
}

const icon = computed(() => ICONS[props.tone])
</script>
