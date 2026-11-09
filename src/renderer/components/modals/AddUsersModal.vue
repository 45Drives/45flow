<template>
  <FlowModal :model-value="modelValue" :title="linkMode ? 'Invite clients & teams' : 'Client Access'"
    :description="linkMode
      ? 'Choose who can open this link and pick a role for each person or team.'
      : 'Clients are people outside your company who sign in to open invite-only links.'"
    size="xl" class="h-[min(46rem,calc(100vh-2rem))]" body-class="flex flex-col min-h-0 gap-3"
    :header-attrs="{ 'data-tour': 'users-modal-header' }" @close="close()">
    <template v-if="linkMode" #header-actions>
      <button class="btn btn-secondary" @click="openGroups()">Manage teams</button>
      <button class="btn btn-secondary" @click="openRoles()">Manage roles</button>
    </template>

    <!-- Manage mode: one dialog, three tabs -->
    <div v-if="!linkMode" class="flow-tabs shrink-0" role="tablist" aria-label="Client Access">
      <button v-for="t in tabs" :key="t.key" :id="`access-tab-${t.key}`" class="flow-tab" role="tab"
        :aria-selected="activeTab === t.key" :aria-controls="`access-panel-${t.key}`" @click="activeTab = t.key">
        {{ t.label }}
        <span v-if="t.count != null" class="flow-tab__count">{{ t.count }}</span>
      </button>
    </div>

    <!-- ── Clients ── -->
    <section v-show="linkMode || activeTab === 'clients'" id="access-panel-clients" role="tabpanel"
      aria-labelledby="access-tab-clients" class="flex flex-col gap-3 min-h-0"
      :class="linkMode ? 'shrink-0' : 'flex-1'" data-tour="users-modal-list">
      <div class="flex flex-wrap items-center gap-2">
        <h3 v-if="linkMode" class="text-sm font-semibold mr-auto">
          Clients <span class="font-normal text-muted">· {{ selectedKeys.length }} selected</span>
        </h3>
        <div class="relative" :class="linkMode ? 'w-64' : 'flex-1 min-w-[14rem]'">
          <MagnifyingGlassIcon class="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 opacity-60" aria-hidden="true" />
          <input v-model.trim="userSearch" type="search" aria-label="Search clients"
            class="input-textlike w-full pl-8 pr-3 py-2 text-sm" placeholder="Search name, email, company or tag"
            @input="debouncedFetchUsers()" />
        </div>
        <div data-tour="users-modal-create">
          <button class="btn" :class="linkMode ? 'btn-secondary' : 'btn-primary'" @click="openCreate()">Add client</button>
        </div>
      </div>

      <ul v-if="users.length" class="flow-list overflow-y-auto min-h-0" :class="{ 'max-h-[16rem]': linkMode }" aria-label="Clients">
        <li v-for="u in users" :key="u.id ?? u.username">
          <component :is="linkMode ? 'label' : 'div'" class="flow-list__row"
            :class="linkMode ? ['flow-list__row--interactive', { 'flow-list__row--selected': selectedKeys.includes(userKey(u)) }] : []">
            <input v-if="linkMode" type="checkbox" :value="userKey(u)" v-model="selectedKeys" class="styled-checkbox"
              :aria-label="`Invite ${u.name || u.username}`" />
            <span class="flow-avatar" :style="avatarStyle(u.display_color)" aria-hidden="true">{{ initials(u.name || u.username) }}</span>
            <div class="min-w-0 flex-1">
              <p class="flow-list__title truncate">{{ u.name || u.username }}</p>
              <p class="flow-list__meta truncate">@{{ u.username }}<template v-if="u.user_email"> · {{ u.user_email }}</template></p>
              <div v-if="u.company || u.tags?.length || (!linkMode && defaultRoleLabel(u))" class="flex flex-wrap gap-1 mt-1">
                <span v-if="u.company" class="flow-chip flow-chip--sm flow-chip--neutral">{{ u.company }}</span>
                <span v-for="tag in u.tags" :key="tag" class="flow-chip flow-chip--sm flow-chip--muted">{{ tag }}</span>
                <span v-if="!linkMode && defaultRoleLabel(u)" class="flow-chip flow-chip--sm flow-chip--info"
                  title="Role picked for this client when you invite them to a new link">Default: {{ defaultRoleLabel(u) }}</span>
              </div>
            </div>
            <span v-if="linkMode && !selectedKeys.includes(userKey(u))" class="w-36 shrink-0 text-xs text-muted text-right pr-2">Not invited</span>
            <select v-else-if="linkMode" v-model.number="roleByKey[userKey(u)]" aria-label="Role on this link"
              :disabled="rolesLoading || !roles.length"
              class="input-textlike px-2 py-1 text-xs w-36 shrink-0" title="Role on this link" @click.stop>
              <option v-if="rolesLoading" disabled value="">Loading roles…</option>
              <option v-else-if="!roles.length" disabled value="">No roles</option>
              <option v-else v-for="r in roles" :key="r.id" :value="r.id">{{ r.name }}</option>
            </select>
            <div class="flex items-center gap-1.5 shrink-0">
              <button type="button" class="btn btn-secondary btn-xs" @click.stop.prevent="startEdit(u)">Edit</button>
              <button type="button" class="btn btn-danger btn-xs" @click.stop.prevent="deleteUser(u)">Delete</button>
            </div>
          </component>
        </li>
      </ul>
      <FlowEmpty v-else-if="userSearch" compact title="No matching clients" description="Try a different name, email, company or tag." />
      <FlowEmpty v-else :compact="linkMode" title="No clients yet"
        description="Add a client to give them their own sign-in for invite-only links.">
        <template #actions><button class="btn btn-primary" @click="openCreate()">Add client</button></template>
      </FlowEmpty>

      <div v-if="linkMode && users.length" class="flex gap-3 text-xs">
        <button type="button" class="text-primary hover:underline" @click="selectAll()">Select all</button>
        <button type="button" class="text-primary hover:underline disabled:opacity-50 disabled:no-underline"
          :disabled="!selectedKeys.length" @click="clearSelected()">Clear selection</button>
      </div>
    </section>

    <!-- ── Teams: pick (link mode) ── -->
    <section v-if="linkMode" class="flex flex-col gap-2 min-h-0 flex-1" data-tour="users-modal-groups">
      <div class="flex items-center gap-2">
        <h3 class="text-sm font-semibold mr-auto">
          Teams <span class="font-normal text-muted">· {{ selectedGroupIds.length }} selected</span>
        </h3>
      </div>
      <ul v-if="groups.length" class="flow-list overflow-y-auto min-h-0" aria-label="Teams">
        <li v-for="g in groups" :key="g.id" class="flow-list__group">
          <label class="flow-list__row flow-list__row--interactive"
            :class="{ 'flow-list__row--selected': selectedGroupIds.includes(g.id) }">
            <input type="checkbox" :value="g.id" v-model="selectedGroupIds" class="styled-checkbox" :aria-label="`Invite team ${g.name}`" />
            <span class="flow-avatar flow-avatar--team" :style="avatarStyle(g.display_color)" aria-hidden="true">{{ initials(g.name) }}</span>
            <div class="min-w-0 flex-1">
              <p class="flow-list__title truncate">{{ g.name }}</p>
              <p class="flow-list__meta truncate">
                {{ g.member_count ?? 0 }} member{{ (g.member_count ?? 0) === 1 ? '' : 's' }}<template v-if="g.description"> · {{ g.description }}</template>
              </p>
            </div>
            <span v-if="!selectedGroupIds.includes(g.id)" class="w-36 shrink-0 text-xs text-muted text-right pr-2">Not invited</span>
            <select v-else v-model.number="groupRoleById[g.id]" aria-label="Role for this team on this link"
              :disabled="rolesLoading || !roles.length"
              class="input-textlike px-2 py-1 text-xs w-36 shrink-0" title="Role for this team" @click.stop>
              <option v-if="rolesLoading" disabled value="">Loading roles…</option>
              <option v-else-if="!roles.length" disabled value="">No roles</option>
              <option v-else v-for="r in roles" :key="r.id" :value="r.id">{{ r.name }}</option>
            </select>
            <button type="button" class="btn btn-secondary btn-xs shrink-0" :aria-expanded="expandedGroupIds.has(g.id)"
              @click.stop.prevent="toggleGroupMembers(g.id)">
              {{ expandedGroupIds.has(g.id) ? 'Hide members' : 'Members' }}
            </button>
          </label>
          <div v-if="expandedGroupIds.has(g.id)" class="pr-4 pb-3 pl-[5.25rem] -mt-1">
            <div v-if="groupMembersCache[g.id]?.length" class="flex flex-wrap gap-1.5">
              <span v-for="m in groupMembersCache[g.id]" :key="m.user_id" class="flow-chip flow-chip--muted">
                <span class="flow-dot" :style="{ background: m.display_color || '#cbd5e1' }" aria-hidden="true" />
                {{ m.name || m.user_name }}
              </span>
            </div>
            <div v-else class="text-xs text-muted">No members</div>
          </div>
        </li>
      </ul>
      <p v-else class="text-xs text-muted">
        No teams yet. Use <button type="button" class="text-primary hover:underline" @click="openGroups()">Manage teams</button>
        to group clients you often invite together.
      </p>
    </section>

    <!-- ── Teams / Roles: manage (dashboard) ── -->
    <section v-if="!linkMode && activeTab === 'teams'" id="access-panel-teams" role="tabpanel"
      aria-labelledby="access-tab-teams" class="flex flex-col min-h-0 flex-1">
      <TeamsPanel :apiFetch="apiFetch" @updated="fetchGroups" />
    </section>
    <section v-if="!linkMode && activeTab === 'roles'" id="access-panel-roles" role="tabpanel"
      aria-labelledby="access-tab-roles" class="flex flex-col min-h-0 flex-1">
      <RolesPanel :apiFetch="apiFetch" @updated="fetchRoles" />
    </section>

    <template v-if="linkMode" #footer>
      <div class="flex items-center justify-between gap-2 w-full" data-tour="users-modal-actions">
        <span class="text-xs text-muted">{{ selectionSummary }}</span>
        <div class="flex gap-2">
          <button class="btn btn-dismiss" @click="close()">Cancel</button>
          <button class="btn btn-success" @click="apply()" :disabled="!selectedKeys.length && !selectedGroupIds.length">
            Add selected to link
          </button>
        </div>
      </div>
    </template>
  </FlowModal>

  <!-- Add client -->
  <FlowModal v-model="showCreate" :title="linkMode ? 'Add & invite a client' : 'Add client'"
    description="Set a temporary password and send it to your client securely." size="lg">
    <form id="add-client-form" class="flex flex-col gap-5" @submit.prevent="createUser()">
      <fieldset class="client-form__grid">
        <legend class="client-form__legend">Sign-in</legend>
        <FlowField label="Name" required>
          <template #default="{ id }">
            <input :id="id" v-model.trim="newUser.name" autofocus class="input-textlike w-full px-3 py-2" placeholder="Jane Doe" />
          </template>
        </FlowField>
        <FlowField label="Username" required help="What they type to sign in.">
          <template #default="{ id, describedBy }">
            <input :id="id" v-model.trim="newUser.username" :aria-describedby="describedBy" autocomplete="off"
              class="input-textlike w-full px-3 py-2" placeholder="jane" />
          </template>
        </FlowField>
        <FlowField label="Temporary password" required :error="passwordFormatInvalid ? 'Password must be 4–64 characters.' : null">
          <template #default="{ id, describedBy }">
            <div class="relative">
              <input :id="id" :type="showTempPassword ? 'text' : 'password'" v-model.trim="tempPassword"
                :aria-describedby="describedBy" :aria-invalid="passwordFormatInvalid" autocomplete="new-password"
                class="input-textlike w-full px-3 py-2 pr-14" placeholder="4–64 characters" />
              <button type="button" class="absolute right-2 top-1/2 -translate-y-1/2 btn btn-secondary btn-xs"
                :aria-pressed="showTempPassword" @click="showTempPassword = !showTempPassword">
                {{ showTempPassword ? 'Hide' : 'Show' }}
              </button>
            </div>
          </template>
          <template #help>
            <button type="button" class="text-primary hover:underline" @click="generateTempPassword">Generate a password</button>
          </template>
        </FlowField>
        <FlowField label="Confirm password" required :error="passwordMismatch ? 'Passwords do not match.' : null">
          <template #default="{ id, describedBy }">
            <div class="relative">
              <input :id="id" :type="showTempPasswordConfirm ? 'text' : 'password'" v-model.trim="tempPasswordConfirm"
                :aria-describedby="describedBy" :aria-invalid="passwordMismatch" autocomplete="new-password"
                class="input-textlike w-full px-3 py-2 pr-14" placeholder="Re-enter password" />
              <button type="button" class="absolute right-2 top-1/2 -translate-y-1/2 btn btn-secondary btn-xs"
                :aria-pressed="showTempPasswordConfirm" @click="showTempPasswordConfirm = !showTempPasswordConfirm">
                {{ showTempPasswordConfirm ? 'Hide' : 'Show' }}
              </button>
            </div>
          </template>
        </FlowField>
      </fieldset>

      <fieldset class="client-form__grid">
        <legend class="client-form__legend">Details</legend>
        <FlowField label="Email" optional>
          <template #default="{ id }">
            <input :id="id" type="email" v-model.trim="newUser.user_email" class="input-textlike w-full px-3 py-2" placeholder="jane@example.com" />
          </template>
        </FlowField>
        <FlowField label="Company" optional>
          <template #default="{ id }">
            <input :id="id" v-model.trim="newUser.company" class="input-textlike w-full px-3 py-2" placeholder="Acme Corp" />
          </template>
        </FlowField>
        <FlowField label="Tags" optional help="Separate with commas. Handy for searching.">
          <template #default="{ id, describedBy }">
            <input :id="id" v-model.trim="newUserTagsInput" :aria-describedby="describedBy" class="input-textlike w-full px-3 py-2" placeholder="finance, vip" />
          </template>
        </FlowField>
        <FlowField label="Comment colour" help="Colours this client's comments.">
          <template #default="{ id, describedBy }">
            <div class="flex items-center gap-2">
              <input type="color" :value="normalizeHex(newUser.display_color) || '#cccccc'" aria-label="Pick a colour"
                class="h-9 w-11 p-0.5 rounded-md border border-default bg-default cursor-pointer"
                @input="newUser.display_color = ($event.target as HTMLInputElement).value" />
              <input :id="id" v-model.trim="newUser.display_color" :aria-describedby="describedBy"
                class="input-textlike w-full px-3 py-2 font-mono text-sm" placeholder="#aabbcc" />
            </div>
          </template>
        </FlowField>
      </fieldset>

      <fieldset class="client-form__grid">
        <legend class="client-form__legend">Access</legend>
        <FlowField label="Default role" help="Picked for them when you invite them to a new link.">
          <template #default="{ id, describedBy }">
            <select :id="id" v-model="newUserDefaultRoleId" :aria-describedby="describedBy" :disabled="rolesLoading || !roles.length"
              class="input-textlike w-full px-3 py-2">
              <option :value="null">None</option>
              <option v-if="rolesLoading" disabled value="">Loading roles…</option>
              <option v-else-if="!roles.length" disabled value="">No roles</option>
              <option v-else v-for="r in roles" :key="r.id" :value="r.id">{{ r.name }}</option>
            </select>
          </template>
        </FlowField>
        <FlowField v-if="linkMode" label="Role on this link">
          <template #default="{ id }">
            <select :id="id" v-model.number="newUserRoleId" :disabled="rolesLoading || !roles.length" class="input-textlike w-full px-3 py-2">
              <option v-if="rolesLoading" disabled value="">Loading roles…</option>
              <option v-else-if="!roles.length" disabled value="">No roles</option>
              <option v-else v-for="r in roles" :key="r.id" :value="r.id">{{ r.name }}</option>
            </select>
          </template>
        </FlowField>
        <div class="client-form__full flex flex-col gap-1.5">
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium">Teams <span class="font-normal opacity-70">(optional)</span></span>
            <button type="button" class="text-xs text-primary hover:underline" @click="openGroups()">New team</button>
          </div>
          <div v-if="groups.length" class="flex flex-wrap gap-2">
            <label v-for="g in groups" :key="g.id" class="client-team-pill"
              :class="{ 'client-team-pill--on': newUserGroupIds.includes(g.id) }">
              <input type="checkbox" :value="g.id" v-model="newUserGroupIds" class="sr-only" />
              <span class="flow-dot" :style="{ background: g.display_color || '#cbd5e1' }" aria-hidden="true" />
              {{ g.name }}
            </label>
          </div>
          <p v-else class="text-xs text-muted">No teams yet.</p>
        </div>
      </fieldset>

      <p v-if="error" class="text-sm text-flow-danger" role="alert">{{ error }}</p>
    </form>

    <template #footer>
      <button type="button" class="btn btn-secondary mr-auto" @click="resetNewUser()">Clear form</button>
      <button type="button" class="btn btn-dismiss" @click="closeCreate()">Cancel</button>
      <button type="submit" form="add-client-form" class="btn btn-primary" :disabled="!canSubmit">
        {{ linkMode ? 'Add & invite client' : 'Add client' }}
      </button>
    </template>
  </FlowModal>

  <!-- Edit client -->
  <FlowModal :model-value="!!editing" :title="editing ? `Edit ${editing.name || editing.username}` : 'Edit client'"
    :description="editing ? `Signs in as @${editing.username}` : undefined" size="lg" @close="editing = null">
    <form v-if="editing" id="edit-client-form" class="flex flex-col gap-5" @submit.prevent="saveEdit()">
      <fieldset class="client-form__grid">
        <legend class="client-form__legend">Details</legend>
        <FlowField label="Name">
          <template #default="{ id }">
            <input :id="id" v-model.trim="editForm.name" class="input-textlike w-full px-3 py-2" />
          </template>
        </FlowField>
        <FlowField label="Email" optional>
          <template #default="{ id }">
            <input :id="id" v-model.trim="editForm.user_email" type="email" class="input-textlike w-full px-3 py-2" />
          </template>
        </FlowField>
        <FlowField label="Company" optional>
          <template #default="{ id }">
            <input :id="id" v-model.trim="editForm.company" class="input-textlike w-full px-3 py-2" />
          </template>
        </FlowField>
        <FlowField label="Tags" optional help="Separate with commas.">
          <template #default="{ id, describedBy }">
            <input :id="id" v-model.trim="editForm.tags_text" :aria-describedby="describedBy" class="input-textlike w-full px-3 py-2" placeholder="finance, vip" />
          </template>
        </FlowField>
        <FlowField label="Comment colour">
          <template #default="{ id }">
            <div class="flex items-center gap-2">
              <input type="color" :value="normalizeHex(editForm.display_color) || '#cccccc'" aria-label="Pick a colour"
                class="h-9 w-11 p-0.5 rounded-md border border-default bg-default cursor-pointer"
                @input="editForm.display_color = ($event.target as HTMLInputElement).value" />
              <input :id="id" v-model.trim="editForm.display_color" class="input-textlike w-full px-3 py-2 font-mono text-sm" />
            </div>
          </template>
        </FlowField>
        <FlowField label="Default role" help="Picked for them when you invite them to a new link.">
          <template #default="{ id, describedBy }">
            <select :id="id" v-model="editForm.default_role_id" :aria-describedby="describedBy" :disabled="rolesLoading || !roles.length"
              class="input-textlike w-full px-3 py-2">
              <option :value="null">None</option>
              <option v-if="rolesLoading" disabled value="">Loading roles…</option>
              <option v-else-if="!roles.length" disabled value="">No roles</option>
              <option v-else v-for="r in roles" :key="r.id" :value="r.id">{{ r.name }}</option>
            </select>
          </template>
        </FlowField>
      </fieldset>

      <fieldset class="flex flex-col gap-1.5">
        <legend class="client-form__legend">Teams</legend>
        <div class="flex items-center justify-end -mt-1">
          <button type="button" class="text-xs text-primary hover:underline" @click="openGroups()">New team</button>
        </div>
        <div v-if="groups.length" class="flex flex-wrap gap-2">
          <label v-for="g in groups" :key="g.id" class="client-team-pill"
            :class="{ 'client-team-pill--on': editGroupIds.includes(g.id) }">
            <input type="checkbox" :value="g.id" v-model="editGroupIds" class="sr-only" />
            <span class="flow-dot" :style="{ background: g.display_color || '#cbd5e1' }" aria-hidden="true" />
            {{ g.name }}
          </label>
        </div>
        <p v-else class="text-xs text-muted">No teams yet.</p>
      </fieldset>

      <fieldset class="flex flex-col gap-2">
        <legend class="client-form__legend">Password</legend>
        <div class="flex flex-wrap items-center gap-3">
          <button type="button" class="btn btn-secondary" @click="openReset(editing)">Reset password…</button>
          <span v-if="pendingResetPassword" class="text-xs text-flow-info">New password is set when you save.</span>
          <span v-else class="text-xs text-muted">Give them a new temporary password.</span>
        </div>
      </fieldset>

      <p v-if="error" class="text-sm text-flow-danger" role="alert">{{ error }}</p>
    </form>

    <template #footer>
      <button type="button" class="btn btn-dismiss" @click="editing = null">Cancel</button>
      <button type="submit" form="edit-client-form" class="btn btn-success" :disabled="!(hasProfileEdits || pendingResetPassword)">
        Save changes
      </button>
    </template>
  </FlowModal>

  <ConfirmDeleteModal v-model="deleteOpen" title="Delete client"
    :message="userToDelete ? `Delete “${userToDelete.name || userToDelete.username}”? They lose access to every link. This can't be undone.` : ''"
    :danger="true" :busy="deleting" :error="deleteError" :clickOutsideCancels="true" confirmText="Delete client"
    cancelText="Cancel" @confirm="performDelete" />

  <ResetPasswordModal v-model="resetOpen" :user="userToReset" @confirm="onConfirmReset" />

  <RolesModal v-model="rolesOpen" :apiFetch="apiFetch" @updated="fetchRoles" />

  <GroupsModal v-model="groupsOpen" :apiFetch="apiFetch" @updated="fetchGroups" />

