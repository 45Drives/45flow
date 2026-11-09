<template>
  <div v-if="loading && isEmpty" class="text-sm text-muted py-3">Loading…</div>
  <FlowEmpty v-else-if="isEmpty" compact title="No one invited yet"
    :description="editable ? 'Invite clients or teams so they can sign in and open this link.' : 'Edit the link to invite clients or teams.'" />
  <ul v-else class="flow-list" aria-label="Invited clients and teams">
    <li v-for="g in groups" :key="`g-${g.group_id}`" class="flow-list__row" :class="{ 'lal-removed': g.pending === 'removed' }">
      <span class="flow-avatar flow-avatar--team" :style="avatarStyle(g.group_color)" aria-hidden="true">{{ initials(g.group_name) }}</span>
      <div class="min-w-0 flex-1">
        <p class="flow-list__title truncate">
          <span class="lal-name">{{ g.group_name || 'Team' }}</span>
          <FlowChip v-if="g.pending" :tone="PENDING[g.pending].tone" size="sm" class="ml-1 align-middle">{{ PENDING[g.pending].label }}</FlowChip>
        </p>
        <p class="flow-list__meta truncate" :title="teamMeta(g)">{{ teamMeta(g) }}</p>
      </div>
      <FlowChip tone="muted" size="sm" class="lal-role">{{ g.role_name || g.role?.name || 'Viewer' }}</FlowChip>
      <template v-if="editable">
        <button v-if="g.pending === 'removed'" type="button" class="btn btn-secondary btn-xs" @click="emit('undo-team', g.group_id)">Undo</button>
        <button v-else type="button" class="btn btn-danger btn-xs" @click="emit('remove-team', g.group_id)">Remove</button>
      </template>
    </li>
    <li v-for="u in users" :key="`u-${u.user_id}`" class="flow-list__row" :class="{ 'lal-removed': u.pending === 'removed' }">
      <span class="flow-avatar" :style="avatarStyle(u.display_color)" aria-hidden="true">{{ initials(u.name || u.user_name) }}</span>
      <div class="min-w-0 flex-1">
        <p class="flow-list__title truncate">
          <span class="lal-name">{{ u.name || u.user_name || 'Client' }}</span>
          <FlowChip v-if="u.pending" :tone="PENDING[u.pending].tone" size="sm" class="ml-1 align-middle">{{ PENDING[u.pending].label }}</FlowChip>
          <FlowChip v-if="u.is_disabled" tone="warning" size="sm" class="ml-1 align-middle" title="This client login is disabled">Login disabled</FlowChip>
        </p>
        <p class="flow-list__meta truncate">{{ personMeta(u) }}</p>
      </div>
      <FlowChip tone="muted" size="sm" class="lal-role">{{ u.role_name || u.role?.name || 'Viewer' }}</FlowChip>
      <template v-if="editable">
        <button v-if="u.pending === 'removed'" type="button" class="btn btn-secondary btn-xs" @click="emit('undo-user', u.user_id)">Undo</button>
        <button v-else type="button" class="btn btn-danger btn-xs" @click="emit('remove-user', u.user_id)">Remove</button>
      </template>
    </li>
  </ul>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import FlowChip from '../../ui/FlowChip.vue'
import FlowEmpty from '../../ui/FlowEmpty.vue'
import { avatarStyle, initials } from './accessUi'

// Unsaved edits shown in Edit mode; they apply on Save & close.
type Pending = 'added' | 'removed' | 'changed'
const PENDING: Record<Pending, { label: string; tone: 'info' | 'danger' | 'warning' }> = {
  added: { label: 'New', tone: 'info' },
  changed: { label: 'Role changed', tone: 'warning' },
  removed: { label: 'Will be removed', tone: 'danger' },
}

type InvitedUser = {
  user_id: number
  user_name?: string
  name?: string
  user_email?: string
  display_color?: string | null
  role_name?: string | null
  role?: { name?: string } | null
  is_disabled?: boolean
  pending?: Pending
}

type InvitedTeam = {
  group_id: number
  group_name?: string
  group_color?: string | null
  member_count?: number
  role_name?: string | null
  role?: { name?: string } | null
  members?: Array<{ user_id: number; name?: string; user_name?: string }>
  pending?: Pending
}

const props = defineProps<{
  users: InvitedUser[]
  groups: InvitedTeam[]
  editable?: boolean
  loading?: boolean
}>()

const emit = defineEmits<{
  (e: 'remove-user', userId: number): void
  (e: 'remove-team', groupId: number): void
  (e: 'undo-user', userId: number): void
  (e: 'undo-team', groupId: number): void
}>()

const isEmpty = computed(() => !props.users.length && !props.groups.length)

function personMeta(u: InvitedUser) {
  const parts = ['Invited directly']
  if (u.user_name && u.name) parts.push(`@${u.user_name}`)
  if (u.user_email) parts.push(u.user_email)
  return parts.join(' · ')
}

function teamMeta(g: InvitedTeam) {
  const count = g.member_count ?? g.members?.length ?? 0
  const label = `Team · ${count} member${count === 1 ? '' : 's'}`
  const names = (g.members || []).map(m => m.name || m.user_name).filter(Boolean)
  return names.length ? `${label}: ${names.join(', ')}` : label
}
</script>

<style scoped>
.lal-removed .flow-avatar,
.lal-removed .lal-role,
.lal-removed .flow-list__meta {
  opacity: 0.5;
}
.lal-removed .lal-name {
  text-decoration: line-through;
  opacity: 0.6;
}
</style>
