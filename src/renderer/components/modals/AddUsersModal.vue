<template>
  <div v-if="modelValue" class="fixed inset-0 z-50 flex items-center justify-center">
    <div class="absolute inset-0 bg-black/50" @click="close()"></div>

    <div class="relative w-[96vw] max-w-2xl bg-accent rounded-lg shadow-xl p-4 flex flex-col max-h-[90vh]">
      <div class="flex items-center justify-between mb-3" data-tour="users-modal-header">
        <h3 class="text-lg font-semibold">{{ linkMode ? 'Manage link access' : 'Manage users' }}</h3>

        <div class="flex items-center gap-2">
          <button class="btn btn-secondary" @click="openGroups()">Manage groups</button>
          <button class="btn btn-secondary" @click="openRoles()">Manage roles</button>
          <button class="btn btn-secondary" @click="close()">Close</button>
        </div>
      </div>

      <div class="flex-1 overflow-auto pr-1 min-h-0">
        <div class="grid grid-cols-1 gap-4">
          <!-- Existing users -->
          <div class="border rounded p-3 bg-accent/60" data-tour="users-modal-list">
            <div class="flex items-center justify-between mb-2">
              <div class="font-semibold text-sm">{{ linkMode ? 'Select existing users' : 'Existing users' }}</div>
              <input type="text" v-model.trim="userSearch"
                class="input-textlike border rounded px-2 py-1 text-sm"
                placeholder="Search by name/username/email/company/tag" @input="debouncedFetchUsers()" />
            </div>

            <div class="max-h-[45vh] overflow-auto border rounded">
              <div v-for="u in users" :key="u.id ?? u.username"
                class="flex items-center justify-between px-3 py-2 border-b border-default text-sm">
                <label v-if="linkMode" class="flex items-center gap-2 cursor-pointer" @click.stop>
                  <input type="checkbox" :value="userKey(u)" v-model="selectedKeys" />
                  <span class="inline-block h-3 w-3 rounded-full"
                    :style="{ backgroundColor: u.display_color || '#999' }"></span>
                  <div class="flex flex-col">
                    <span class="font-medium">{{ u.name || u.username }}</span>
                    <span class="opacity-70">
                      @{{ u.username }}
                      <span v-if="u.user_email">• {{ u.user_email }}</span>
                    </span>
                    <span v-if="u.company || (u.tags && u.tags.length)" class="opacity-60 text-xs">
                      <span v-if="u.company">{{ u.company }}</span>
                      <span v-if="u.company && u.tags && u.tags.length">•</span>
                      <span v-if="u.tags && u.tags.length">{{ u.tags.join(', ') }}</span>
                    </span>
                  </div>
                </label>
                <div v-else class="flex items-center gap-2">
                  <span class="inline-block h-3 w-3 rounded-full"
                    :style="{ backgroundColor: u.display_color || '#999' }"></span>
                  <div class="flex flex-col">
                    <span class="font-medium">{{ u.name || u.username }}</span>
                    <span class="opacity-70">
                      @{{ u.username }}
                      <span v-if="u.user_email">• {{ u.user_email }}</span>
                    </span>
                    <span v-if="u.company || (u.tags && u.tags.length)" class="opacity-60 text-xs">
                      <span v-if="u.company">{{ u.company }}</span>
                      <span v-if="u.company && u.tags && u.tags.length">•</span>
                      <span v-if="u.tags && u.tags.length">{{ u.tags.join(', ') }}</span>
                    </span>
                  </div>
                </div>

                <!-- Actions -->
                <div class="flex items-center gap-2">
                  <select
                    v-if="linkMode"
                    v-model.number="roleByKey[userKey(u)]"
                    :disabled="!selectedKeys.includes(userKey(u)) || rolesLoading || !roles.length"
                    class="input-textlike border rounded px-2 py-1 text-xs min-w-[140px]"
                    title="Role for this link"
                  >
                    <option v-if="rolesLoading" disabled value="">Loading roles…</option>
                    <option v-else-if="!roles.length" disabled value="">No roles</option>
                    <option v-else v-for="r in roles" :key="r.id" :value="r.id">
                      {{ r.name }}
                    </option>
                  </select>
                  <button class="px-2 py-1 text-xs border rounded hover:opacity-80" @click.stop="startEdit(u)"
                    title="Edit user">
                    <FontAwesomeIcon :icon="faEdit" />
                  </button>
                  <button class="px-2 py-1 text-xs border rounded text-red-600 hover:bg-red-600/10"
                    @click.stop="deleteUser(u)" title="Delete user">
                    <FontAwesomeIcon :icon="faTrash" />
                  </button>
                </div>
              </div>
              <div v-if="!users.length" class="px-3 py-2 text-sm opacity-70">No users.</div>
            </div>

            <div v-if="linkMode" class="flex gap-2 mt-2">
              <button class="btn btn-secondary" @click="selectAll()" :disabled="!users.length">Select all</button>
              <button class="btn btn-secondary" @click="clearSelected()" :disabled="!selectedKeys.length">
                Clear
              </button>
            </div>
          </div>

          <!-- Groups section (link mode) -->
          <div v-if="linkMode && groups.length" class="border rounded p-3 bg-accent/60" data-tour="users-modal-groups">
            <div class="font-semibold text-sm mb-2">Select groups</div>
            <div class="max-h-[30vh] overflow-auto border rounded">
              <div v-for="g in groups" :key="g.id"
                class="border-b border-default text-sm">
                <div class="flex items-center justify-between px-3 py-2">
                  <label class="flex items-center gap-2 cursor-pointer flex-1" @click.stop>
                    <input type="checkbox" :value="g.id" v-model="selectedGroupIds" />
                    <span class="inline-block h-3 w-3 rounded-full"
                      :style="{ backgroundColor: g.display_color || '#999' }"></span>
                    <div class="flex flex-col">
                      <span class="font-medium">{{ g.name }}</span>
                      <span class="opacity-60 text-xs">
                        {{ g.member_count ?? 0 }} member{{ (g.member_count ?? 0) === 1 ? '' : 's' }}
                        <span v-if="g.description"> • {{ g.description }}</span>
                      </span>
                    </div>
                  </label>
                  <div class="flex items-center gap-2">
                    <select v-model.number="groupRoleById[g.id]"
                      :disabled="!selectedGroupIds.includes(g.id) || rolesLoading || !roles.length"
                      class="input-textlike border rounded px-2 py-1 text-xs min-w-[140px]"
                      title="Role for this group">
                      <option v-if="rolesLoading" disabled value="">Loading roles…</option>
                      <option v-else-if="!roles.length" disabled value="">No roles</option>
                      <option v-else v-for="r in roles" :key="r.id" :value="r.id">
                        {{ r.name }}
                      </option>
                    </select>
                    <button class="px-2 py-1 text-xs border rounded hover:opacity-80"
                      @click.stop="toggleGroupMembers(g.id)"
                      :title="expandedGroupIds.has(g.id) ? 'Hide members' : 'Show members'">
                      <FontAwesomeIcon :icon="expandedGroupIds.has(g.id) ? faChevronUp : faChevronDown" />
                    </button>
                  </div>
                </div>
                <div v-if="expandedGroupIds.has(g.id)" class="px-8 pb-2">
                  <div v-if="groupMembersCache[g.id]?.length" class="flex flex-wrap gap-1">
                    <span v-for="m in groupMembersCache[g.id]" :key="m.user_id"
                      class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border">
                      <span class="inline-block h-2 w-2 rounded-full"
                        :style="{ backgroundColor: m.display_color || '#999' }"></span>
                      {{ m.name || m.user_name }}
                    </span>
                  </div>
                  <div v-else class="text-xs opacity-60">No members</div>
                </div>
              </div>
            </div>
          </div>

          <!-- Create new user -->
          <div class="flex flex-col gap-2" data-tour="users-modal-create">
            <div class="mr-auto">
              <button v-if="!showCreate"
                class="btn btn-primary"
                @click="openCreate()">Create new user</button>
              <button v-else
                class="btn btn-danger"
                @click="closeCreate()">
                Close create form
              </button>
            </div>
            <div v-if="showCreate" class="border rounded p-3 bg-accent/60">
              <div class="font-semibold text-sm mb-2">Create new user</div>
              <div class="flex flex-col gap-2">
                <div class="text-xs opacity-70 mb-1">A temporary password is required. Share it securely with the user.</div>
                <div class="grid grid-cols-2 gap-2 text-left">
                  <div>
                    <label class="text-xs opacity-80">Name <span class="text-red-500">*</span></label>
                    <input type="text" v-model.trim="newUser.name" tabindex="1"
                      class="input-textlike border rounded px-3 py-2 w-full" placeholder="Jane Doe" />
                  </div>
                  <div>
                    <label class="text-xs opacity-80">Username <span class="text-red-500">*</span></label>
                    <input type="text" v-model.trim="newUser.username" tabindex="2"
                      class="input-textlike border rounded px-3 py-2 w-full" placeholder="jane" />
                  </div>
                  <div>
                    <div class="relative">
                      <label class="text-xs opacity-80 pr-28 inline-block">
                        Temporary Password <span class="text-red-500">*</span>
                      </label>
                      <button type="button"
                        class="absolute right-0 top-0 text-xs underline opacity-80 hover:opacity-100 mt-1.5"
                        @click="generateTempPassword">
                        Generate password
                      </button>
                    </div>
                    <div class="relative">
                      <input :type="showTempPassword ? 'text' : 'password'"
                        v-model.trim="tempPassword" tabindex="3"
                        :class="['input-textlike border rounded px-3 py-2 w-full pr-12', (passwordFormatInvalid ? 'border-red-500' : '')]"
                        placeholder="4–64 characters" aria-invalid="true"
                        v-bind="passwordFormatInvalid ? { 'aria-describedby': 'password-format-error' } : {}" />
                      <button type="button"
                        class="absolute right-2 top-1/2 -translate-y-1/2 text-xs border rounded px-2 py-1"
                        @click="showTempPassword = !showTempPassword" :aria-pressed="showTempPassword ? 'true' : 'false'">
                        {{ showTempPassword ? 'Hide' : 'Show' }}
                      </button>
                    </div>
                    <p v-if="passwordFormatInvalid" id="password-format-error" class="mt-1 text-xs text-red-500">
                      Password must be 4–64 characters.
                    </p>
                  </div>
                   <div>
                    <label class="text-xs opacity-80">Confirm Password <span class="text-red-500">*</span></label>
                    <div class="relative">
                      <input :type="showTempPasswordConfirm ? 'text' : 'password'"
                        v-model.trim="tempPasswordConfirm" tabindex="4"
                        :class="['input-textlike border rounded px-3 py-2 w-full pr-12', (passwordMismatch ? 'border-red-500' : '')]"
                        placeholder="Re-enter password" aria-invalid="true"
                        v-bind="passwordMismatch ? { 'aria-describedby': 'password-mismatch-error' } : {}" />
                      <button type="button"
                        class="absolute right-2 top-1/2 -translate-y-1/2 text-xs border rounded px-2 py-1"
                        @click="showTempPasswordConfirm = !showTempPasswordConfirm" :aria-pressed="showTempPasswordConfirm ? 'true' : 'false'">
                        {{ showTempPasswordConfirm ? 'Hide' : 'Show' }}
                      </button>
                    </div>
                    <p v-if="passwordMismatch" id="password-mismatch-error" class="mt-1 text-xs text-red-500">Passwords do not match.</p>
                  </div>
                  <div>
                    <label class="text-xs opacity-80">Email (optional)</label>
                    <input type="email" v-model.trim="newUser.user_email" tabindex="5"
                      class="input-textlike border rounded px-3 py-2 w-full" placeholder="jane@example.com" />
                  </div>
                  <div>
                    <label class="text-xs opacity-80">Company (optional)</label>
                    <input type="text" v-model.trim="newUser.company" tabindex="6"
                      class="input-textlike border rounded px-3 py-2 w-full" placeholder="Acme Corp" />
                  </div>
                  <div class="col-span-2">
                    <label class="text-xs opacity-80">Tags (optional)</label>
                    <input type="text" v-model.trim="newUserTagsInput" tabindex="7"
                      class="input-textlike border rounded px-3 py-2 w-full" placeholder="finance, vip, internal" />
                  </div>
                  <div>
                    <label class="text-xs opacity-80">Default role (new links)</label>
                    <select v-model="newUserDefaultRoleId" :disabled="rolesLoading || !roles.length" tabindex="8"
                      class="input-textlike border rounded px-3 py-2 w-full">
                      <option :value="null">None</option>
                      <option v-if="rolesLoading" disabled value="">Loading roles…</option>
                      <option v-else-if="!roles.length" disabled value="">No roles</option>
                      <option v-else v-for="r in roles" :key="r.id" :value="r.id">
                        {{ r.name }}
                      </option>
                    </select>
                  </div>
                  <div v-if="linkMode" class="col-span-2">
                    <label class="text-xs opacity-80">Role for this link</label>
                    <select v-model.number="newUserRoleId" :disabled="rolesLoading || !roles.length" tabindex="9"
                      class="input-textlike border rounded px-3 py-2 w-full">
                      <option v-if="rolesLoading" disabled value="">Loading roles…</option>
                      <option v-else-if="!roles.length" disabled value="">No roles</option>
                      <option v-else v-for="r in roles" :key="r.id" :value="r.id">
                        {{ r.name }}
                      </option>
                    </select>
                  </div>
                  <div class="col-span-2">
                    <div class="flex items-center justify-between">
                      <label class="text-xs opacity-80">Groups (optional)</label>
                      <button type="button" class="text-xs underline opacity-80 hover:opacity-100" @click="openGroups()">
                        New group
                      </button>
                    </div>
                    <div v-if="groups.length" class="mt-1 border rounded p-2 max-h-32 overflow-auto">
                      <label v-for="g in groups" :key="g.id"
                        class="flex items-center gap-2 py-0.5 cursor-pointer text-sm">
                        <input type="checkbox" :value="g.id" v-model="newUserGroupIds" />
                        <span class="inline-block h-2.5 w-2.5 rounded-full"
                          :style="{ backgroundColor: g.display_color || '#999' }"></span>
                        <span>{{ g.name }}</span>
                        <span class="opacity-50 text-xs">({{ g.member_count ?? 0 }})</span>
                      </label>
                    </div>
                    <div v-else class="mt-1 text-xs opacity-60">No groups yet.</div>
                  </div>
                </div>
             
                <div class="col-span-2 text-left">
                  <label class="text-xs opacity-80">Comment color</label>
                  <div class="flex items-center gap-2">
                    <input type="color" v-model="newUser.display_color" class="h-8 w-10 p-0 border rounded"
                      title="Pick a color" />
                    <input type="text" v-model.trim="newUser.display_color" tabindex="10"
                      class="input-textlike border rounded px-3 py-2 w-full" placeholder="#aabbcc" />
                  </div>
                  <div class="text-xs opacity-70 mt-1">Used to tint this user’s comments.</div>
                </div>

                <div class="flex flex-row w-full justify-between mt-2">

                  <button class="btn btn-secondary" @click="resetNewUser()">Reset</button>
                  <button class="btn btn-primary" @click="createUser()" tabindex="11" :disabled="!canSubmit">{{linkMode ? 'Create & Select User' : 'Create User'}}</button>
                </div>


                <div v-if="error" class="text-sm text-red-500">{{ error }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="flex justify-end gap-2 mt-4" data-tour="users-modal-actions">
        <button class="btn btn-secondary" @click="close()">{{ linkMode ? 'Cancel' : 'Close' }}</button>
        <button v-if="linkMode" class="btn btn-success" @click="apply()">Add to link</button>
      </div>
    </div>
  </div>

  <!-- Edit modal -->
  <div v-if="editing" class="fixed inset-0 z-[60] flex items-center justify-center text-left">
    <div class="absolute inset-0 bg-black/50" @click="editing = null"></div>
    <div class="relative w-full max-w-md bg-accent rounded-lg shadow-xl p-4">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-lg font-semibold">Edit user</h3>
        <button class="btn btn-secondary" @click="editing = null">Close</button>
      </div>
      <div class="space-y-3">
        <div>
          <label class="text-xs opacity-80">Username</label>
          <input class="input-textlike border rounded px-3 py-2 w-full bg-gray-600/20 opacity-70"
            :value="editing.username" disabled />
        </div>
        <div>
          <label class="text-xs opacity-80">Name</label>
          <input v-model.trim="editForm.name" class="input-textlike border rounded px-3 py-2 w-full" />
        </div>
        <div>
          <label class="text-xs opacity-80">Email</label>
          <input v-model.trim="editForm.user_email" type="email"
            class="input-textlike border rounded px-3 py-2 w-full" />
        </div>
        <div>
          <label class="text-xs opacity-80">Company</label>
          <input v-model.trim="editForm.company" type="text"
            class="input-textlike border rounded px-3 py-2 w-full" />
        </div>
        <div>
          <label class="text-xs opacity-80">Tags</label>
          <input v-model.trim="editForm.tags_text" type="text"
            class="input-textlike border rounded px-3 py-2 w-full" placeholder="finance, vip, internal" />
        </div>
        <div>
          <label class="text-xs opacity-80">Comment color</label>
          <div class="flex items-center gap-2">
            <input type="color" v-model="editForm.display_color" class="h-8 w-10 p-0 border rounded" />
            <input v-model.trim="editForm.display_color"
              class="input-textlike border rounded px-3 py-2 w-full" />
          </div>
        </div>
        <div>
          <label class="text-xs opacity-80">Default role (new links)</label>
          <select v-model="editForm.default_role_id" :disabled="rolesLoading || !roles.length"
            class="input-textlike border rounded px-3 py-2 w-full">
            <option :value="null">None</option>
            <option v-if="rolesLoading" disabled value="">Loading roles…</option>
            <option v-else-if="!roles.length" disabled value="">No roles</option>
            <option v-else v-for="r in roles" :key="r.id" :value="r.id">
              {{ r.name }}
            </option>
          </select>
        </div>
        <div>
          <div class="flex items-center justify-between">
            <label class="text-xs opacity-80">Groups</label>
            <button type="button" class="text-xs underline opacity-80 hover:opacity-100" @click="openGroups()">
              New group
            </button>
          </div>
          <div v-if="groups.length" class="mt-1 border rounded p-2 max-h-32 overflow-auto">
            <label v-for="g in groups" :key="g.id"
              class="flex items-center gap-2 py-0.5 cursor-pointer text-sm">
              <input type="checkbox" :value="g.id" v-model="editGroupIds" />
              <span class="inline-block h-2.5 w-2.5 rounded-full"
                :style="{ backgroundColor: g.display_color || '#999' }"></span>
              <span>{{ g.name }}</span>
              <span class="opacity-50 text-xs">({{ g.member_count ?? 0 }})</span>
            </label>
          </div>
          <div v-else class="mt-1 text-xs opacity-60">No groups yet.</div>
        </div>
        <div class="items-center text-center">
          <button class="btn btn-primary" @click="openReset(editing)" title="Reset password for this user">
            Reset Password
          </button>
        </div>
      </div>

      <div class="flex justify-end gap-2 mt-4">
        <button class="btn btn-secondary" @click="editing = null">Cancel</button>
        <button class="btn btn-success" @click="saveEdit()" :disabled="!(hasProfileEdits || pendingResetPassword)">
          Save
        </button>
      </div>
    </div>
  </div>
  <ConfirmDeleteModal v-model="deleteOpen" :title="'Delete user'"
    :message="userToDelete ? `Delete “${userToDelete.name || userToDelete.username}”? This cannot be undone.` : ''"
    :danger="true" :busy="deleting" :error="deleteError" :clickOutsideCancels="true" confirmText="Delete"
    cancelText="Cancel" @confirm="performDelete" />

  <ResetPasswordModal v-model="resetOpen" :user="userToReset" @confirm="onConfirmReset" />

  <RolesModal v-model="rolesOpen" :apiFetch="apiFetch" @updated="fetchRoles" />

  <GroupsModal v-model="groupsOpen" :apiFetch="apiFetch" @updated="fetchGroups" />

</template>

<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import { faTrash, faEdit, faChevronDown, faChevronUp } from '@fortawesome/free-solid-svg-icons';
import type { Role, LinkItem, ExistingUser, Group, GroupMember } from '../../typings/electron'
import ConfirmDeleteModal from './ConfirmDeleteModal.vue'
import ResetPasswordModal from './ResetPasswordModal.vue';
import RolesModal from './RolesModal.vue'
import GroupsModal from './GroupsModal.vue'
import { useTourManager, type TourStep } from '../../composables/useTourManager'
import { useOnboarding } from '../../composables/useOnboarding'

const { requestTour } = useTourManager()
const { onboarding, markDone } = useOnboarding()

const usersTourSteps: TourStep[] = [
	{
		target: '[data-tour="users-modal-header"]',
		message: 'This is the User Management panel.\n\nWhen opened from a link, it works in "link mode" — you select which users get access. From the dashboard, it\'s a general user manager.',
	},
	{
		target: '[data-tour="users-modal-list"]',
		message: 'Existing users appear here.\n\nSearch by name, username, email, company, or tags. In link mode, check the box next to each user to grant them access, and assign a role from the dropdown.',
	},
	{
		target: '[data-tour="users-modal-create"]',
		message: 'Create new user accounts here.\n\nFill in name, username, and a temporary password (use "Generate password" for a random one). Optionally add email, company, tags, and a comment color.\n\nIn link mode, newly created users are auto-selected for the link.',
	},
	{
		target: '[data-tour="users-modal-actions"]',
		message: 'When in link mode, click "Add to link" to assign the selected users.\n\nUse "Manage roles" in the header to create or edit permission roles that control what users can do.',
	},
]

let _usersTourTriggered = false

const props = defineProps<{
  modelValue: boolean
  apiFetch: (url: string, opts?: any) => Promise<any>
  preselected?: ExistingUser[]
  preselectedGroups?: { id: number; role_id?: number | null; role_name?: string | null }[]
  roleHint?: 'upload' | 'comment' | 'view'
  link?: Partial<LinkItem> | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'apply', users: ExistingUser[], groups: { id: number; name: string; member_count?: number; display_color?: string | null; role_id: number | null; role_name: string | null }[]): void
}>()