</template>

<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue'
import { MagnifyingGlassIcon } from '@heroicons/vue/24/outline'
import type { Role, LinkItem, ExistingUser, Group, GroupMember } from '../../typings/electron'
import ConfirmDeleteModal from './ConfirmDeleteModal.vue'
import ResetPasswordModal from './ResetPasswordModal.vue';
import RolesModal from './RolesModal.vue'
import GroupsModal from './GroupsModal.vue'
import { useTourManager, type TourStep } from '../../composables/useTourManager'
import { useOnboarding } from '../../composables/useOnboarding'
import FlowModal from '../../ui/FlowModal.vue'
import FlowField from '../../ui/FlowField.vue'
import FlowEmpty from '../../ui/FlowEmpty.vue'
import TeamsPanel from '../access/TeamsPanel.vue'
import RolesPanel from '../access/RolesPanel.vue'
import { avatarStyle, initials, normalizeHex, pickLinkRoleId, randomPastel, usernameFromName } from '../access/accessUi'

const { requestTour } = useTourManager()
const { onboarding, markDone } = useOnboarding()

const usersTourSteps: TourStep[] = [
	{
		target: '[data-tour="users-modal-header"]',
		message: 'This is Client Access.\n\nFrom the dashboard you manage clients, teams and roles in the tabs here. When opened from a link, you choose which clients and teams can open that link.',
	},
	{
		target: '[data-tour="users-modal-list"]',
		message: 'Your clients appear here.\n\nSearch by name, username, email, company, or tags. When inviting to a link, tick each client who should get access and pick their role.',
	},
	{
		target: '[data-tour="users-modal-create"]',
		message: 'Add client accounts here.\n\nGive them a name, username, and a temporary password ("Generate a password" makes a random one). Email, company, tags, and comment colour are optional.\n\nWhen inviting to a link, new clients are ticked for the link automatically.',
	},
	{
		target: '[data-tour="users-modal-actions"]',
		message: 'When inviting to a link, click "Add selected to link" to give the ticked clients and teams access.\n\nThe Roles tab (or "Manage roles") controls what each role can do.',
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
			requestTour('manage-users', linkMode.value ? usersTourSteps : usersTourSteps.filter(s => !s.target.includes('users-modal-actions')), () => markDone('manageUsersTourDone'))
		}, 400)
	}
})

