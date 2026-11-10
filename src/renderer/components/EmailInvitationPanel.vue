<template>
    <div aria-label="Invite by email">
        <FlowNotice v-if="mailUnconfigured" tone="warning" size="sm" class="mb-3">
            Email isn't set up on this server yet. Open Settings → Email (SMTP) to add it.
        </FlowNotice>
        <div :class="compact ? '' : 'flow-group'">
            <div :class="compact ? '' : 'py-3'">
                <FlowField :label="compact ? 'Email this link' : 'Recipient email'" :optional="compact"
                    :help="compact ? 'Sends the link to this address. You can also do this later from the link\'s details.' : 'They get the link to this share by email.'">
                    <template #default="{ id, describedBy }">
                        <div class="flex flex-wrap items-center gap-2 min-w-0">
                            <input :id="id" v-model.trim="recipientEmail" type="email" autocomplete="email"
                                placeholder="name@example.com" :aria-describedby="describedBy"
                                class="input-textlike border border-default rounded-lg px-3 py-1.5 text-sm min-w-0 flex-1"
                                :disabled="submitting" @keyup.enter="sendInvite" />
                            <FlowButton variant="primary" size="sm" class="whitespace-nowrap" :disabled="!canSubmit"
                                :loading="submitting" loading-text="Sending…" @click="sendInvite">
                                {{ compact ? 'Send' : 'Send invitation' }}
                            </FlowButton>
                        </div>
                    </template>
                </FlowField>
                <FlowNotice v-if="submitError" tone="danger" size="sm" class="mt-2" live>{{ submitError }}</FlowNotice>
                <FlowNotice v-if="loadError" tone="danger" size="sm" class="mt-2">{{ loadError }}</FlowNotice>
            </div>

            <div v-for="inv in invitations" :key="inv.id" class="flex flex-col gap-2" :class="compact ? 'pt-3' : 'py-3'">
                <div class="flex flex-wrap items-center gap-2 min-w-0">
                    <span class="min-w-0 truncate text-sm font-medium" :title="inv.recipientEmail">{{ inv.recipientEmail }}</span>
                    <FlowChip :tone="viewOf(inv).tone" size="sm" :dot="viewOf(inv).tone === 'success'">{{ viewOf(inv).label }}</FlowChip>
                    <span class="flex-1" />
                    <FlowButton size="xs" :disabled="!canRetry(inv)" :loading="retryingId === inv.id" loading-text="Retrying…" @click="retryInvite(inv)">Retry</FlowButton>
                    <FlowButton size="xs" :disabled="refreshingId === inv.id" :loading="refreshingId === inv.id" loading-text="Refreshing…" @click="refreshStatus(inv)">Refresh status</FlowButton>
                </div>
                <p class="text-xs text-muted" role="status">{{ viewOf(inv).help }}</p>
                <FlowNotice v-if="rowErrors[inv.id]" tone="danger" size="sm" live>{{ rowErrors[inv.id] }}</FlowNotice>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import FlowButton from '../ui/FlowButton.vue'
import FlowChip from '../ui/FlowChip.vue'
import FlowField from '../ui/FlowField.vue'
import FlowNotice from '../ui/FlowNotice.vue'
import { emailStatusView } from '../utils/emailStatus'

export type InvitationMail = { configured: boolean | null; sent: boolean; message: string }
export type InvitationStatus = 'pending' | 'sending' | 'accepted' | 'rejected' | 'timeout' | 'ambiguous'
export type Invitation = {
    id: number
    linkId: number
    recipientEmail: string
    status: InvitationStatus
    attemptCount: number
    lastOutcome: string | null
    /** Safe reason code for a failed attempt; absent on older servers. */
    reason: string | null
    createdAt: string
    updatedAt: string
    invitationUrl: string | null
    mail: InvitationMail
}

const props = defineProps<{
    linkId: number | string
    apiFetch: (url: string, opts?: any) => Promise<any>
    /** Just-created link: optional wording, no earlier invitations to load. */
    compact?: boolean
}>()

const recipientEmail = ref('')
const submitting = ref(false)
const submitError = ref('')
const loadError = ref('')
const refreshingId = ref<number | null>(null)
const retryingId = ref<number | null>(null)
const rowErrors = ref<Record<number, string>>({})
// Newest first.
const invitations = ref<Invitation[]>([])

