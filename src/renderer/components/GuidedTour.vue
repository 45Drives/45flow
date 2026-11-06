<template>
  <teleport to="body">
    <!-- Overlay + spotlight: only visible once positioned -->
    <div v-if="active && positioned" data-flow-overlay class="fixed inset-0 z-tour pointer-events-none">
      <!-- Dark overlay with cutout — allows scroll passthrough -->
      <svg class="absolute inset-0 w-full h-full pointer-events-auto tour-overlay"
        @click="handleOverlayClick" @wheel.prevent="onOverlayWheel">
        <defs>
          <mask id="tour-mask">
            <rect width="100%" height="100%" fill="white" />
            <rect
              :x="spotlightRect.x - spotlightPadding"
              :y="spotlightRect.y - spotlightPadding"
              :width="spotlightRect.width + spotlightPadding * 2"
              :height="spotlightRect.height + spotlightPadding * 2"
              :rx="spotlightRadius"
              fill="black"
            />
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(0,0,0,0.6)" mask="url(#tour-mask)" />
      </svg>

      <!-- Spotlight border ring -->
      <div class="absolute pointer-events-none rounded-lg ring-2 ring-primary/80 transition-all duration-300"
        :style="{
          top: `${spotlightRect.y - spotlightPadding}px`,
          left: `${spotlightRect.x - spotlightPadding}px`,
          width: `${spotlightRect.width + spotlightPadding * 2}px`,
          height: `${spotlightRect.height + spotlightPadding * 2}px`,
        }"
      />
    </div>

    <!-- Popup: always in DOM when active (needed for popupRef), but invisible until positioned -->
    <div v-if="active" ref="popupRef" class="fixed pointer-events-auto z-tour"
      :style="{ top: popupPos.top, left: popupPos.left, visibility: positioned ? 'visible' : 'hidden' }">
      <div class="flex items-start text-left bg-slate-800/95 text-white p-5 min-h-[80px] rounded-md shadow-lg max-w-[500px]"
        @click.stop>
          <!-- Arrow -->
          <div class="absolute w-0 h-0 border-l-[10px] border-r-[10px] border-transparent"
            :class="{
              'border-b-[10px] border-b-slate-800/95 -top-[10px]': popupPlacement === 'bottom',
              'border-t-[10px] border-t-slate-800/95 -bottom-[10px]': popupPlacement === 'top',
            }"
            :style="{ left: `${arrowX}px`, transform: 'translateX(-50%)' }"
          />

          <img :src="houstonImg" alt="Houston"
            class="w-16 h-16 mr-3 rounded-lg object-cover flex-shrink-0" />
          <div class="flex flex-col flex-1 min-w-0">
            <p class="font-mono text-xs text-muted mb-1"><i>Houston says:</i></p>
            <p class="font-mono text-sm whitespace-pre-wrap break-words">{{ currentStep?.message }}</p>

            <!-- Navigation -->
            <div class="flex items-center justify-between mt-3 pt-2 border-t border-white/20">
              <span class="text-xs text-muted">{{ currentIndex + 1 }} / {{ steps.length }}</span>
              <div class="flex items-center gap-2">
                <button class="text-xs text-muted hover:text-white underline" @click="skip">Skip tour</button>
                <button v-if="currentIndex > 0"
                  class="px-3 py-1 text-xs rounded bg-white/10 hover:bg-white/20 transition-colors"
                  @click="prev">Back</button>
                <button
                  class="px-3 py-1 text-xs rounded bg-primary text-white hover:bg-primary/80 transition-colors"
                  @click="next">
                  {{ currentIndex === steps.length - 1 ? 'Finish' : 'Next' }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
  </teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { computePosition, offset, flip, shift } from '@floating-ui/dom'
import type { TourStep } from '../composables/useTourManager'
import houstonImg from '../assets/houston.png'

const props = defineProps<{
  steps: TourStep[]
  active: boolean
}>()

const emit = defineEmits<{
  done: []
  skip: []
}>()

const currentIndex = ref(0)
const popupRef = ref<HTMLElement | null>(null)
const positioned = ref(false)
const spotlightPadding = 8
const spotlightRadius = 8

const currentStep = computed(() => props.steps[currentIndex.value])

const spotlightRect = ref({ x: 0, y: 0, width: 0, height: 0 })
const popupPos = ref({ top: '0px', left: '0px' })
const popupPlacement = ref<'top' | 'bottom'>('bottom')
const arrowX = ref(0)

let pollHandle: number | null = null

function cancelPoll() {
  if (pollHandle != null) {
    cancelAnimationFrame(pollHandle)
    pollHandle = null
  }
}

function getTargetEl(): HTMLElement | null {
  if (!currentStep.value) return null
  return document.querySelector(currentStep.value.target)
}

/** Check if an element is actually visible (not hidden by v-show, display:none, or zero-size) */
function isVisible(el: HTMLElement): boolean {
  if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') return false
  const rect = el.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) return false
  return true
}

/** Find the next valid step index (with a visible target), starting from `from`. Returns -1 if none found. */
function findNextVisibleStep(from: number, direction: 1 | -1 = 1): number {
  let i = from
  while (i >= 0 && i < props.steps.length) {
    const step = props.steps[i]
    // Steps with beforeShow may make their target visible dynamically — always consider them valid
    if (step.beforeShow) return i
    const el = document.querySelector<HTMLElement>(step.target)
    if (el && isVisible(el)) return i
    i += direction
  }
  return -1
}

