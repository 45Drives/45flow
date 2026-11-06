<template>
  <div class="flow-empty" :class="{ 'flow-empty--compact': compact }">
    <span v-if="$slots.icon" class="flow-empty__icon" aria-hidden="true"><slot name="icon" /></span>
    <p v-if="title" class="flow-empty__title">{{ title }}</p>
    <div v-if="description || $slots.default" class="flow-empty__description">
      <slot>{{ description }}</slot>
    </div>
    <div v-if="$slots.actions" class="flow-empty__actions"><slot name="actions" /></div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title?: string
  description?: string
  compact?: boolean
}>()
</script>