// Tour: trigger on first open
watch(() => props.modelValue, (open) => {
	if (open && !_usersTourTriggered && !onboarding.value.manageUsersTourDone) {
		_usersTourTriggered = true
		setTimeout(() => {
			requestTour('manage-users', usersTourSteps, () => markDone('manageUsersTourDone'))
		}, 400)
	}
})

// UI state
const userSearch = ref('')
const users = ref<ExistingUser[]>([])
const selectedKeys = ref<string[]>([])

const roles = ref<Role[]>([])
const rolesLoading = ref(false)
const rolesError = ref<string | null>(null)
const rolesOpen = ref(false)
const roleByKey = ref<Record<string, number>>({})
const roleNameByKey = ref<Record<string, string>>({})
const newUserRoleId = ref<number | null>(null)
const newUserDefaultRoleId = ref<number | null>(null)

// Groups state
const groups = ref<Group[]>([])
const groupsOpen = ref(false)
const selectedGroupIds = ref<number[]>([])
const groupRoleById = ref<Record<number, number>>({})
const expandedGroupIds = new Set<number>()
const groupMembersCache = ref<Record<number, GroupMember[]>>({})

const newUser = ref<ExistingUser>({ username: '', name: '', user_email: '', company: '', display_color: randomPastel(), tags: [] })
const newUserTagsInput = ref('')
const newUserGroupIds = ref<number[]>([])
const error = ref('')
const tempPassword = ref('')
const tempPasswordConfirm = ref('')
const showTempPassword = ref(false)
const showTempPasswordConfirm = ref(false)
const showCreate = ref(false)
const deleteOpen = ref(false)
const deleting = ref(false)
const deleteError = ref<string | null>(null)
const userToDelete = ref<ExistingUser | null>(null)
const resetOpen = ref(false)
const userToReset = ref<{ id?: number | string; username?: string; name?: string } | null>(null)
const pendingResetPassword = ref<string | null>(null)
const pendingResetUserId = ref<number | string | null>(null)


