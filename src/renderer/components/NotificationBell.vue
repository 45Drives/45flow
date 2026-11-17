<template>
  <div class="relative" ref="bellRef">
    <button
      class="relative p-1.5 rounded-md hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
      title="Notifications"
      @click="toggleBell"
    >
      <BellIcon class="w-5 h-5 text-default" />
      <span
        v-if="totalUnread > 0"
        class="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-flow-danger text-white text-[10px] font-bold px-1 leading-none"
      >
        {{ totalUnread > 9 ? '9+' : totalUnread }}
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
        class="absolute right-0 top-full mt-2 w-80 max-h-96 overflow-y-auto rounded-xl shadow-2xl border border-default bg-default z-50 text-left"
      >
        <div class="flex items-center justify-between px-4 py-2.5 border-b border-default">
          <span class="text-sm font-semibold text-default">Notifications</span>
          <button
            v-if="history.length > 0 || feedback.items.value.length > 0"
            class="text-xs text-blue-400 hover:underline"
            @click="clearAll"
          >
            Clear all
          </button>
        </div>

        <section v-if="feedback.serverName.value" class="px-4 py-3 border-b border-default" aria-label="Feedback notifications">
          <div class="flex items-center justify-between gap-2">
            <h3 class="text-sm font-semibold">Feedback · {{ feedback.serverName.value }}</h3>
            <FlowButton v-if="feedback.unreadCount.value" size="xs" :disabled="feedback.saving.value" @click="feedback.markRead">Mark read</FlowButton>
          </div>
          <FlowNotice v-if="feedback.unsupported.value" tone="info" size="sm" class="mt-2">Update this server to use the feedback inbox.</FlowNotice>
          <FlowNotice v-if="feedback.error.value" tone="danger" size="sm" class="mt-2" live>
            {{ feedback.error.value }}
            <template #actions><FlowButton size="xs" :disabled="feedback.saving.value" @click="feedback.refresh">Reload</FlowButton></template>
          </FlowNotice>
          <p v-if="feedback.loading.value && !feedback.items.value.length" class="text-sm text-muted mt-2" role="status">Loading feedback...</p>
          <details v-if="!feedback.unsupported.value" class="mt-2 text-sm">
            <summary class="cursor-pointer">In-app feedback preferences</summary>
            <div class="mt-2 flex flex-col gap-2">
              <label v-for="option in feedbackOptions" :key="option.key" class="inline-flex items-center gap-2">
                <input type="checkbox" :checked="feedback.events.value[option.key]" :disabled="feedback.saving.value"
                  @change="changeFeedbackEvent(option.key, $event)" />
                {{ option.label }}
              </label>
            </div>
          </details>
          <ul class="mt-3 flex flex-col gap-3">
            <li v-for="item in feedback.items.value" :key="item.id" class="text-sm">
              <p class="font-medium">{{ feedbackLabels[item.kind] }} · {{ item.link_title || 'Shared link' }}</p>
              <p class="text-xs text-muted">{{ item.filename }}{{ item.version_index ? ` · v${item.version_index}` : '' }} · {{ item.actor }}</p>
              <p class="whitespace-pre-wrap break-words line-clamp-3 mt-1">{{ item.body }}</p>
              <a :href="feedback.reviewUrl(item)" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-xs mt-1">View link</a>
            </li>
          </ul>
        </section>
        <div v-if="history.length === 0 && !feedback.items.value.length && !feedback.loading.value" class="px-4 py-8 text-center text-sm text-muted">
          No notifications yet
        </div>

        <div v-else class="divide-y divide-default">
          <div
            v-for="item in history"
            :key="item.id"
            class="px-4 py-2.5 hover:bg-well/50 transition-colors cursor-pointer"
            @click="toggleExpand(item.id)"
          >
            <div class="flex items-start gap-2">
              <span class="mt-0.5 w-2 h-2 rounded-full shrink-0" :class="levelDot(item.level)"></span>
              <div class="min-w-0 flex-1">
                <div class="flex items-center justify-between gap-2">
                  <span class="text-xs font-medium text-default truncate">{{ item.title }}</span>
                  <span class="text-[10px] text-muted whitespace-nowrap">{{ timeAgo(item.timestamp) }}</span>
                </div>
                <p class="text-xs text-muted mt-0.5" :class="expandedId === item.id ? '' : 'truncate'">{{ item.body }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { BellIcon } from '@heroicons/vue/24/outline'
import { useNotificationCenter } from '../composables/useNotificationCenter'
import { useFeedbackNotifications } from '../composables/useFeedbackNotifications'
import FlowButton from '../ui/FlowButton.vue'
import FlowNotice from '../ui/FlowNotice.vue'

const { history, unreadCount, bellOpen, toggleBell, clearHistory } = useNotificationCenter()
const feedback = useFeedbackNotifications(bellOpen)
const totalUnread = computed(() => unreadCount.value + feedback.unreadCount.value)
const feedbackOptions = [
  { key: 'comments', label: 'New comments' }, { key: 'replies', label: 'Replies' }, { key: 'reopened', label: 'Reopened feedback' },
] as const
const feedbackLabels = { comments: 'New comment', replies: 'New reply', reopened: 'Feedback reopened' }
function clearAll() {
  clearHistory()
  void feedback.clear()
}
function changeFeedbackEvent(key: 'comments' | 'replies' | 'reopened', event: Event) {
  if (!(event.target instanceof HTMLInputElement)) return
  const enabled = event.target.checked
  event.target.checked = feedback.events.value[key]
  void feedback.setEvents({ ...feedback.events.value, [key]: enabled })
}
const bellRef = ref<HTMLElement | null>(null)
const expandedId = ref<symbol | null>(null)

function toggleExpand(id: symbol) {
  expandedId.value = expandedId.value === id ? null : id
}

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

// composedPath() is captured at dispatch, so it still includes the bell when the click target
// (the unread badge, "Clear all") was removed from the DOM by the click handler's re-render.
function onClickOutside(e: MouseEvent) {
  if (bellRef.value && !e.composedPath().includes(bellRef.value)) {
    bellOpen.value = false
  }
}

onMounted(() => document.addEventListener('click', onClickOutside))
onBeforeUnmount(() => document.removeEventListener('click', onClickOutside))
</script>
