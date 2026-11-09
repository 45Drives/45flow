<template>
  <div class="flex flex-col gap-3 min-h-0">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <p class="text-xs text-muted max-w-xl">
        A role decides what someone can do on an invite-only link. You pick a role for each client or team when you invite them.
      </p>
      <button class="btn btn-primary shrink-0" data-tour="roles-modal-create" @click="openCreate()">New role</button>
    </div>

    <p v-if="loadError" class="text-sm text-flow-danger" role="alert">{{ loadError }}</p>

    <div v-if="loading && !roles.length" class="text-sm text-muted py-6 text-center">Loading roles…</div>

    <div v-else-if="roles.length" class="flow-list overflow-y-auto min-h-0" role="table" aria-label="Roles" data-tour="roles-modal-list">
      <div class="flow-list__row roles-grid !py-2 text-xs font-semibold text-muted uppercase tracking-wide" role="row">
        <span role="columnheader">Role</span>
        <span v-for="p in ROLE_PERMISSIONS" :key="p.key" role="columnheader" class="text-center" :title="p.help">{{ p.label }}</span>
        <span role="columnheader"><span class="sr-only">Actions</span></span>
      </div>
      <div v-for="r in roles" :key="r.id" class="flow-list__row roles-grid" role="row">
        <span role="cell" class="flex items-center gap-2 min-w-0">
          <span class="flow-list__title truncate">{{ r.name }}</span>
          <span v-if="r.is_system" class="flow-chip flow-chip--sm flow-chip--muted" title="Comes with 45Flow. You can change its permissions but not delete it.">Built-in</span>
        </span>
        <span v-for="p in ROLE_PERMISSIONS" :key="p.key" role="cell" class="flex justify-center">
          <template v-if="(r as any)[p.key]">
            <CheckIcon class="w-4 h-4 text-flow-success" aria-hidden="true" /><span class="sr-only">Yes</span>
          </template>
          <template v-else>
            <span class="text-muted" aria-hidden="true">—</span><span class="sr-only">No</span>
          </template>
        </span>
        <span role="cell" class="flex items-center justify-end gap-1.5">
          <button class="btn btn-secondary btn-xs" @click="startEdit(r)">Edit</button>
          <button class="btn btn-danger btn-xs" :disabled="!!r.is_system"
            :title="r.is_system ? 'Built-in roles can\'t be deleted' : undefined" @click="askDelete(r)">Delete</button>
        </span>
      </div>
    </div>

    <FlowEmpty v-else title="No roles yet" description="Create a role to control what invited clients can do.">
      <template #actions><button class="btn btn-primary" @click="openCreate()">New role</button></template>
    </FlowEmpty>
  </div>

  <FlowModal v-model="formOpen" :title="editingRole ? `Edit ${editingRole.name}` : 'New role'" size="md" :busy="saving">
    <form id="role-form" class="flex flex-col gap-4" @submit.prevent="submit">
      <FlowField label="Role name" required
        :help="editingRole?.is_system ? 'Built-in roles keep their name.' : undefined">
        <template #default="{ id, describedBy }">
          <input :id="id" v-model.trim="form.name" :aria-describedby="describedBy" :disabled="!!editingRole?.is_system"
            autofocus class="input-textlike w-full px-3 py-2" placeholder="e.g. Editor" />
        </template>
      </FlowField>
      <fieldset class="flex flex-col gap-1">
        <legend class="text-sm font-medium mb-1">People with this role can</legend>
        <div class="flow-list">
          <label v-for="p in ROLE_PERMISSIONS" :key="p.key" class="flow-list__row flow-list__row--interactive !items-start">
            <input type="checkbox" v-model="(form as any)[p.key]" class="styled-checkbox mt-0.5" />
            <span class="min-w-0">
              <span class="block text-sm font-medium">{{ p.label }}</span>
              <span class="flow-list__meta">{{ p.help }}</span>
            </span>
          </label>
        </div>
      </fieldset>
      <p v-if="formError" class="text-sm text-flow-danger" role="alert">{{ formError }}</p>
    </form>
    <template #footer>
      <button type="button" class="btn btn-dismiss" @click="formOpen = false">Cancel</button>
      <button type="submit" form="role-form" class="btn btn-primary" :disabled="saving || !form.name.trim()">
        {{ saving ? 'Saving…' : editingRole ? 'Save role' : 'Create role' }}
      </button>
    </template>
  </FlowModal>

  <ConfirmDeleteModal v-model="deleteOpen" title="Delete role"
    :message="roleToDelete ? `Delete the role “${roleToDelete.name}”? This can't be undone.` : ''"
    :danger="true" :busy="deleting" :error="deleteError" :clickOutsideCancels="true" confirmText="Delete role"
    cancelText="Cancel" @confirm="performDelete" />
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { CheckIcon } from '@heroicons/vue/24/outline'
import type { Role } from '../../typings/electron'
import ConfirmDeleteModal from '../modals/ConfirmDeleteModal.vue'
import FlowModal from '../../ui/FlowModal.vue'
import FlowField from '../../ui/FlowField.vue'
import FlowEmpty from '../../ui/FlowEmpty.vue'
import { ROLE_PERMISSIONS } from './accessUi'
import { useTourManager, type TourStep } from '../../composables/useTourManager'
import { useOnboarding } from '../../composables/useOnboarding'