// Statuses the server itself never retries (see server RETRY_BLOCKED_STATUSES):
// 'sending' means a claim is active right now; 'accepted' means delivery
// already succeeded. Mirrored here only to keep the button disabled for an
// obviously-blocked call, not as a new client-side policy — the server is
// the actual authority and still re-validates on every retry request.
const RETRY_BLOCKED_STATUSES: InvitationStatus[] = ['sending', 'accepted']

// Bumped on every link switch so an in-flight response from the PREVIOUS
// link can never land on the panel now showing a different link — avoids
// showing a stale recipient/status or a late async reply for a link the
// user already navigated away from.
let generation = 0
watch(() => props.linkId, () => {
    generation += 1
    recipientEmail.value = ''
    invitations.value = []
    submitError.value = ''
    loadError.value = ''
    rowErrors.value = {}
    submitting.value = false
    refreshingId.value = null
    retryingId.value = null
    loadHistory()
}, { flush: 'sync', immediate: true })

function normalizeEmail(raw: string) {
    return raw.trim().toLowerCase()
}

function viewOf(inv: Invitation) {
    return emailStatusView(inv.status, inv.mail.configured, inv.reason)
}
const mailUnconfigured = computed(() => invitations.value.some(inv => inv.mail.configured === false))

function canRetry(inv: Invitation) {
    return retryingId.value === null && !RETRY_BLOCKED_STATUSES.includes(inv.status)
}

const canSubmit = computed(() => {
    if (submitting.value || !recipientEmail.value.trim()) return false
    // Block a duplicate submission for the SAME pending invitation; a
    // different recipient email is a distinct invitation and stays allowed.
    const email = normalizeEmail(recipientEmail.value)
    return !invitations.value.some(inv => inv.status === 'pending' && inv.recipientEmail === email)
})

function upsert(inv: Invitation) {
    invitations.value = [inv, ...invitations.value.filter(row => row.id !== inv.id)]
}
function replace(inv: Invitation) {
    invitations.value = invitations.value.map(row => (row.id === inv.id ? inv : row))
}
function setRowError(id: number, text: string) {
    rowErrors.value = { ...rowErrors.value, [id]: text }
}

function message(e: unknown) {
    return e instanceof Error ? e.message : 'Unexpected invitation request failure.'
}

function errorCode(e: unknown) {
    return typeof e === 'object' && e !== null && 'code' in e ? (e as any).code : undefined
}

// The server is the actual retry authority (it re-validates the row's real
// status at request time); these messages only explain a real rejection it
// already returned, never a new client-invented policy.
function retryErrorMessage(e: unknown) {
    switch (errorCode(e)) {
        case 'already_sent':
            return 'This invitation was already accepted by the mail server; retry is blocked to avoid a duplicate send.'
        case 'recovery_required':
            return 'A delivery attempt is already in progress for this invitation; retry is blocked until it completes.'
        case 'retry_conflict':
            return 'Another retry or delivery attempt is already in progress for this invitation. Refresh status and try again shortly.'
        case 'credential_store_unavailable':
            return 'SMTP credential store is unavailable; the invitation was not retried.'
        default:
            return message(e)
    }
}

const invitationStatuses: InvitationStatus[] = ['pending', 'sending', 'accepted', 'rejected', 'timeout', 'ambiguous']

function parseInvitation(inv: any): Invitation {
    if (typeof inv !== 'object' || inv === null) throw new Error('Unexpected invitation response from server.')
    const requiredString = (key: string): string => {
        const field: unknown = key in inv ? Reflect.get(inv, key) : undefined
        if (typeof field !== 'string') throw new Error('Unexpected invitation response from server.')
        return field
    }
    const nullableString = (key: string): string | null => {
        const field: unknown = key in inv ? Reflect.get(inv, key) : undefined
        if (field !== null && typeof field !== 'string') throw new Error('Unexpected invitation response from server.')
        return field
    }
    const requiredNumber = (key: string): number => {
        const field: unknown = key in inv ? Reflect.get(inv, key) : undefined
        if (typeof field !== 'number') throw new Error('Unexpected invitation response from server.')
        return field
    }
    const status = requiredString('status')
    if (!invitationStatuses.includes(status as InvitationStatus)) {
        throw new Error('Unexpected invitation status from server.')
    }
    const mailField: unknown = 'mail' in inv ? Reflect.get(inv, 'mail') : undefined
    if (typeof mailField !== 'object' || mailField === null
        || !('configured' in mailField) || (mailField.configured !== null && typeof mailField.configured !== 'boolean')
        || !('sent' in mailField) || typeof mailField.sent !== 'boolean'
        || !('message' in mailField) || typeof mailField.message !== 'string') {
        throw new Error('Unexpected invitation mail response from server.')
    }
    return {
        id: requiredNumber('id'),
        linkId: requiredNumber('linkId'),
        recipientEmail: requiredString('recipientEmail'),
        status: status as InvitationStatus,
        attemptCount: requiredNumber('attemptCount'),
        lastOutcome: nullableString('lastOutcome'),
        reason: typeof inv.reason === 'string' ? inv.reason : null,
        createdAt: requiredString('createdAt'),
        updatedAt: requiredString('updatedAt'),
        invitationUrl: nullableString('invitationUrl'),
        mail: { configured: mailField.configured, sent: mailField.sent, message: mailField.message },
    }
}

