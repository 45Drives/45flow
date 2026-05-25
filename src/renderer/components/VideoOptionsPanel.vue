<template>
  <div :data-tour="dataTour" class="flex flex-col gap-3">
    <span v-if="showHeading" class="font-semibold" :class="compact ? 'text-sm' : ''">Video Options</span>

    <div :class="compact ? 'grid grid-cols-3 gap-4 items-start' : 'grid grid-cols-3 gap-4 items-start'">
      <!-- Review Copies column -->
      <div :class="compact ? 'min-w-0' : 'rounded-md p-2.5 min-w-0'">
        <label class="font-semibold block" :class="compact ? 'text-sm mb-1' : 'mb-2'">Review Copies</label>

        <div v-if="proxyBlockReason" class="text-xs text-amber-700 dark:text-amber-300 mb-2">
          {{ proxyBlockReason }}
        </div>

        <div class="flex flex-wrap gap-x-3 gap-y-2">
          <label class="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" class="proxy-quality-checkbox" value="720p"
              :checked="proxyQualities.includes('720p')"
              @change="toggleQuality('720p', ($event.target as HTMLInputElement).checked)" />
            <span>720p</span>
          </label>
          <label class="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" class="proxy-quality-checkbox" value="1080p"
              :checked="proxyQualities.includes('1080p')"
              @change="toggleQuality('1080p', ($event.target as HTMLInputElement).checked)" />
            <span>1080p</span>
          </label>
          <label class="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" class="proxy-quality-checkbox" value="original"
              :checked="proxyQualities.includes('original')"
              @change="toggleQuality('original', ($event.target as HTMLInputElement).checked)" />
            <span>Full Res</span>
          </label>
        </div>
        <p class="text-xs text-slate-400 mt-2" v-if="!compact">
          {{ reviewCopyHelpText }}
        </p>
        <p v-else class="text-xs text-slate-400 mt-1">
          Lightweight MP4s for downloading &amp; offline review. A browser stream is always generated separately.
        </p>
      </div>

      <!-- Watermark column -->
      <div :class="compact ? 'col-span-2 min-w-0' : 'col-span-2 rounded-md p-2.5 min-w-0'">
        <div class="flex flex-wrap items-center gap-2 mb-2">
          <label class="font-semibold whitespace-nowrap" :class="compact ? 'text-sm' : ''">
            {{ watermarkLabel }}:
          </label>
          <Switch :modelValue="watermarkEnabled" @update:modelValue="$emit('update:watermarkEnabled', $event)"
            :disabled="watermarkSwitchDisabled"
            :title="watermarkSwitchTitle"
            :class="[
              watermarkEnabled ? 'bg-secondary' : 'bg-well',
              watermarkSwitchDisabled ? 'opacity-50 cursor-not-allowed' : '',
              'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-slate-600 focus:ring-offset-2'
            ]">
            <span class="sr-only">Toggle watermark</span>
            <span aria-hidden="true" :class="[
              watermarkEnabled ? 'translate-x-5' : 'translate-x-0',
              'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-default shadow ring-0 transition duration-200 ease-in-out'
            ]" />
          </Switch>
          <span class="text-sm truncate min-w-0 flex-1" :title="watermarkSwitchTitle">
            {{ watermarkStatusText }}
          </span>
        </div>

        <div v-if="watermarkBlockReason" class="text-xs text-amber-700 dark:text-amber-300 mb-2">
          {{ watermarkBlockReason }}
        </div>

        <div v-if="watermarkEnabled" class="flex flex-row items-center gap-2 mb-2">
          <button class="btn btn-secondary" :class="compact ? 'text-xs' : ''" @click="$emit('pickWatermark')">
            {{ pickButtonLabel }}
          </button>
          <span class="text-sm truncate min-w-0" :title="effectiveWatermarkName || 'No image selected'">
            {{ effectiveWatermarkName || (usingExistingWatermark ? 'Using existing watermark' : 'No image selected') }}
          </span>
          <select :value="selectedExistingWatermark" @change="$emit('update:selectedExistingWatermark', ($event.target as HTMLSelectElement).value)"
            :class="compact ? 'input-textlike border rounded px-2 py-1 text-xs min-w-[14rem]' : 'input-textlike border rounded px-2 py-1 text-sm min-w-[16rem]'">
            <option value="">{{ compact ? 'Existing watermark…' : 'Select existing watermark file…' }}</option>
            <option v-for="wm in existingWatermarkFiles" :key="wm" :value="wm">{{ wm }}</option>
          </select>
          <button class="btn btn-secondary px-2 py-1 text-xs" @click="$emit('refreshWatermarks')">Refresh</button>
        </div>

        <p v-if="watermarkEnabled && !watermarkFile && !selectedExistingWatermark && !usingExistingWatermark"
          class="text-xs text-amber-700 dark:text-amber-300 mb-2">
          Select a watermark image to continue.
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Switch } from '@headlessui/vue'

type LocalFile = { path: string; name: string; size: number; dataUrl?: string | null }

const props = withDefaults(defineProps<{
  /** data-tour attribute */
  dataTour?: string
  /** Use compact styling (QuickShare) */
  compact?: boolean
  /** Show "Video Options" heading */
  showHeading?: boolean
  /** Review copy quality selections */
  proxyQualities: string[]
  /** Watermark toggle state */
  watermarkEnabled: boolean
  /** The locally picked watermark file (if any) */
  watermarkFile: LocalFile | null
  /** Currently selected existing watermark path */
  selectedExistingWatermark: string
  /** Available existing watermark files on server */
  existingWatermarkFiles: string[]
  /** Computed display name of the active watermark */
  effectiveWatermarkName?: string
  /** Whether using an already-existing watermark (no new file picked) */
  usingExistingWatermark?: boolean
  /** Label for the watermark toggle */
  watermarkLabel?: string
  /** Label for the pick button */
  pickButtonLabel?: string
  /** Whether the watermark switch is disabled */
  watermarkSwitchDisabled?: boolean
  /** Tooltip / title for watermark switch */
  watermarkSwitchTitle?: string
  /** Status text next to the watermark toggle */
  watermarkStatusText?: string
  /** Blocking reason text for proxy (preflight) */
  proxyBlockReason?: string
  /** Blocking reason text for watermark (preflight) */
  watermarkBlockReason?: string
  /** Help text below review copies */
  reviewCopyHelpText?: string
}>(), {
  dataTour: '',
  compact: false,
  showHeading: true,
  effectiveWatermarkName: '',
  usingExistingWatermark: false,
  watermarkLabel: 'Watermark',
  pickButtonLabel: 'Browse…',
  watermarkSwitchDisabled: false,
  watermarkSwitchTitle: '',
  watermarkStatusText: '',
  proxyBlockReason: '',
  watermarkBlockReason: '',
  reviewCopyHelpText: 'Lightweight MP4s for downloading & offline review. A browser stream is always generated separately. The original file is always preserved.',
})

const emit = defineEmits<{
  'update:proxyQualities': [value: string[]]
  'update:watermarkEnabled': [value: boolean]
  'update:selectedExistingWatermark': [value: string]
  pickWatermark: []
  clearWatermark: []
  refreshWatermarks: []
}>()

function toggleQuality(quality: string, checked: boolean) {
  if (checked) {
    emit('update:proxyQualities', [...new Set([...props.proxyQualities, quality])])
  } else {
    emit('update:proxyQualities', props.proxyQualities.filter(q => q !== quality))
  }
}
</script>
