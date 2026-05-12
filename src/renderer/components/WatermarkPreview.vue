<template>
  <div class="mt-2">
    <div class="flex items-center justify-between gap-2 mb-1">
      <span class="text-xs text-slate-400">{{ label }}</span>
      <button v-if="showClear" class="btn btn-danger" :class="clearBtnClass" @click="$emit('clear')">
        Clear Image
      </button>
    </div>
    <div
      class="relative aspect-video w-full rounded-md border border-default bg-default/60 overflow-hidden"
      :style="{ maxWidth }"
    >
      <div class="absolute inset-0 bg-gradient-to-br from-slate-700/40 via-slate-800/40 to-slate-900/60"></div>
      <img
        :src="previewUrl"
        alt="Watermark preview"
        class="absolute opacity-70 drop-shadow-md"
        :class="imageClass"
        :style="imageStyle"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  previewUrl: string
  label?: string
  showClear?: boolean
  clearBtnClass?: string
  maxWidth?: string
  /** 'small' uses bottom/right 2%/1.5% at 20%, 'large' uses bottom-3 right-3 at 35% */
  size?: 'small' | 'large'
}>(), {
  label: 'Preview (approximate)',
  showClear: false,
  clearBtnClass: '',
  maxWidth: '18rem',
  size: 'large',
})

defineEmits<{
  clear: []
}>()

const imageClass = computed(() =>
  props.size === 'small' ? '' : 'bottom-3 right-3 max-h-[35%] max-w-[35%]'
)

const imageStyle = computed(() =>
  props.size === 'small'
    ? { bottom: '2%', right: '1.5%', maxHeight: '20%', maxWidth: '20%' }
    : undefined
)
</script>