// UI state
type AccessTab = 'clients' | 'teams' | 'roles'
const activeTab = ref<AccessTab>('clients')
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
// Suggest a username from the name until the user types their own.
watch(() => newUser.value.name, (name, previousName) => {
  const current = (newUser.value.username || '').trim()
  if (!current || current === usernameFromName(previousName)) newUser.value.username = usernameFromName(name)
})
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

const defaultRoleId = computed(() => pickLinkRoleId(roles.value, props.roleHint))

const linkMode = computed(() => !!props.link || props.roleHint != null)

const tabs = computed<{ key: AccessTab; label: string; count?: number | null }[]>(() => [
  { key: 'clients', label: 'Clients', count: userSearch.value ? null : users.value.length },
  { key: 'teams', label: 'Teams', count: groups.value.length },
  { key: 'roles', label: 'Roles', count: roles.value.length || null },
])

const selectionSummary = computed(() => {
  const c = selectedKeys.value.length
  const g = selectedGroupIds.value.length
  if (!c && !g) return 'Nobody selected yet'
  const parts: string[] = []
  if (c) parts.push(`${c} client${c === 1 ? '' : 's'}`)
  if (g) parts.push(`${g} team${g === 1 ? '' : 's'}`)
  return `${parts.join(' and ')} selected`
})

