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
        v-if="previewUrl"
        :src="previewUrl"
        alt="Watermark preview"
        class="absolute drop-shadow-md pointer-events-none"
        :style="computedImageStyle"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { WatermarkSettings } from '../types/watermark'

const props = withDefaults(defineProps<{
  previewUrl: string
  label?: string
  showClear?: boolean
  clearBtnClass?: string
  maxWidth?: string
  /** Legacy size prop for backward compatibility */
  size?: 'small' | 'large'
  /** Premium: Custom watermark settings */
  settings?: WatermarkSettings | null
}>(), {
  label: 'Preview (approximate)',
  showClear: false,
  clearBtnClass: '',
  maxWidth: '18rem',
  size: 'large',
  settings: null,
})

defineEmits<{
  clear: []
}>()

/**
 * Calculate positioning based on settings or legacy size prop
 */
const computedImageStyle = computed(() => {
  // Premium: Use custom settings if provided
  if (props.settings) {
    const { position, scale, opacity, rotation } = props.settings
    
    // Calculate position based on anchor
    const positionStyles: Record<string, string> = {}
    
    switch (position.anchor) {
      case 'top-left':
        positionStyles.top = `${position.y}${position.yUnit}`
        positionStyles.left = `${position.x}${position.xUnit}`
        break
      case 'top-right':
        positionStyles.top = `${position.y}${position.yUnit}`
        positionStyles.right = `${position.x}${position.xUnit}`
        break
      case 'bottom-left':
        positionStyles.bottom = `${position.y}${position.yUnit}`
        positionStyles.left = `${position.x}${position.xUnit}`
        break
      case 'bottom-right':
        positionStyles.bottom = `${position.y}${position.yUnit}`
        positionStyles.right = `${position.x}${position.xUnit}`
        break
      case 'center':
        positionStyles.top = '50%'
        positionStyles.left = '50%'
        positionStyles.transform = `translate(-50%, -50%) rotate(${rotation}deg)`
        break
    }
    
    // Apply transform for rotation (if not center, which handles it above)
    if (position.anchor !== 'center' && rotation !== 0) {
      positionStyles.transform = `rotate(${rotation}deg)`
      positionStyles.transformOrigin = 'center'
    }
    
    return {
      ...positionStyles,
      maxHeight: `${scale}%`,
      maxWidth: `${scale}%`,
      opacity: opacity / 100,
    }
  }
  
  // Legacy: Use size prop for backward compatibility
  if (props.size === 'small') {
    return {
      bottom: '2%',
      right: '1.5%',
      maxHeight: '20%',
      maxWidth: '20%',
      opacity: 0.7,
    }
  }
  
  // Legacy: default 'large'
  return {
    bottom: '12px',
    right: '12px',
    maxHeight: '35%',
    maxWidth: '35%',
    opacity: 0.7,
  }
})
</script>
