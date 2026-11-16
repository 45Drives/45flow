<template>
  <template v-if="!blocked">
    <FlowNotice v-if="unsupported" tone="info" size="sm">This server does not support storage setup. Update Broadcaster to configure storage and staff accounts here.</FlowNotice>
    <slot />
  </template>
  <FirstRunSetup v-else-if="status && admin" :key="connectionId" :status="status" :connection-id="connectionId" :persistence-key="persistenceKey" @refreshed="status = $event" @complete="complete" />
  <div v-else class="p-6" :class="error || status ? 'max-w-xl mx-auto space-y-4' : 'flex h-full w-full flex-col items-center justify-center gap-4'">
    <FlowNotice v-if="error" tone="danger" title="Could not check server setup">{{ error }}</FlowNotice>
    <FlowNotice v-else-if="status" tone="info">Server setup is not finished. Ask your administrator.</FlowNotice>
    <p v-else class="flex items-center gap-3 text-sm text-muted" role="status" aria-live="polite">
      <ArrowPathIcon class="h-5 w-5 motion-safe:animate-spin" aria-hidden="true" />
      Checking server setup…
    </p>
    <FlowButton v-if="!loading" @click="check(false)">Check again</FlowButton>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ArrowPathIcon } from '@heroicons/vue/24/outline'
import { useApi } from '../../composables/useApi'
import { useConnections } from '../../composables/useConnections'
import { isAdminSession } from '../../composables/adminSession'
import { useSetupStatus, useSetupReplay, serverSetupKey, saveSetupProgress } from '../../composables/useSetupStatus'
import { useTourManager } from '../../composables/useTourManager'
import FirstRunSetup from './FirstRunSetup.vue'
import FlowNotice from '../../ui/FlowNotice.vue'
import FlowButton from '../../ui/FlowButton.vue'

const emit = defineEmits<{ blocked: [value: boolean]; complete: []; 'projects-configured': [value: boolean | null] }>()
const { activeConnection } = useConnections()
const { apiFetch } = useApi()
const { status, loading, error, unsupported, load, required } = useSetupStatus(apiFetch)
const { setSetupPending } = useTourManager()
const connectionId = computed(() => activeConnection.value?.connectionId)
const persistenceKey = computed(() => serverSetupKey(activeConnection.value))
const replay = useSetupReplay(() => persistenceKey.value)
const admin = computed(() => !!status.value?.storageRoot && isAdminSession(activeConnection.value?.token))
const projectsConfigured = computed<boolean | null>(() => status.value?.projects ? status.value.projects.count > 0 : null)
const blocked = computed(() => !!activeConnection.value?.token && !unsupported.value && (!status.value || required.value || (admin.value && replay.requested.value)))
watch(blocked, value => { setSetupPending(value); emit('blocked', value) }, { immediate: true })
watch(projectsConfigured, value => emit('projects-configured', value), { immediate: true })
let timer: ReturnType<typeof setTimeout> | undefined
let disposed = false
let attempts = 0
async function check(background = false) {
  if (timer) clearTimeout(timer)
  if (!background) attempts = 0
  const key = persistenceKey.value
  const token = activeConnection.value?.token
  try { await load(background); attempts = 0 }
  catch {
    if (key !== persistenceKey.value || token !== activeConnection.value?.token) return
    if (!disposed && ++attempts < 60) timer = setTimeout(() => check(true), 2500)
    else if (!disposed) error.value = 'Server setup could not be checked after repeated attempts. Check the connection, then choose Check again.'
  }
}
watch(() => [persistenceKey.value, activeConnection.value?.token], (value, previous) => {
  if (timer) clearTimeout(timer)
  attempts = 0
  if (value[0] === previous?.[0] && value[1] && previous?.[1] && status.value) {
    void check(true)
    return
  }
  status.value = null
  unsupported.value = false
  if (activeConnection.value?.token) void check()
}, { immediate: true })
watch(replay.requested, requested => {
  if (requested && activeConnection.value?.token) {
    status.value = null
    void check()
  }
})
function complete(projectCreated = false) {
  if (!projectCreated || !status.value?.storageRoot?.configured) return
  status.value = { ...status.value, projects: { ...status.value.projects, count: Math.max(status.value.projects?.count ?? 0, 1) } }
  saveSetupProgress(persistenceKey.value, { complete: true, step: 3 })
  replay.finish()
  emit('complete')
}
onBeforeUnmount(() => { disposed = true; if (timer) clearTimeout(timer); setSetupPending(false) })
</script>
