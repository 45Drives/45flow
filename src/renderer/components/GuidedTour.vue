<template>
  <teleport to="body">
    <!-- Overlay + spotlight: only visible once positioned -->
    <div v-if="active && positioned" data-flow-overlay data-flow-tour class="fixed inset-0 z-tour pointer-events-none">
      <!-- Dark overlay with cutout — allows scroll passthrough -->
      <svg class="absolute inset-0 w-full h-full pointer-events-auto tour-overlay"
        @click="next" @wheel.prevent="onOverlayWheel">
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
    <div v-if="active" ref="popupRef" data-flow-tour class="fixed pointer-events-auto z-tour w-max max-w-[calc(100vw-24px)]"
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
            <p aria-live="polite" class="font-mono text-sm whitespace-pre-wrap break-words">{{ currentStep?.message }}</p>

            <!-- Navigation -->
            <div class="flex items-center justify-between mt-3 pt-2 border-t border-white/20">
              <span class="text-xs text-muted">{{ currentIndex + 1 }} / {{ steps.length }}</span>
              <div class="flex items-center gap-2">
                <button class="text-xs text-muted hover:text-white underline" @click="skip">Skip tour</button>
                <button v-if="hasPrevious"
                  class="px-3 py-1 text-xs rounded bg-white/10 hover:bg-white/20 transition-colors"
                  @click="prev">Back</button>
                <button ref="nextButton"
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
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { autoUpdate, computePosition, offset, flip, shift } from '@floating-ui/dom'
import type { TourStep } from '../composables/useTourManager'
import houstonImg from '../assets/houston.png'

const props = defineProps<{
  steps: TourStep[]
  active: boolean
}>()

const emit = defineEmits<{
  done: []
  skip: []
  unavailable: []
}>()

const currentIndex = ref(0)
const popupRef = ref<HTMLElement | null>(null)
const nextButton = ref<HTMLButtonElement | null>(null)
const positioned = ref(false)
const spotlightPadding = 8
const spotlightRadius = 8

const currentStep = computed(() => props.steps[currentIndex.value])
const visited = new Set<number>()
const hasPrevious = ref(false)

const spotlightRect = ref({ x: 0, y: 0, width: 0, height: 0 })
const popupPos = ref({ top: '0px', left: '0px' })
const popupPlacement = ref<'top' | 'bottom'>('bottom')
const arrowX = ref(0)

let frame = 0
let generation = 0
let enteredStep: TourStep | undefined
let stopPositioning: (() => void) | undefined
let previousFocus: HTMLElement | null = null
let running = false

function getTargetEl(step = currentStep.value): HTMLElement | undefined {
  if (!step) return
  return Array.from(document.querySelectorAll<HTMLElement>(step.target)).find(el => {
    const rect = el.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0 && getComputedStyle(el).visibility === 'visible'
  })
}

function leaveStep() {
  generation++
  cancelAnimationFrame(frame)
  stopPositioning?.()
  stopPositioning = undefined
  positioned.value = false
  const step = enteredStep
  enteredStep = undefined
  step?.cleanup?.()
}

function endTour(result?: 'done' | 'skip' | 'unavailable') {
  running = false
  leaveStep()
  if (previousFocus?.isConnected && popupRef.value?.contains(document.activeElement)) {
    previousFocus.focus({ preventScroll: true })
  }
  previousFocus = null
  if (result === 'done') emit('done')
  if (result === 'skip') emit('skip')
  if (result === 'unavailable') emit('unavailable')
}

function showStep(index: number, direction: 1 | -1 = 1, backFrom?: number) {
  leaveStep()
  if (direction === -1) {
    while (index >= 0 && !visited.has(index)) index--
    if (index < 0 && backFrom !== undefined) return showStep(backFrom)
  }
  const step = props.steps[index]
  if (!step) return endTour(visited.size ? 'done' : 'unavailable')

  currentIndex.value = index
  enteredStep = step
  const run = generation
  const deadline = performance.now() + 2000
  const tryTarget = () => {
    if (run !== generation) return
    const el = getTargetEl(step)
    const popup = popupRef.value
    if (!el || !popup) {
      if (performance.now() >= deadline) showStep(index + direction, direction, backFrom)
      else frame = requestAnimationFrame(tryTarget)
      return
    }

    el.scrollIntoView({ behavior: 'instant', block: 'center' })
    stopPositioning = autoUpdate(el, popup, async () => {
      const { x, y, placement } = await computePosition(el, popup, {
        strategy: 'fixed',
        placement: step.placement ?? 'bottom',
        middleware: [offset(16), flip({ fallbackPlacements: ['top', 'bottom'] }), shift({ padding: 12, crossAxis: true })],
      })
      if (run !== generation) return
      const { x: left, y: top, width, height } = el.getBoundingClientRect()
      spotlightRect.value = { x: left, y: top, width, height }
      popupPlacement.value = placement.startsWith('top') ? 'top' : 'bottom'
      popupPos.value = { top: `${y}px`, left: `${x}px` }
      arrowX.value = Math.max(20, Math.min(left + width / 2 - x, popup.offsetWidth - 20))
      if (!positioned.value) {
        visited.add(index)
        hasPrevious.value = [...visited].some(i => i < index)
        positioned.value = true
        await nextTick()
        if (run === generation) nextButton.value?.focus({ preventScroll: true })
      }
    })
  }

  try {
    step.beforeShow?.()
  } catch (error) {
    console.warn('Could not prepare guided tour step:', step.target, error)
    showStep(index + direction, direction, backFrom)
    return
  }
  void nextTick(tryTarget)
}

function next() {
  if (positioned.value) showStep(currentIndex.value + 1)
}

function prev() {
  if (positioned.value && hasPrevious.value) showStep(currentIndex.value - 1, -1, currentIndex.value)
}

function skip() {
  if (running) endTour('skip')
}

function onKeydown(event: KeyboardEvent) {
  if (!running || event.key !== 'Escape') return
  event.preventDefault()
  event.stopImmediatePropagation()
  skip()
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown, true)
  watch([() => props.active, () => props.steps], ([active]) => {
    endTour()
    visited.clear()
    hasPrevious.value = false
    if (!active) return
    running = true
    previousFocus = document.activeElement as HTMLElement | null
    showStep(0)
  }, { immediate: true, flush: 'post' })
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown, true)
  endTour()
})

/** Forward wheel events from the overlay to the scrollable element beneath it */
function onOverlayWheel(e: WheelEvent) {
  // Find the scrollable ancestor under the target element
  const el = getTargetEl()
  const scrollable = el ? findScrollParent(el) : document.documentElement
  scrollable?.scrollBy({ top: e.deltaY, left: e.deltaX })
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

</script>
