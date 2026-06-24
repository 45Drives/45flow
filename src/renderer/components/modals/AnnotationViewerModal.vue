<template>
  <div v-if="modelValue && comment" class="fixed inset-0 z-[200]">
    <div class="absolute inset-0 bg-black/80" @click="close"></div>

    <div class="absolute inset-8 mx-auto max-w-5xl max-h-[90vh] bg-accent border border-default rounded-lg shadow-2xl z-[201] flex flex-col">
      <!-- Header -->
      <div class="flex items-center justify-between px-5 py-4 border-b border-default shrink-0 bg-well">
        <div class="flex-1 min-w-0">
          <h3 class="text-xl font-bold flex items-center gap-2 m-5">
            <PencilIcon class="w-5 h-5 m-2" />
            View Annotation
          </h3>
          <p class="text-xs text-muted mt-0.5">
            {{ comment.file_name || 'Unknown file' }} • {{ formatTimecode(comment.start_seconds) }}
          </p>
        </div>
        <button class="btn btn-danger px-4 py-2 h-fit" @click="close">Close</button>
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="flex-1 flex items-center justify-center">
        <div class="flex items-center gap-3 px-4 py-3 rounded-lg bg-default/60 border border-default shadow-sm">
          <span class="inline-block w-4 h-4 border-2 border-default border-t-transparent rounded-full animate-spin"></span>
          <div class="flex flex-col leading-tight">
            <div class="text-sm font-semibold text-default">Loading frame...</div>
            <div class="text-xs text-muted">Extracting video frame</div>
          </div>
        </div>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="flex-1 flex items-center justify-center p-8">
        <div class="p-4 rounded bg-red-900/30 text-default border border-red-800 max-w-md">
          <div class="font-semibold mb-1">Failed to load annotation</div>
          <div class="text-sm opacity-80">{{ error }}</div>
        </div>
      </div>

      <!-- Main Content -->
      <div v-else class="flex-1 flex min-h-0 overflow-hidden">
        <!-- Left: Preview -->
        <div class="flex-1 flex flex-col p-6 min-h-0 overflow-hidden">
          <div class="flex-1 flex items-center justify-center min-h-0">
            <div ref="imageContainerRef" class="relative inline-block max-w-full max-h-full">
              <!-- Frame Image -->
              <img
                v-if="frameDataUrl"
                ref="frameImageRef"
                :src="frameDataUrl"
                alt="Video frame"
                class="max-w-full max-h-full object-contain rounded border border-default shadow-lg block"
                @load="onImageLoad"
              />
              
              <!-- Annotation Overlay -->
              <svg
                v-if="frameDataUrl && annotationData && displayWidth && displayHeight"
                class="absolute top-0 left-0 pointer-events-none"
                :width="displayWidth"
                :height="displayHeight"
                :viewBox="`0 0 ${frameWidth} ${frameHeight}`"
                preserveAspectRatio="xMidYMid meet"
                style="display: block;"
              >
                <!-- Render freehand paths -->
                <g v-if="annotationData.paths">
                  <path
                    v-for="(path, idx) in annotationData.paths"
                    :key="`path-${idx}`"
                    :d="createPathFromPoints(path.points)"
                    :stroke="path.color || '#ff0000'"
                    :stroke-width="path.width || 3"
                    fill="none"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </g>

                <!-- Render single legacy shape -->
                <g v-if="annotationData.shape">
                  <!-- Rectangle -->
                  <rect
                    v-if="annotationData.shape.type === 'rectangle' && annotationData.shape.start && annotationData.shape.end"
                    :x="Math.min(annotationData.shape.start.x, annotationData.shape.end.x)"
                    :y="Math.min(annotationData.shape.start.y, annotationData.shape.end.y)"
                    :width="Math.abs(annotationData.shape.end.x - annotationData.shape.start.x)"
                    :height="Math.abs(annotationData.shape.end.y - annotationData.shape.start.y)"
                    :stroke="annotationData.shape.color || '#ff0000'"
                    :stroke-width="annotationData.shape.width || 3"
                    :fill="annotationData.shape.fillColor || 'none'"
                  />
                  
                  <!-- Circle -->
                  <circle
                    v-else-if="annotationData.shape.type === 'circle' && annotationData.shape.start && annotationData.shape.end"
                    :cx="annotationData.shape.start.x"
                    :cy="annotationData.shape.start.y"
                    :r="annotationData.shape.radius || Math.hypot(annotationData.shape.end.x - annotationData.shape.start.x, annotationData.shape.end.y - annotationData.shape.start.y)"
                    :stroke="annotationData.shape.color || '#ff0000'"
                    :stroke-width="annotationData.shape.width || 3"
                    :fill="annotationData.shape.fillColor || 'none'"
                  />
                  
                  <!-- Arrow / Line -->
                  <line
                    v-else-if="(annotationData.shape.type === 'arrow' || annotationData.shape.type === 'line') && annotationData.shape.start && annotationData.shape.end"
                    :x1="annotationData.shape.start.x"
                    :y1="annotationData.shape.start.y"
                    :x2="annotationData.shape.end.x"
                    :y2="annotationData.shape.end.y"
                    :stroke="annotationData.shape.color || '#ff0000'"
                    :stroke-width="annotationData.shape.width || 3"
                    stroke-linecap="round"
                    :marker-end="annotationData.shape.type === 'arrow' ? `url(#arrowhead-${annotationData.shape.color?.replace('#', '')})` : undefined"
                  />
                </g>

                <!-- Render multiple shapes -->
                <g v-if="annotationData.shapes">
                  <g v-for="(shape, idx) in annotationData.shapes" :key="`shape-${idx}`">
                    <!-- Rectangle -->
                    <rect
                      v-if="shape.type === 'rectangle'"
                      :x="Math.min(shape.start.x, shape.end.x)"
                      :y="Math.min(shape.start.y, shape.end.y)"
                      :width="Math.abs(shape.end.x - shape.start.x)"
                      :height="Math.abs(shape.end.y - shape.start.y)"
                      :stroke="shape.color || '#ff0000'"
                      :stroke-width="shape.width || 3"
                      fill="none"
                    />
                    
                    <!-- Circle -->
                    <circle
                      v-else-if="shape.type === 'circle'"
                      :cx="shape.start.x"
                      :cy="shape.start.y"
                      :r="Math.hypot(shape.end.x - shape.start.x, shape.end.y - shape.start.y)"
                      :stroke="shape.color || '#ff0000'"
                      :stroke-width="shape.width || 3"
                      fill="none"
                    />
                    
                    <!-- Arrow / Line -->
                    <line
                      v-else-if="shape.type === 'arrow' || shape.type === 'line'"
                      :x1="shape.start.x"
                      :y1="shape.start.y"
                      :x2="shape.end.x"
                      :y2="shape.end.y"
                      :stroke="shape.color || '#ff0000'"
                      :stroke-width="shape.width || 3"
                      stroke-linecap="round"
                      :marker-end="shape.type === 'arrow' ? `url(#arrowhead-${shape.color?.replace('#', '')})` : undefined"
                    />
                  </g>
                </g>

                <!-- Arrow marker definitions (create one for each unique color) -->
                <defs>
                  <marker
                    v-for="color in uniqueColors"
                    :key="`arrow-${color}`"
                    :id="`arrowhead-${color.replace('#', '')}`"
                    markerWidth="10"
                    markerHeight="10"
                    refX="9"
                    refY="3"
                    orient="auto"
                  >
                    <polygon
                      points="0 0, 10 3, 0 6"
                      :fill="color"
                    />
                  </marker>
                </defs>
              </svg>

              <!-- No frame fallback -->
              <div v-if="!frameDataUrl" class="flex items-center justify-center w-full h-64 bg-default/20 rounded border border-default">
                <div class="text-muted text-center">
                  <div class="text-sm font-semibold">Frame preview unavailable</div>
                  <div class="text-xs opacity-70 mt-1">Annotation data is shown on the right</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Right: Metadata -->
        <div class="w-80 border-l border-default p-6 overflow-y-auto bg-default/5 shrink-0">
          <div class="space-y-4">
            <div>
              <h4 class="text-sm font-bold mb-3">Annotation Details</h4>
              <div class="space-y-2 text-sm">
                <div class="flex justify-between">
                  <span class="text-muted">Type:</span>
                  <span class="font-semibold capitalize">{{ annotationData?.type || comment.annotation_type || 'Unknown' }}</span>
                </div>
                <div v-if="annotationData?.color" class="flex justify-between items-center">
                  <span class="text-muted">Color:</span>
                  <div class="flex items-center gap-2">
                    <div 
                      class="w-5 h-5 rounded border border-default shadow-sm"
                      :style="{ backgroundColor: annotationData.color }"
                    ></div>
                    <span class="font-mono text-xs">{{ annotationData.color }}</span>
                  </div>
                </div>
                <div v-if="annotationData?.thickness" class="flex justify-between">
                  <span class="text-muted">Thickness:</span>
                  <span class="font-semibold">{{ annotationData.thickness }}px</span>
                </div>
              </div>
            </div>

            <div class="border-t border-default pt-4">
              <h4 class="text-sm font-bold mb-3">Comment Details</h4>
              <div class="space-y-2 text-sm">
                <div class="flex justify-between">
                  <span class="text-muted">Author:</span>
                  <span class="font-semibold">{{ comment.author_name || comment.user_name || 'Anonymous' }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-muted">Timecode:</span>
                  <span class="font-mono font-semibold">{{ formatTimecode(comment.start_seconds) }}</span>
                </div>
                <div v-if="comment.start_frame !== null" class="flex justify-between">
                  <span class="text-muted">Frame:</span>
                  <span class="font-mono font-semibold">{{ comment.start_frame }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-muted">Created:</span>
                  <span class="font-semibold">{{ formatDate(comment.created_at) }}</span>
                </div>
              </div>
            </div>

            <div v-if="comment.body" class="border-t border-default pt-4">
              <h4 class="text-sm font-bold mb-2">Comment Text</h4>
              <div class="text-sm text-default whitespace-pre-wrap leading-relaxed bg-well/40 p-3 rounded border border-default">
                {{ comment.body }}
              </div>
            </div>

            <div v-if="annotationData" class="border-t border-default pt-4">
              <h4 class="text-sm font-bold mb-2">Raw Data</h4>
              <details class="text-xs">
                <summary class="cursor-pointer text-primary hover:underline">View JSON</summary>
                <pre class="mt-2 p-3 bg-well/60 rounded border border-default overflow-x-auto font-mono text-[10px] leading-tight">{{ JSON.stringify(annotationData, null, 2) }}</pre>
              </details>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { PencilIcon } from '@heroicons/vue/24/outline'
import type { Comment } from '../../composables/useComments'
import { useApi } from '../../composables/useApi'
import { useTimeFormat } from '../../composables/useTimeFormat'

const props = defineProps<{
  modelValue: boolean
  comment: Comment | null
  link: any
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const { apiFetch, baseUrl, connection } = useApi()

const loading = ref(false)
const error = ref<string | null>(null)
const frameDataUrl = ref<string | null>(null)
const frameWidth = ref(1920)
const frameHeight = ref(1080)
const displayWidth = ref(0)
const displayHeight = ref(0)
const frameImageRef = ref<HTMLImageElement | null>(null)
const imageContainerRef = ref<HTMLDivElement | null>(null)

const annotationData = computed(() => {
  if (!props.comment?.draw_data) return null
  try {
    return typeof props.comment.draw_data === 'string'
      ? JSON.parse(props.comment.draw_data)
      : props.comment.draw_data
  } catch {
    return null
  }
})

const uniqueColors = computed(() => {
  if (!annotationData.value) return []
  const colors = new Set<string>()
  
  // Collect colors from all shapes and paths
  if (annotationData.value.paths) {
    annotationData.value.paths.forEach((path: any) => {
      if (path.color) colors.add(path.color)
    })
  }
  if (annotationData.value.shape?.color) {
    colors.add(annotationData.value.shape.color)
  }
  if (annotationData.value.shapes) {
    annotationData.value.shapes.forEach((shape: any) => {
      if (shape.color) colors.add(shape.color)
    })
  }
  
  return Array.from(colors)
})

function onImageLoad() {
  if (!frameImageRef.value) return
  
  // Get the actual displayed size of the image (accounting for object-contain)
  const img = frameImageRef.value
  const naturalWidth = img.naturalWidth
  const naturalHeight = img.naturalHeight
  const displayedWidth = img.offsetWidth
  const displayedHeight = img.offsetHeight
  
  // Store the natural dimensions for viewBox
  frameWidth.value = naturalWidth
  frameHeight.value = naturalHeight
  
  // Store the displayed dimensions for SVG size
  displayWidth.value = displayedWidth
  displayHeight.value = displayedHeight
}

function createPathFromPoints(points: Array<{x: number, y: number}>): string {
  if (!points || points.length === 0) return ''
  const first = points[0]
  let path = `M ${first.x} ${first.y}`
  for (let i = 1; i < points.length; i++) {
    path += ` L ${points[i].x} ${points[i].y}`
  }
  return path
}

function formatTimecode(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return '--:--'
  const hrs = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 1000)
  
  if (hrs > 0) {
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`
}

const { hour12 } = useTimeFormat()

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleString(undefined, { hour12: hour12.value })
}

async function loadFrame() {
  if (!props.comment?.file_id || props.comment.start_seconds === null) {
    error.value = 'Missing file or timecode information'
    return
  }

  if (!props.link?.id) {
    error.value = 'Missing link information'
    return
  }

  loading.value = true
  error.value = null
  frameDataUrl.value = null

  try {
    // Build request URL
    const url = `/api/links/${props.link.id}/files/${props.comment.file_id}/frame?time=${props.comment.start_seconds}`
    
    // Use native fetch to get binary image data
    // apiFetch doesn't support 'blob' parse mode, so we need to use fetch directly
    const apiBase = baseUrl.value
    const token = connection.value?.token || ''
    
    if (!apiBase) {
      throw new Error('API base URL not configured')
    }

    const response = await fetch(`${apiBase}${url}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(errorText || `HTTP ${response.status}`)
    }
    
    const blob = await response.blob()

    // Convert blob to data URL
    const reader = new FileReader()
    reader.onload = (e) => {
      frameDataUrl.value = e.target?.result as string
    }
    reader.readAsDataURL(blob)
  } catch (err: any) {
    console.error('[annotation-viewer] Failed to load frame:', err)
    error.value = err.message || 'Failed to extract video frame'
  } finally {
    loading.value = false
  }
}

function close() {
  emit('update:modelValue', false)
}

watch(() => props.modelValue, (isOpen) => {
  if (isOpen && props.comment) {
    loadFrame()
  } else {
    // Reset state when closing
    frameDataUrl.value = null
    error.value = null
    displayWidth.value = 0
    displayHeight.value = 0
  }
})
</script>

<style scoped>
/* Ensure proper SVG overlay sizing */
svg {
  position: absolute;
  top: 0;
  left: 0;
}
</style>
