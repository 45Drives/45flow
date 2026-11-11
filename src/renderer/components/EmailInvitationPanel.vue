<template>
    <div aria-label="Invite by email">
        <FlowNotice v-if="emailOff" tone="warning" size="sm" class="mb-3" title="Email is off">
            {{ EGRESS_OFF_TEXT.smtp }}
        </FlowNotice>
        <FlowNotice v-else-if="mailUnconfigured" tone="warning" size="sm" class="mb-3">
            Email isn't set up on this server yet. Open Settings → Email (SMTP) to add it.
        </FlowNotice>
        <div :class="compact ? 'flex flex-col gap-3' : 'flow-group'">
            <!-- Just-created link: what was sent comes first, then a way to email more people. -->
            <template v-if="compact">
                <div v-for="inv in invitations" :key="inv.id" class="flex flex-col gap-2">
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
            </template>

            <div class="flex flex-col gap-3 min-w-0" :class="compact ? '' : 'py-3'">
                <fieldset v-if="!compact && peopleRows.length" class="flex flex-col gap-1.5 min-w-0">
                    <legend class="text-sm font-medium mb-1">People on this link</legend>
                    <label v-for="p in peopleRows" :key="p.key" class="flex items-center gap-2 min-w-0 text-sm"
                        :class="p.email ? 'cursor-pointer' : 'opacity-60'">
                        <input type="checkbox" class="styled-checkbox shrink-0" :checked="p.email ? selectedEmails.has(p.email) : false"
                            :disabled="!p.email || submitting" :aria-label="`Email ${p.name}`" @change="togglePerson(p.email)" />
                        <span class="truncate font-medium" :title="p.name">{{ p.name }}</span>
                        <span class="truncate text-muted" :title="p.email || undefined">{{ p.email || 'No email address' }}</span>
                        <FlowChip v-if="p.email && invitedEmails.has(p.email)" size="sm" tone="muted" class="shrink-0">Emailed</FlowChip>
                    </label>
                </fieldset>
                <FlowField :label="fieldLabel" :optional="compact || peopleRows.length > 0" :help="fieldHelp">
                    <template #default="{ id, describedBy }">
                        <input :id="id" v-model.trim="recipientEmail" type="email" multiple autocomplete="email"
                            placeholder="name@example.com, other@example.com" :aria-describedby="describedBy"
                            class="input-textlike border border-default rounded-lg px-3 py-1.5 text-sm w-full min-w-0"
                            :disabled="submitting" @keyup.enter="sendInvite" />
                    </template>
                </FlowField>
                <p v-if="invalidTyped.length" class="text-xs text-flow-danger" role="status">
                    Check {{ invalidTyped.length === 1 ? 'this address' : 'these addresses' }}: {{ invalidTyped.join(', ') }}
                </p>
                <div class="flex flex-wrap items-center justify-end gap-3 min-w-0">
                    <span v-if="recipientSummary" class="text-xs text-muted mr-auto min-w-0 truncate" :title="recipientSummary">{{ recipientSummary }}</span>
                    <FlowButton variant="primary" size="sm" class="whitespace-nowrap" :disabled="!canSubmit"
                        :loading="submitting" loading-text="Sending…" @click="sendInvite">
                        {{ sendLabel }}
                    </FlowButton>
                </div>
                <FlowNotice v-if="submitError" tone="danger" size="sm" live><span class="whitespace-pre-line">{{ submitError }}</span></FlowNotice>
                <FlowNotice v-if="loadError" tone="danger" size="sm">{{ loadError }}</FlowNotice>
            </div>

            <template v-if="!compact">
                <div v-for="inv in invitations" :key="inv.id" class="flex flex-col gap-2 py-3">
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
            </template>
        </div>
    </div>
</template>

