<template>
  <div v-if="modelValue" class="fixed inset-0 z-[70] flex items-center justify-center">
    <div class="absolute inset-0 bg-black/50" @click="close()"></div>

    <div class="relative w-[96vw] max-w-3xl bg-accent rounded-lg shadow-xl p-4 flex flex-col max-h-[90vh]">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-lg font-semibold">Manage groups</h3>
        <button class="btn btn-secondary" @click="close()">Close</button>
      </div>

      <div class="flex-1 overflow-auto pr-1 min-h-0">
        <div class="grid grid-cols-1 gap-4">
          <!-- Create/Edit group -->
          <div class="border rounded p-3 bg-accent/60">
            <div class="font-semibold text-sm mb-2">{{ editingGroup ? 'Edit group' : 'Create new group' }}</div>
            <div class="flex flex-col gap-2 text-left">
              <div class="grid grid-cols-2 gap-2">
                <div>
                  <label class="text-xs opacity-80">Group name <span class="text-red-500">*</span></label>
                  <input v-model.trim="form.name" class="input-textlike border rounded px-3 py-2 w-full"
                    placeholder="e.g. Design Team" />
                </div>
                <div>
                  <label class="text-xs opacity-80">Description (optional)</label>
                  <input v-model.trim="form.description" class="input-textlike border rounded px-3 py-2 w-full"
                    placeholder="Creative department" />
                </div>
              </div>
              <div>
                <label class="text-xs opacity-80">Color (optional)</label>
                <div class="flex items-center gap-2">
                  <input type="color" v-model="form.display_color" class="h-8 w-10 p-0 border rounded" />
                  <input type="text" v-model.trim="form.display_color"
                    class="input-textlike border rounded px-3 py-2 flex-1" placeholder="#aabbcc" />
                </div>
              </div>

              <!-- Member selection -->
              <div>
                <label class="text-xs opacity-80">Members</label>
                <div class="border rounded max-h-40 overflow-auto">
                  <div v-for="u in allUsers" :key="u.id"
                    class="flex items-center gap-2 px-3 py-1.5 border-b border-default text-sm">
                    <input type="checkbox" :value="Number(u.id)" v-model="form.member_ids" />
                    <span class="inline-block h-3 w-3 rounded-full"
                      :style="{ backgroundColor: u.display_color || '#999' }"></span>
                    <span>{{ u.name || u.username }}</span>
                    <span class="opacity-60 text-xs">@{{ u.username }}</span>
                  </div>
                  <div v-if="!allUsers.length" class="px-3 py-2 text-sm opacity-70">No users available.</div>
                </div>
              </div>

              <div class="flex gap-2 mt-2">
                <button v-if="editingGroup" class="btn btn-success" @click="saveGroup()"
                  :disabled="saving || !form.name.trim()">Save</button>
                <button v-else class="btn btn-primary" @click="createNewGroup()"
                  :disabled="saving || !form.name.trim()">Create</button>
                <button v-if="editingGroup" class="btn btn-secondary" @click="cancelEdit()">Cancel</button>
                <button v-else class="btn btn-secondary" @click="resetForm()">Reset</button>
              </div>

              <div v-if="formError" class="text-sm text-red-500">{{ formError }}</div>
            </div>
          </div>

          <!-- Groups list -->
          <div class="border rounded p-3 bg-accent/60">
            <div class="flex items-center justify-between mb-2">
              <div class="font-semibold text-sm">Existing groups</div>
              <button class="btn btn-secondary" @click="fetchGroups()" :disabled="loading">
                {{ loading ? 'Refreshing…' : 'Refresh' }}
              </button>
            </div>

            <div class="max-h-[40vh] overflow-auto border rounded">
              <div v-for="g in groups" :key="g.id"
                class="border-b border-default text-sm">
                <div class="flex items-center justify-between px-3 py-2">
                  <div class="flex items-center gap-2">
                    <span class="inline-block h-3 w-3 rounded-full"
                      :style="{ backgroundColor: g.display_color || '#999' }"></span>
                    <div class="flex flex-col">
                      <span class="font-medium">{{ g.name }}</span>
                      <span v-if="g.description" class="opacity-60 text-xs">{{ g.description }}</span>
                    </div>
                    <span class="text-xs opacity-60 ml-2">{{ g.member_count ?? 0 }} member{{ (g.member_count ?? 0) === 1 ? '' : 's' }}</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <button class="px-2 py-1 text-xs border rounded hover:opacity-80"
                      @click="toggleExpand(g.id)" :title="expanded.has(g.id) ? 'Collapse' : 'Expand members'">
                      <FontAwesomeIcon :icon="expanded.has(g.id) ? faChevronUp : faChevronDown" />
                    </button>
                    <button class="px-2 py-1 text-xs border rounded hover:opacity-80"
                      @click="startEdit(g)" title="Edit group">
                      <FontAwesomeIcon :icon="faEdit" />
                    </button>
                    <button class="px-2 py-1 text-xs border rounded text-red-600 hover:bg-red-600/10"
                      @click="deleteGroup(g)" title="Delete group">
                      <FontAwesomeIcon :icon="faTrash" />
                    </button>
                  </div>
                </div>
                <!-- Expanded members -->
                <div v-if="expanded.has(g.id)" class="px-6 pb-2">
                  <div v-if="membersByGroup[g.id]?.length" class="flex flex-wrap gap-1">
                    <span v-for="m in membersByGroup[g.id]" :key="m.user_id"
                      class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border">
                      <span class="inline-block h-2 w-2 rounded-full"
                        :style="{ backgroundColor: m.display_color || '#999' }"></span>
                      {{ m.name || m.user_name }}
                    </span>
                  </div>
                  <div v-else class="text-xs opacity-60">No members</div>
                </div>
              </div>
              <div v-if="!groups.length && !loading" class="px-3 py-2 text-sm opacity-70">No groups yet.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <ConfirmDeleteModal v-model="deleteOpen" :title="'Delete group'"
    :message="groupToDelete ? `Delete group &quot;${groupToDelete.name}&quot;? Members will lose group-based access to any links.` : ''"
    :danger="true" :busy="deleting" :error="deleteError" :clickOutsideCancels="true" confirmText="Delete"
    cancelText="Cancel" @confirm="performDelete" />
