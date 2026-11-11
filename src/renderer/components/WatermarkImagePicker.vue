<template>
  <div class="space-y-2">
    <div class="flex flex-wrap items-center gap-2">
      <button type="button" class="btn btn-secondary" :class="compact ? 'text-xs' : ''" @click="emit('pickWatermark')">
        {{ pickButtonLabel }}
      </button>
      <span class="text-sm truncate min-w-0" :title="effectiveWatermarkName || 'No image selected'">
        {{ effectiveWatermarkName || (usingExistingWatermark ? 'Using existing watermark' : 'No image selected') }}
      </span>
      <select :value="selectedExistingWatermark" aria-label="Existing watermark image"
        :class="compact ? 'input-textlike border rounded px-2 py-1 text-xs min-w-[12rem] flex-1' : 'input-textlike border rounded px-2 py-1 text-sm min-w-[14rem] flex-1'"
        @change="emit('update:selectedExistingWatermark', ($event.target as HTMLSelectElement).value)">
        <option value="">{{ compact ? 'Existing watermark…' : 'Select existing watermark file…' }}</option>
        <optgroup v-if="showDefaultWatermarks && defaultWatermarks.length && existingWatermarkFiles.length" label="Client Uploads">
          <option v-for="wm in existingWatermarkFiles" :key="wm" :value="wm">{{ wm.split('/').pop() }}</option>
        </optgroup>
        <template v-else-if="existingWatermarkFiles.length">
          <option v-for="wm in existingWatermarkFiles" :key="wm" :value="wm">{{ wm.split('/').pop() }}</option>
        </template>
        <optgroup v-if="showDefaultWatermarks && defaultWatermarks.length" label="45Flow Defaults">
          <option v-for="wm in defaultWatermarks" :key="wm.id" :value="wm.path">{{ wm.name }}</option>
        </optgroup>
      </select>
      <button type="button" class="btn btn-secondary px-2 py-1 text-xs" @click="emit('refreshWatermarks')">Refresh</button>
    </div>
    <label class="flex items-center gap-2 text-sm cursor-pointer">
      <input type="checkbox" class="proxy-quality-checkbox" :checked="showDefaultWatermarks"
        @change="emit('update:showDefaultWatermarks', ($event.target as HTMLInputElement).checked)" />
      Show default watermarks
    </label>
    <p v-if="!watermarkFile && !selectedExistingWatermark && !usingExistingWatermark" class="text-xs text-flow-warning">
      Select a watermark image to continue.
    </p>
  </div>
</template>

<script setup lang="ts">
import type { Default45FlowWatermark } from '../types/watermark'

type LocalFile = { path: string; name: string; size: number; dataUrl?: string | null }

withDefaults(defineProps<{
  watermarkFile: LocalFile | null
  selectedExistingWatermark: string
  existingWatermarkFiles: string[]
  defaultWatermarks: Default45FlowWatermark[]
  showDefaultWatermarks: boolean
  effectiveWatermarkName?: string
  usingExistingWatermark?: boolean
  pickButtonLabel?: string
  compact?: boolean
}>(), {
  effectiveWatermarkName: '',
  usingExistingWatermark: false,
  pickButtonLabel: 'Browse…',
  compact: false,
})

const emit = defineEmits<{
  'update:selectedExistingWatermark': [value: string]
  'update:showDefaultWatermarks': [value: boolean]
  pickWatermark: []
  refreshWatermarks: []
}>()
</script>
