<template>
  <div
    v-if="secondsLeft !== null"
    role="alertdialog"
    aria-live="assertive"
    aria-label="Session about to expire"
    class="fixed bottom-6 left-1/2 -translate-x-1/2 z-critical flex items-center gap-4 px-5 py-3 rounded-lg border border-default bg-accent shadow-xl"
  >
    <p class="text-sm text-default">
      You will be signed out in <strong>{{ clock }}</strong> because of inactivity.
    </p>
    <button type="button" class="btn btn-primary" @click="stay">Stay signed in</button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useSessionIdle } from '../composables/useSessionIdle'

const { secondsLeft, stay } = useSessionIdle()

const clock = computed(() => {
  const total = Math.max(0, secondsLeft.value ?? 0)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
})
</script>
