<template>
  <section v-if="supported" aria-label="Email delivery problems" class="mt-6">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="flow-subhead">Delivery problems</p>
      <FlowButton size="xs" variant="ghost" :disabled="loading" @click="load">Refresh</FlowButton>
    </div>
    <FlowNotice v-if="error" tone="danger" size="sm" live class="mb-3">{{ error }}</FlowNotice>
    <FlowNotice v-if="retryError" tone="danger" size="sm" live class="mb-3">{{ retryError }}</FlowNotice>

    <p v-if="loading && !loaded" class="text-sm text-muted py-2" role="status">Checking emails…</p>
    <FlowEmpty v-else-if="loaded && !emails.length" compact title="No delivery problems"
      description="Emails the mail server refuses, can't confirm, or that can't be sent show here, from every link." />
    <div v-else-if="emails.length" class="flow-table-wrap">
      <table class="flow-table">
        <thead>
          <tr>
            <th>When</th>
            <th>Link</th>
            <th>Email</th>
            <th>To</th>
            <th>Status</th>
            <th class="text-right"><span class="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="e in visibleEmails" :key="e.id" :data-testid="`email-problem-${e.id}`">
            <td class="whitespace-nowrap">{{ when(e.updatedAt || e.createdAt) }}</td>
            <td class="max-w-[12rem]">
              <span class="block truncate" :title="linkLabel(e)">{{ linkLabel(e) }}</span>
              <span v-if="e.linkArchived" class="text-xs text-muted">Archived</span>
            </td>
            <td class="whitespace-nowrap">{{ KIND_LABELS[e.kind] || 'Email' }}</td>
            <td class="max-w-[14rem]"><span class="block truncate" :title="e.recipientEmail">{{ e.recipientEmail }}</span></td>
            <td>
              <FlowChip size="sm" :tone="statusOf(e).tone" :title="statusOf(e).help">{{ statusOf(e).label }}</FlowChip>
              <span v-if="e.attemptCount > 1" class="ml-1.5 text-xs text-muted">{{ e.attemptCount }} tries</span>
              <p class="text-xs text-muted mt-1 whitespace-normal">{{ emailReasonHelp(e.reason) || statusOf(e).help }}</p>
            </td>
            <td class="text-right whitespace-nowrap">
              <FlowButton v-if="canRetryEmail(e.status) && !e.linkArchived" size="xs" :loading="retryingId === e.id"
                loading-text="Retrying…" :disabled="retryingId !== null" @click="retry(e)">Retry</FlowButton>
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
// C3: emails that need attention across every link (refused, unconfirmed, or
// never sent because email isn't set up). Same words and Retry rules as the
// per-link Emails list (LinkEmailsPanel).
import { computed, ref } from 'vue'
import FlowButton from '../ui/FlowButton.vue'
import FlowChip from '../ui/FlowChip.vue'
import FlowEmpty from '../ui/FlowEmpty.vue'
import FlowNotice from '../ui/FlowNotice.vue'
import { useApi } from '../composables/useApi'
import { canRetryEmail, emailReasonHelp, emailStatusView, type EmailStatus } from '../utils/emailStatus'
import { parseServerTime } from '../utils/reviewStatus'

export type EmailProblemRow = {
  id: number
  linkId: number
  linkTitle: string | null
  linkArchived?: boolean
  kind: 'invitation' | 'download' | 'review'
  recipientEmail: string
  status: EmailStatus
  attemptCount: number
  reason?: string | null
  createdAt: string
  updatedAt: string
  mail: { configured: boolean | null; disabled?: boolean; sent: boolean; message: string }
}

const props = defineProps<{ connectionId: string; hour12?: boolean }>()
const { apiFetch } = useApi(props.connectionId)

const KIND_LABELS: Record<string, string> = {
  invitation: 'Invitation',
  download: 'Download alert',
  review: 'Review decision',
}
const PREVIEW = 8

const emails = ref<EmailProblemRow[]>([])
const loading = ref(false)
const loaded = ref(false)
const supported = ref(true)
const error = ref('')
const retryError = ref('')
const retryingId = ref<number | null>(null)
const showAll = ref(false)

const visibleEmails = computed(() => (showAll.value ? emails.value : emails.value.slice(0, PREVIEW)))

function statusOf(e: EmailProblemRow) {
  return emailStatusView(e.status, e.mail?.configured, e.reason, e.mail?.disabled)
}

function linkLabel(e: EmailProblemRow) {
  return e.linkTitle || `Link ${e.linkId}`
}

function when(v: string) {
  const d = parseServerTime(v)
  return d ? d.toLocaleString(undefined, { hour12: props.hour12 }) : '—'
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const data = await apiFetch('/api/emails/problems')
    emails.value = Array.isArray(data?.emails) ? data.emails : []
    loaded.value = true
  } catch (e: any) {
    // Servers without this route: show nothing.
    if (e?.status === 404) { supported.value = false; return }
    error.value = e?.message ? `Couldn't check emails: ${e.message}` : "Couldn't check emails."
  } finally {
    loading.value = false
  }
}

async function retry(e: EmailProblemRow) {
  if (retryingId.value !== null) return
  retryingId.value = e.id
  retryError.value = ''
  try {
    const data = await apiFetch(`/api/links/${e.linkId}/invite/${e.id}/retry`, { method: 'POST', retry: 0 })
    const updated = data?.invitation
    if (updated?.status === 'accepted') {
      emails.value = emails.value.filter(row => row.id !== e.id)
    } else if (updated) {
      emails.value = emails.value.map(row => (row.id === e.id ? { ...row, ...updated, kind: row.kind, linkTitle: row.linkTitle } : row))
    }
  } catch (err: any) {
    retryError.value = err?.code === 'already_sent'
      ? 'That email was already accepted by the mail server, so it was not sent again.'
      : err?.code === 'credential_store_unavailable'
        ? "The server couldn't read its email settings, so nothing was sent."
        : (err?.message ? `Couldn't retry: ${err.message}` : "Couldn't retry.")
  } finally {
    retryingId.value = null
  }
}

load()
defineExpose({ reload: load })
</script>