</template>

<script setup lang="ts">
import { ref, watch, reactive, onMounted } from 'vue'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import { faEdit, faTrash, faChevronDown, faChevronUp } from '@fortawesome/free-solid-svg-icons'
import type { Group, GroupMember, ExistingUser } from '../../typings/electron'
import ConfirmDeleteModal from './ConfirmDeleteModal.vue'

const props = defineProps<{
  modelValue: boolean
  apiFetch: (url: string, opts?: any) => Promise<any>
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'updated'): void
}>()

const groups = ref<Group[]>([])
const allUsers = ref<ExistingUser[]>([])
const loading = ref(false)
const saving = ref(false)
const formError = ref<string | null>(null)
const editingGroup = ref<Group | null>(null)
const expanded = reactive(new Set<number>())
const membersByGroup = ref<Record<number, GroupMember[]>>({})

const form = ref({
  name: '',
  description: '',
  display_color: randomColor(),
  member_ids: [] as number[],
})

const deleteOpen = ref(false)
const deleting = ref(false)
const deleteError = ref<string | null>(null)
const groupToDelete = ref<Group | null>(null)

onMounted(() => {
  if (props.modelValue) {
    fetchGroups()
    fetchUsers()
  }
})

watch(() => props.modelValue, (v) => {
  if (v) {
    fetchGroups()
    fetchUsers()
    cancelEdit()
  }
})

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
  } else {
    expanded.add(groupId)
    if (!membersByGroup.value[groupId]) {
      fetchGroupMembers(groupId)
    }
  }
}

async function createNewGroup() {
  formError.value = null
  saving.value = true
  try {
    await props.apiFetch('/api/groups', {
      method: 'POST',
      body: JSON.stringify({
        name: form.value.name,
        description: form.value.description || null,
        display_color: form.value.display_color || null,
        member_ids: form.value.member_ids,
      }),
    })
    resetForm()
    await fetchGroups()
    emit('updated')
  } catch (e: any) {
    formError.value = e?.message || 'Failed to create group.'
  } finally {
    saving.value = false
  }
}

function startEdit(g: Group) {
  editingGroup.value = g
  form.value = {
    name: g.name,
    description: g.description || '',
    display_color: g.display_color || randomColor(),
    member_ids: [],
  }
  formError.value = null
  // Load members for the edit form
  props.apiFetch(`/api/groups/${g.id}`, { method: 'GET' }).then(data => {
    if (data?.members) {
      form.value.member_ids = data.members.map((m: GroupMember) => m.user_id)
    }
  }).catch(() => {})
}

async function saveGroup() {
  if (!editingGroup.value) return
  formError.value = null
  saving.value = true
  try {
    await props.apiFetch(`/api/groups/${editingGroup.value.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        name: form.value.name,
        description: form.value.description || null,
        display_color: form.value.display_color || null,
      }),
    })
    // Update members
    await props.apiFetch(`/api/groups/${editingGroup.value.id}/members`, {
      method: 'POST',
      body: JSON.stringify({
        user_ids: form.value.member_ids,
        mode: 'replace',
      }),
    })
    cancelEdit()
    await fetchGroups()
    emit('updated')
  } catch (e: any) {
    formError.value = e?.message || 'Failed to update group.'
  } finally {
    saving.value = false
  }
}

function cancelEdit() {
  editingGroup.value = null
  resetForm()
}

function resetForm() {
  form.value = {
    name: '',
    description: '',
    display_color: randomColor(),
    member_ids: [],
  }
  formError.value = null
}

function deleteGroup(g: Group) {
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
    deleteError.value = e?.message || 'Failed to delete group.'
  } finally {
    deleting.value = false
  }
}

function close() {
  emit('update:modelValue', false)
}

function randomColor() {
  const h = Math.floor(Math.random() * 360)
  const s = 60 + Math.floor(Math.random() * 20)
  const l = 70 + Math.floor(Math.random() * 10)
  function h2rgb(p: number, q: number, t: number) {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  const H = h / 360, S = s / 100, L = l / 100
  const q = L < 0.5 ? L * (1 + S) : L + S - L * S
  const p = 2 * L - q
  const r = Math.round(h2rgb(p, q, H + 1 / 3) * 255)
  const g = Math.round(h2rgb(p, q, H) * 255)
  const b = Math.round(h2rgb(p, q, H - 1 / 3) * 255)
  const toHex = (x: number) => x.toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}
</script>
