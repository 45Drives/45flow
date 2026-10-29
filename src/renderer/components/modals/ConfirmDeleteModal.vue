<template>
    <div v-if="modelValue" class="fixed inset-0 z-[3000] flex items-center justify-center">
      <div class="absolute inset-0 bg-black/50" @click="onBackdrop" />
      <div
        class="relative w-full max-w-md bg-accent rounded-lg shadow-xl p-4"
        role="dialog"
        :aria-labelledby="ids.title"
        :aria-describedby="ids.desc"
        @keydown.esc.prevent.stop="(closeIsCancel ? onCancel() : onClose())"
      >
        <div class="flex items-center justify-between mb-3">
          <h3 :id="ids.title" class="text-lg font-semibold">{{ titleText }}</h3>
          <button class="btn btn-secondary" @click="(closeIsCancel ? onCancel() : onClose())" :disabled="busy">Close</button>
        </div>
  
        <div :id="ids.desc" class="text-sm">
          <slot>{{ messageText }}</slot>
          <p v-if="error" class="mt-2 text-red-500 text-xs">{{ error }}</p>
        </div>
  
        <div class="flex justify-end gap-2 mt-4">
          <button class="btn btn-secondary" @click="onCancel" :disabled="busy">{{ cancelText }}</button>
          <button
            class="btn"
            :class="danger ? 'btn-danger' : 'btn-primary'"
            @click="onConfirm"
            :disabled="busy"
            ref="confirmBtn"
          >
            {{ busy ? busyText : confirmText }}
          </button>
        </div>
      </div>
    </div>
</template>
  
  <script setup lang="ts">
  import { ref, watch, computed } from 'vue'
  
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
  
  const ids = { title: 'confirm-title', desc: 'confirm-desc' }
  const confirmBtn = ref<HTMLButtonElement | null>(null)
  
  watch(() => props.modelValue, (open) => {
    if (open) queueMicrotask(() => confirmBtn.value?.focus())
  })
  
  function onBackdrop() {
    if (props.busy) return
    if (!(props.clickOutsideCancels ?? true)) return
    if (props.closeIsCancel ?? true) onCancel()
    else onClose()
  }
  function onCancel() {
    if (props.busy) return
    emit('update:modelValue', false)
    emit('cancel')
  }
  function onClose() {
    if (props.busy) return
    emit('update:modelValue', false)
    emit('close')
  }
  function onConfirm() {
    if (props.busy) return
    emit('confirm')
  }
  
  /* Derived, reactive labels */
  const titleText = computed(() => props.title ?? 'Confirm')
  const messageText = computed(() => props.message ?? 'Are you sure?')
  const confirmText = computed(() => props.confirmText ?? 'Delete')
  const cancelText = computed(() => props.cancelText ?? 'Cancel')
  const busyText = computed(() => props.busyText ?? 'Working…')
  const danger = computed(() => props.danger ?? true)
  const closeIsCancel = computed(() => props.closeIsCancel ?? true)
  
  /* expose simple pass-throughs so the template can use them as plain values */
  const busy = computed(() => !!props.busy)
  const error = computed(() => props.error)
  const modelValue = computed(() => props.modelValue)
  </script>
  