// Edit state
const editing = ref<ExistingUser | null>(null)
const editGroupIds = ref<number[]>([])
const editGroupIdsOriginal = ref<number[]>([])
const editForm = ref<{ name: string; user_email: string; company: string; tags_text: string; display_color: string; default_role_id: number | null }>({
  name: '',
  user_email: '',
  company: '',
  tags_text: '',
  display_color: '#999999',
  default_role_id: null,
})

const canSubmit = computed(() => {
  const u = (newUser.value.username || '').trim()
  const p = tempPassword.value.trim()
  const c = tempPasswordConfirm.value.trim()
  return !!u && p.length >= 4 && p.length <= 64 && p === c
})
const passwordMismatch = computed(() => {
  const p = tempPassword.value.trim()
  const c = tempPasswordConfirm.value.trim()
  return p.length > 0 && c.length > 0 && p !== c
})
const passwordFormatInvalid = computed(() => {
  const p = tempPassword.value.trim()
  return p.length > 0 && (p.length < 4 || p.length > 64)
})
const hasProfileEdits = computed(() => {
  if (!editing.value) return false
  const nameChanged = editForm.value.name.trim() !== (editing.value.name || '')
  const emailChanged = (editForm.value.user_email.trim() || null) !== (editing.value.user_email ?? null)
  const companyChanged = (editForm.value.company.trim() || null) !== ((editing.value.company || '').trim() || null)
  const currentTags = normalizeTagArray(editing.value.tags)
  const nextTags = normalizeTagArray(editForm.value.tags_text)
  const tagsChanged = !tagArraysEqual(currentTags, nextTags)
  const colorChanged = (normalizeHex(editForm.value.display_color) || null) !== (editing.value.display_color || null)
  const defaultRoleChanged = (editForm.value.default_role_id ?? null) !== (getDefaultRoleId(editing.value) ?? null)
  const groupsSorted = (ids: number[]) => [...ids].sort((a, b) => a - b).join(',')
  const groupsChanged = groupsSorted(editGroupIds.value) !== groupsSorted(editGroupIdsOriginal.value)
  return nameChanged || emailChanged || companyChanged || tagsChanged || colorChanged || defaultRoleChanged || groupsChanged
})

