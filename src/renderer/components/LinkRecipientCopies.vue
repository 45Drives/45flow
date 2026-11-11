<template>
  <section class="space-y-3" data-testid="link-recipient-copies">
    <div class="flex items-center justify-between gap-2">
      <p class="flow-subhead">Personal watermarked copies</p>
      <FlowSwitch v-if="loaded" :model-value="enabled" label="Personal watermarked copies" :disabled="saving"
        @update:model-value="(v) => (enabled = v)" />
    </div>
    <FlowNotice v-if="loadError" tone="warning" size="sm">{{ loadError }}</FlowNotice>
    <template v-else-if="loaded">
      <p v-if="!enabled && !savedEnabled" class="text-xs text-muted">
        Give each invited person their own copy by using {recipient}, {email} or {company} in a text watermark when you share.
      </p>
      <template v-if="enabled">
        <p class="text-xs text-muted">
          Each invited person gets their own copy with their details filled in, and only ever sees that copy.
          <span v-if="summary"> {{ summary }}</span>
        </p>
        <ul v-if="rows.length" class="divide-y divide-default border border-default rounded-lg">
          <li v-for="r in rows" :key="r.userId" class="flex items-center gap-3 px-3 py-2">
            <div class="min-w-0 flex-1">
              <p class="text-sm truncate">{{ r.name || r.email }}</p>
              <p v-if="r.email" class="text-xs text-muted truncate">{{ r.email }}</p>
            </div>
            <span class="text-xs" :class="stateClass(r)" :title="failureDetail(r)">{{ stateLabel(r) }}</span>
          </li>
        </ul>
        <button type="button" class="text-xs underline text-muted" @click="showEditor = !showEditor">
          {{ showEditor ? 'Hide' : 'Edit' }} the watermark text
        </button>
        <WatermarkCustomizer v-if="showEditor" :allow-image="false" allow-text
          :text-layer="text" :preview-sample="previewSample" @update:text-layer="(v) => (text = v || text)" />
      </template>
      <p v-else-if="savedEnabled" class="text-xs text-flow-warning">Saving turns personal copies off and deletes them.</p>
      <FlowNotice v-if="saveError" tone="danger" size="sm">{{ saveError }}</FlowNotice>
      <div v-if="dirty" class="flex justify-end gap-2">
        <button type="button" class="btn btn-dismiss btn-sm" :disabled="saving" @click="applyResponse(lastResponse)">Discard</button>
        <button type="button" class="btn btn-primary btn-sm" :disabled="saving" @click="save">
          {{ saving ? 'Saving…' : 'Save' }}
        </button>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import FlowNotice from '../ui/FlowNotice.vue'
import FlowSwitch from '../ui/FlowSwitch.vue'
import WatermarkCustomizer from './WatermarkCustomizer.vue'
import { BACKGROUND_REQUEST } from '../background-request'
import {
  createDefaultTextLayer,
  type RecipientCopyRow,
  type RecipientWatermarkOverride,
  type RecipientWatermarksResponse,
  type TextWatermarkLayer,
  type WatermarkSpec,
} from '../types/watermark'
import { buildRecipientPolicy, recipientPolicyProblem } from '../utils/watermarkRequest'

const props = defineProps<{
  linkId: number
  linkTitle?: string
  apiFetch: (url: string, opts?: any) => Promise<any>
}>()

const POLL_MS = 5000
const loaded = ref(false)
const loadError = ref('')
const saveError = ref('')
const saving = ref(false)
const lastResponse = ref<RecipientWatermarksResponse | null>(null)
const rows = ref<RecipientCopyRow[]>([])
const enabled = ref(false)
const savedEnabled = ref(false)
const text = ref<TextWatermarkLayer>(createDefaultTextLayer())
const showEditor = ref(false)
const baseline = ref('')
// Copies made with an image or per-person overrides (older links) are kept as they are.
let keptImage: WatermarkSpec['image'] = null
let keptOverrides: RecipientWatermarkOverride[] = []

