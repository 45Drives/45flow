<template>
  <div class="watermark-customizer p-4 border border-default rounded-lg bg-default/20">
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-sm font-bold">Watermark Customization</h3>
    </div>

    <!-- 2-Column Layout -->
    <div class="grid grid-cols-2 gap-6">
      <!-- Left Column: Controls -->
      <div class="space-y-4">
        <!-- Image watermark (Pro: one card, exclusive with text) -->
        <div v-if="allowImage" :class="allowText ? 'space-y-4 p-3 border border-default rounded-lg bg-default/10' : 'space-y-4'" data-testid="wm-image-section">
          <label v-if="allowText" class="flex items-center gap-2 text-xs font-semibold">
            <input type="checkbox" :checked="imageOn" data-testid="wm-image-toggle"
              @change="toggleImage(($event.target as HTMLInputElement).checked)" />
            Image watermark
          </label>
          <template v-if="imageOn">
        <slot name="image-source" />
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
          </template>
        </div>

        <!-- Text watermark (Pro) -->
        <div v-if="allowText" class="space-y-3 p-3 border border-default rounded-lg bg-default/10" data-testid="wm-text-section">
          <label class="flex items-center gap-2 text-xs font-semibold">
            <input type="checkbox" :checked="!!text" data-testid="wm-text-toggle" @change="toggleText(($event.target as HTMLInputElement).checked)" />
            Text watermark
          </label>
          <template v-if="text">
            <div class="space-y-1">
              <label class="text-xs text-muted" :for="templateInputId">Text</label>
              <input :id="templateInputId" ref="templateInput" type="text" :maxlength="TEXT_TEMPLATE_MAX_LENGTH"
                :value="text.template" data-testid="wm-text-template"
                class="w-full px-2 py-1.5 text-sm border border-default rounded bg-default"
                @input="patchText({ template: ($event.target as HTMLInputElement).value })" />
              <div class="flex flex-wrap gap-1">
                <button v-for="v in WATERMARK_TEXT_VARIABLES" :key="v.token" type="button"
                  class="px-2 py-0.5 text-[11px] border border-default rounded-full bg-default hover:bg-default/60"
                  :title="`Insert ${v.label}`" @click="insertVariable(v.token)">{{ v.label }}</button>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-2">
              <label class="text-xs text-muted space-y-1">
                <span>Font</span>
                <select :value="text.font" class="w-full px-2 py-1 text-xs border border-default rounded bg-default"
                  @change="patchText({ font: ($event.target as HTMLSelectElement).value as WatermarkFont })">
                  <option value="sans-bold">Sans Bold</option>
                  <option value="sans">Sans</option>
                </select>
              </label>
              <label class="text-xs text-muted space-y-1">
                <span>Colour</span>
                <input type="color" :value="text.color" class="w-full h-7 border border-default rounded bg-default"
                  @input="patchText({ color: ($event.target as HTMLInputElement).value.toUpperCase() })" />
              </label>
            </div>
            <div class="flex items-center gap-4 text-xs">
              <label class="flex items-center gap-1"><input type="checkbox" :checked="text.outline"
                @change="patchText({ outline: ($event.target as HTMLInputElement).checked })" /> Outline</label>
              <label class="flex items-center gap-1"><input type="radio" :checked="text.layout === 'single'"
                @change="patchText({ layout: 'single' })" /> Once</label>
              <label class="flex items-center gap-1"><input type="radio" :checked="text.layout === 'tiled'"
                @change="patchText({ layout: 'tiled' })" /> Tiled</label>
            </div>
            <div v-if="text.layout === 'single'" class="space-y-1">
              <label class="text-xs text-muted">Position</label>
              <div class="grid grid-cols-3 gap-1">
                <button v-for="anchor in anchorOptions" :key="anchor.value" type="button"
                  class="px-2 py-1 text-[11px] border rounded transition-colors"
                  :class="text.settings.position.anchor === anchor.value ? 'border-primary bg-primary/20 text-primary font-semibold' : 'border-default bg-default hover:bg-default/60'"
                  @click="patchTextSettings({ position: { ...text.settings.position, anchor: anchor.value } })">{{ anchor.label }}</button>
              </div>
            </div>
            <div v-for="ctl in textSliders" :key="ctl.key" class="space-y-1">
              <div class="flex items-center justify-between">
                <label class="text-xs font-semibold">{{ ctl.label }}</label>
                <span class="text-xs font-mono text-muted">{{ text.settings[ctl.key] }}{{ ctl.unit }}</span>
              </div>
              <input type="range" :min="ctl.min" :max="ctl.max" step="1" :value="text.settings[ctl.key]"
                :style="getSliderStyle(text.settings[ctl.key], ctl.max, ctl.min)" class="w-full slider"
                @input="setTextSetting(ctl.key, parseInt(($event.target as HTMLInputElement).value))" />
            </div>
          </template>
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
            'cursor-grab': !isDragging && canDragPreview,
            'cursor-default': !canDragPreview
          }"
          @mousedown="startDrag"
        >
          <img
            v-if="imageOn && watermarkPreviewUrl"
            :src="watermarkPreviewUrl"
            alt="Watermark preview"
            class="absolute drop-shadow-md transition-opacity"
            :class="isDragging ? 'opacity-80' : 'opacity-100'"
            style="object-fit: contain; max-width: none; max-height: none; pointer-events: none;"
            :style="computedPreviewStyle"
          />
          <div v-if="text && text.layout === 'tiled'" class="absolute inset-0 overflow-hidden pointer-events-none" data-testid="wm-text-preview">
            <div class="absolute flex flex-wrap content-start" :style="tiledWrapperStyle">
              <span v-for="n in 60" :key="n" class="whitespace-nowrap" :style="textPreviewStyle">{{ previewText }}</span>
            </div>
          </div>
          <span v-else-if="text" class="absolute whitespace-nowrap pointer-events-none" :style="singleTextStyle"
            data-testid="wm-text-preview">{{ previewText }}</span>
        </div>
        <p class="text-xs text-muted italic">
          <span v-if="isDragging" class="text-primary font-semibold">Dragging...</span>
          <span v-else-if="text?.layout === 'tiled'" class="opacity-60">Tiled text covers the frame — position does not apply</span>
          <span v-else-if="previewPosition.anchor === 'center'" class="opacity-60">Center position is fixed — choose another anchor to enable dragging</span>
          <span v-else-if="canDragPreview">Drag the watermark to position it or use position controls</span>
          <span v-else>Enable a watermark to preview its position</span>
        </p>
        <p class="text-[10px] text-muted/50 italic">
          For images, actual placement may vary slightly depending on dimensions and aspect ratio.
        </p>
      </div>
    </div>

    <!-- Save Preset Dialog -->
    <FlowModal v-model="showSavePresetDialog" title="Save as Preset" size="sm" hide-close :busy="saving" body-class="space-y-4">
        <FlowField label="Preset Name">
          <template #default="{ id }">
          <input
            :id="id"
            ref="presetNameInput"
            data-autofocus
            v-model="newPresetName"
            type="text"
            placeholder="e.g., My Custom Watermark"
            class="w-full px-3 py-2 border border-default rounded-lg bg-default"
            @keyup.enter="handleSavePreset"
          />
          </template>
        </FlowField>
        
        <FlowField label="Description" optional>
          <template #default="{ id }">
          <textarea
            :id="id"
            v-model="newPresetDescription"
            placeholder="Optional description..."
            rows="2"
            class="w-full px-3 py-2 border border-default rounded-lg bg-default"
          ></textarea>
          </template>
        </FlowField>
        
        <div v-if="error" class="text-xs text-flow-danger">
          {{ error }}
        </div>
        
        <template #footer>
          <button
            @click="showSavePresetDialog = false"
            :disabled="saving"
            class="btn btn-dismiss px-4 py-2 h-fit"
          >
            Cancel
          </button>
          <button
            @click="handleSavePreset"
            :disabled="!newPresetName.trim() || saving"
            class="btn btn-primary px-4 py-2 h-fit flex-1"
          >
            {{ saving ? 'Saving...' : 'Save' }}
          </button>
        </template>
    </FlowModal>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import type { WatermarkSettings, WatermarkPosition, PositionAnchor, TextWatermarkLayer, WatermarkFont, TemplateSample } from '../types/watermark'
