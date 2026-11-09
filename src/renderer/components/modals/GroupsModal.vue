<template>
  <FlowModal :model-value="modelValue" title="Teams" description="Group clients so you can invite them to a link in one step."
    size="lg" body-class="flex flex-col min-h-0" @close="close()">
    <TeamsPanel v-if="modelValue" :apiFetch="apiFetch" @updated="emit('updated')" />
  </FlowModal>
</template>

<script setup lang="ts">
import FlowModal from '../../ui/FlowModal.vue'
import TeamsPanel from '../access/TeamsPanel.vue'

defineProps<{
  modelValue: boolean
  apiFetch: (url: string, opts?: any) => Promise<any>
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'updated'): void
}>()

function close() {
  emit('update:modelValue', false)
}
</script>
