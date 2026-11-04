<template>
    <div v-if="modelValue" class="fixed inset-0 z-[3000] flex items-center justify-center">
      <div class="absolute inset-0 bg-black/50" @click="close"></div>
  
      <div class="relative w-full max-w-md bg-accent rounded-lg shadow-xl p-4">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-lg font-semibold">Reset Password</h3>
          <button class="btn btn-secondary" @click="close">Close</button>
        </div>
  
        <div class="space-y-3 text-left">
          <p class="text-sm">
            Enter a temporary password for
            <b>{{ user?.name || user?.username }}</b>. They’ll be required to change it on
            next login.
          </p>
  
          <!-- New Password -->
          <div>
            <label class="text-xs opacity-80">Temporary Password (4–64 chars)</label>
            <div class="relative">
              <input
                :type="showResetPassword ? 'text' : 'password'"
                v-model.trim="ResetPasswordInput"
                class="input-textlike border rounded px-3 py-2 w-full pr-16"
                placeholder="4–64 characters"
                autocomplete="off"
              />
              <button
                type="button"
                class="absolute right-2 top-1/2 -translate-y-1/2 text-xs border rounded px-2 py-1"
                @click="showResetPassword = !showResetPassword"
                :aria-pressed="showResetPassword ? 'true' : 'false'"
              >
                <FontAwesomeIcon :icon="showResetPassword ? faEyeSlash : faEye" />
              </button>
            </div>
            <p v-if="ResetPasswordInvalid" class="text-xs text-red-500 mt-1">
              Password must be 4–64 characters.
            </p>
          </div>
  
          <!-- Confirm Password -->
          <div>
            <label class="text-xs opacity-80">Confirm Password</label>
            <div class="relative">
              <input
                :type="showResetConfirm ? 'text' : 'password'"
                v-model.trim="ResetPasswordConfirm"
                class="input-textlike border rounded px-3 py-2 w-full pr-16"
                placeholder="Re-enter password"
                autocomplete="off"
              />
              <button
                type="button"
                class="absolute right-2 top-1/2 -translate-y-1/2 text-xs border rounded px-2 py-1"
                @click="showResetConfirm = !showResetConfirm"
                :aria-pressed="showResetConfirm ? 'true' : 'false'"
              >
                <FontAwesomeIcon :icon="showResetConfirm ? faEyeSlash : faEye" />
              </button>
            </div>
            <p v-if="resetMismatch" class="text-xs text-red-500 mt-1">
              Passwords do not match.
            </p>
          </div>
  
          <div class="text-sm text-red-500" v-if="error">{{ error }}</div>
        </div>
  
        <div class="flex justify-end gap-2 mt-4">
          <button class="btn btn-secondary" @click="close">Cancel</button>
          <button
            class="btn btn-primary"
            :disabled="ResetPasswordInvalid || resetMismatch || !ResetPasswordInput || !ResetPasswordConfirm"
            @click="confirm"
          >
            Reset Password
          </button>
        </div>
      </div>
    </div>
</template>
  
  <script setup lang="ts">
  import { ref, computed, watch } from 'vue'
  import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
  import { faEye, faEyeSlash } from '@fortawesome/free-solid-svg-icons'
  
  type MinimalUser = { id?: number | string; username?: string; name?: string }
  
  const props = defineProps<{
    modelValue: boolean
    user: MinimalUser | null
  }>()
  
  const emit = defineEmits<{
    (e: 'update:modelValue', v: boolean): void
    (e: 'confirm', payload: { userId?: number | string; newPassword: string }): void
  }>()
  
  const ResetPasswordInput = ref('')
  const ResetPasswordConfirm = ref('')
  const showResetPassword = ref(false)
  const showResetConfirm = ref(false)
  const error = ref<string | null>(null)
  
  const ResetPasswordInvalid = computed(
    () => ResetPasswordInput.value !== '' && (ResetPasswordInput.value.length < 4 || ResetPasswordInput.value.length > 64)
  )
  const resetMismatch = computed(
    () => ResetPasswordInput.value !== '' && ResetPasswordConfirm.value !== '' && ResetPasswordInput.value !== ResetPasswordConfirm.value
  )
  
  watch(
    () => props.modelValue,
    (open) => {
      if (open) {
        ResetPasswordInput.value = ''
        ResetPasswordConfirm.value = ''
        showResetPassword.value = false
        showResetConfirm.value = false
        error.value = null
      }
    }
  )
  
  function close() {
    emit('update:modelValue', false)
  }
  
  function confirm() {
    if (ResetPasswordInput.value.trim().length < 4 || ResetPasswordInput.value.trim().length > 64) {
      error.value = 'Password must be 4–64 characters.'
      return
    }
    if (ResetPasswordInput.value.trim() !== ResetPasswordConfirm.value.trim()) {
      error.value = 'Passwords do not match.'
      return
    }
    emit('confirm', { userId: props.user?.id, newPassword: ResetPasswordInput.value.trim() })
    close()
  }
  </script>
  