import {
  WATERMARK_TEXT_VARIABLES,
  TEXT_TEMPLATE_MAX_LENGTH,
  createDefaultTextLayer,
  resolveTemplatePreview,
} from '../types/watermark'
import { useWatermarkCustomization } from '../composables/useWatermarkCustomization'
import { pushNotification, Notification } from '@45drives/houston-common-ui'
import FlowModal from '../ui/FlowModal.vue'
import FlowField from '../ui/FlowField.vue'

const props = withDefaults(defineProps<{
  /** Pass existing settings to initialize */
  modelValue?: WatermarkSettings | null
  /** URL for watermark image preview */
  watermarkPreviewUrl?: string | null
  /** Text layer (Pro); null = no text. Only editable when allowText is set. */
  textLayer?: TextWatermarkLayer | null
  allowText?: boolean
  /** Values shown for template variables in the preview */
  previewSample?: TemplateSample | null
  /** Image layer on (Pro editor: image and text are exclusive) */
  imageEnabled?: boolean
  /** Hide the image card entirely (text-only editor) */
  allowImage?: boolean
}>(), {
  modelValue: null,
  watermarkPreviewUrl: null,
  textLayer: null,
  allowText: false,
  previewSample: null,
  imageEnabled: true,
  allowImage: true,
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: WatermarkSettings): void
  (e: 'update:textLayer', value: TextWatermarkLayer | null): void
  (e: 'update:imageEnabled', value: boolean): void
}>()