const props = defineProps<{
  apiFetch: (url: string, opts?: any) => Promise<any>
}>()

const emit = defineEmits<{ (e: 'updated'): void }>()

const { requestTour } = useTourManager()
const { onboarding, markDone } = useOnboarding()

const rolesTourSteps: TourStep[] = [
  {
    target: '[data-tour="roles-modal-create"]',
    message: 'Create custom roles here.\n\nEach role has a name and four permissions: View, Comment, Download, and Upload. They control what clients with this role can do on a shared link.',
  },
  {
    target: '[data-tour="roles-modal-list"]',
    message: 'Your roles are listed here with a tick for each permission.\n\nBuilt-in roles can be edited but not deleted. Click "Edit" to change a role\'s permissions.',
  },
]

type RoleForm = { name: string; can_view: boolean; can_comment: boolean; can_download: boolean; can_upload: boolean }
const emptyForm = (): RoleForm => ({ name: '', can_view: true, can_comment: false, can_download: false, can_upload: false })

const roles = ref<Role[]>([])
const loading = ref(false)
const loadError = ref<string | null>(null)

const formOpen = ref(false)
const saving = ref(false)
const formError = ref<string | null>(null)
const editingRole = ref<Role | null>(null)
const form = ref<RoleForm>(emptyForm())

const deleteOpen = ref(false)
const deleting = ref(false)
const deleteError = ref<string | null>(null)
const roleToDelete = ref<Role | null>(null)

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

function openCreate() {
  editingRole.value = null
  form.value = emptyForm()
  formError.value = null
  formOpen.value = true
}

function startEdit(r: Role) {
  editingRole.value = r
  form.value = {
    name: r.name,
    can_view: !!r.can_view,
    can_comment: !!r.can_comment,
    can_download: !!r.can_download,
    can_upload: !!r.can_upload,
  }
  formError.value = null
  formOpen.value = true
}

async function submit() {
  if (!form.value.name.trim() || saving.value) return
  saving.value = true
  formError.value = null
  const permissions = {
    view: form.value.can_view,
    comment: form.value.can_comment,
    download: form.value.can_download,
    upload: form.value.can_upload,
  }
  try {
    if (editingRole.value) {
      await props.apiFetch(`/api/roles/${editingRole.value.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: form.value.name.trim() || editingRole.value.name, permissions }),
      })
    } else {
      await props.apiFetch('/api/roles', {
        method: 'POST',
        body: JSON.stringify({ name: form.value.name.trim(), permissions }),
      })
    }
    formOpen.value = false
    await fetchRoles()
    emit('updated')
  } catch (e: any) {
    formError.value = e?.message || (editingRole.value ? 'Failed to update role.' : 'Failed to create role.')
  } finally {
    saving.value = false
  }
}

function askDelete(r: Role) {
  if (r.is_system) return
  roleToDelete.value = r
  deleteError.value = null
  deleteOpen.value = true
}

async function performDelete() {
  if (!roleToDelete.value) return
  deleting.value = true
  deleteError.value = null
  try {
    await props.apiFetch(`/api/roles/${roleToDelete.value.id}`, { method: 'DELETE' })
    deleteOpen.value = false
    roleToDelete.value = null
    await fetchRoles()
    emit('updated')
  } catch (e: any) {
    deleteError.value = e?.message || 'Failed to delete role.'
  } finally {
    deleting.value = false
  }
}

let tourRequested = false
onMounted(() => {
  fetchRoles()
  if (!tourRequested && !onboarding.value.manageRolesTourDone) {
    tourRequested = true
    setTimeout(() => requestTour('manage-roles', rolesTourSteps, () => markDone('manageRolesTourDone')), 400)
  }
})

defineExpose({ refresh: fetchRoles, openCreate })
</script>

<style scoped>
.roles-grid {
  display: grid;
  grid-template-columns: minmax(8rem, 1fr) repeat(4, 5rem) 8.5rem;
  align-items: center;
}
</style>
