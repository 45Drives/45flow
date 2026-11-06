<template>
  <div class="flow-field" :class="{ 'flow-field--invalid': !!error }">
    <label v-if="label || $slots.label" class="flow-field__label" :class="labelClass" :for="controlId">
      <slot name="label">{{ label }}</slot>
      <span v-if="required" class="flow-field__required" aria-hidden="true">*</span>
      <span v-else-if="optional" class="flow-field__optional"> (optional)</span>
    </label>
    <slot :id="controlId" :describedBy="describedBy" :invalid="!!error" />
    <p v-if="help || $slots.help" :id="helpId" class="flow-field__help">
      <slot name="help">{{ help }}</slot>
    </p>
    <p v-if="error" :id="errorId" class="flow-field__error" role="alert">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, useId, useSlots } from 'vue'

const props = defineProps<{
  label?: string
  /** id for the control; generated when omitted. Bind it with the default slot's `id`. */
  id?: string
  help?: string
  error?: string | null
  required?: boolean
  optional?: boolean
  labelClass?: unknown
}>()

const slots = useSlots()
const uid = useId()
const controlId = computed(() => props.id || `${uid}-control`)
const helpId = computed(() => `${controlId.value}-help`)
const errorId = computed(() => `${controlId.value}-error`)
const describedBy = computed(() => {
  const ids = []
  if (props.help || slots.help) ids.push(helpId.value)
  if (props.error) ids.push(errorId.value)
  return ids.length ? ids.join(' ') : undefined
})
</script>
