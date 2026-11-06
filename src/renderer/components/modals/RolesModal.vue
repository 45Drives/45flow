<template>
  <div v-if="modelValue" class="fixed inset-0 z-[2500] flex items-center justify-center">
    <div class="absolute inset-0 bg-black/50" @click="close()"></div>

    <div class="relative w-full max-w-4xl bg-accent rounded-lg shadow-xl p-4">
      <div class="flex items-center justify-between mb-3" data-tour="roles-modal-header">
        <h3 class="text-lg font-semibold">Manage roles</h3>
        <button class="btn btn-secondary" @click="close()">Close</button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <!-- Create role -->
        <div class="border rounded p-3 bg-accent/60" data-tour="roles-modal-create">
          <div class="font-semibold text-sm mb-2">Create new role</div>
          <div class="flex flex-col gap-2 text-left">
            <div>
              <label class="text-xs opacity-80">Role name</label>
              <input v-model.trim="createForm.name" class="input-textlike border rounded px-3 py-2 w-full"
                placeholder="e.g. Editor" />
            </div>

            <div class="grid grid-cols-2 gap-2 text-xs">
              <label class="flex items-center gap-2">
                <input type="checkbox" v-model="createForm.can_view" />
                View
              </label>
              <label class="flex items-center gap-2">
                <input type="checkbox" v-model="createForm.can_comment" />
                Comment
              </label>
              <label class="flex items-center gap-2">
                <input type="checkbox" v-model="createForm.can_download" />
                Download
              </label>
              <label class="flex items-center gap-2">
                <input type="checkbox" v-model="createForm.can_upload" />
                Upload
              </label>
            </div>

            <div class="flex gap-2 mt-2">
              <button class="btn btn-primary" @click="createRole" :disabled="creating || !createForm.name.trim()">
                Create
              </button>
              <button class="btn btn-secondary" @click="resetCreate">Reset</button>
            </div>

            <div v-if="createError" class="text-sm text-red-500">{{ createError }}</div>
          </div>
        </div>

        <!-- Roles list -->
        <div class="border rounded p-3 bg-accent/60" data-tour="roles-modal-list">
          <div class="flex items-center justify-between mb-2">
            <div class="font-semibold text-sm">Existing roles</div>
            <button class="btn btn-secondary" @click="fetchRoles" :disabled="loading">
              {{ loading ? 'Refreshing…' : 'Refresh' }}
            </button>
          </div>

          <div v-if="loadError" class="text-sm text-red-500 mb-2">{{ loadError }}</div>

          <div class="max-h-80 overflow-auto border rounded">
            <div v-for="r in roles" :key="r.id" class="border-b border-default px-3 py-2 text-sm">
              <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-2">
                  <input v-if="isEditing(r)" v-model.trim="editForm.name"
                    class="input-textlike border rounded px-2 py-1 text-sm" :disabled="r.is_system" />
                  <span v-else class="font-medium">{{ r.name }}</span>
                  <span v-if="r.is_system"
                    class="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full bg-default/70 text-amber-400 border border-amber-500/30">
                    System
                  </span>
                </div>

                <div class="flex items-center gap-2">
                  <button v-if="!isEditing(r)" class="px-2 py-1 text-xs border rounded hover:opacity-80"
                    @click="startEdit(r)">
                    Edit
                  </button>
                  <button v-else class="px-2 py-1 text-xs border rounded hover:opacity-80"
                    @click="saveEdit(r)" :disabled="saving">
                    Save
                  </button>
                  <button v-if="isEditing(r)" class="px-2 py-1 text-xs border rounded hover:opacity-80"
                    @click="cancelEdit">
                    Cancel
                  </button>
                  <button class="px-2 py-1 text-xs border rounded text-red-600 hover:bg-red-600/10"
                    :disabled="!!r.is_system"
                    @click="deleteRole(r)">
                    Delete
                  </button>
                </div>
              </div>

              <div class="grid grid-cols-2 gap-2 text-xs mt-2">
                <template v-if="isEditing(r)">
                  <label class="flex items-center gap-2">
                    <input type="checkbox" v-model="editForm.can_view" />
                    View
                  </label>
                  <label class="flex items-center gap-2">
                    <input type="checkbox" v-model="editForm.can_comment" />
                    Comment
                  </label>
                  <label class="flex items-center gap-2">
                    <input type="checkbox" v-model="editForm.can_download" />
                    Download
                  </label>
                  <label class="flex items-center gap-2">
                    <input type="checkbox" v-model="editForm.can_upload" />
                    Upload
                  </label>
                </template>
                <template v-else>
                  <label class="flex items-center gap-2">
                    <input type="checkbox" :checked="!!r.can_view" disabled />
                    View
                  </label>
                  <label class="flex items-center gap-2">
                    <input type="checkbox" :checked="!!r.can_comment" disabled />
                    Comment
                  </label>
                  <label class="flex items-center gap-2">
                    <input type="checkbox" :checked="!!r.can_download" disabled />
                    Download
                  </label>
                  <label class="flex items-center gap-2">
                    <input type="checkbox" :checked="!!r.can_upload" disabled />
                    Upload
                  </label>
                </template>
              </div>
            </div>
            <div v-if="!roles.length" class="px-3 py-2 text-sm opacity-70">No roles found.</div>
          </div>

          <div v-if="editError" class="text-sm text-red-500 mt-2">{{ editError }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import type { Role } from '../../typings/electron'
import { useTourManager, type TourStep } from '../../composables/useTourManager'
import { useOnboarding } from '../../composables/useOnboarding'

const { requestTour } = useTourManager()
const { onboarding, markDone } = useOnboarding()

const rolesTourSteps: TourStep[] = [
	{
		target: '[data-tour="roles-modal-create"]',
		message: 'Create custom roles here.\n\nEach role has a name and four permission checkboxes: View, Comment, Download, and Upload. These control what clients with this role can do on a shared link.',
	},
	{
		target: '[data-tour="roles-modal-list"]',
		message: 'Existing roles are listed here.\n\nSystem roles (marked with a badge) cannot be deleted. Click "Edit" to change a role\'s permissions, or "Delete" to remove custom roles.',
	},
]

let _rolesTourTriggered = false

const props = defineProps<{
  modelValue: boolean
  apiFetch: (url: string, opts?: any) => Promise<any>
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'updated'): void
}>()