const previewSample = computed(() => ({
  link: props.linkTitle || '',
  recipient: rows.value[0]?.name || '',
  email: rows.value[0]?.email || '',
}))
const draftPolicy = computed(() => buildRecipientPolicy(
  { image: keptImage, text: text.value },
  keptOverrides,
  enabled.value,
))
const dirty = computed(() => loaded.value && JSON.stringify(draftPolicy.value) !== baseline.value)

const summary = computed(() => {
  const withCopies = rows.value.filter((r) => r.status.total > 0)
  if (!withCopies.length) return ''
  const ready = withCopies.filter((r) => r.status.state === 'ready').length
  return `${ready} of ${withCopies.length} ready.`
})

function stateLabel(r: RecipientCopyRow) {
  if (r.mode === 'none') return 'No watermark'
  if (r.status.state === 'ready') return 'Ready'
  if (r.status.state === 'failed') return 'Failed'
  if (r.status.state === 'processing') return `Preparing ${r.status.done}/${r.status.total}`
  return ''
}
function stateClass(r: RecipientCopyRow) {
  if (r.status.state === 'ready') return 'text-flow-success'
  if (r.status.state === 'failed') return 'text-flow-danger'
  return 'text-muted'
}
function failureDetail(r: RecipientCopyRow) {
  return r.files.flatMap((f) => Object.values(f.jobs).map((j) => j?.error).filter(Boolean)).join('\n')
}

function applyResponse(data: RecipientWatermarksResponse | null) {
  if (!data) return
  lastResponse.value = data
  rows.value = data.recipients || []
  enabled.value = !!data.enabled
  savedEnabled.value = !!data.enabled
  keptImage = data.defaultSpec?.image || null
  text.value = data.defaultSpec?.text ? JSON.parse(JSON.stringify(data.defaultSpec.text)) : createDefaultTextLayer()
  keptOverrides = rows.value
    .filter((r) => r.mode !== 'default')
    .map((r) => ({ userId: r.userId, mode: r.mode, ...(r.mode === 'custom' && r.spec ? { spec: r.spec } : {}) }))
  saveError.value = ''
  baseline.value = JSON.stringify(draftPolicy.value)
}

let pollTimer: ReturnType<typeof setTimeout> | null = null
function schedulePoll() {
  if (pollTimer) clearTimeout(pollTimer)
  pollTimer = null
  if (rows.value.some((r) => r.status.state === 'processing')) pollTimer = setTimeout(() => void load(true), POLL_MS)
}

async function load(background = false) {
  try {
    const data = await props.apiFetch(`/api/links/${props.linkId}/recipient-watermarks`,
      background ? { headers: BACKGROUND_REQUEST } : { exposeServerMessage: true })
    if (background && dirty.value) rows.value = data?.recipients || rows.value
    else applyResponse(data)
    loadError.value = ''
    loaded.value = true
  } catch (e: any) {
    if (!background) {
      loadError.value = e?.status === 404
        ? 'This server does not support personal copies yet. Update the Broadcaster.'
        : e?.status === 403
          ? 'Personal copies need a 45Flow Pro license.'
          : `Couldn't load personal copies: ${e?.message || 'unknown error'}`
    }
  } finally {
    schedulePoll()
  }
}

async function save() {
  saveError.value = recipientPolicyProblem(draftPolicy.value) || ''
  if (saveError.value) return
  saving.value = true
  try {
    const data = await props.apiFetch(`/api/links/${props.linkId}/recipient-watermarks`, {
      method: 'PUT',
      body: JSON.stringify(draftPolicy.value),
      retry: 0,
      exposeServerMessage: true,
    })
    applyResponse(data)
    schedulePoll()
  } catch (e: any) {
    saveError.value = e?.message || 'Could not save personal copies.'
  } finally {
    saving.value = false
  }
}

watch(() => props.linkId, () => {
  loaded.value = false
  void load()
}, { immediate: true })
onBeforeUnmount(() => { if (pollTimer) clearTimeout(pollTimer) })
</script>
