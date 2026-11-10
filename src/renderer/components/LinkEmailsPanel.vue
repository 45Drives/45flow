<template>
  <section v-if="visible" aria-label="Emails for this link" class="mb-6">
    <p class="flow-subhead flow-subhead--first">Emails</p>
    <FlowNotice v-if="ownerUnreachable" tone="warning" size="sm" class="mb-3">
      Download and review alerts for this link aren't emailed to anyone on your team:
      <template v-if="owner">{{ owner.name || 'the owner' }}'s account has no email address and</template>
      <template v-else>the link isn't tied to a 45Flow account with an email address, and</template>
      no staff alert addresses are set. Add them in Settings → Email.
    </FlowNotice>
    <FlowNotice v-if="error" tone="danger" size="sm" live class="mb-3">{{ error }}</FlowNotice>
    <FlowNotice v-if="retryError" tone="danger" size="sm" live class="mb-3">{{ retryError }}</FlowNotice>

    <div v-if="emails.length" class="flow-table-wrap">
      <table class="flow-table">
        <thead>
          <tr>
            <th>When</th>
            <th>Email</th>
            <th>To</th>
            <th>Status</th>
            <th class="text-right"><span class="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="e in visibleEmails" :key="e.id">
            <td class="whitespace-nowrap">{{ when(e.createdAt) }}</td>
            <td class="whitespace-nowrap">{{ KIND_LABELS[e.kind] || 'Email' }}</td>
            <td class="max-w-[16rem]"><span class="block truncate" :title="e.recipientEmail">{{ e.recipientEmail }}</span></td>
            <td>
              <FlowChip size="sm" :tone="statusOf(e).tone" :dot="statusOf(e).tone === 'success'" :title="statusOf(e).help">
                {{ statusOf(e).label }}
              </FlowChip>
              <span v-if="e.attemptCount > 1" class="ml-1.5 text-xs text-muted">{{ e.attemptCount }} tries</span>
              <p v-if="emailReasonHelp(e.reason)" class="text-xs text-muted mt-1 whitespace-normal">{{ emailReasonHelp(e.reason) }}</p>
            </td>
            <td class="text-right whitespace-nowrap">
              <FlowButton v-if="canRetryEmail(e.status)" size="xs" :loading="retryingId === e.id" loading-text="Retrying…"
                :disabled="retryingId !== null" :title="statusOf(e).help" @click="retry(e)">Retry</FlowButton>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-if="emails.length > PREVIEW" class="mt-2">
      <FlowButton size="xs" variant="ghost" @click="showAll = !showAll">
        {{ showAll ? 'Show fewer' : `Show all ${emails.length}` }}
      </FlowButton>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import FlowButton from '../ui/FlowButton.vue'
import FlowChip from '../ui/FlowChip.vue'
import FlowNotice from '../ui/FlowNotice.vue'
import { canRetryEmail, emailReasonHelp, emailStatusView, type EmailStatus } from '../utils/emailStatus'
import { parseServerTime } from '../utils/reviewStatus'

type EmailRow = {
  id: number
  kind: 'invitation' | 'download' | 'review'
  recipientEmail: string
  status: EmailStatus
  attemptCount: number
  reason?: string | null
  createdAt: string
  updatedAt: string
  mail: { configured: boolean | null; sent: boolean; message: string }
}

const props = defineProps<{
  linkId: number
  apiFetch: (url: string, opts?: any) => Promise<any>
  hour12?: boolean
}>()

const KIND_LABELS: Record<string, string> = {
  invitation: 'Invitation',
  download: 'Download alert',
  review: 'Review decision',
}
const PREVIEW = 5

const emails = ref<EmailRow[]>([])
const owner = ref<{ id: number; name: string | null; hasEmail: boolean } | null>(null)
const error = ref('')
const retryError = ref('')
const retryingId = ref<number | null>(null)
const supported = ref(true)
const showAll = ref(false)
let generation = 0

const loaded = ref(false)
// Older servers don't send staffAlertCount; treat that as "no staff list".
const staffAlertCount = ref(0)
const ownerUnreachable = computed(() => loaded.value && (!owner.value || !owner.value.hasEmail) && staffAlertCount.value === 0)
const visible = computed(() => supported.value && (emails.value.length > 0 || !!error.value || ownerUnreachable.value))
const visibleEmails = computed(() => (showAll.value ? emails.value : emails.value.slice(0, PREVIEW)))

function statusOf(e: EmailRow) {
  return emailStatusView(e.status, e.mail?.configured, e.reason)
}

function when(v: string) {
  const d = parseServerTime(v)
  return d ? d.toLocaleString(undefined, { hour12: props.hour12 }) : '—'
}

async function load() {
  generation += 1
  const mine = generation
  error.value = ''
  try {
    const data = await props.apiFetch(`/api/links/${props.linkId}/emails`)
    if (mine !== generation) return
    emails.value = Array.isArray(data?.emails) ? data.emails : []
    owner.value = data?.owner ?? null
    staffAlertCount.value = Number(data?.staffAlertCount) || 0
    supported.value = true
    loaded.value = true
  } catch (e: any) {
    if (mine !== generation) return
    // Servers without this route: show nothing.
    if (e?.status === 404) { supported.value = false; return }
    error.value = e?.message ? `Couldn't load emails: ${e.message}` : "Couldn't load emails."
  }
}

async function retry(e: EmailRow) {
  if (retryingId.value !== null) return
  retryingId.value = e.id
  retryError.value = ''
  const mine = generation
  try {
    const data = await props.apiFetch(`/api/links/${props.linkId}/invite/${e.id}/retry`, { method: 'POST', retry: 0 })
    if (mine !== generation) return
    const updated = data?.invitation
    if (updated) {
      emails.value = emails.value.map(row => (row.id === e.id ? { ...row, ...updated, kind: row.kind } : row))
    }
  } catch (err: any) {
    if (mine !== generation) return
    retryError.value = err?.code === 'already_sent'
      ? 'That email was already accepted by the mail server, so it was not sent again.'
      : err?.code === 'credential_store_unavailable'
        ? "The server couldn't read its email settings, so nothing was sent."
        : (err?.message ? `Couldn't retry: ${err.message}` : "Couldn't retry.")
  } finally {
    if (mine === generation) retryingId.value = null
  }
}

watch(() => props.linkId, () => {
  emails.value = []
  owner.value = null
  staffAlertCount.value = 0
  loaded.value = false
  showAll.value = false
  retryingId.value = null
  retryError.value = ''
  load()
}, { immediate: true })

defineExpose({ reload: load })
</script>