// ── Text layer ──────────────────────────────────────────────────────────
const text = computed(() => (props.allowText ? props.textLayer : null))
// With text allowed, the image and text watermarks are exclusive cards; otherwise image only.
const imageOn = computed(() => props.allowImage && (!props.allowText || (props.imageEnabled && !text.value)))
let lastText: TextWatermarkLayer | null = null
const templateInputId = `wm-text-template-${Math.random().toString(36).slice(2, 9)}`
const templateInput = ref<HTMLInputElement | null>(null)
const textSliders = [
  { key: 'scale', label: 'Text size', min: 1, max: 30, unit: '%' },
  { key: 'opacity', label: 'Text opacity', min: 0, max: 100, unit: '%' },
  { key: 'rotation', label: 'Text rotation', min: 0, max: 360, unit: '°' },
] as const

function emitText(next: TextWatermarkLayer | null) {
  emit('update:textLayer', next ? JSON.parse(JSON.stringify(next)) : null)
}
function toggleText(on: boolean) {
  if (on) {
    emitText(props.textLayer || lastText || createDefaultTextLayer())
    emit('update:imageEnabled', false)
  } else {
    lastText = props.textLayer
    emitText(null)
  }
}
function toggleImage(on: boolean) {
  if (on && props.textLayer) {
    lastText = props.textLayer
    emitText(null)
  }
  emit('update:imageEnabled', on)
}
function patchText(patch: Partial<TextWatermarkLayer>) {
  if (props.textLayer) emitText({ ...props.textLayer, ...patch })
}
function patchTextSettings(patch: Partial<WatermarkSettings>) {
  if (props.textLayer) emitText({ ...props.textLayer, settings: { ...props.textLayer.settings, ...patch } })
}
function setTextSetting(key: 'scale' | 'opacity' | 'rotation', value: number) {
  if (Number.isFinite(value)) patchTextSettings({ [key]: value } as Partial<WatermarkSettings>)
}
function insertVariable(token: string) {
  if (!props.textLayer) return
  const el = templateInput.value
  const value = props.textLayer.template
  const start = el?.selectionStart ?? value.length
  const end = el?.selectionEnd ?? value.length
  // Keep variables apart from the word before them ("{date} {company}", not "{date}{company}").
  const insert = start > 0 && !/\s/.test(value[start - 1]) ? ` ${token}` : token
  const next = (value.slice(0, start) + insert + value.slice(end)).slice(0, TEXT_TEMPLATE_MAX_LENGTH)
  patchText({ template: next })
  nextTick(() => {
    el?.focus()
    el?.setSelectionRange(start + insert.length, start + insert.length)
  })
}

const previewText = computed(() => resolveTemplatePreview(text.value?.template || '', {
  recipient: 'John Smith',
  email: 'john.smith@example.com',
  company: 'Example Co',
  link: 'Review link',
  ...Object.fromEntries(Object.entries(props.previewSample || {}).filter(([, v]) => !!v)),
}))

// Text height is a % of the frame height, like the server-rendered plate.
const previewHeight = ref(0)
let resizeObserver: ResizeObserver | null = null
onMounted(() => {
  if (typeof ResizeObserver === 'undefined') return
  resizeObserver = new ResizeObserver(([entry]) => { previewHeight.value = entry.contentRect.height })
  if (previewContainer.value) resizeObserver.observe(previewContainer.value)
})
onBeforeUnmount(() => resizeObserver?.disconnect())

