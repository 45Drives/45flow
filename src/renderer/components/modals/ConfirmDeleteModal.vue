<template>
  <FlowModal
    :model-value="modelValue"
    :title="titleText"
    size="sm"
    :busy="busy"
    :close-on-backdrop="clickOutsideCancels ?? true"
    initial-focus="[data-confirm]"
    :aria-describedby="descId"
    @update:model-value="(v) => emit('update:modelValue', v)"
    @close="onDismissed"
  >
    <div :id="descId" class="text-sm">
      <slot>{{ messageText }}</slot>
      <p v-if="error" class="mt-2 text-flow-danger text-xs">{{ error }}</p>
    </div>

    <template #footer>
      <button class="btn" :class="closeIsCancel ? 'btn-dismiss' : 'btn-secondary'" @click="onCancel" :disabled="busy">{{ cancelText }}</button>
      <button
        class="btn"
        :class="danger ? 'btn-danger' : 'btn-primary'"
        @click="onConfirm"
        :disabled="busy"
        data-confirm
      >
        {{ busy ? busyText : confirmText }}
      </button>
    </template>
  </FlowModal>
</template>

<script setup lang="ts">
import { computed, useId } from 'vue'
import FlowModal from '../../ui/FlowModal.vue'

const props = defineProps<{
  modelValue: boolean
  title?: string
  message?: string
  confirmText?: string
  cancelText?: string
  busy?: boolean
  busyText?: string
  danger?: boolean
  error?: string | null
  clickOutsideCancels?: boolean
  closeIsCancel?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'confirm'): void
  (e: 'cancel'): void
  (e: 'close'): void
}>()

const descId = `${useId()}-desc`

// FlowModal already emitted update:modelValue(false) for Close, Escape and the backdrop.
function onDismissed() {
  emit(closeIsCancel.value ? 'cancel' : 'close')
}
function onCancel() {
  if (props.busy) return
  emit('update:modelValue', false)
  emit('cancel')
}
function onConfirm() {
  if (props.busy) return
  emit('confirm')
}

const titleText = computed(() => props.title ?? 'Confirm')
const messageText = computed(() => props.message ?? 'Are you sure?')
const confirmText = computed(() => props.confirmText ?? 'Delete')
const cancelText = computed(() => props.cancelText ?? 'Cancel')
const busyText = computed(() => props.busyText ?? 'Working…')
const danger = computed(() => props.danger ?? true)
const closeIsCancel = computed(() => props.closeIsCancel ?? true)
</script>