const defaultRoleId = computed(() => {
  if (!roles.value.length) return null
  if (props.roleHint === 'upload') {
    return roles.value.find(r => r.can_upload)?.id ?? roles.value[0].id
  }
  if (props.roleHint === 'comment') {
    return roles.value.find(r => r.can_comment)?.id ?? roles.value[0].id
  }
  const viewer = roles.value.find(r => r.name?.toLowerCase() === 'viewer')
  return viewer?.id ?? roles.value[0].id
})

const linkMode = computed(() => !!props.link || props.roleHint != null)

watch([tempPassword, tempPasswordConfirm], () => {
  if (error.value) error.value = ''
})

function generateTempPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"
  let out = ""
  for (let i = 0; i < 8; i++) {
    out += chars[Math.floor(Math.random() * chars.length)]
  }
  tempPassword.value = out
  tempPasswordConfirm.value = out
}

// lifecycle
onMounted(() => {
  if (props.modelValue) {
    fetchUsers()
    fetchRoles()
    fetchGroups()
  }
})

watch(
  () => props.modelValue,
  v => {
    if (v) {
      userSearch.value = ''
      error.value = ''
      selectedKeys.value = (props.preselected || [])
        .map(p => userKey(p))
        .filter(Boolean)
      roleByKey.value = {}
      roleNameByKey.value = {}
      for (const p of (props.preselected || [])) {
        const k = userKey(p)
        if (!k) continue
        const rawRoleId = p.role_id ?? (p as any).roleId ?? p.role?.id
        if (rawRoleId != null && Number.isFinite(Number(rawRoleId))) {
          roleByKey.value[k] = Number(rawRoleId)
        } else {
          const rawRoleName = p.role_name ?? (p as any).roleName ?? p.role?.name
          if (rawRoleName) roleNameByKey.value[k] = String(rawRoleName)
        }
      }
      fetchUsers()
      fetchRoles()
      fetchGroups()

      // Restore preselected groups
      selectedGroupIds.value = (props.preselectedGroups || [])
        .map(g => g.id)
        .filter(Boolean)
      groupRoleById.value = {}
      for (const g of (props.preselectedGroups || [])) {
        if (g.role_id != null) groupRoleById.value[g.id] = Number(g.role_id)
      }
    }
  }
)

