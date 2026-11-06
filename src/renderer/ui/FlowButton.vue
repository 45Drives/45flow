<template>
  <button
    :type="type"
    class="btn"
    :class="[`btn-${variant}`, size !== 'md' && `btn-${size}`, { 'btn-block': block }]"
    :disabled="disabled || loading"
    :aria-busy="loading || undefined"
  >
    <template v-if="loading && loadingText">{{ loadingText }}</template>
    <slot v-else />
  </button>
</template>

<script setup lang="ts">
export type FlowButtonVariant = 'primary' | 'secondary' | 'dismiss' | 'danger' | 'success' | 'ghost' | 'outline' | 'icon'

withDefaults(defineProps<{
  variant?: FlowButtonVariant
  size?: 'xs' | 'sm' | 'md'
  type?: 'button' | 'submit' | 'reset'
  block?: boolean
  disabled?: boolean
  loading?: boolean
  loadingText?: string
}>(), {
  variant: 'secondary',
  size: 'md',
  type: 'button',
})
</script>
