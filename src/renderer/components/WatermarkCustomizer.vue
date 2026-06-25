<template>
  <div class="watermark-customizer p-4 border border-default rounded-lg bg-default/20">
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-sm font-bold">Watermark Customization</h3>
    </div>

    <!-- 2-Column Layout -->
    <div class="grid grid-cols-2 gap-6">
      <!-- Left Column: Controls -->
      <div class="space-y-4">
        <!-- Preset Selector -->
        <div class="space-y-2">
          <label class="text-xs font-semibold text-muted">Quick Presets</label>
          <div class="flex items-center gap-2">
            <select
              :value="selectedPresetId || ''"
              @change="handlePresetChange"
              class="flex-1 px-3 py-2 text-sm border border-default rounded-lg bg-default"
            >
              <option value="" disabled>Custom Settings</option>
              <optgroup label="Default Presets">
                <option
                  v-for="preset in defaultPresets"
                  :key="preset.id"
                  :value="preset.id"
                >
                  {{ preset.name }}
                </option>
              </optgroup>
              <optgroup v-if="customPresets.length > 0" label="My Presets">
                <option
                  v-for="preset in customPresets"
                  :key="preset.id"
                  :value="preset.id"
                >
                  {{ preset.name }}
                </option>
              </optgroup>
            </select>
            
            <button
              v-if="selectedPresetId && currentPreset?.isCustom"
              @click="confirmDeletePreset"
              class="btn btn-danger px-3 py-2 text-xs h-fit"
              title="Delete custom preset"
            >
              Delete
            </button>
          </div>
          
          <p v-if="currentPreset?.description" class="text-xs text-muted italic">
            {{ currentPreset.description }}
          </p>
        </div>

        <!-- Position Controls (Collapsible) -->
        <div class="space-y-3 p-3 border border-default rounded-lg bg-default/10">
          <button
            @click="showAdvancedPosition = !showAdvancedPosition"
            class="flex items-center justify-between w-full text-left hover:opacity-80 transition-opacity"
          >
            <span class="text-xs font-semibold">Position</span>
            <div class="flex items-center gap-2">
              <span v-if="isCustomSettings" class="text-xs text-primary italic">Custom</span>
              <svg
                class="w-4 h-4 transition-transform"
                :class="showAdvancedPosition ? 'rotate-180' : ''"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </button>
          <p v-if="!showAdvancedPosition" class="text-xs text-muted italic">Drag the watermark in the preview to position it</p>

          <div v-show="showAdvancedPosition" class="space-y-3 pt-2">
            <!-- Anchor Point -->
            <div class="space-y-2">
              <label class="text-xs text-muted">Anchor Point</label>
            <div class="grid grid-cols-3 gap-1">
              <button
                v-for="anchor in anchorOptions"
                :key="anchor.value"
                @click="updatePosition({ anchor: anchor.value })"
                class="px-2 py-1.5 text-xs border rounded transition-colors"
                :class="
                  settings.position.anchor === anchor.value
                    ? 'border-primary bg-primary/20 text-primary font-semibold'
                    : 'border-default bg-default hover:bg-default/60'
                "
              >
                {{ anchor.label }}
              </button>
            </div>
          </div>

          <!-- Offset X -->
          <div class="space-y-1">
            <div class="flex items-center justify-between">
              <label class="text-xs text-muted">Horizontal Offset</label>
              <div class="flex items-center gap-1">
                <input
                  type="number"
                  :min="0"
                  :max="settings.position.xUnit === '%' ? 50 : 200"
                  :step="settings.position.xUnit === '%' ? 0.5 : 5"
                  :value="settings.position.x"
                  @input="updatePosition({ x: clampInput(parseFloat(($event.target as HTMLInputElement).value), 0, settings.position.xUnit === '%' ? 50 : 200) })"
                  :disabled="settings.position.anchor === 'center'"
                  class="w-14 px-1.5 py-0.5 text-xs font-mono text-right border border-default rounded bg-default"
                />
                <span class="text-xs text-muted">{{ settings.position.xUnit }}</span>
              </div>
            </div>
            <input
              type="range"
              :min="settings.position.xUnit === '%' ? 0 : 0"
              :max="settings.position.xUnit === '%' ? 50 : 200"
              :step="settings.position.xUnit === '%' ? 0.5 : 5"
              :value="settings.position.x"
              @input="updatePosition({ x: parseFloat(($event.target as HTMLInputElement).value) })"
              :style="getSliderStyle(settings.position.x, settings.position.xUnit === '%' ? 50 : 200)"
              :disabled="settings.position.anchor === 'center'"
              class="w-full slider"
            />
            <div class="flex items-center gap-2">
              <label class="text-xs">
                <input
                  type="radio"
                  :checked="settings.position.xUnit === '%'"
                  @change="updatePosition({ xUnit: '%' })"
                />
                %
              </label>
              <label class="text-xs">
                <input
                  type="radio"
                  :checked="settings.position.xUnit === 'px'"
                  @change="updatePosition({ xUnit: 'px' })"
                />
                px
              </label>
            </div>
          </div>

          <!-- Offset Y -->
          <div class="space-y-1">
            <div class="flex items-center justify-between">
              <label class="text-xs text-muted">Vertical Offset</label>
              <div class="flex items-center gap-1">
                <input
                  type="number"
                  :min="0"
                  :max="settings.position.yUnit === '%' ? 50 : 200"
                  :step="settings.position.yUnit === '%' ? 0.5 : 5"
                  :value="settings.position.y"
                  @input="updatePosition({ y: clampInput(parseFloat(($event.target as HTMLInputElement).value), 0, settings.position.yUnit === '%' ? 50 : 200) })"
                  :disabled="settings.position.anchor === 'center'"
                  class="w-14 px-1.5 py-0.5 text-xs font-mono text-right border border-default rounded bg-default"
                />
                <span class="text-xs text-muted">{{ settings.position.yUnit }}</span>
              </div>
            </div>
            <input
              type="range"
              :min="settings.position.yUnit === '%' ? 0 : 0"
              :max="settings.position.yUnit === '%' ? 50 : 200"
              :step="settings.position.yUnit === '%' ? 0.5 : 5"
              :value="settings.position.y"
              @input="updatePosition({ y: parseFloat(($event.target as HTMLInputElement).value) })"
              :style="getSliderStyle(settings.position.y, settings.position.yUnit === '%' ? 50 : 200)"
              :disabled="settings.position.anchor === 'center'"
              class="w-full slider"
            />
            <div class="flex items-center gap-2">
              <label class="text-xs">
                <input
                  type="radio"
                  :checked="settings.position.yUnit === '%'"
                  @change="updatePosition({ yUnit: '%' })"
                />
                %
              </label>
              <label class="text-xs">
                <input
                  type="radio"
                  :checked="settings.position.yUnit === 'px'"
                  @change="updatePosition({ yUnit: 'px' })"
                />
                px
              </label>
            </div>
          </div>
          </div>
        </div>

        <!-- Scale Control -->
        <div class="space-y-1">
          <div class="flex items-center justify-between">
            <label class="text-xs font-semibold">Scale</label>
            <div class="flex items-center gap-1">
              <input
                type="number"
                min="10"
                max="100"
                step="1"
                :value="settings.scale"
                @input="updateScale(clampInput(parseInt(($event.target as HTMLInputElement).value), 10, 100))"
                class="w-14 px-1.5 py-0.5 text-xs font-mono text-right border border-default rounded bg-default"
              />
              <span class="text-xs text-muted">%</span>
            </div>
          </div>
          <input
            type="range"
            min="10"
            max="100"
            step="1"
            :value="settings.scale"
            @input="updateScale(parseInt(($event.target as HTMLInputElement).value))"
            :style="getSliderStyle(settings.scale, 100, 10)"
            class="w-full slider"
          />
          <div class="flex justify-between text-xs text-muted">
            <span>Small (10%)</span>
            <span>Large (100%)</span>
          </div>
        </div>

        <!-- Opacity Control -->
        <div class="space-y-1">
          <div class="flex items-center justify-between">
            <label class="text-xs font-semibold">Opacity</label>
            <div class="flex items-center gap-1">
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                :value="settings.opacity"
                @input="updateOpacity(clampInput(parseInt(($event.target as HTMLInputElement).value), 0, 100))"
                class="w-14 px-1.5 py-0.5 text-xs font-mono text-right border border-default rounded bg-default"
              />
              <span class="text-xs text-muted">%</span>
            </div>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            :value="settings.opacity"
            @input="updateOpacity(parseInt(($event.target as HTMLInputElement).value))"
            :style="getSliderStyle(settings.opacity, 100)"
            class="w-full slider"
          />
          <div class="flex justify-between text-xs text-muted">
            <span>Transparent (0%)</span>
            <span>Opaque (100%)</span>
          </div>
        </div>

        <!-- Rotation Control -->
        <div class="space-y-1">
          <div class="flex items-center justify-between">
            <label class="text-xs font-semibold">Rotation</label>
            <div class="flex items-center gap-1">
              <input
                type="number"
                min="0"
                max="360"
                step="1"
                :value="settings.rotation"
                @input="updateRotation(clampInput(parseInt(($event.target as HTMLInputElement).value), 0, 360))"
                class="w-14 px-1.5 py-0.5 text-xs font-mono text-right border border-default rounded bg-default"
              />
              <span class="text-xs text-muted">°</span>
            </div>
          </div>
          <input
            type="range"
            min="0"
            max="360"
            step="1"
            :value="settings.rotation"
            @input="updateRotation(parseInt(($event.target as HTMLInputElement).value))"
            :style="getSliderStyle(settings.rotation, 360)"
            class="w-full slider"
          />
          <div class="flex justify-between text-xs text-muted">
            <span>0°</span>
            <span>180°</span>
            <span>360°</span>
          </div>
        </div>

        <!-- Actions -->
        <div class="flex items-center gap-2 pt-2 border-t border-default">
          <button
            @click="showSavePresetDialog = true"
            :disabled="!isCustomSettings"
            class="btn btn-primary px-4 py-2 text-xs h-fit flex-1"
          >
            Save as Preset
          </button>
          <button
            @click="reset"
            class="btn btn-secondary px-4 py-2 text-xs h-fit"
          >
            Reset
          </button>
        </div>
      </div>

      <!-- Right Column: Live Preview -->
      <div class="space-y-2">
        <label class="text-xs font-semibold text-muted">Live Preview</label>
        <div
          ref="previewContainer"
          class="relative aspect-video w-full rounded-md border border-default bg-gradient-to-br from-slate-700/40 via-slate-800/40 to-slate-900/60 overflow-hidden select-none"
          :class="{ 
            'cursor-grabbing': isDragging, 
            'cursor-grab': !isDragging && watermarkPreviewUrl && settings.position.anchor !== 'center',
            'cursor-default': settings.position.anchor === 'center'
          }"
          @mousedown="startDrag"
        >
          <img
            v-if="watermarkPreviewUrl"
            :src="watermarkPreviewUrl"
            alt="Watermark preview"
            class="absolute drop-shadow-md transition-opacity"
            :class="isDragging ? 'opacity-80' : 'opacity-100'"
            style="object-fit: contain; max-width: none; max-height: none; pointer-events: none;"
            :style="computedPreviewStyle"
          />
        </div>
        <p class="text-xs text-muted italic">
          <span v-if="isDragging" class="text-primary font-semibold">Dragging...</span>
          <span v-else-if="settings.position.anchor === 'center'" class="opacity-60">Center position is fixed — use advanced controls to adjust offsets</span>
          <span v-else>Drag the watermark to position it or use advanced controls</span>
        </p>
        <p class="text-[10px] text-muted/50 italic">
          For images, actual placement may vary slightly depending on dimensions and aspect ratio.
        </p>
      </div>
    </div>

    <!-- Save Preset Dialog -->
    <div
      v-if="showSavePresetDialog"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      @click.self="showSavePresetDialog = false"
    >
      <div class="bg-accent border border-default rounded-lg p-4 w-96 space-y-4">
        <h3 class="text-lg font-bold">Save as Preset</h3>
        
        <div class="space-y-2">
          <label class="text-sm font-semibold">Preset Name</label>
          <input
            ref="presetNameInput"
            v-model="newPresetName"
            type="text"
            placeholder="e.g., My Custom Watermark"
            class="w-full px-3 py-2 border border-default rounded-lg bg-default"
            @keyup.enter="handleSavePreset"
          />
        </div>
        
        <div class="space-y-2">
          <label class="text-sm font-semibold">Description (optional)</label>
          <textarea
            v-model="newPresetDescription"
            placeholder="Optional description..."
            rows="2"
            class="w-full px-3 py-2 border border-default rounded-lg bg-default"
          ></textarea>
        </div>
        
        <div v-if="error" class="text-xs text-red-500">
          {{ error }}
        </div>
        
        <div class="flex items-center gap-2">
          <button
            @click="handleSavePreset"
            :disabled="!newPresetName.trim() || saving"
            class="btn btn-primary px-4 py-2 h-fit flex-1"
          >
            {{ saving ? 'Saving...' : 'Save' }}
          </button>
          <button
            @click="showSavePresetDialog = false"
            :disabled="saving"
            class="btn btn-secondary px-4 py-2 h-fit"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import type { WatermarkSettings, PositionAnchor } from '../types/watermark'
