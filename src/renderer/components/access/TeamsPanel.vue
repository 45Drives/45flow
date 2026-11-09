<template>
  <div class="flex flex-col gap-3 min-h-0">
    <div class="flex flex-wrap items-center gap-2">
      <div class="relative flex-1 min-w-[14rem]">
        <MagnifyingGlassIcon class="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 opacity-60" aria-hidden="true" />
        <input v-model.trim="search" type="search" aria-label="Search teams"
          class="input-textlike w-full pl-8 pr-3 py-2 text-sm" placeholder="Search teams" />
      </div>
      <button class="btn btn-primary" data-tour="teams-new" @click="openCreate()">New team</button>
    </div>
    <p class="text-xs text-muted">
      A team is a group of clients. Invite a team to a link and everyone in it gets access in one step.
    </p>

    <div v-if="loading && !groups.length" class="text-sm text-muted py-6 text-center">Loading teams…</div>

    <ul v-else-if="filteredGroups.length" class="flow-list overflow-y-auto min-h-0" aria-label="Teams">
      <li v-for="g in filteredGroups" :key="g.id" class="flow-list__group">
        <div class="flow-list__row">
          <span class="flow-avatar flow-avatar--team" :style="avatarStyle(g.display_color)" aria-hidden="true">{{ initials(g.name) }}</span>
          <div class="min-w-0 flex-1">
            <p class="flow-list__title truncate">{{ g.name }}</p>
            <p class="flow-list__meta truncate">
              {{ memberLabel(g.member_count) }}<template v-if="g.description"> · {{ g.description }}</template>
            </p>
          </div>
          <div class="flex items-center gap-1.5 shrink-0">
            <button class="btn btn-secondary btn-xs" :aria-expanded="expanded.has(g.id)" @click="toggleExpand(g.id)">
              {{ expanded.has(g.id) ? 'Hide members' : 'Members' }}
            </button>
            <button class="btn btn-secondary btn-xs" @click="startEdit(g)">Edit</button>
            <button class="btn btn-danger btn-xs" @click="askDelete(g)">Delete</button>
          </div>
        </div>
        <div v-if="expanded.has(g.id)" class="pr-4 pb-3 pl-[3.75rem] -mt-1">
          <div v-if="!membersByGroup[g.id]" class="text-xs text-muted">Loading members…</div>
          <div v-else-if="membersByGroup[g.id].length" class="flex flex-wrap gap-1.5">
            <span v-for="m in membersByGroup[g.id]" :key="m.user_id" class="flow-chip flow-chip--muted">
              <span class="flow-dot" :style="{ background: m.display_color || '#cbd5e1' }" aria-hidden="true" />
              {{ m.name || m.user_name }}
            </span>
          </div>
          <div v-else class="text-xs text-muted">No members yet. Use Edit to add clients.</div>
        </div>
      </li>
    </ul>

    <FlowEmpty v-else-if="search" compact title="No matching teams" description="Try a different name." />
    <FlowEmpty v-else title="No teams yet"
      description="Group clients who review together, such as a client's marketing team, so you can invite them all at once.">
      <template #actions><button class="btn btn-primary" @click="openCreate()">New team</button></template>
    </FlowEmpty>
  </div>

  <FlowModal v-model="formOpen" :title="editingGroup ? `Edit ${editingGroup.name}` : 'New team'" size="md" :busy="saving">
    <form id="team-form" class="flex flex-col gap-4" @submit.prevent="submit">
      <FlowField label="Team name" required>
        <template #default="{ id, describedBy }">
          <input :id="id" v-model.trim="form.name" :aria-describedby="describedBy" autofocus
            class="input-textlike w-full px-3 py-2" placeholder="e.g. Acme Marketing" />
        </template>
      </FlowField>
      <FlowField label="Description" optional>
        <template #default="{ id }">
          <input :id="id" v-model.trim="form.description" class="input-textlike w-full px-3 py-2"
            placeholder="Who is in this team?" />
        </template>
      </FlowField>
      <FlowField label="Colour" help="Used for this team's label in lists.">
        <template #default="{ id, describedBy }">
          <div class="flex items-center gap-2">
            <input type="color" :value="normalizeHex(form.display_color) || '#cccccc'" aria-label="Pick a colour"
              class="h-9 w-11 p-0.5 rounded-md border border-default bg-default cursor-pointer"
              @input="form.display_color = ($event.target as HTMLInputElement).value" />
            <input :id="id" v-model.trim="form.display_color" :aria-describedby="describedBy"
              class="input-textlike w-32 px-3 py-2 font-mono text-sm" placeholder="#aabbcc" />
          </div>
        </template>
      </FlowField>

      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between gap-2">
          <span class="text-sm font-medium">Members</span>
          <span class="text-xs text-muted">{{ form.member_ids.length }} selected</span>
        </div>
        <input v-if="allUsers.length > 6" v-model.trim="memberSearch" type="search" aria-label="Search clients"
          class="input-textlike w-full px-3 py-1.5 text-sm" placeholder="Search clients" />
        <ul v-if="filteredUsers.length" class="flow-list max-h-56 overflow-y-auto">
          <li v-for="u in filteredUsers" :key="u.id">
            <label class="flow-list__row flow-list__row--interactive !py-2"
              :class="{ 'flow-list__row--selected': form.member_ids.includes(Number(u.id)) }">
              <input type="checkbox" :value="Number(u.id)" v-model="form.member_ids" class="styled-checkbox" />
              <span class="flow-avatar flow-avatar--sm" :style="avatarStyle(u.display_color)" aria-hidden="true">{{ initials(u.name || u.username) }}</span>
              <span class="min-w-0 flex-1 truncate text-sm">{{ u.name || u.username }}</span>
              <span class="flow-list__meta truncate">@{{ u.username }}</span>
            </label>
          </li>
        </ul>
        <p v-else class="text-xs text-muted">{{ allUsers.length ? 'No clients match.' : 'No clients yet. Add clients first, then put them in teams.' }}</p>
      </div>

      <p v-if="formError" class="text-sm text-flow-danger" role="alert">{{ formError }}</p>
    </form>

    <template #footer>
      <button type="button" class="btn btn-dismiss" @click="formOpen = false">Cancel</button>
      <button type="submit" form="team-form" class="btn btn-primary" :disabled="saving || !form.name.trim()">
        {{ saving ? 'Saving…' : editingGroup ? 'Save team' : 'Create team' }}
      </button>
    </template>
  </FlowModal>

  <ConfirmDeleteModal v-model="deleteOpen" title="Delete team"
    :message="groupToDelete ? `Delete the team “${groupToDelete.name}”? Its members keep their accounts but lose any link access they had through this team.` : ''"
    :danger="true" :busy="deleting" :error="deleteError" :clickOutsideCancels="true" confirmText="Delete team"
    cancelText="Cancel" @confirm="performDelete" />
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { MagnifyingGlassIcon } from '@heroicons/vue/24/outline'
import type { Group, GroupMember, ExistingUser } from '../../typings/electron'
import ConfirmDeleteModal from '../modals/ConfirmDeleteModal.vue'
import FlowModal from '../../ui/FlowModal.vue'
import FlowField from '../../ui/FlowField.vue'
import FlowEmpty from '../../ui/FlowEmpty.vue'
import { avatarStyle, initials, normalizeHex, randomPastel } from './accessUi'