watch(
  newUserDefaultRoleId,
  (newVal) => {
    if (!linkMode.value) return

    // If they pick a default role, force "Role for this link" to match.
    // If they clear default (None), fall back to the computed modal default.
    if (newVal == null) {
      newUserRoleId.value = defaultRoleId.value
      return
    }

    const n = Number(newVal)
    newUserRoleId.value = Number.isFinite(n) ? n : defaultRoleId.value
  }
)


watch(
  selectedKeys,
  (keys) => {
    if (!linkMode.value) return
    keys.forEach(k => ensureRoleForKey(k))
  },
  { deep: true }
)

watch(
  selectedGroupIds,
  (ids) => {
    if (!linkMode.value) return
    ids.forEach(id => ensureGroupRole(id))
  },
  { deep: true }
)

// API helpers
function userKey(u: ExistingUser) {
  return u.id != null ? String(u.id) : (u.username || '').toLowerCase()
}

function normalizeTagArray(input: unknown): string[] {
  const raw = Array.isArray(input)
    ? input
    : typeof input === 'string'
      ? input.split(',')
      : [];
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    const tag = String(item ?? '').trim()
    if (!tag) continue
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(tag)
  }
  return out
}

function tagArraysEqual(a: string[], b: string[]) {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if ((a[i] || '').toLowerCase() !== (b[i] || '').toLowerCase()) return false
  }
  return true
}

