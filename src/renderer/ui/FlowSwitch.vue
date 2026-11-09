<template>
  <Switch
    :model-value="modelValue"
    :disabled="disabled"
    class="flow-switch"
    :class="{ 'flow-switch--on': modelValue }"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <span class="sr-only">{{ label }}</span>
    <span class="flow-switch__thumb" aria-hidden="true" />
  </Switch>
</template>

<script setup lang="ts">
import { Switch } from '@headlessui/vue'

defineProps<{
  modelValue: boolean
  /** Accessible name; not shown. Put the visible label next to the switch. */
  label: string
  disabled?: boolean
}>()

const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()
</script>
