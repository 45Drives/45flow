<template>
  <span class="flow-chip" :class="[`flow-chip--${tone}`, { 'flow-chip--sm': size === 'sm' }]">
    <span v-if="dot" class="flow-dot" :class="tone === 'muted' ? 'flow-dot--neutral' : `flow-dot--${tone}`" aria-hidden="true" />
    <slot />
  </span>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'muted'
  size?: 'sm' | 'md'
  dot?: boolean
}>(), {
  tone: 'neutral',
  size: 'md',
})
</script>