<script lang="ts">
// Links whose chosen-before-creation addresses were already sent, so a remount
// (e.g. Quick Share minimized and restored) never emails them twice.
const autoSentLinks = new Set<string>()
</script>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import FlowButton from '../ui/FlowButton.vue'
import FlowChip from '../ui/FlowChip.vue'
import FlowField from '../ui/FlowField.vue'
import FlowNotice from '../ui/FlowNotice.vue'
import { emailStatusView } from '../utils/emailStatus'
import { EGRESS_OFF_TEXT } from '../composables/useEgressSwitches'
import { EMAIL_RE, invitePeopleRows, normalizeEmail, splitAddresses, type InvitePerson } from '../utils/emailRecipients'

export type InvitationMail = { configured: boolean | null; disabled?: boolean; sent: boolean; message: string }
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

export type { InvitePerson } from '../utils/emailRecipients'

const props = defineProps<{
    linkId: number | string
    apiFetch: (url: string, opts?: any) => Promise<any>
    /** Just-created link: optional wording, no earlier invitations to load. */
    compact?: boolean
    /** People invited to the link. Those with an email start ticked unless they've already been emailed. */
    people?: InvitePerson[]
    /** Addresses to email as soon as the panel opens (chosen before the link was created). Sent once per link. */
    autoSend?: string[]
    /** Email is switched off on the server (Settings → Scanning & privacy). */
    emailOff?: boolean
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
// Ticked people, by normalized email.
const selectedEmails = ref<Set<string>>(new Set())
// People already auto-ticked once, and people the user ticked or unticked themselves.
const seenPeople = new Set<string>()
const touchedPeople = new Set<string>()

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
    selectedEmails.value = new Set()
    seenPeople.clear()
    touchedPeople.clear()
    invitations.value = []
    submitError.value = ''
    loadError.value = ''
    rowErrors.value = {}
    submitting.value = false
    refreshingId.value = null
    retryingId.value = null
    const key = String(props.linkId)
    const wantsAutoSend = !!props.autoSend?.length && !autoSentLinks.has(key)
    // Reopened after an automatic send: show what went out instead of sending again.
    loadHistory(autoSentLinks.has(key))
    if (wantsAutoSend) {
        autoSentLinks.add(key)
        recipientEmail.value = props.autoSend!.join(', ')
        void nextTick(() => sendInvite())
    }
}, { flush: 'sync', immediate: true })

function viewOf(inv: Invitation) {
    return emailStatusView(inv.status, inv.mail.configured, inv.reason, inv.mail.disabled)
}
const mailUnconfigured = computed(() => invitations.value.some(inv => inv.mail.configured === false && !inv.mail.disabled))
const emailOff = computed(() => !!props.emailOff || invitations.value.some(inv => inv.mail.disabled))

function canRetry(inv: Invitation) {
    return retryingId.value === null && !RETRY_BLOCKED_STATUSES.includes(inv.status)
}

const ALREADY_INVITED: InvitationStatus[] = ['pending', 'sending', 'accepted']

const typedAddresses = computed(() => splitAddresses(recipientEmail.value))
const invalidTyped = computed(() => typedAddresses.value.filter(e => !EMAIL_RE.test(e)))
const invitedEmails = computed(() => new Set(
    invitations.value.filter(inv => ALREADY_INVITED.includes(inv.status)).map(inv => normalizeEmail(inv.recipientEmail))
))

const peopleRows = computed(() => (props.compact ? [] : invitePeopleRows(props.people)))

// Tick newly added people who have an email; untick anyone who turns out to
// have been emailed already, unless the user chose otherwise.
watch([peopleRows, invitedEmails], () => {
    const next = new Set(selectedEmails.value)
    const present = new Set<string>()
    for (const p of peopleRows.value) {
        if (!p.email) continue
        present.add(p.email)
        if (!seenPeople.has(p.email)) {
            seenPeople.add(p.email)
            if (!invitedEmails.value.has(p.email)) next.add(p.email)
        } else if (!touchedPeople.has(p.email) && invitedEmails.value.has(p.email)) {
            next.delete(p.email)
        }
    }
    for (const e of next) if (!present.has(e)) next.delete(e)
    selectedEmails.value = next
}, { immediate: true })