// Tour: trigger on first open
watch(() => props.modelValue, (open) => {
	if (open && !_rolesTourTriggered && !onboarding.value.manageRolesTourDone) {
		_rolesTourTriggered = true
		setTimeout(() => {
			requestTour('manage-roles', rolesTourSteps, () => markDone('manageRolesTourDone'))
		}, 400)
	}
})

const roles = ref<Role[]>([])
const loading = ref(false)
const loadError = ref<string | null>(null)

const creating = ref(false)
const createError = ref<string | null>(null)
const createForm = ref({
  name: '',
  can_view: true,
  can_comment: false,
  can_download: false,
  can_upload: false,
})

const editingId = ref<number | null>(null)
const saving = ref(false)
const editError = ref<string | null>(null)
const editForm = ref({
  name: '',
  can_view: false,
  can_comment: false,
  can_download: false,
  can_upload: false,
})

watch(
  () => props.modelValue,
  (v) => {
    if (v) fetchRoles()
  }
)

function close() {
  emit('update:modelValue', false)
}

function resetCreate() {
  createForm.value = {
    name: '',
    can_view: true,
    can_comment: false,
    can_download: false,
    can_upload: false,
  }
  createError.value = null
}

async function fetchRoles() {
  loading.value = true
  loadError.value = null
  try {
    const data = await props.apiFetch('/api/roles', { method: 'GET' })
    roles.value = Array.isArray(data?.roles) ? data.roles : []
  } catch (e: any) {
    loadError.value = e?.message || 'Failed to load roles.'
    roles.value = []
  } finally {
    loading.value = false
  }
}

async function createRole() {
  createError.value = null
  if (!createForm.value.name.trim()) return
  creating.value = true
  try {
    await props.apiFetch('/api/roles', {
      method: 'POST',
      body: JSON.stringify({
        name: createForm.value.name.trim(),
        permissions: {
          view: createForm.value.can_view,
          comment: createForm.value.can_comment,
          download: createForm.value.can_download,
          upload: createForm.value.can_upload,
        },
      }),
    })
    resetCreate()
    await fetchRoles()
    emit('updated')
  } catch (e: any) {
    createError.value = e?.message || 'Failed to create role.'
  } finally {
    creating.value = false
  }
}

function isEditing(r: Role) {
  return editingId.value === r.id
}

function startEdit(r: Role) {
  editingId.value = r.id
  editError.value = null
  editForm.value = {
    name: r.name,
    can_view: !!r.can_view,
    can_comment: !!r.can_comment,
    can_download: !!r.can_download,
    can_upload: !!r.can_upload,
  }
}

function cancelEdit() {
  editingId.value = null
  editError.value = null
}

async function saveEdit(r: Role) {
  if (!isEditing(r)) return
  saving.value = true
  editError.value = null
  try {
    await props.apiFetch(`/api/roles/${r.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        name: editForm.value.name.trim() || r.name,
        permissions: {
          view: editForm.value.can_view,
          comment: editForm.value.can_comment,
          download: editForm.value.can_download,
          upload: editForm.value.can_upload,
        },
      }),
    })
    editingId.value = null
    await fetchRoles()
    emit('updated')
  } catch (e: any) {
    editError.value = e?.message || 'Failed to update role.'
  } finally {
    saving.value = false
  }
}

async function deleteRole(r: Role) {
  if (r.is_system) return
  if (!confirm(`Delete role "${r.name}"? This cannot be undone.`)) return
  try {
    await props.apiFetch(`/api/roles/${r.id}`, { method: 'DELETE' })
    await fetchRoles()
    emit('updated')
  } catch (e: any) {
    editError.value = e?.message || 'Failed to delete role.'
  }
}
</script>