function defaultRoleLabel(u: ExistingUser) {
  const id = getDefaultRoleId(u)
  if (id != null) return roles.value.find(r => r.id === id)?.name || getDefaultRoleName(u)
  return getDefaultRoleName(u)
}

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
      activeTab.value = 'clients'
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
    showCreate.value = false
  } catch (e: any) {
    error.value = e?.message || 'Couldn\'t add the client.'
  }
}

// Edit / Delete helpers
async function startEdit(u: ExistingUser) {
  error.value = ''
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

      // Only send PATCH if there are actual profile field changes (not just group changes)
      if (Object.keys(payload).length > 0) {
        ops.push(
          props.apiFetch(`/api/users/${encodeURIComponent(String(idOrUsername))}`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
          })
        )
      }
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
    error.value = e?.message || 'Couldn\'t update the client.'
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
    deleteError.value = e?.message || 'Couldn\'t delete the client.'
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

<style scoped>
.client-form__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
  gap: 0.75rem 1rem;
  min-width: 0;
}

.client-form__full {
  grid-column: 1 / -1;
}

.client-form__legend {
  grid-column: 1 / -1;
  margin-bottom: 0.25rem;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ui-subtle-text);
}

.client-team-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.3rem 0.7rem;
  font-size: var(--flow-text-sm);
  border: 1px solid var(--flow-line);
  border-radius: var(--flow-radius-pill);
  cursor: pointer;
  user-select: none;
}

.client-team-pill:hover {
  background: var(--flow-surface-hover);
}

.client-team-pill:focus-within {
  outline: 2px solid var(--ui-ring);
  outline-offset: 1px;
}

.client-team-pill--on {
  border-color: var(--flow-accent-line);
  background: var(--flow-accent-soft);
  font-weight: 600;
}
</style>