function readInvitation(data: unknown): Invitation {
    if (typeof data !== 'object' || data === null || !('ok' in data) || data.ok !== true
        || !('invitation' in data) || typeof data.invitation !== 'object' || data.invitation === null) {
        throw new Error('Unexpected invitation response from server.')
    }
    return parseInvitation(data.invitation)
}

// Earlier invitations for this link, so they don't vanish when the panel reopens.
async function loadHistory() {
    if (props.compact || props.linkId === undefined || props.linkId === null || props.linkId === '') return
    const myGeneration = generation
    try {
        const data = await props.apiFetch(`/api/links/${props.linkId}/emails`)
        if (myGeneration !== generation) return
        const rows = Array.isArray(data?.emails) ? data.emails : []
        const found: Invitation[] = []
        for (const row of rows) {
            if (row?.kind !== 'invitation') continue
            try { found.push(parseInvitation(row)) } catch { /* skip a row this app can't read */ }
        }
        // Keep anything sent while this was loading.
        const seen = new Set(invitations.value.map(inv => inv.id))
        invitations.value = [...invitations.value, ...found.filter(inv => !seen.has(inv.id))]
    } catch (e: any) {
        if (myGeneration !== generation) return
        if (e?.status === 404) return // older server without the list route
        loadError.value = `Couldn't load earlier invitations: ${message(e)}`
    }
}

async function sendInvite() {
    if (!canSubmit.value) return
    const email = recipientEmail.value.trim()
    const myGeneration = generation
    const myLinkId = props.linkId
    submitting.value = true
    submitError.value = ''
    try {
        const data = await props.apiFetch(`/api/links/${myLinkId}/invite`, {
            method: 'POST',
            body: JSON.stringify({ recipientEmail: email }),
        })
        if (myGeneration !== generation) return
        upsert(readInvitation(data))
    } catch (e: unknown) {
        if (myGeneration !== generation) return
        submitError.value = message(e)
    } finally {
        if (myGeneration === generation) submitting.value = false
    }
}

async function refreshStatus(inv: Invitation) {
    if (refreshingId.value !== null) return
    const myGeneration = generation
    const myLinkId = props.linkId
    refreshingId.value = inv.id
    setRowError(inv.id, '')
    try {
        const data = await props.apiFetch(`/api/links/${myLinkId}/invite/${inv.id}`)
        if (myGeneration !== generation) return
        replace(readInvitation(data))
    } catch (e: unknown) {
        if (myGeneration !== generation) return
        setRowError(inv.id, message(e))
    } finally {
        if (myGeneration === generation) refreshingId.value = null
    }
}

async function retryInvite(inv: Invitation) {
    if (!canRetry(inv)) return
    const myGeneration = generation
    const myLinkId = props.linkId
    retryingId.value = inv.id
    setRowError(inv.id, '')
    try {
        const data = await props.apiFetch(`/api/links/${myLinkId}/invite/${inv.id}/retry`, { method: 'POST' })
        if (myGeneration !== generation) return
        // Success here means the server either attempted (or skipped, when
        // genuinely unconfigured) the retry; it never means the inbox
        // received it. Consume the returned DTO rather than optimistically
        // claiming a send.
        replace(readInvitation(data))
    } catch (e: unknown) {
        if (myGeneration !== generation) return
        // Preserve the last known DTO on failure — never manufacture a new
        // invitation/share and never fall back to the enqueue route.
        setRowError(inv.id, retryErrorMessage(e))
    } finally {
        if (myGeneration === generation) retryingId.value = null
    }
}
</script>