function positionPopup(startTime?: number) {
  cancelPoll()
  const now = startTime ?? performance.now()

  const el = getTargetEl()
  const popup = popupRef.value

  // Target or popup not in DOM yet — retry via rAF for up to 2s
  if (!el || !popup || (el && !isVisible(el))) {
    const elapsed = performance.now() - now
    if (elapsed < 2000) {
      pollHandle = requestAnimationFrame(() => positionPopup(now))
      return
    }
    // Element never appeared — skip this step automatically
    skipToNextVisible()
    return
  }

  // Scroll the target into view — use 'center' so there's room for both
  // the highlighted element and the popup above or below it
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })

  // Wait for scroll to settle, then measure and position
  const settle = () => {
    const rect = el.getBoundingClientRect()
    spotlightRect.value = {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    }

    const preferred = currentStep.value?.placement ?? 'bottom'
    computePosition(el, popup, {
      strategy: 'fixed',
      placement: preferred,
      middleware: [
        offset(16),
        flip({ fallbackPlacements: ['top', 'bottom'] }),
        shift({ padding: 12, crossAxis: true }),
      ],
    }).then(({ x, y, placement }) => {
      popupPlacement.value = placement.startsWith('top') ? 'top' : 'bottom'
      popupPos.value = { top: `${y}px`, left: `${x}px` }

      const targetCenterX = rect.x + rect.width / 2
      arrowX.value = Math.max(20, Math.min(targetCenterX - x, (popup.offsetWidth ?? 400) - 20))
      positioned.value = true
    })
  }

  // Give smooth scroll time to finish before measuring
  setTimeout(() => requestAnimationFrame(settle), 350)
}

/** Skip to the next step that has a visible target. If none remain, finish the tour. */
function skipToNextVisible() {
  const nextIdx = findNextVisibleStep(currentIndex.value + 1, 1)
  if (nextIdx === -1) {
    // No more visible steps — end the tour
    emit('done')
  } else {
    currentIndex.value = nextIdx
  }
}

function startPositioning() {
  positioned.value = false
  cancelPoll()
  const step = currentStep.value
  const run = async () => {
    if (step?.beforeShow) await step.beforeShow()
    nextTick(() => positionPopup())
  }
  run()
}

/** Clean up the current step's spoofed state */
function cleanupCurrentStep() {
  const step = currentStep.value
  if (step?.cleanup) step.cleanup()
}

/** Clean up ALL steps (used when tour ends/skips) */
function cleanupAllSteps() {
  for (const step of props.steps) {
    if (step.cleanup) step.cleanup()
  }
}

function next() {
  if (currentIndex.value >= props.steps.length - 1) {
    cleanupCurrentStep()
    emit('done')
  } else {
    cleanupCurrentStep()
    // Find next visible step instead of blindly incrementing
    const nextIdx = findNextVisibleStep(currentIndex.value + 1, 1)
    if (nextIdx === -1) {
      emit('done')
    } else {
      currentIndex.value = nextIdx
    }
  }
}

function prev() {
  if (currentIndex.value > 0) {
    cleanupCurrentStep()
    const prevIdx = findNextVisibleStep(currentIndex.value - 1, -1)
    if (prevIdx !== -1) {
      currentIndex.value = prevIdx
    }
  }
}

function skip() {
  cleanupAllSteps()
  emit('skip')
}

function handleOverlayClick() {
  next()
}

watch(currentIndex, () => {
  startPositioning()
})

watch(() => props.active, (isActive) => {
  if (isActive) {
    currentIndex.value = 0
    startPositioning()
  } else {
    cleanupAllSteps()
    cancelPoll()
    positioned.value = false
  }
})

watch(() => props.steps, () => {
  if (props.active) {
    currentIndex.value = 0
    startPositioning()
  }
})

function onResize() {
  if (props.active && positioned.value) positionPopup()
}

onMounted(() => {
  window.addEventListener('resize', onResize)
  if (props.active) {
    currentIndex.value = 0
    startPositioning()
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', onResize)
  cleanupAllSteps()
  cancelPoll()
})

/** Forward wheel events from the overlay to the scrollable element beneath it */
function onOverlayWheel(e: WheelEvent) {
  // Find the scrollable ancestor under the target element
  const el = getTargetEl()
  const scrollable = el ? findScrollParent(el) : document.documentElement
  if (scrollable) {
    scrollable.scrollBy({ top: e.deltaY, left: e.deltaX })
    // Re-measure after scroll
    requestAnimationFrame(() => {
      if (positioned.value) repositionCurrent()
    })
  }
}

function findScrollParent(el: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = el.parentElement
  while (node) {
    const style = getComputedStyle(node)
    if (/(auto|scroll)/.test(style.overflow + style.overflowY)) return node
    node = node.parentElement
  }
  return document.documentElement
}

/** Re-measure the current target and reposition spotlight + popup without re-scrolling */
function repositionCurrent() {
  const el = getTargetEl()
  const popup = popupRef.value
  if (!el || !popup || !isVisible(el)) return

  const rect = el.getBoundingClientRect()
  spotlightRect.value = { x: rect.x, y: rect.y, width: rect.width, height: rect.height }

  const preferred = currentStep.value?.placement ?? 'bottom'
  computePosition(el, popup, {
    strategy: 'fixed',
    placement: preferred,
    middleware: [
      offset(16),
      flip({ fallbackPlacements: ['top', 'bottom'] }),
      shift({ padding: 12, crossAxis: true }),
    ],
  }).then(({ x, y, placement }) => {
    popupPlacement.value = placement.startsWith('top') ? 'top' : 'bottom'
    popupPos.value = { top: `${y}px`, left: `${x}px` }
    const targetCenterX = rect.x + rect.width / 2
    arrowX.value = Math.max(20, Math.min(targetCenterX - x, (popup.offsetWidth ?? 400) - 20))
  })
}
</script>
