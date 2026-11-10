<template>
  <div aria-label="Review and approval">
    <FlowNotice v-if="accessMode !== 'restricted'" tone="info" size="sm" class="mb-4">
      Approvals need an invite-only link, so 45Flow knows who approved.
      <template #actions>
        <FlowButton size="xs" @click="emit('edit')">Edit link</FlowButton>
      </template>
    </FlowNotice>
    <FlowNotice v-if="error" tone="danger" size="sm" live class="mb-4">{{ error }}</FlowNotice>

    <p class="flow-subhead flow-subhead--first">Approver</p>
    <div class="flow-group">
      <div class="grid grid-cols-[minmax(0,1fr)_auto] gap-x-6 items-center py-3">
        <div class="min-w-0">
          <p class="text-sm font-medium text-default">Who approves</p>
          <p class="text-xs text-accent mt-0.5">
            Only this person can approve, request changes or reject.
          </p>
        </div>
        <div class="flex items-center justify-end gap-3 min-w-0">
          <span v-if="approver" class="text-sm font-medium truncate max-w-[14rem]" :title="approverLabel">{{ approverLabel }}</span>
          <span v-else class="text-sm text-muted">No approver</span>
          <FlowButton v-if="accessMode === 'restricted'" size="sm" :disabled="loading" @click="emit('change-approver')">
            {{ approver ? 'Change' : 'Choose' }}
          </FlowButton>
        </div>
      </div>
      <p v-if="accessMode === 'restricted' && !eligibleUsers.length" class="py-3 text-xs text-muted">
        No clients are invited yet. Click Edit to invite someone and choose who approves.
      </p>
      <p v-else-if="approver && approverNotInvited" class="py-3 text-xs text-flow-warning">
        This person is no longer invited, so they can't approve. Click Change to pick someone else.
      </p>
    </div>

    <template v-if="accessMode === 'restricted' || history.length">
    <p class="flow-subhead">Files</p>
    <p v-if="loading && !state" class="text-sm text-muted py-4">Loading review status…</p>
    <FlowEmpty v-else-if="!files.length" compact title="No files to review"
      description="Add files to this link to collect approvals." />
    <div v-else class="flow-table-wrap">
      <table class="flow-table">
        <thead>
          <tr>
            <th>File</th>
            <th>Version</th>
            <th>Status</th>
            <th>Last decision</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="f in files" :key="f.fileId">
            <td class="max-w-[18rem]"><span class="block truncate font-medium" :title="f.name">{{ f.name }}</span></td>
            <td class="whitespace-nowrap">{{ f.currentVersionIndex ? `v${f.currentVersionIndex}` : '—' }}</td>
            <td>
              <FlowChip v-if="f.status !== 'pending' || canCollect" size="sm" :tone="view(f.status).tone" :dot="view(f.status).dot">{{ view(f.status).label }}</FlowChip>
              <span v-else class="text-muted" title="Choose an approver to collect approvals">—</span>
            </td>
            <td class="text-muted">
              <template v-if="f.latest">{{ when(f.latest.decided_at) }}</template>
              <template v-else>—</template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p class="flow-subhead">History</p>
    <FlowEmpty v-if="!history.length" compact title="No decisions yet"
      description="Approvals, change requests and rejections will show here." />
    <ul v-else class="flow-list">
      <li v-for="d in visibleHistory" :key="d.id" class="flow-list__row items-start">
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <FlowChip size="sm" :tone="view(d.decision).tone" :dot="view(d.decision).dot">{{ view(d.decision).label }}</FlowChip>
            <FlowChip v-if="d.superseded" size="sm" tone="muted" title="A newer version of this file has been added since">Superseded</FlowChip>
            <span class="flow-list__title truncate">{{ d.fileName || 'Removed file' }}<template v-if="d.versionIndex"> · v{{ d.versionIndex }}</template></span>
          </div>
          <p class="flow-list__meta">{{ d.actor?.name || 'Approver' }} · {{ when(d.decided_at) }}</p>
          <p v-if="d.note" class="text-sm mt-1 whitespace-pre-wrap break-words">{{ d.note }}</p>
        </div>
      </li>
    </ul>
    <FlowButton v-if="history.length > HISTORY_PREVIEW" size="xs" variant="ghost" class="mt-2"
      @click="showAllHistory = !showAllHistory">
      {{ showAllHistory ? 'Show fewer' : `Show all ${history.length}` }}
    </FlowButton>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import FlowButton from '../ui/FlowButton.vue'
import FlowChip from '../ui/FlowChip.vue'
import FlowEmpty from '../ui/FlowEmpty.vue'
import FlowNotice from '../ui/FlowNotice.vue'
import type { AccessRow } from '../typings/electron'
import type { LinkReviewState } from '../composables/useLinkReview'
import { parseServerTime, reviewStateView } from '../utils/reviewStatus'

const props = defineProps<{
  state: LinkReviewState | null
  loading?: boolean
  error?: string
  /** The link's access mode as the app knows it; the server's value wins once loaded. */
  linkAccessMode: 'open' | 'restricted'
  users: AccessRow[]
  hour12?: boolean
}>()

const emit = defineEmits<{
  (e: 'edit'): void
  (e: 'change-approver'): void
}>()

const HISTORY_PREVIEW = 5
const showAllHistory = ref(false)

const accessMode = computed(() => props.state?.accessMode ?? props.linkAccessMode)
// Only a restricted link with an approver can collect decisions.
const canCollect = computed(() => accessMode.value === 'restricted' && !!props.state?.approver)
const files = computed(() => props.state?.files ?? [])
const history = computed(() => props.state?.history ?? [])
const visibleHistory = computed(() => (showAllHistory.value ? history.value : history.value.slice(0, HISTORY_PREVIEW)))

const eligibleUsers = computed(() => props.users.filter(u => !u.is_disabled && !u.is_deleted))
const approver = computed(() => props.state?.approver ?? null)
const approverLabel = computed(() => approver.value?.name || approver.value?.user_name || 'Approver')
const approverNotInvited = computed(() =>
  !!approver.value && !eligibleUsers.value.some(u => u.user_id === approver.value!.user_id)
)

function view(state: string) {
  return reviewStateView(state)
}

function when(v: string) {
  const d = parseServerTime(v)
  return d ? d.toLocaleString(undefined, { hour12: props.hour12 }) : '—'
}
</script>