async function fetchUsers() {
  try {
    const q = userSearch.value ? `?q=${encodeURIComponent(userSearch.value)}` : ''
    const data = await props.apiFetch(`/api/users${q}`, { method: 'GET' })
    const list = Array.isArray(data) ? data : []
    users.value = list.map((u: any) => {
      const out = { ...u }
      if (out && out.id == null) {
        const derivedId = out.user_id ?? out.userId
        if (derivedId != null) out.id = derivedId
      }
      const rawDefaultRoleId =
        out.default_role_id ?? out.defaultRoleId ?? out.default_role?.id
      if (rawDefaultRoleId != null && Number.isFinite(Number(rawDefaultRoleId))) {
        out.default_role_id = Number(rawDefaultRoleId)
      }
      const rawDefaultRoleName =
        out.default_role_name ?? out.defaultRoleName ?? out.default_role?.name
      if (rawDefaultRoleName != null) out.default_role_name = String(rawDefaultRoleName)
      if (!out.default_role && out.defaultRole) out.default_role = out.defaultRole
      out.company = out.company == null ? '' : String(out.company)
      out.tags = normalizeTagArray(out.tags ?? out.tags_json ?? out.tagsJson ?? out.user_tags)
      return out
    })
    // ensure selected keys still exist; keep them even if not in the current page
    selectedKeys.value = Array.from(new Set(selectedKeys.value))
    selectedKeys.value.forEach(k => ensureRoleForKey(k))
  } catch {
    users.value = []
  }
}

async function fetchRoles() {
  rolesLoading.value = true
  rolesError.value = null
  try {
    const data = await props.apiFetch('/api/roles', { method: 'GET' })
    const list = Array.isArray(data?.roles) ? data.roles : (Array.isArray(data) ? data : [])
    roles.value = list as Role[]
  } catch (e: any) {
    roles.value = []
    rolesError.value = e?.message || 'Failed to load roles.'
  } finally {
    rolesLoading.value = false
    resolveRoleNames()
    selectedKeys.value.forEach(k => ensureRoleForKey(k))
    if (newUserRoleId.value == null) newUserRoleId.value = defaultRoleId.value
  }
}

function resolveRoleNames() {
  for (const [k, name] of Object.entries(roleNameByKey.value)) {
    if (roleByKey.value[k]) continue
    const hit = roles.value.find(r => r.name?.toLowerCase() === String(name).toLowerCase())
    if (hit?.id) {
      roleByKey.value[k] = hit.id
    } else {
      delete roleNameByKey.value[k]
    }
  }
}

async function fetchGroups() {
  try {
    const data = await props.apiFetch('/api/groups', { method: 'GET' })
    groups.value = Array.isArray(data?.groups) ? data.groups : []
  } catch {
    groups.value = []
  }
}

async function fetchGroupMembersFor(groupId: number) {
  try {
    const data = await props.apiFetch(`/api/groups/${groupId}`, { method: 'GET' })
    groupMembersCache.value[groupId] = Array.isArray(data?.members) ? data.members : []
  } catch {
    groupMembersCache.value[groupId] = []
  }
}

function toggleGroupMembers(groupId: number) {
  if (expandedGroupIds.has(groupId)) {
    expandedGroupIds.delete(groupId)
  } else {
    expandedGroupIds.add(groupId)
    if (!groupMembersCache.value[groupId]) {
      fetchGroupMembersFor(groupId)
    }
  }
}

function openGroups() {
  groupsOpen.value = true
}

function ensureGroupRole(groupId: number) {
  if (groupRoleById.value[groupId]) return
  if (defaultRoleId.value) groupRoleById.value[groupId] = defaultRoleId.value
}

