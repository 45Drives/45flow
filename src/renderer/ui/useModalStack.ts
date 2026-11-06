import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue'

// Every open FlowModal registers here. Order of opening decides stacking and which
// modal receives Escape, so nested dialogs work without hand-picked z-index values.

interface Entry {
  id: number
  onEscape: () => void
}

const stack = ref<Entry[]>([])
let nextId = 0
let listening = false

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || event.defaultPrevented) return
  const top = stack.value[stack.value.length - 1]
  if (!top) return
  event.preventDefault()
  event.stopPropagation()
  top.onEscape()
}

function syncListener() {
  if (typeof document === 'undefined') return
  if (stack.value.length && !listening) {
    document.addEventListener('keydown', onKeydown, true)
    listening = true
  } else if (!stack.value.length && listening) {
    document.removeEventListener('keydown', onKeydown, true)
    listening = false
  }
}

export function useModalStack(open: Ref<boolean>, onEscape: () => void) {
  const id = ++nextId

  function remove() {
    stack.value = stack.value.filter((entry) => entry.id !== id)
    syncListener()
  }

  watch(open, (isOpen) => {
    if (isOpen) {
      if (!stack.value.some((entry) => entry.id === id)) stack.value = [...stack.value, { id, onEscape }]
      syncListener()
    } else {
      remove()
    }
  }, { immediate: true })

  onBeforeUnmount(remove)

  const level = computed(() => Math.max(0, stack.value.findIndex((entry) => entry.id === id)))
  const isTop = computed(() => stack.value[stack.value.length - 1]?.id === id)
  const zIndex = computed(() => `calc(var(--flow-z-modal) + ${level.value * 10})`)

  return { level, isTop, zIndex }
}

export function openModalCount() {
  return stack.value.length
}
