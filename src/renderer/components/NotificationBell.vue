<template>
  <div class="relative" ref="bellRef">
    <button
      class="relative p-1.5 rounded-md hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
      title="Notifications"
      @click="toggleBell"
    >
      <BellIcon class="w-5 h-5 text-default" />
      <span
        v-if="unreadCount > 0"
        class="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1 leading-none"
      >
        {{ unreadCount > 9 ? '9+' : unreadCount }}
      </span>
    </button>

    <!-- Dropdown panel -->
    <Transition
      enter-active-class="transition ease-out duration-150"
      enter-from-class="opacity-0 scale-95 -translate-y-1"
      enter-to-class="opacity-100 scale-100 translate-y-0"
      leave-active-class="transition ease-in duration-100"
      leave-from-class="opacity-100 scale-100 translate-y-0"
      leave-to-class="opacity-0 scale-95 -translate-y-1"
    >
      <div
        v-if="bellOpen"
        class="absolute right-0 top-full mt-2 w-80 max-h-96 overflow-y-auto rounded-xl shadow-2xl border border-default bg-default z-50"
      >
        <div class="flex items-center justify-between px-4 py-2.5 border-b border-default">
          <span class="text-sm font-semibold text-default">Notifications</span>
          <button
            v-if="history.length > 0"
            class="text-xs text-blue-400 hover:underline"
            @click="clearHistory"
          >
            Clear all
          </button>
        </div>

        <div v-if="history.length === 0" class="px-4 py-8 text-center text-sm text-muted">
          No notifications yet
        </div>

        <div v-else class="divide-y divide-default">
          <div
            v-for="item in history"
            :key="item.id"
            class="px-4 py-2.5 hover:bg-well/50 transition-colors"
          >
            <div class="flex items-start gap-2">
              <span class="mt-0.5 w-2 h-2 rounded-full shrink-0" :class="levelDot(item.level)"></span>
              <div class="min-w-0 flex-1">
                <div class="flex items-center justify-between gap-2">
                  <span class="text-xs font-medium text-default truncate">{{ item.title }}</span>
                  <span class="text-[10px] text-muted whitespace-nowrap">{{ timeAgo(item.timestamp) }}</span>
                </div>
                <p class="text-xs text-muted mt-0.5 line-clamp-2">{{ item.body }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { BellIcon } from '@heroicons/vue/24/outline'
import { useNotificationCenter } from '../composables/useNotificationCenter'

const { history, unreadCount, bellOpen, toggleBell, clearHistory } = useNotificationCenter()
const bellRef = ref<HTMLElement | null>(null)

function levelDot(level: string) {
  switch (level) {
    case 'success': return 'bg-green-400'
    case 'error':
    case 'denied': return 'bg-red-400'
    case 'warning': return 'bg-amber-400'
    default: return 'bg-blue-400'
  }
}

function timeAgo(ts: number) {
  const diff = Date.now() - ts
  if (diff < 60_000) return 'just now'
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`
  return `${Math.floor(diff / 86400_000)}d ago`
}

function onClickOutside(e: MouseEvent) {
  if (bellRef.value && !bellRef.value.contains(e.target as Node)) {
    bellOpen.value = false
  }
}

onMounted(() => document.addEventListener('click', onClickOutside))
onBeforeUnmount(() => document.removeEventListener('click', onClickOutside))
</script>
