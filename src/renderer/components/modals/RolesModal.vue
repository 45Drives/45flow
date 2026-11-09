<template>
  <FlowModal :model-value="modelValue" title="Roles" description="Decide what invited clients can do on a link."
    size="xl" body-class="flex flex-col min-h-0" :header-attrs="{ 'data-tour': 'roles-modal-header' }" @close="close()">
    <RolesPanel v-if="modelValue" :apiFetch="apiFetch" @updated="emit('updated')" />
  </FlowModal>
</template>

<script setup lang="ts">
import FlowModal from '../../ui/FlowModal.vue'
import RolesPanel from '../access/RolesPanel.vue'

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
