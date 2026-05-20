<template>
  <div class="relative flex items-center gap-2">
    <span class="text-sm font-medium text-default whitespace-nowrap">Connected to:</span>
    <!-- Trigger Button -->
    <button
      ref="triggerRef"
      class="flex items-center gap-2 px-3 py-2 rounded-md border border-default hover:border-primary transition-colors"
      :class="{
        'border-primary bg-well': isOpen,
        'border-danger': activeConnection?.status === 'error' || activeConnection?.status === 'disconnected'
      }"
      @click="toggle"
      title="Switch active server for operations"
    >
      <span class="inline-block w-2 h-2 rounded-full" :class="{
        'bg-green-500': activeConnection?.status === 'connected',
        'bg-red-500': activeConnection?.status === 'disconnected' || activeConnection?.status === 'error',
        'bg-yellow-500': activeConnection?.status === 'checking'
      }" />
      <span class="text-sm font-medium w-[120px] truncate">
        {{ activeConnection?.name || 'No Connection' }}
      </span>
      <svg
        class="w-4 h-4 transition-transform flex-shrink-0"
        :class="{ 'rotate-180': isOpen }"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
      </svg>
    </button>

    <!-- Dropdown Menu -->
    <teleport to="body">
      <transition name="dropdown">
        <div
          v-if="isOpen"
          ref="menuRef"
          class="fixed z-[1000] w-80 bg-accent border border-default rounded-lg shadow-xl overflow-hidden"
          :style="menuStyle"
        >
          <!-- Quick Switch -->
          <div class="p-3 border-b border-default">
            <div class="text-xs text-muted mb-2">Active Server (for operations)</div>
            <div class="max-h-60 overflow-y-auto space-y-1">
              <button
                v-for="conn in sortedConnections"
                :key="conn.connectionId"
                class="w-full flex items-center gap-2 px-3 py-2 rounded-md text-left transition-colors"
                :class="{
                  'bg-primary text-white': conn.isActive,
                  'hover:bg-well': !conn.isActive
                }"
                @click="switchTo(conn.connectionId)"
              >
                <span class="inline-block w-2 h-2 rounded-full" :class="{
                  'bg-green-300': conn.status === 'connected' && conn.isActive,
                  'bg-green-500': conn.status === 'connected' && !conn.isActive,
                  'bg-red-500': conn.status === 'disconnected' || conn.status === 'error',
                  'bg-yellow-500': conn.status === 'checking'
                }" />
                <span class="flex-1 text-sm text-default truncate">{{ conn.name }}</span>
                <span v-if="conn.isFavorite" class="text-yellow-500">★</span>
              </button>
            </div>
          </div>

          <!-- Actions -->
          <div class="p-2 flex gap-2">
            <button
              class="flex-1 btn btn-sm btn-secondary"
              @click="openManager"
            >
              Manage
            </button>
            <button
              class="flex-1 btn btn-sm btn-primary"
              @click="addServer"
            >
              + Add
            </button>
          </div>
        </div>
      </transition>
    </teleport>

    <!-- Connection Manager Modal -->
    <ConnectionManagerModal v-model="showManager" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useConnections } from '../composables/useConnections'
import { useRouter } from 'vue-router'
import ConnectionManagerModal from './modals/ConnectionManagerModal.vue'

const router = useRouter()
const { sortedConnections, activeConnection, setActive } = useConnections()

const isOpen = ref(false)
const showManager = ref(false)
const triggerRef = ref<HTMLElement | null>(null)
const menuRef = ref<HTMLElement | null>(null)
const menuStyle = ref({ top: '0px', left: '0px' })

async function toggle() {
  isOpen.value = !isOpen.value
  if (isOpen.value && triggerRef.value) {
    await nextTick()
    const rect = triggerRef.value.getBoundingClientRect()
    menuStyle.value = {
      top: `${rect.bottom + 8}px`,
      left: `${Math.max(8, rect.right - 320)}px`
    }
  }
}

function switchTo(connectionId: string) {
  setActive(connectionId)
  isOpen.value = false
}

function openManager() {
  isOpen.value = false
  showManager.value = true
}

function addServer() {
  isOpen.value = false
  router.push({ name: 'server-selection', query: { skipAutoLogin: 'true' } })
}

function handleClickOutside(event: MouseEvent) {
  const path = event.composedPath()
  if (
    isOpen.value &&
    menuRef.value &&
    triggerRef.value &&
    !path.includes(menuRef.value) &&
    !path.includes(triggerRef.value)
  ) {
    isOpen.value = false
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    isOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  document.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside)
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<style scoped>
.dropdown-enter-active,
.dropdown-leave-active {
  transition: opacity 0.15s, transform 0.15s;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

.btn-sm {
  padding: 0.375rem 0.75rem;
  font-size: 0.875rem;
  height: fit-content;
}
</style>
