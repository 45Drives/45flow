<template>
  <div :data-tour="dataTour" :class="wrapperClass">
    <div v-if="showHeading" class="font-semibold mb-2" :class="compact ? 'text-sm' : ''">Link Access Mode</div>
    <div class="grid grid-cols-3 gap-2 min-w-0">
      <!-- Left column: radio buttons -->
      <div :class="compact ? 'flex flex-col gap-1' : ''">
        <label :class="radioLabelClass">
          <input type="radio" :name="radioName" value="open" :checked="modelValue === 'open'"
            @change="$emit('update:modelValue', 'open')" :class="compact ? 'mt-0.5' : 'mt-1'" />
          <span class="min-w-0">
            <span class="font-semibold block" :class="compact ? 'text-sm' : ''">Anyone with the link</span>
            <span class="text-xs text-muted block">No sign-in required.</span>
          </span>
        </label>

        <label :class="radioLabelClass">
          <input type="radio" :name="radioName" value="open_password" :checked="modelValue === 'open_password'"
            @change="$emit('update:modelValue', 'open_password')" :class="compact ? 'mt-0.5' : 'mt-1'" />
          <span class="min-w-0">
            <span class="font-semibold block" :class="compact ? 'text-sm' : ''">{{ compact ? 'Password protected' : 'Anyone with the link + password' }}</span>
            <span class="text-xs text-muted block">One shared password{{ compact ? '.' : ' for everyone.' }}</span>
          </span>
        </label>

        <label :class="radioLabelClass">
          <input type="radio" :name="radioName" value="restricted" :checked="modelValue === 'restricted'"
            @change="$emit('update:modelValue', 'restricted')" :class="compact ? 'mt-0.5' : 'mt-1'" />
          <span class="min-w-0">
            <span class="font-semibold block" :class="compact ? 'text-sm' : ''">{{ compact ? 'Invited users & groups' : 'Only invited users & groups' }}</span>
            <span class="text-xs text-muted block">Sign in with {{ compact ? 'user account.' : 'a user account. Permissions come from roles.' }}</span>
          </span>
        </label>
      </div>

      <!-- Right column: details panel -->
      <div class="col-span-2 border border-default rounded-md p-3 min-w-0" :class="compact ? '' : 'border-default gap-2'">
        <!-- Allow comments (not shown for upload or restricted) -->
        <div v-if="showComments && modelValue !== 'restricted'" class="flex flex-wrap items-center gap-3 min-w-0">
          <label class="font-semibold" :class="compact ? 'text-sm whitespace-nowrap' : 'sm:whitespace-nowrap'">Allow comments</label>
          <Switch :id="`${radioName}-comments-switch`" :modelValue="allowOpenComments" @update:modelValue="$emit('update:allowOpenComments', $event)" :class="[
            allowOpenComments ? 'bg-secondary' : 'bg-well',
            'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-slate-600 focus:ring-offset-2'
          ]">
            <span class="sr-only">Toggle comments</span>
            <span aria-hidden="true" :class="[
              allowOpenComments ? 'translate-x-5' : 'translate-x-0',
              'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-default shadow ring-0 transition duration-200 ease-in-out'
            ]" />
          </Switch>
          <span class="text-xs text-muted">{{ allowOpenComments ? (compact ? 'Visitors can comment.' : 'Visitors can leave a name and a comment.') : 'Comments are disabled.' }}</span>
        </div>

        <!-- Password field -->
        <div v-if="modelValue === 'open_password'" class="flex flex-col gap-2 min-w-0" :class="compact ? 'mt-2' : 'mt-1'">
          <div v-if="!compact" class="flex flex-row gap-6 items-center text-center">
            <label class="text-default font-semibold sm:whitespace-nowrap">Link password</label>
            <p class="text-xs text-muted">Share this password with anyone you want to access the link.</p>
          </div>

          <div class="relative flex items-center min-w-0 w-full">
            <input :type="showPassword ? 'text' : 'password'"
              :value="password" @input="$emit('update:password', ($event.target as HTMLInputElement).value.trim())"
              placeholder="Enter a password"
              class="input-textlike border rounded px-3 py-2 w-full pr-10 min-w-0" />
            <button type="button" @click="$emit('update:showPassword', !showPassword)"
              class="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted">
              <EyeIcon v-if="!showPassword" class="w-5 h-5" />
              <EyeSlashIcon v-else class="w-5 h-5" />
            </button>
          </div>

          <p v-if="!password" class="text-sm text-red-500">
            Password is required{{ compact ? '.' : ' when protection is enabled.' }}
          </p>
        </div>

        <!-- Restricted mode -->
        <div v-if="modelValue === 'restricted'" class="flex flex-col gap-2 min-w-0">
          <p class="text-xs text-muted">
            {{ compact ? 'Users and groups sign in with their own credentials. Roles control permissions.' : restrictedHelpText }}
          </p>
          <button type="button" class="btn btn-primary" @click="$emit('openUserModal')">
            {{ accessCount ? 'Manage access' : 'Invite users & groups…' }}
            <span v-if="accessCount"
              class="ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs bg-default text-default">
              {{ accessCount }}
            </span>
          </button>
          <p class="text-xs opacity-70">Roles control permissions.</p>
          <p v-if="!accessSatisfied" class="text-sm text-red-500">
            Add at least one user or group{{ compact ? '.' : ' to continue.' }}
          </p>
        </div>

        <!-- Open mode warning (upload-specific) -->
        <div v-if="modelValue === 'open' && openWarning" class="">
          <p class="text-2xl text-center text-warning items-center">
            {{ openWarning }}
          </p>
        </div>
      </div>

      <!-- Access summary footer -->
      <div v-if="showSummary" class="col-span-3 grid grid-cols-3">
        <p class="mx-auto text-xs text-success">
          Access:
          {{ modelValue === 'open' ? 'Anyone with the link' : modelValue === 'open_password' ? 'Anyone with the link + password' : 'Invited users only' }}
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Switch } from '@headlessui/vue'
import { EyeIcon, EyeSlashIcon } from '@heroicons/vue/20/solid'