import { useWatermarkCustomization } from '../composables/useWatermarkCustomization'
import { pushNotification, Notification } from '@45drives/houston-common-ui'

const props = withDefaults(defineProps<{
  /** Pass existing settings to initialize */
  modelValue?: WatermarkSettings | null
  /** URL for watermark image preview */
  watermarkPreviewUrl?: string | null
}>(), {
  modelValue: null,
  watermarkPreviewUrl: null,
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: WatermarkSettings): void
}>()

const {
  settings,
  presets,
  selectedPresetId,
  currentPreset,
  isCustomSettings,
  saving,
  error,
  loadUserPresets,
  applyPreset,
  saveAsPreset,
  deletePreset,
  updatePosition,
  updateScale,
  updateOpacity,
  updateRotation,
  reset: resetSettings,
} = useWatermarkCustomization({ autoSave: false })

// Load user presets on mount
onMounted(() => {
  loadUserPresets()
})

// Initialize from props if provided
if (props.modelValue) {
  settings.value = { ...props.modelValue }
}

// Watch for external modelValue changes (e.g. parent re-seeds after details load)
watch(() => props.modelValue, (newVal) => {
  if (newVal && JSON.stringify(newVal) !== JSON.stringify(settings.value)) {
    settings.value = { ...newVal }
  }
}, { deep: true })

