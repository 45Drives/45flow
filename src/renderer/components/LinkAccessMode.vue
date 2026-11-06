<template>
  <div :data-tour="dataTour" :class="wrapperClass">
    <div v-if="showHeading" class="font-semibold mb-2" :class="compact ? 'text-sm' : ''">Link Access Mode</div>
    <div class="access-mode-container">
      <div class="access-mode-grid" :class="{ 'access-mode-grid--no-comments': !showComments }">
        <!-- Column 1: access mode radios -->
        <div class="access-mode-modes flex flex-col gap-1 min-w-0">
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
              <span class="font-semibold block" :class="compact ? 'text-sm' : ''">{{ compact ? 'Invited clients & teams' : 'Only invited clients & teams' }}</span>
              <span class="text-xs text-muted block">Sign in with {{ compact ? 'their own login.' : 'their own login. Roles set what they can do.' }}</span>
            </span>
          </label>

          <p v-if="showSummary" class="text-xs text-success text-center mt-1">
            Access:
            {{ modelValue === 'open' ? 'Anyone with the link' : modelValue === 'open_password' ? 'Anyone with the link + password' : 'Invited users only' }}
          </p>
        </div>

        <!-- Column 2: settings for the selected mode -->
        <div class="access-mode-detail border border-default rounded-md p-3 min-w-0 flex flex-col gap-2">
          <template v-if="modelValue === 'open'">
            <div class="flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-3">
              <ExclamationTriangleIcon class="w-5 h-5 shrink-0 text-amber-500" />
              <div class="min-w-0">
                <p class="font-semibold" :class="compact ? 'text-sm' : ''">Anyone with the link can open it</p>
                <p class="text-xs mt-0.5 opacity-90">
                  {{ openWarning || 'No sign-in or password. Anyone it gets forwarded to can see it too.' }}
                </p>
              </div>
            </div>
          </template>

          <template v-else-if="modelValue === 'open_password'">
            <label :for="`${radioName}-password`" class="font-semibold" :class="compact ? 'text-sm' : ''">Link password</label>
            <p v-if="!compact" class="text-xs text-muted -mt-1">Share this password with anyone you want to access the link.</p>
            <div class="relative flex items-center min-w-0 w-full">
              <input :id="`${radioName}-password`" :type="showPassword ? 'text' : 'password'"
                :value="password" @input="$emit('update:password', ($event.target as HTMLInputElement).value.trim())"
                placeholder="Enter a password"
                class="input-textlike border rounded px-3 py-2 w-full pr-10 min-w-0" />
              <button type="button" @click="$emit('update:showPassword', !showPassword)"
                class="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted"
                :aria-label="showPassword ? 'Hide password' : 'Show password'">
                <EyeIcon v-if="!showPassword" class="w-5 h-5" />
                <EyeSlashIcon v-else class="w-5 h-5" />
              </button>
            </div>
            <p v-if="!password" class="text-sm text-red-500">
              Password is required{{ compact ? '.' : ' when protection is enabled.' }}
            </p>
          </template>

          <template v-else>
            <p class="text-xs text-muted">
              {{ compact ? 'Clients and teams sign in with their own login. Roles set what they can do.' : restrictedHelpText }}
            </p>
            <button type="button" class="btn btn-primary" @click="$emit('openUserModal')">
              {{ accessCount ? 'Manage invited clients' : 'Invite clients & teams…' }}
              <span v-if="accessCount"
                class="ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs bg-default text-default">
                {{ accessCount }}
              </span>
            </button>
            <p v-if="!accessSatisfied" class="text-sm text-red-500">
              Add at least one client or team{{ compact ? '.' : ' to continue.' }}
            </p>
          </template>
        </div>

        <!-- Column 3: comments -->
        <div v-if="showComments" class="access-mode-comments border border-default rounded-md p-3 min-w-0 flex flex-col gap-2">
          <template v-if="modelValue !== 'restricted'">
            <div class="flex flex-wrap items-center gap-3 min-w-0">
              <label :for="`${radioName}-comments-switch`" class="font-semibold whitespace-nowrap" :class="compact ? 'text-sm' : ''">Allow comments</label>
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
            </div>
            <p class="text-xs text-muted -mt-1">{{ allowOpenComments ? (compact ? 'Visitors can comment.' : 'Visitors can leave a name and a comment.') : 'Comments are turned off.' }}</p>
            <button v-if="allowOpenComments" type="button" class="btn btn-secondary w-fit h-fit" :class="compact ? 'text-xs px-2 py-1' : 'text-sm'" @click="$emit('openCategoriesModal')">
              Manage Comment Categories
            </button>
          </template>
          <template v-else>
            <p class="font-semibold" :class="compact ? 'text-sm' : ''">Comments</p>
            <p class="text-xs text-muted -mt-1">Each invited person's role decides whether they can comment.</p>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Switch } from '@headlessui/vue'
import { EyeIcon, EyeSlashIcon, ExclamationTriangleIcon } from '@heroicons/vue/20/solid'

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
  restrictedHelpText: 'Invited clients and teams sign in with their own login. Roles control what they can download and comment on.',
  wrapperClass: '',
})

defineEmits<{
  'update:modelValue': [value: AccessMode]
  'update:password': [value: string]
  'update:showPassword': [value: boolean]
  'update:allowOpenComments': [value: boolean]
  openUserModal: []
  openCategoriesModal: []
}>()

const radioLabelClass = computed(() =>
  props.compact
    ? 'flex items-start gap-2 p-1.5 rounded-md border border-default cursor-pointer'
    : 'flex items-start gap-2 p-1 rounded-md border border-default cursor-pointer'
)
</script>

<style scoped>
/* Columns follow the component's own width, not the window, because it also
   renders inside the narrower Quick Share overlay. */
.access-mode-container {
  container-type: inline-size;
}

.access-mode-grid {
  display: grid;
  gap: 0.5rem;
  grid-template-columns: minmax(0, 1fr);
  grid-template-areas: "modes" "detail" "comments";
}

.access-mode-modes { grid-area: modes; }
.access-mode-detail { grid-area: detail; }
.access-mode-comments { grid-area: comments; }

@container (min-width: 30rem) {
  .access-mode-grid {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    grid-template-areas: "modes detail" "modes comments";
  }
  .access-mode-grid--no-comments {
    grid-template-areas: "modes detail";
  }
}

@container (min-width: 52rem) {
  .access-mode-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    grid-template-areas: "modes detail comments";
  }
  .access-mode-grid--no-comments {
    grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
    grid-template-areas: "modes detail";
  }
}
</style>