type AccessMode = 'open' | 'open_password' | 'restricted'

const props = withDefaults(defineProps<{
  modelValue: AccessMode
  password: string
  showPassword: boolean
  allowOpenComments?: boolean
  accessCount: number
  /** Whether at least one user is added (or mode is not restricted) */
  accessSatisfied?: boolean
  /** data-tour attribute value */
  dataTour?: string
  /** Unique radio group name to avoid collisions */
  radioName?: string
  /** Use compact styling (QuickShare) */
  compact?: boolean
  /** Show the heading "Link Access Mode" */
  showHeading?: boolean
  /** Show "Allow comments" toggle */
  showComments?: boolean
  /** Show access summary footer */
  showSummary?: boolean
  /** Warning text shown when "open" mode selected (e.g. upload warning) */
  openWarning?: string
  /** Help text for restricted mode */
  restrictedHelpText?: string
  /** Extra wrapper class */
  wrapperClass?: string
}>(), {
  allowOpenComments: true,
  accessSatisfied: true,
  dataTour: '',
  radioName: 'access-mode',
  compact: false,
  showHeading: true,
  showComments: true,
  showSummary: true,
  openWarning: '',
  restrictedHelpText: 'Invited users and groups sign in with their own credentials. Roles control download and comment permissions.',
  wrapperClass: '',
})

defineEmits<{
  'update:modelValue': [value: AccessMode]
  'update:password': [value: string]
  'update:showPassword': [value: boolean]
  'update:allowOpenComments': [value: boolean]
  openUserModal: []
}>()

const radioLabelClass = computed(() =>
  props.compact
    ? 'flex items-start gap-2 p-1.5 rounded-md border border-default cursor-pointer'
    : 'flex items-start gap-2 p-1 rounded-md border border-default cursor-pointer'
)
</script>