// Emit changes to parent
const emitUpdate = () => {
  emit('update:modelValue', settings.value)
}

// Watch settings and emit changes
watch(settings, emitUpdate, { deep: true })

// Anchor options
const anchorOptions = [
  { value: 'top-left' as PositionAnchor, label: '↖ Top Left' },
  { value: 'top-right' as PositionAnchor, label: '↗ Top Right' },
  { value: 'center' as PositionAnchor, label: '⊙ Center' },
  { value: 'bottom-left' as PositionAnchor, label: '↙ Bottom Left' },
  { value: 'bottom-right' as PositionAnchor, label: '↘ Bottom Right' },
]

// Separate default and custom presets
const defaultPresets = computed(() => presets.value.filter(p => !p.isCustom))
const customPresets = computed(() => presets.value.filter(p => p.isCustom))

// Handle preset selection
function handlePresetChange(event: Event) {
  const presetId = (event.target as HTMLSelectElement).value
  if (presetId) {
    applyPreset(presetId)
  }
}

// Save preset dialog
const showSavePresetDialog = ref(false)
const newPresetName = ref('')
const newPresetDescription = ref('')
const presetNameInput = ref<HTMLInputElement | null>(null)

// Auto-focus preset name input when dialog opens
watch(showSavePresetDialog, async (isOpen) => {
  if (isOpen) {
    await nextTick()
    presetNameInput.value?.focus()
  }
})

