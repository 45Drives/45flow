<template>
  <FlowModal
    :model-value="modelValue"
    title="Fork this version"
    description="Makes a separate copy of this exact version. Changes to either file never affect the other."
    size="lg"
    :busy="working"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <form id="fork-version-form" class="flex flex-col gap-4" @submit.prevent="submit">
      <FlowField label="Source" id="fork-source">
        <template #default="{ id }">
          <input :id="id" :value="sourceLabel" type="text" readonly
            class="input-textlike w-full px-3 py-2 rounded-lg border border-default" data-testid="fork-source" />
        </template>
      </FlowField>

      <FlowField label="File name" id="fork-filename" required>
        <template #default="{ id }">
          <input :id="id" v-model="filename" type="text" required autofocus :disabled="locked"
            class="input-textlike w-full px-3 py-2 rounded-lg border border-default" data-testid="fork-filename" />
        </template>
      </FlowField>

      <FlowField label="Folder" id="fork-folder" help="Relative to the storage root. Leave as is to keep the copy next to the original.">
        <template #default="{ id }">
          <input :id="id" v-model="destRelDir" type="text" :disabled="locked"
            class="input-textlike w-full px-3 py-2 rounded-lg border border-default" data-testid="fork-folder" />
        </template>
      </FlowField>

      <FlowField label="Label" id="fork-label" optional help="A short name for this branch, such as Social Cut.">
        <template #default="{ id }">
          <input :id="id" v-model="label" type="text" maxlength="200" :disabled="locked"
            class="input-textlike w-full px-3 py-2 rounded-lg border border-default" data-testid="fork-label" />
        </template>
      </FlowField>

      <label v-if="linkId" class="inline-flex items-center gap-2 text-sm cursor-pointer">
        <input v-model="attach" type="checkbox" class="styled-checkbox" :disabled="locked" data-testid="fork-attach" />
        Add to this link
      </label>

      <FlowNotice v-if="error" tone="danger" size="sm" live data-testid="fork-error">{{ error }}</FlowNotice>

      <div v-if="jobId && state !== 'failed'" class="flex flex-col gap-1" data-testid="fork-progress">
        <div class="text-sm" role="status">
          <template v-if="state === 'done'">Fork created.</template>
          <template v-else>Copying… {{ progress }}%</template>
        </div>
        <progress class="w-full" :value="progress" max="100" aria-label="Copy progress" />
      </div>
    </form>
    <template #footer>
      <button type="button" class="btn btn-dismiss px-4 py-2" :disabled="working" @click="close">
        {{ state === 'done' ? 'Close' : 'Cancel' }}
      </button>
      <button v-if="state === 'failed'" type="button" class="btn btn-primary px-4 py-2" data-testid="fork-retry" @click="retry">
        Retry
      </button>
      <button v-else-if="state !== 'done'" type="submit" form="fork-version-form" class="btn btn-primary px-4 py-2"
        :disabled="!canSubmit" data-testid="fork-submit">
        {{ working ? 'Forking…' : 'Fork' }}
      </button>
    </template>
  </FlowModal>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import FlowModal from '../../ui/FlowModal.vue'
import FlowField from '../../ui/FlowField.vue'
import FlowNotice from '../../ui/FlowNotice.vue'

export type ForkSource = {
  fileId: number
  fileName: string
  versionId: number
  versionNumber: number
  /** Folder of the source file, relative to the storage root. */
  relDir: string
}

const props = defineProps<{
  modelValue: boolean
  apiFetch: (url: string, opts?: any) => Promise<any>
  source: ForkSource | null
  /** When set, the dialog offers to add the fork to this link. */
  linkId?: number | null
}>()
const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'forked', payload: { fileId: number | null; attachedToLink: boolean }): void
}>()

const POLL_MS = 1000
const filename = ref('')
const destRelDir = ref('')
const label = ref('')
const attach = ref(false)
const submitting = ref(false)
const error = ref<string | null>(null)
const jobId = ref<number | null>(null)
const state = ref<'queued' | 'copying' | 'done' | 'failed' | null>(null)
const progress = ref(0)
let idempotencyKey = ''
let pollTimer: ReturnType<typeof setTimeout> | null = null
let pollToken = 0