const textPreviewStyle = computed(() => {
  const t = text.value
  if (!t) return {}
  const px = Math.max(6, (previewHeight.value || 180) * t.settings.scale / 100)
  return {
    fontFamily: "'DejaVu Sans', 'Verdana', sans-serif",
    fontWeight: t.font === 'sans-bold' ? '700' : '400',
    fontSize: `${px}px`,
    lineHeight: '1',
    color: t.color,
    opacity: t.settings.opacity / 100,
    textShadow: t.outline ? '0 0 2px rgba(0,0,0,.75), 0 0 1px rgba(0,0,0,.75)' : 'none',
  }
})
const singleTextStyle = computed(() => {
  const t = text.value
  if (!t) return {}
  const { position: p, rotation } = t.settings
  const s: Record<string, string> = {}
  const x = `${p.x}${p.xUnit}`
  const y = `${p.y}${p.yUnit}`
  if (p.anchor === 'center') {
    s.top = '50%'
    s.left = '50%'
    s.transform = `translate(-50%, -50%) rotate(${rotation}deg)`
  } else {
    if (p.anchor.startsWith('top')) s.top = y
    else s.bottom = y
    if (p.anchor.endsWith('left')) s.left = x
    else s.right = x
    if (rotation) s.transform = `rotate(${rotation}deg)`
  }
  return { ...textPreviewStyle.value, ...s }
})
const tiledWrapperStyle = computed(() => ({
  inset: '-50%',
  gap: `${Math.max(12, (previewHeight.value || 180) * 0.08)}px ${Math.max(16, (previewHeight.value || 180) * 0.1)}px`,
  transform: `rotate(${text.value?.settings.rotation || 0}deg)`,
}))

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
const previewPosition = computed(() => text.value?.settings.position || settings.value.position)
const previewDragLayer = computed(() => {
  if (text.value) return text.value.layout === 'single' ? 'text' : null
  return imageOn.value && props.watermarkPreviewUrl ? 'image' : null
})
const canDragPreview = computed(() => !!previewDragLayer.value && previewPosition.value.anchor !== 'center')
const previewContainer = ref<HTMLElement | null>(null)
const isDragging = ref(false)
const dragStartX = ref(0)
const dragStartY = ref(0)
const dragStartSettings = ref<WatermarkPosition | null>(null)
const dragLayer = ref<'text' | 'image' | null>(null)

/**
 * Start dragging watermark
 */
function startDrag(event: MouseEvent) {
  if (!canDragPreview.value || !previewContainer.value || event.button !== 0) return
  
  event.preventDefault()
  
  isDragging.value = true
  dragStartX.value = event.clientX
  dragStartY.value = event.clientY
  dragStartSettings.value = { ...previewPosition.value }
  dragLayer.value = previewDragLayer.value
  
  // Attach global listeners so drag works even when mouse leaves preview
  document.addEventListener('mousemove', drag)
  document.addEventListener('mouseup', stopDrag)
}

/**
 * Drag watermark and update position
 */
function drag(event: MouseEvent) {
  if (!isDragging.value || !dragStartSettings.value || !previewContainer.value) return
  if (!canDragPreview.value || dragLayer.value !== previewDragLayer.value) {
    stopDrag()
    return
  }
  
  const rect = previewContainer.value.getBoundingClientRect()
  let deltaX = event.clientX - dragStartX.value
  let deltaY = event.clientY - dragStartY.value
  
  const position = dragStartSettings.value
  
  // Invert delta for right/bottom anchors so watermark follows cursor
  // For 'right' anchors: x offset is from right edge, so moving right = decrease offset
  // For 'bottom' anchors: y offset is from bottom edge, so moving down = decrease offset
  const invertX = position.anchor.includes('right')
  const invertY = position.anchor.includes('bottom')
  
  if (invertX) deltaX = -deltaX
  if (invertY) deltaY = -deltaY
  
  // Convert pixel delta to position units
  let x: number
  let y: number
  if (position.xUnit === '%') {
    const deltaXPercent = (deltaX / rect.width) * 100
    // Allow positioning anywhere, clamp to reasonable bounds
    const newX = Math.max(-50, Math.min(100, dragStartSettings.value.x + deltaXPercent))
    x = Math.round(newX * 10) / 10
  } else {
    // Allow positioning anywhere in pixel mode
    const newX = Math.max(-500, Math.min(1000, dragStartSettings.value.x + deltaX))
    x = Math.round(newX)
  }
  
  if (position.yUnit === '%') {
    const deltaYPercent = (deltaY / rect.height) * 100
    const newY = Math.max(-50, Math.min(100, dragStartSettings.value.y + deltaYPercent))
    y = Math.round(newY * 10) / 10
  } else {
    const newY = Math.max(-500, Math.min(1000, dragStartSettings.value.y + deltaY))
    y = Math.round(newY)
  }
  if (dragLayer.value === 'text') {
    patchTextSettings({ position: { ...position, x, y } })
  } else {
    updatePosition({ x, y })
  }
}

/**
 * Stop dragging
 */
function stopDrag() {
  if (!isDragging.value) return
  
  isDragging.value = false
  dragStartSettings.value = null
  dragLayer.value = null
  
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