async function handleSavePreset() {
  const success = await saveAsPreset(newPresetName.value, newPresetDescription.value)
  
  if (success) {
    pushNotification(
      new Notification(
        'Preset Saved',
        `"${newPresetName.value}" has been saved to your presets`,
        'success',
        3000
      )
    )
    showSavePresetDialog.value = false
    newPresetName.value = ''
    newPresetDescription.value = ''
  }
}

// Collapsible position controls
const showAdvancedPosition = ref(false)

// Drag-to-position state
const previewContainer = ref<HTMLElement | null>(null)
const isDragging = ref(false)
const dragStartX = ref(0)
const dragStartY = ref(0)
const dragStartSettings = ref<{ x: number; y: number } | null>(null)

/**
 * Start dragging watermark
 */
function startDrag(event: MouseEvent) {
  if (!props.watermarkPreviewUrl || !previewContainer.value) return
  
  // Disable dragging when center anchor is selected (offsets don't apply)
  if (settings.value.position.anchor === 'center') return
  
  event.preventDefault()
  
  isDragging.value = true
  dragStartX.value = event.clientX
  dragStartY.value = event.clientY
  dragStartSettings.value = {
    x: settings.value.position.x,
    y: settings.value.position.y,
  }
  
  // Attach global listeners so drag works even when mouse leaves preview
  document.addEventListener('mousemove', drag)
  document.addEventListener('mouseup', stopDrag)
}