const props = defineProps<{
  apiFetch: (url: string, opts?: any) => Promise<any>
}>()

const emit = defineEmits<{ (e: 'updated'): void }>()

const groups = ref<Group[]>([])
const allUsers = ref<ExistingUser[]>([])
const loading = ref(false)
const search = ref('')
const expanded = reactive(new Set<number>())
const membersByGroup = ref<Record<number, GroupMember[]>>({})

const formOpen = ref(false)
const saving = ref(false)
const formError = ref<string | null>(null)
const editingGroup = ref<Group | null>(null)
const memberSearch = ref('')
const form = ref({ name: '', description: '', display_color: randomPastel(), member_ids: [] as number[] })

const deleteOpen = ref(false)
const deleting = ref(false)
const deleteError = ref<string | null>(null)
const groupToDelete = ref<Group | null>(null)

const filteredGroups = computed(() => {
  const q = search.value.toLowerCase()
  if (!q) return groups.value
  return groups.value.filter(g => `${g.name} ${g.description || ''}`.toLowerCase().includes(q))
})

const filteredUsers = computed(() => {
  const q = memberSearch.value.toLowerCase()
  if (!q) return allUsers.value
  return allUsers.value.filter(u => `${u.name || ''} ${u.username}`.toLowerCase().includes(q))
})

