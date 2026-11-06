<template>
    <div class="space-y-3" aria-label="Email invitation">
        <div class="flex items-center justify-between gap-2">
            <div class="text-default font-semibold">Invite by Email</div>
        </div>
        <p class="text-xs opacity-70">
            Enqueues a share invitation for this link. The server reports the real queued status; it does
            not confirm inbox delivery.
        </p>

        <div class="flex flex-wrap items-center gap-2 min-w-0">
            <input
                v-model.trim="recipientEmail"
                type="email"
                placeholder="recipient@example.com"
                class="input-textlike border border-default rounded px-3 py-2 min-w-0 flex-1"
                :disabled="submitting"
                @keyup.enter="sendInvite"
            />
            <button type="button" class="btn btn-primary text-xs px-3 py-2 whitespace-nowrap"
                :disabled="!canSubmit" @click="sendInvite">
                {{ submitting ? 'Sending…' : 'Send Invitation' }}
            </button>
        </div>

        <p v-if="submitError" role="alert" class="text-sm text-danger">{{ submitError }}</p>

        <div v-if="invitation" class="rounded-lg border border-default bg-default/20 p-3 space-y-1.5 text-sm">
            <div class="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <span class="font-semibold">Recipient:</span> {{ invitation.recipientEmail }}
                </div>
                <div class="flex items-center gap-2">
                    <button type="button" class="btn btn-secondary text-xs px-2 py-1"
                        :disabled="!canRetry" @click="retryInvite">
                        {{ retrying ? 'Retrying…' : 'Retry' }}
                    </button>
                    <button type="button" class="btn btn-secondary text-xs px-2 py-1"
                        :disabled="refreshing" @click="refreshStatus">
                        {{ refreshing ? 'Refreshing…' : 'Refresh status' }}
                    </button>
                </div>
            </div>
            <div><span class="font-semibold">Status:</span> {{ invitation.status }}</div>
            <div v-if="invitation.lastOutcome">
                <span class="font-semibold">Last outcome:</span> {{ invitation.lastOutcome }}
            </div>
            <div class="opacity-80">
                {{ invitation.mail.sent ? invitation.mail.message : 'Not sent — ' + invitation.mail.message }}
            </div>
            <p v-if="invitation.status === 'accepted'" class="text-xs opacity-70">
                "Accepted" means the mail server accepted the attempt, not that the recipient's inbox
                received it. There is no guarantee of exactly-once delivery: the mail server may have
                accepted an earlier attempt even when this panel could not confirm the outcome.
            </p>
            <p v-if="refreshError" role="alert" class="text-sm text-danger">{{ refreshError }}</p>
            <p v-if="retryError" role="alert" class="text-sm text-danger">{{ retryError }}</p>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'

export type InvitationMail = { configured: boolean | null; sent: boolean; message: string }
export type InvitationStatus = 'pending' | 'sending' | 'accepted' | 'rejected' | 'timeout' | 'ambiguous'
export type Invitation = {
    id: number
    linkId: number
    recipientEmail: string
    status: InvitationStatus
    attemptCount: number
    lastOutcome: string | null
    createdAt: string
    updatedAt: string
    invitationUrl: string | null
    mail: InvitationMail
}

const props = defineProps<{
    linkId: number | string
    apiFetch: (url: string, opts?: any) => Promise<any>
}>()

const recipientEmail = ref('')
const submitting = ref(false)
const submitError = ref('')
const refreshing = ref(false)
const refreshError = ref('')
const retrying = ref(false)
const retryError = ref('')
const invitation = ref<Invitation | null>(null)

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
    invitation.value = null
    submitError.value = ''
    refreshError.value = ''
    retryError.value = ''
    submitting.value = false
    refreshing.value = false
    retrying.value = false
}, { flush: 'sync' })

function normalizeEmail(raw: string) {
    return raw.trim().toLowerCase()
}

const canRetry = computed(() => !!invitation.value && !retrying.value
    && !RETRY_BLOCKED_STATUSES.includes(invitation.value.status))

const canSubmit = computed(() => {
    if (submitting.value || !recipientEmail.value.trim()) return false
    // Block a duplicate submission for the SAME pending invitation; a
    // different recipient email is a distinct invitation and stays allowed.
    if (invitation.value && invitation.value.status === 'pending'
        && invitation.value.recipientEmail === normalizeEmail(recipientEmail.value)) return false
    return true
})

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

function readInvitation(data: unknown): Invitation {
    if (typeof data !== 'object' || data === null || !('ok' in data) || data.ok !== true
        || !('invitation' in data) || typeof data.invitation !== 'object' || data.invitation === null) {
        throw new Error('Unexpected invitation response from server.')
    }
    const inv = data.invitation
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
        createdAt: requiredString('createdAt'),
        updatedAt: requiredString('updatedAt'),
        invitationUrl: nullableString('invitationUrl'),
        mail: { configured: mailField.configured, sent: mailField.sent, message: mailField.message },
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
        invitation.value = readInvitation(data)
    } catch (e: unknown) {
        if (myGeneration !== generation) return
        submitError.value = message(e)
    } finally {
        if (myGeneration === generation) submitting.value = false
    }
}

async function refreshStatus() {
    if (!invitation.value || refreshing.value) return
    const myGeneration = generation
    const myLinkId = props.linkId
    const invitationId = invitation.value.id
    refreshing.value = true
    refreshError.value = ''
    try {
        const data = await props.apiFetch(`/api/links/${myLinkId}/invite/${invitationId}`)
        if (myGeneration !== generation) return
        invitation.value = readInvitation(data)
    } catch (e: unknown) {
        if (myGeneration !== generation) return
        refreshError.value = message(e)
    } finally {
        if (myGeneration === generation) refreshing.value = false
    }
}

async function retryInvite() {
    if (!canRetry.value || !invitation.value) return
    const myGeneration = generation
    const myLinkId = props.linkId
    const invitationId = invitation.value.id
    retrying.value = true
    retryError.value = ''
    try {
        const data = await props.apiFetch(`/api/links/${myLinkId}/invite/${invitationId}/retry`, { method: 'POST' })
        if (myGeneration !== generation) return
        // Success here means the server either attempted (or skipped, when
        // genuinely unconfigured) the retry; it never means the inbox
        // received it. Consume the returned DTO rather than optimistically
        // claiming a send.
        invitation.value = readInvitation(data)
    } catch (e: unknown) {
        if (myGeneration !== generation) return
        // Preserve the last known DTO on failure — never manufacture a new
        // invitation/share and never fall back to the enqueue route.
        retryError.value = retryErrorMessage(e)
    } finally {
        if (myGeneration === generation) retrying.value = false
    }
}
</script>