/**
 * Drag watermark and update position
 */
function drag(event: MouseEvent) {
  if (!isDragging.value || !dragStartSettings.value || !previewContainer.value) return
  
  const rect = previewContainer.value.getBoundingClientRect()
  let deltaX = event.clientX - dragStartX.value
  let deltaY = event.clientY - dragStartY.value
  
  const { position } = settings.value
  
  // Invert delta for right/bottom anchors so watermark follows cursor
  // For 'right' anchors: x offset is from right edge, so moving right = decrease offset
  // For 'bottom' anchors: y offset is from bottom edge, so moving down = decrease offset
  const invertX = position.anchor.includes('right')
  const invertY = position.anchor.includes('bottom')
  
  if (invertX) deltaX = -deltaX
  if (invertY) deltaY = -deltaY
  
  // Convert pixel delta to position units
  if (position.xUnit === '%') {
    const deltaXPercent = (deltaX / rect.width) * 100
    // Allow positioning anywhere, clamp to reasonable bounds
    const newX = Math.max(-50, Math.min(100, dragStartSettings.value.x + deltaXPercent))
    updatePosition({ x: Math.round(newX * 10) / 10 })
  } else {
    // Allow positioning anywhere in pixel mode
    const newX = Math.max(-500, Math.min(1000, dragStartSettings.value.x + deltaX))
    updatePosition({ x: Math.round(newX) })
  }
  
  if (position.yUnit === '%') {
    const deltaYPercent = (deltaY / rect.height) * 100
    const newY = Math.max(-50, Math.min(100, dragStartSettings.value.y + deltaYPercent))
    updatePosition({ y: Math.round(newY * 10) / 10 })
  } else {
    const newY = Math.max(-500, Math.min(1000, dragStartSettings.value.y + deltaY))
    updatePosition({ y: Math.round(newY) })
  }
}

/**
 * Stop dragging
 */
function stopDrag() {
  if (!isDragging.value) return
  
  isDragging.value = false
  dragStartSettings.value = null
  
  // Remove global listeners
  document.removeEventListener('mousemove', drag)
  document.removeEventListener('mouseup', stopDrag)
}

