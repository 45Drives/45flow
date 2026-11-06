<template>
  <Teleport to="body">
    <Transition name="flow-modal" appear @after-leave="emit('after-leave')">
      <div
        v-if="modelValue"
        class="flow-modal text-default"
        :class="{ 'flow-modal--top': position === 'top' }"
        :style="{ zIndex }"
      >
        <div class="flow-modal__backdrop" aria-hidden="true" @click="onBackdrop" />
        <div
          ref="panel"
          class="flow-modal__panel border-default"
          :class="[`flow-modal__panel--${size}`, surface === 'default' ? 'bg-default' : 'bg-accent', panelClass]"
          :role="role"
          aria-modal="true"
          :aria-labelledby="hasHeading ? titleId : undefined"
          :aria-describedby="description ? descriptionId : undefined"
          :aria-label="!hasHeading ? ariaLabel : undefined"
          tabindex="-1"
          v-bind="$attrs"
          @keydown.tab="trapTab"
        >
          <header v-if="!hideHeader" class="flow-modal__header border-default" :class="headerClass" v-bind="headerAttrs">
            <slot name="header">
              <div class="flow-modal__heading">
                <h2 :id="titleId" class="flow-modal__title"><slot name="title">{{ title }}</slot></h2>
                <p v-if="description" :id="descriptionId" class="flow-modal__description">{{ description }}</p>
              </div>
            </slot>
            <div v-if="$slots['header-actions'] || !hideClose" class="flow-modal__header-actions">
              <slot name="header-actions" />
              <button
                v-if="!hideClose"
                type="button"
                class="btn btn-dismiss whitespace-nowrap"
                :disabled="busy"
                @click="requestClose('close')"
              >
                {{ closeLabel }}
              </button>
            </div>
          </header>

          <div class="flow-modal__body" :class="[{ 'flow-modal__body--flush': flush }, bodyClass]">
            <slot :close="closeFromSlot" />
          </div>

          <footer v-if="$slots.footer" class="flow-modal__footer border-default" :class="footerClass">
            <slot name="footer" :close="closeFromSlot" />
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, toRef, useId, useSlots, watch } from 'vue'
import { useModalStack } from './useModalStack'

defineOptions({ inheritAttrs: false })

export type FlowModalCloseReason = 'close' | 'escape' | 'backdrop'

const props = withDefaults(defineProps<{
  modelValue: boolean
  title?: string
  description?: string
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full'
  position?: 'center' | 'top'
  surface?: 'accent' | 'default'
  role?: 'dialog' | 'alertdialog'
  ariaLabel?: string
  closeLabel?: string
  hideClose?: boolean
  hideHeader?: boolean
  flush?: boolean
  /** Blocks every way of closing (button, Escape, backdrop) while work is in flight. */
  busy?: boolean
  dismissible?: boolean
  closeOnBackdrop?: boolean
  /** Return false (or resolve false) to keep the modal open, e.g. to confirm discarding edits. */
  beforeClose?: (reason: FlowModalCloseReason) => boolean | void | Promise<boolean | void>
  /** CSS selector inside the panel to focus on open. Defaults to [autofocus], then the panel. */
  initialFocus?: string
  panelClass?: unknown
  headerClass?: unknown
  /** Extra attributes for the header row, e.g. { 'data-tour': 'settings-modal-header' }. */
  headerAttrs?: Record<string, unknown>
  bodyClass?: unknown
  footerClass?: unknown
}>(), {
  size: 'md',
  position: 'center',
  surface: 'accent',
  role: 'dialog',
  closeLabel: 'Close',
  dismissible: true,
  closeOnBackdrop: true,
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'close', reason: FlowModalCloseReason): void
  (e: 'after-leave'): void
}>()

const slots = useSlots()
const panel = ref<HTMLElement | null>(null)
const uid = useId()
const titleId = `${uid}-title`
const descriptionId = `${uid}-description`
const hasHeading = computed(() => !props.hideHeader && !slots.header && !!(props.title || slots.title))

const open = toRef(props, 'modelValue')
const { zIndex, isTop } = useModalStack(open, () => void requestClose('escape'))

async function requestClose(reason: FlowModalCloseReason) {
  if (props.busy || !props.dismissible) return
  if (props.beforeClose) {
    const allowed = await props.beforeClose(reason)
    if (allowed === false) return
  }
  emit('update:modelValue', false)
  emit('close', reason)
}

const closeFromSlot = () => void requestClose('close')

function onBackdrop() {
  if (props.closeOnBackdrop) void requestClose('backdrop')
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]'

function focusables(): HTMLElement[] {
  if (!panel.value) return []
  return Array.from(panel.value.querySelectorAll<HTMLElement>(FOCUSABLE))
    .filter((el) => !el.closest('[hidden], [inert], [style*="display: none"]'))
}

function trapTab(event: KeyboardEvent) {
  if (!isTop.value) return
  const items = focusables()
  if (!items.length) {
    event.preventDefault()
    panel.value?.focus()
    return
  }
  const first = items[0]
  const last = items[items.length - 1]
  const active = document.activeElement
  if (event.shiftKey && (active === first || active === panel.value)) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && active === last) {
    event.preventDefault()
    first.focus()
  }
}

let returnFocus: HTMLElement | null = null

watch(open, async (isOpen) => {
  if (isOpen) {
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    await nextTick()
    const target = (props.initialFocus && panel.value?.querySelector<HTMLElement>(props.initialFocus))
      || panel.value?.querySelector<HTMLElement>('[autofocus], [data-autofocus]')
      || panel.value
    target?.focus({ preventScroll: true })
  } else if (returnFocus && document.contains(returnFocus)) {
    returnFocus.focus({ preventScroll: true })
    returnFocus = null
  }
}, { immediate: true })

defineExpose({ close: () => requestClose('close'), panel })
</script>