function memberLabel(n?: number) {
  const c = n ?? 0
  return `${c} member${c === 1 ? '' : 's'}`
}

async function fetchGroups() {
  loading.value = true
  try {
    const data = await props.apiFetch('/api/groups', { method: 'GET' })
    groups.value = Array.isArray(data?.groups) ? data.groups : []
  } catch {
    groups.value = []
  } finally {
    loading.value = false
  }
}

async function fetchUsers() {
  try {
    const data = await props.apiFetch('/api/users', { method: 'GET' })
    allUsers.value = Array.isArray(data) ? data : []
  } catch {
    allUsers.value = []
  }
}

async function fetchGroupMembers(groupId: number) {
  try {
    const data = await props.apiFetch(`/api/groups/${groupId}`, { method: 'GET' })
    membersByGroup.value[groupId] = Array.isArray(data?.members) ? data.members : []
  } catch {
    membersByGroup.value[groupId] = []
  }
}

function toggleExpand(groupId: number) {
  if (expanded.has(groupId)) {
    expanded.delete(groupId)
    return
  }
  expanded.add(groupId)
  if (!membersByGroup.value[groupId]) fetchGroupMembers(groupId)
}

function openCreate() {
  editingGroup.value = null
  form.value = { name: '', description: '', display_color: randomPastel(), member_ids: [] }
  formError.value = null
  memberSearch.value = ''
  formOpen.value = true
}

function startEdit(g: Group) {
  editingGroup.value = g
  form.value = { name: g.name, description: g.description || '', display_color: g.display_color || randomPastel(), member_ids: [] }
  formError.value = null
  memberSearch.value = ''
  formOpen.value = true
  props.apiFetch(`/api/groups/${g.id}`, { method: 'GET' }).then(data => {
    if (data?.members) form.value.member_ids = data.members.map((m: GroupMember) => m.user_id)
  }).catch(() => {})
}

async function submit() {
  if (!form.value.name.trim() || saving.value) return
  formError.value = null
  saving.value = true
  const details = {
    name: form.value.name,
    description: form.value.description || null,
    display_color: normalizeHex(form.value.display_color) || form.value.display_color || null,
  }
  try {
    if (editingGroup.value) {
      const id = editingGroup.value.id
      await props.apiFetch(`/api/groups/${id}`, { method: 'PATCH', body: JSON.stringify(details) })
      await props.apiFetch(`/api/groups/${id}/members`, {
        method: 'POST',
        body: JSON.stringify({ user_ids: form.value.member_ids, mode: 'replace' }),
      })
      delete membersByGroup.value[id]
      if (expanded.has(id)) fetchGroupMembers(id)
    } else {
      await props.apiFetch('/api/groups', {
        method: 'POST',
        body: JSON.stringify({ ...details, member_ids: form.value.member_ids }),
      })
    }
    formOpen.value = false
    await fetchGroups()
    emit('updated')
  } catch (e: any) {
    formError.value = e?.message || (editingGroup.value ? 'Couldn\'t update the team.' : 'Couldn\'t create the team.')
  } finally {
    saving.value = false
  }
}

function askDelete(g: Group) {
  groupToDelete.value = g
  deleteError.value = null
  deleteOpen.value = true
}

async function performDelete() {
  if (!groupToDelete.value) return
  deleting.value = true
  deleteError.value = null
  try {
    await props.apiFetch(`/api/groups/${groupToDelete.value.id}`, { method: 'DELETE' })
    deleteOpen.value = false
    groupToDelete.value = null
    await fetchGroups()
    emit('updated')
  } catch (e: any) {
    deleteError.value = e?.message || 'Couldn\'t delete the team.'
  } finally {
    deleting.value = false
  }
}

function refresh() {
  fetchGroups()
  fetchUsers()
}

onMounted(refresh)

defineExpose({ refresh, openCreate })
</script>