function getDefaultRoleId(u?: ExistingUser | null) {
  const raw = u?.default_role_id ?? (u as any)?.defaultRoleId ?? u?.default_role?.id
  if (raw == null) return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

function getDefaultRoleName(u?: ExistingUser | null) {
  return (
    u?.default_role_name ??
    (u as any)?.defaultRoleName ??
    u?.default_role?.name ??
    null
  )
}

function findUserByKey(key: string) {
  if (!key) return null
  const hit = users.value.find(u => userKey(u) === key)
  if (hit) return hit
  return (props.preselected || []).find(u => userKey(u) === key) || null
}

function ensureRoleForKey(key: string) {
  if (!linkMode.value) return
  if (!key) return
  if (roleByKey.value[key] || roleNameByKey.value[key]) return
  const u = findUserByKey(key)
  const defaultId = getDefaultRoleId(u)
  if (defaultId != null) {
    roleByKey.value[key] = defaultId
    return
  }
  const defaultName = getDefaultRoleName(u)
  if (defaultName) {
    roleNameByKey.value[key] = defaultName
    resolveRoleNames()
    if (roleByKey.value[key]) return
  }
  if (defaultRoleId.value) roleByKey.value[key] = defaultRoleId.value
}

function openRoles() {
  rolesOpen.value = true
}

let t: any = null
function debouncedFetchUsers() {
  if (t) clearTimeout(t)
  t = setTimeout(fetchUsers, 250)
}

async function createUser() {
  error.value = ''
  const payload: any = {
    username: newUser.value.username.trim(),
    name: (newUser.value.name || '').trim(),
    user_email: (newUser.value.user_email || '').trim() || undefined,
    company: (newUser.value.company || '').trim() || undefined,
    tags: normalizeTagArray(newUserTagsInput.value),
    display_color: normalizeHex(newUser.value.display_color) || randomPastel(),
  }
  if (newUserDefaultRoleId.value != null) {
    payload.default_role_id = Number(newUserDefaultRoleId.value)
  }
  if (!payload.username) {
    error.value = 'Username is required.'
    return
  }

  const password = tempPassword.value.trim()
  const password2 = tempPasswordConfirm.value.trim()
  if (password.length < 4 || password.length > 64) {
    error.value = 'Temporary password must be 4–64 characters.'
    return
  }
  if (password !== password2) {
    error.value = 'Passwords do not match.'
    return
  }

  try {
    const created = await props.apiFetch('/api/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    })

    // set the password (best-effort)
    try {
      await props.apiFetch(`/api/users/${created.id}/password`, {
        method: 'POST',
        body: JSON.stringify({ new_password: password }),
      })
    } catch { }

    // Add to selected groups (best-effort)
    if (newUserGroupIds.value.length && created.id) {
      const groupOps = newUserGroupIds.value.map(gid =>
        props.apiFetch(`/api/groups/${gid}/members`, {
          method: 'POST',
          body: JSON.stringify({ user_ids: [created.id], mode: 'add' }),
        }).catch(() => {})
      )
      await Promise.all(groupOps)
    }

    const u: ExistingUser = {
      id: created.id,
      username: created.username || payload.username,
      name: created.name ?? payload.name,
      user_email: created.user_email ?? payload.user_email,
      company: created.company ?? payload.company,
      tags: normalizeTagArray(created.tags ?? payload.tags),
      display_color: created.display_color ?? payload.display_color,
    }
    if (payload.default_role_id != null) {
      u.default_role_id = payload.default_role_id
      const hit = roles.value.find(r => r.id === payload.default_role_id)
      if (hit) u.default_role_name = hit.name
    }
    const k = userKey(u)           // <- one canonical key
    if (linkMode.value) {
      const roleId = newUserRoleId.value ?? defaultRoleId.value
      if (roleId) {
        u.role_id = roleId
        const hit = roles.value.find(r => r.id === roleId)
        if (hit) u.role_name = hit.name
      }
      if (!selectedKeys.value.includes(k)) {
        selectedKeys.value.push(k)   // <- push the same canonical key
      }
      if (roleId) roleByKey.value[k] = roleId
    }
    await fetchUsers()
    if (newUserGroupIds.value.length) fetchGroups()
    resetNewUser()
  } catch (e: any) {
    error.value = e?.message || 'Failed to create user.'
  }
}

// Edit / Delete helpers
async function startEdit(u: ExistingUser) {
  editing.value = u
  editForm.value = {
    name: u.name || '',
    user_email: u.user_email || '',
    company: u.company || '',
    tags_text: normalizeTagArray(u.tags).join(', '),
    display_color: normalizeHex(u.display_color) || '#999999',
    default_role_id: getDefaultRoleId(u),
  }
  // Fetch groups this user belongs to
  editGroupIds.value = []
  editGroupIdsOriginal.value = []
  try {
    const uid = u.id ?? u.username
    if (uid != null) {
      const resp = await props.apiFetch(`/api/users/${encodeURIComponent(String(uid))}/groups`)
      const ids = (resp?.groups || []).map((g: any) => g.id).filter(Boolean)
      editGroupIds.value = ids
      editGroupIdsOriginal.value = [...ids]
    }
  } catch { }
}

async function saveEdit() {
  if (!editing.value) return

  // allow either numeric id or username (string)
  const idOrUsername = (editing.value.id ?? editing.value.username) as string | number
  if (!idOrUsername) {
    error.value = 'Missing user identifier'
    return
  }

  try {
    const ops: Promise<any>[] = []

    // Only PATCH if something actually changed
    if (hasProfileEdits.value) {
      const payload: any = {}

      const nextName = editForm.value.name.trim()
      if (nextName !== (editing.value.name || '')) {
        payload.name = nextName
      }

      const nextEmail = editForm.value.user_email.trim() || null
      if ((nextEmail || null) !== (editing.value.user_email ?? null)) {
        payload.user_email = nextEmail
      }

      const nextCompany = editForm.value.company.trim() || null
      if ((nextCompany || null) !== ((editing.value.company || '').trim() || null)) {
        payload.company = nextCompany
      }

      const nextTags = normalizeTagArray(editForm.value.tags_text)
      const currentTags = normalizeTagArray(editing.value.tags)
      if (!tagArraysEqual(nextTags, currentTags)) {
        payload.tags = nextTags
      }

      const nextColor = normalizeHex(editForm.value.display_color) || null
      if (nextColor !== (editing.value.display_color || null)) {
        payload.display_color = nextColor
      }

      const currentDefaultRoleId = getDefaultRoleId(editing.value)
      const nextDefaultRoleId = editForm.value.default_role_id ?? null
      if ((currentDefaultRoleId ?? null) !== (nextDefaultRoleId ?? null)) {
        payload.default_role_id = nextDefaultRoleId
      }

      ops.push(
        props.apiFetch(`/api/users/${encodeURIComponent(String(idOrUsername))}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        })
      )
    }

    // Add reset-password call if queued
    if (pendingResetPassword.value) {
      const resetIdOrUsername = pendingResetUserId.value ?? idOrUsername
      ops.push(
        props.apiFetch(`/api/users/${encodeURIComponent(String(resetIdOrUsername))}/reset-password`, {
          method: 'POST',
          body: JSON.stringify({ new_password: pendingResetPassword.value }),
        })
      )
    }

    const groupsSorted = (ids: number[]) => [...ids].sort((a, b) => a - b).join(',')
    const groupsChanged = groupsSorted(editGroupIds.value) !== groupsSorted(editGroupIdsOriginal.value)

    if (!ops.length && !groupsChanged) {
      error.value = 'No changes to save.'
      return
    }

    if (ops.length) await Promise.all(ops)

    // Sync group membership changes
    const userId = editing.value.id
    if (userId != null) {
      const prevSet = new Set(editGroupIdsOriginal.value)
      const nextSet = new Set(editGroupIds.value)
      const toAdd = editGroupIds.value.filter(id => !prevSet.has(id))
      const toRemove = editGroupIdsOriginal.value.filter(id => !nextSet.has(id))
      const groupOps: Promise<any>[] = []
      for (const gid of toAdd) {
        groupOps.push(
          props.apiFetch(`/api/groups/${gid}/members`, {
            method: 'POST',
            body: JSON.stringify({ user_ids: [userId], mode: 'add' }),
          })
        )
      }
      for (const gid of toRemove) {
        groupOps.push(
          props.apiFetch(`/api/groups/${gid}/members/${userId}`, { method: 'DELETE' })
        )
      }
      if (groupOps.length) await Promise.all(groupOps)
    }

    // Clear pending reset + refresh
    pendingResetPassword.value = null
    pendingResetUserId.value = null

    await fetchUsers()
    if (groupsChanged) fetchGroups()
    editing.value = null
  } catch (e: any) {
    error.value = e?.message || 'Failed to update user.'
  }
}


async function deleteUser(u: ExistingUser) {
  openDelete(u)
}

function openDelete(u: ExistingUser) {
  userToDelete.value = u
  deleteError.value = null
  deleteOpen.value = true
}
async function performDelete() {
  if (!userToDelete.value) return
  deleting.value = true
  deleteError.value = null
  try {
    const idOrUsername = userToDelete.value.id ?? userToDelete.value.username
    await props.apiFetch(`/api/users/${idOrUsername}`, { method: 'DELETE' })

    const k = userKey(userToDelete.value)
    selectedKeys.value = selectedKeys.value.filter(x => x !== k)

    await fetchUsers()
    deleteOpen.value = false
    userToDelete.value = null
  } catch (e: any) {
    deleteError.value = e?.message || 'Failed to delete user.'
  } finally {
    deleting.value = false
  }
}
// UX helpers
function selectAll() {
  selectedKeys.value = users.value.map(userKey).filter(Boolean)

}
function clearSelected() {
  selectedKeys.value = []
}

function resetNewUser() {
  newUser.value = { username: '', name: '', user_email: '', company: '', display_color: randomPastel(), tags: [] }
  newUserTagsInput.value = ''
  newUserGroupIds.value = []
  tempPassword.value = ''
  tempPasswordConfirm.value = ''
  showTempPassword.value = false
  showTempPasswordConfirm.value = false
  error.value = ''
  newUserRoleId.value = defaultRoleId.value
  newUserDefaultRoleId.value = null
}

function close() {
  emit('update:modelValue', false)
}
function apply() {
  if (!linkMode.value) {
    close()
    return
  }
  const byKey = (arr: ExistingUser[]) => {
    const m = new Map<string, ExistingUser>()
    arr.forEach(u => {
      const k = userKey(u)
      if (k) m.set(k, u)
    })
    return m
  }
  const mapUsers = byKey(users.value)
  const mapPre   = byKey(props.preselected || [])
  const chosen: ExistingUser[] = []
  for (const k of selectedKeys.value) {
    const base = mapUsers.get(k) || mapPre.get(k)!
    const baseRoleId = base?.role_id ?? null
    const roleId = roleByKey.value[k] ?? baseRoleId ?? defaultRoleId.value ?? null
    const role = roleId ? roles.value.find(r => r.id === roleId) : null
    chosen.push({
      ...base,
      role_id: roleId ?? base?.role_id ?? null,
      role_name: role?.name ?? base?.role_name ?? null,
    })
  }

  // Build chosen groups
  const chosenGroups = selectedGroupIds.value.map(gid => {
    const g = groups.value.find(gr => gr.id === gid)
    const roleId = groupRoleById.value[gid] ?? defaultRoleId.value ?? null
    const role = roleId ? roles.value.find(r => r.id === roleId) : null
    return {
      id: gid,
      name: g?.name || '',
      member_count: g?.member_count ?? 0,
      display_color: g?.display_color ?? null,
      role_id: roleId,
      role_name: role?.name ?? null,
    }
  })

  emit('apply', chosen, chosenGroups)
  close()
}

function openCreate() {
  showCreate.value = true
  // clear any stale values each time it opens
  resetNewUser()
}
function closeCreate() {
  showCreate.value = false
}

// utils
function randomPastel() {
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
  const H = h / 360,
    S = s / 100,
    L = l / 100
  const q = L < 0.5 ? L * (1 + S) : L + S - L * S
  const p = 2 * L - q
  const r = Math.round(h2rgb(p, q, H + 1 / 3) * 255)
  const g = Math.round(h2rgb(p, q, H) * 255)
  const b = Math.round(h2rgb(p, q, H - 1 / 3) * 255)
  const toHex = (x: number) => x.toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function normalizeHex(x?: string) {
  const s = (x || '').trim()
  if (!s) return undefined
  const m = s.match(/^#?([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/)
  if (!m) return undefined
  const v = m[1]
  const full = v.length === 3 ? v.split('').map(c => c + c).join('') : v
  return `#${full.toLowerCase()}`
}
function openReset(u: any) {
  userToReset.value = u
  resetOpen.value = true
}

// handle confirmation (do your API call here)
async function onConfirmReset(payload: { userId?: number | string; newPassword: string }) {
  const id = payload.userId ?? userToReset.value?.id
  if (!id) return
  pendingResetUserId.value = id
  pendingResetPassword.value = payload.newPassword
  resetOpen.value = false
}


</script>