function togglePerson(email: string | null) {
    if (!email) return
    touchedPeople.add(email)
    const next = new Set(selectedEmails.value)
    if (next.has(email)) next.delete(email)
    else next.add(email)
    selectedEmails.value = next
}

function isPendingFor(email: string) {
    return invitations.value.some(inv => inv.status === 'pending' && inv.recipientEmail === email)
}

// Everyone this Send would email, deduplicated. Block a duplicate submission for
// the SAME pending invitation; a different recipient is a distinct invitation.
const recipients = computed(() => {
    const out: Array<{ email: string; fromPerson: boolean; raw: string }> = []
    const seen = new Set<string>()
    for (const p of peopleRows.value) {
        if (!p.email || !selectedEmails.value.has(p.email) || seen.has(p.email) || isPendingFor(p.email)) continue
        seen.add(p.email)
        out.push({ email: p.email, fromPerson: true, raw: p.email })
    }
    for (const raw of typedAddresses.value) {
        if (!EMAIL_RE.test(raw)) continue
        const email = normalizeEmail(raw)
        if (seen.has(email) || isPendingFor(email)) continue
        seen.add(email)
        out.push({ email, fromPerson: false, raw })
    }
    return out
})

const canSubmit = computed(() => !submitting.value && !invalidTyped.value.length && recipients.value.length > 0)

const fieldLabel = computed(() => {
    if (peopleRows.value.length) return 'Other email addresses'
    if (props.compact) return invitations.value.length ? 'Email someone else' : 'Email this link'
    return 'Recipient email'
})
const fieldHelp = computed(() => {
    const several = 'Separate several addresses with commas.'
    if (props.compact) return `Sends the link to these addresses. ${several} You can also do this later from the link's details.`
    return `They get the link to this share by email. ${several}`
})
const recipientSummary = computed(() => {
    const list = recipients.value
    if (!list.length) return ''
    const names = list.map(r => peopleRows.value.find(p => p.email === r.email)?.name || r.raw)
    return `To: ${names.join(', ')}`
})
const sendLabel = computed(() => {
    const n = recipients.value.length
    if (props.compact) return n > 1 ? `Send (${n})` : 'Send'
    return n > 1 ? `Send invitations (${n})` : 'Send invitation'
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
        case 'email_disabled':
            return 'Email is turned off on this server, so it was not retried. An admin can turn it back on in Settings → Scanning & privacy.'
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
        mail: {
            configured: mailField.configured, sent: mailField.sent, message: mailField.message,
            ...('disabled' in mailField && mailField.disabled === true ? { disabled: true } : {}),
        },
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
async function loadHistory(evenWhenCompact = false) {
    if ((props.compact && !evenWhenCompact) || props.linkId === undefined || props.linkId === null || props.linkId === '') return
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
    const batch = recipients.value
    const myGeneration = generation
    const myLinkId = props.linkId
    submitting.value = true
    submitError.value = ''
    const failed: Array<{ raw: string; fromPerson: boolean; reason: string }> = []
    try {
        for (const r of batch) {
            try {
                const data = await props.apiFetch(`/api/links/${myLinkId}/invite`, {
                    method: 'POST',
                    body: JSON.stringify({ recipientEmail: r.raw }),
                })
                if (myGeneration !== generation) return
                upsert(readInvitation(data))
                if (r.fromPerson) {
                    const next = new Set(selectedEmails.value)
                    next.delete(r.email)
                    selectedEmails.value = next
                }
            } catch (e: unknown) {
                if (myGeneration !== generation) return
                failed.push({ raw: r.raw, fromPerson: r.fromPerson, reason: message(e) })
            }
        }
        if (!failed.length) {
            recipientEmail.value = ''
            return
        }
        submitError.value = batch.length === 1
            ? failed[0].reason
            : failed.map(f => `Couldn't send to ${f.raw}: ${f.reason}`).join('\n')
        // Leave only the typed addresses that failed, so they can be fixed and resent.
        recipientEmail.value = failed.filter(f => !f.fromPerson).map(f => f.raw).join(', ')
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