// Clean up global event listeners on component unmount
onBeforeUnmount(() => {
  document.removeEventListener('mousemove', drag)
  document.removeEventListener('mouseup', stopDrag)
})

// Delete preset confirmation
function confirmDeletePreset() {
  if (!currentPreset.value || !currentPreset.value.isCustom) return
  
  if (confirm(`Delete preset "${currentPreset.value.name}"?`)) {
    deletePreset(currentPreset.value.id).then(success => {
      if (success) {
        pushNotification(
          new Notification(
            'Preset Deleted',
            `"${currentPreset.value?.name}" has been deleted`,
            'success',
            2000
          )
        )
      }
    })
  }
}

// Reset function
function reset() {
  resetSettings()
  emitUpdate()
}

/**
 * Calculate live preview positioning based on current settings
 */
const computedPreviewStyle = computed(() => {
  const { position, scale, opacity, rotation } = settings.value
  
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
  
  // Scale watermark to match FFmpeg behavior (height-based scaling, width maintains aspect ratio)
  return {
    ...positionStyles,
    height: `${scale}%`,
    width: 'auto',
    opacity: opacity / 100,
  }
})

/**
 * Clamp a number input value to min/max, handling NaN from empty inputs
 */
const clampInput = (value: number, min: number, max: number): number => {
  if (isNaN(value)) return min
  return Math.min(max, Math.max(min, value))
}

/**
 * Calculate slider track fill percentage for dynamic styling
 * Handles sliders with non-zero min values (like scale: 10-100)
 * Uses theme gradient colors from btn-primary
 */
const getSliderStyle = (value: number, max: number, min: number = 0) => {
  const percentage = ((value - min) / (max - min)) * 100
  // Determine track color based on theme
  const theme = document.documentElement.getAttribute('data-theme') || ''
  const darkThemes = ['dark', 'dark-blue', 'dark-purple', 'midnight', 'sunset', 'aurora', 
                      'neon', 'ocean', 'forest', 'galaxy', 'cyberpunk', 'ember', 'storm', 'magma']
  const isDarkTheme = darkThemes.some(t => theme === t || theme.includes(t))
  const trackBg = isDarkTheme ? '#4b5563' : '#9ca3af'
  
  return {
    background: `linear-gradient(to right, var(--btn-primary-bg) 0%, var(--btn-primary-bg) ${percentage}%, ${trackBg} ${percentage}%, ${trackBg} 100%)`
  }
}
</script>

<style scoped>
/* Range slider styling - visible in both light and dark mode */
input[type="range"].slider {
  -webkit-appearance: none;
  appearance: none;
  height: 6px;
  border-radius: 3px;
  outline: none;
  touch-action: none;
  /* No background transition - causes lag during drag */
}

input[type="range"].slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--btn-primary-bg);
  cursor: pointer;
  border: 2px solid white;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  transition: transform 0.1s, box-shadow 0.1s;
}

input[type="range"].slider::-webkit-slider-thumb:hover {
  transform: scale(1.1);
  box-shadow: 0 3px 6px rgba(0, 0, 0, 0.3);
}
input[type="range"].slider:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

input[type="range"].slider:disabled::-webkit-slider-thumb {
  cursor: not-allowed;
  background: #6b7280;
}
input[type="range"].slider::-webkit-slider-thumb:active {
  transform: scale(1.15);
  box-shadow: 0 4px 8px var(--btn-primary-bg);
}

input[type="range"].slider::-moz-range-thumb {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--btn-primary-bg);
  cursor: pointer;
  border: 2px solid white;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  transition: transform 0.1s, box-shadow 0.1s;
}

input[type="range"].slider::-moz-range-thumb:hover {
  transform: scale(1.1);
  box-shadow: 0 3px 6px rgba(0, 0, 0, 0.3);
}

input[type="range"].slider::-moz-range-thumb:active {
  transform: scale(1.15);
  box-shadow: 0 4px 8px var(--btn-primary-bg);
}
</style>