const sourceLabel = computed(() => props.source ? `${props.source.fileName} · v${props.source.versionNumber}` : '')
const working = computed(() => submitting.value || state.value === 'queued' || state.value === 'copying')
const locked = computed(() => working.value || state.value === 'done' || state.value === 'failed')
const canSubmit = computed(() => !working.value && !!filename.value.trim() && !!props.source)

function newKey(): string {
  const c: any = globalThis.crypto
  if (c?.randomUUID) return c.randomUUID()
  return `fork-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function defaultName(name: string): string {
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return `${name} - fork`
  return `${name.slice(0, dot)} - fork${name.slice(dot)}`
}

function reset() {
  stopPolling()
  const s = props.source
  filename.value = s ? defaultName(s.fileName) : ''
  destRelDir.value = s?.relDir ?? ''
  label.value = ''
  attach.value = false
  submitting.value = false
  error.value = null
  jobId.value = null
  state.value = null
  progress.value = 0
  idempotencyKey = newKey()
}

watch(() => [props.modelValue, props.source?.versionId], ([open]) => { if (open) reset() }, { immediate: true })
onBeforeUnmount(stopPolling)

function stopPolling() {
  pollToken += 1
  if (pollTimer) clearTimeout(pollTimer)
  pollTimer = null
}

const JOB_ERRORS: Record<string, string> = {
  not_enough_space: 'There is not enough free space on the server for this copy.',
  server_restarted: 'The server restarted while copying. Retry to start the copy again.',
  name_taken: 'A file with that name already exists',
  source_unavailable: 'This version is no longer available to copy.',
  copy_failed: 'The copy failed. Retry to try again.',
}

async function poll(token: number) {
  if (token !== pollToken || !jobId.value) return
  try {
    const job = await props.apiFetch(`/api/fork-jobs/${jobId.value}`)
    if (token !== pollToken) return
    state.value = job?.state ?? 'copying'
    progress.value = Math.max(0, Math.min(100, Number(job?.progress) || 0))
    if (state.value === 'done') {
      emit('forked', { fileId: job?.fileId ?? null, attachedToLink: attach.value })
      return
    }
    if (state.value === 'failed') {
      error.value = JOB_ERRORS[job?.errorCode] || JOB_ERRORS.copy_failed
      return
    }
  } catch (e: any) {
    if (token !== pollToken) return
    error.value = e?.message || 'Could not read the fork progress.'
  }
  pollTimer = setTimeout(() => { void poll(token) }, POLL_MS)
}

function startPolling() {
  stopPolling()
  const token = pollToken
  void poll(token)
}

async function submit() {
  if (!canSubmit.value || !props.source) return
  submitting.value = true
  error.value = null
  try {
    const res = await props.apiFetch(`/api/files/${props.source.fileId}/forks`, {
      method: 'POST',
      body: JSON.stringify({
        sourceVersionId: props.source.versionId,
        destRelDir: destRelDir.value.trim().replace(/^\/+/, ''),
        filename: filename.value.trim(),
        label: label.value.trim(),
        attachLinkId: attach.value && props.linkId ? props.linkId : null,
        idempotencyKey,
      }),
      retry: 0,
      exposeServerMessage: true,
    })
    jobId.value = Number(res?.jobId)
    state.value = 'queued'
    progress.value = 0
    startPolling()
  } catch (e: any) {
    if (e?.status === 409) error.value = 'A file with that name already exists'
    else if (e?.status === 425) error.value = 'This version is still being saved. Try again in a moment.'
    else error.value = e?.message || 'The fork could not be started.'
  } finally {
    submitting.value = false
  }
}

async function retry() {
  if (!jobId.value) return
  error.value = null
  try {
    await props.apiFetch(`/api/fork-jobs/${jobId.value}/retry`, { method: 'POST', retry: 0, exposeServerMessage: true })
    state.value = 'queued'
    progress.value = 0
    startPolling()
  } catch (e: any) {
    error.value = e?.message || 'The retry could not be started.'
  }
}

function close() {
  stopPolling()
  emit('update:modelValue', false)
}
</script>
